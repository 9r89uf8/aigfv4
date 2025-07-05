/**
 * Simple Firebase Service
 * Basic CRUD operations for conversations and messages
 */
import { getFirebaseFirestore } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { getMessageList, pushMessage, deleteCacheValue, buildCacheKey } from './cacheService.js';

const db = getFirebaseFirestore();

/**
 * Get or create a conversation between user and character
 * @param {string} userId - User ID
 * @param {string} characterId - Character ID
 * @returns {Promise<Object>} Conversation data
 */
export const getOrCreateConversation = async (userId, characterId) => {
  try {
    const conversationId = `${userId}_${characterId}`;
    const conversationRef = db.collection('conversations').doc(conversationId);
    
    const doc = await conversationRef.get();
    
    if (doc.exists) {
      return { id: conversationId, ...doc.data() };
    }
    
    // Create new conversation
    const newConversation = {
      userId,
      characterId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0
    };
    
    await conversationRef.set(newConversation);
    logger.info('Created new conversation', { conversationId, userId, characterId });
    
    return { id: conversationId, ...newConversation };
  } catch (error) {
    logger.error('Error getting/creating conversation:', error);
    throw error;
  }
};

/**
 * Save a message to a conversation
 * @param {string} conversationId - Conversation ID
 * @param {Object} messageData - Message data
 * @returns {Promise<Object>} Saved message
 */
export const saveMessage = async (conversationId, messageData) => {
  try {
    const messageId = uuidv4();
    const timestamp = Date.now();
    
    const message = {
      id: messageId,
      ...messageData,
      timestamp,
      conversationId
    };
    
    // Save message to messages subcollection
    const messageRef = db
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .doc(messageId);
    
    await messageRef.set(message);
    
    // Update conversation metadata
    const conversationRef = db.collection('conversations').doc(conversationId);
    await conversationRef.update({
      updatedAt: timestamp,
      lastMessage: messageData.content || messageData.type,
      messageCount: FieldValue.increment(1)
    });
    
    logger.debug('Message saved', { conversationId, messageId, sender: messageData.sender });
    
    // Push message to cache
    await pushMessage(conversationId, message);
    
    return message;
  } catch (error) {
    logger.error('Error saving message:', error);
    throw error;
  }
};

/**
 * Get messages for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {number} limit - Number of messages to retrieve
 * @returns {Promise<Array>} Array of messages
 */
export const getMessages = async (conversationId, limit = 50) => {
  try {
    // Try to get messages from cache first
    const cachedMessages = await getMessageList(conversationId, limit);
    
    if (cachedMessages && cachedMessages.length > 0) {
      logger.debug(`Retrieved ${cachedMessages.length} messages from cache for conversation ${conversationId}`);
      return cachedMessages;
    }
    
    // Cache miss - fetch from Firebase
    const messagesRef = db
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(limit);
    
    const snapshot = await messagesRef.get();
    const messages = [];
    
    snapshot.forEach(doc => {
      messages.push({ id: doc.id, ...doc.data() });
    });
    
    const orderedMessages = messages.reverse(); // Return in chronological order
    
    // Populate cache for next time (push each message individually to maintain order)
    for (const message of orderedMessages) {
      await pushMessage(conversationId, message);
    }
    
    logger.debug(`Fetched ${orderedMessages.length} messages from Firebase and cached for conversation ${conversationId}`);
    
    return orderedMessages;
  } catch (error) {
    logger.error('Error getting messages:', error);
    throw error;
  }
};

/**
 * Get conversations for a user
 * @param {string} userId - User ID
 * @param {number} limit - Number of conversations to retrieve
 * @returns {Promise<Array>} Array of conversations
 */
export const getUserConversations = async (userId, limit = 20) => {
  try {
    const conversationsRef = db
      .collection('conversations')
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc')
      .limit(limit);
    
    const snapshot = await conversationsRef.get();
    const conversations = [];
    
    snapshot.forEach(doc => {
      conversations.push({ id: doc.id, ...doc.data() });
    });
    
    return conversations;
  } catch (error) {
    logger.error('Error getting user conversations:', error);
    throw error;
  }
};

/**
 * Delete a conversation and all its messages
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<void>}
 */
export const deleteConversation = async (conversationId) => {
  try {
    const batch = db.batch();
    
    // Delete all messages
    const messagesRef = db
      .collection('conversations')
      .doc(conversationId)
      .collection('messages');
    
    const messagesSnapshot = await messagesRef.get();
    messagesSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Delete conversation
    const conversationRef = db.collection('conversations').doc(conversationId);
    batch.delete(conversationRef);
    
    await batch.commit();
    
    // Clear message cache for this conversation
    const cacheKey = buildCacheKey('messages', conversationId);
    await deleteCacheValue(cacheKey);
    
    logger.info('Conversation deleted', { conversationId });
  } catch (error) {
    logger.error('Error deleting conversation:', error);
    throw error;
  }
};

export default {
  getOrCreateConversation,
  saveMessage,
  getMessages,
  getUserConversations,
  deleteConversation
};