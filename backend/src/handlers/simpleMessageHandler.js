/**
 * Simple Message Handler
 * Direct Socket.io -> DeepSeek -> Firebase flow without queues or complex processing
 */
import { getOrCreateConversation, saveMessage, getMessages } from '../services/firebaseService.js';
import { generateResponse } from '../services/deepseekService.js';
import { getCharacterById } from '../services/characterService.js';
import logger from '../utils/logger.js';

/**
 * Register simple message handlers on socket
 * @param {Socket} socket - Socket.io socket instance
 * @param {Object} io - Socket.io server instance
 */
export const registerMessageHandlers = (socket, io) => {
  
  /**
   * Handle sending a message - simple synchronous flow
   */
  socket.on('message:send', async (data, callback) => {
    try {
      const { characterId, content, type = 'text' } = data;
      const userId = socket.userId;
      
      if (!characterId || !content) {
        return callback({ 
          success: false, 
          error: 'Missing required fields' 
        });
      }
      
      logger.info('Processing message', { userId, characterId, type });
      
      // 1. Ensure conversation exists
      const conversation = await getOrCreateConversation(userId, characterId);
      const conversationId = conversation.id;
      
      // 2. Save user message to Firebase
      const userMessage = await saveMessage(conversationId, {
        sender: 'user',
        type,
        content,
        timestamp: Date.now()
      });
      
      // Emit user message to conversation room
      socket.to(`conversation:${conversationId}`).emit('message:receive', {
        message: userMessage,
        conversationId
      });
      
      // Send immediate response to user
      callback({ 
        success: true, 
        message: userMessage,
        conversationId 
      });
      
      // 3. Get character data
      const character = await getCharacterById(characterId);
      if (!character) {
        throw new Error('Character not found');
      }
      
      // 4. Get conversation history for context
      const conversationHistory = await getMessages(conversationId, 10);

      // 5. Generate AI response with DeepSeek
      logger.debug('Generating AI response', { characterId, conversationId });
      
      const aiResponseContent = await generateResponse({
        character,
        conversationHistory,
        userMessage: content
      });
      
      // 6. Save AI response to Firebase
      const aiMessage = await saveMessage(conversationId, {
        sender: 'character',
        type: 'text',
        content: aiResponseContent,
        timestamp: Date.now()
      });

      // 7. Emit AI response to conversation room
      // Get all sockets in the room
      const socketsInRoom = await io.in(`conversation:${conversationId}`).fetchSockets();
      
      io.in(`conversation:${conversationId}`).emit('message:receive', {
        message: aiMessage,
        conversationId
      });
      
    } catch (error) {
      logger.error('Error processing message:', error);
      
      // Emit error to user
      socket.emit('message:error', {
        error: 'Failed to process message. Please try again.',
        timestamp: Date.now()
      });
      
      // If callback wasn't called yet, call it with error
      if (callback) {
        callback({ 
          success: false, 
          error: 'Failed to process message' 
        });
      }
    }
  });
  
  /**
   * Handle joining a conversation room
   */
  socket.on('conversation:join', async (data, callback) => {
    try {
      const { conversationId } = data;
      const userId = socket.userId;
      
      if (!conversationId) {
        return callback({ 
          success: false, 
          error: 'Conversation ID required' 
        });
      }
      
      // Extract characterId from conversationId (format: userId_characterId)
      const parts = conversationId.split('_');
      const characterId = parts[parts.length - 1];

      // Join the conversation room
      socket.join(`conversation:${conversationId}`);
      
      // Get conversation data
      const conversation = await getOrCreateConversation(userId, characterId);
      const messages = await getMessages(conversationId, 50);
      
      callback({ 
        success: true, 
        conversation,
        messages 
      });

      
    } catch (error) {
      logger.error('Error joining conversation:', error);
      callback({ 
        success: false, 
        error: 'Failed to join conversation' 
      });
    }
  });
  
  /**
   * Handle leaving a conversation room
   */
  socket.on('conversation:leave', (data) => {
    try {
      const { conversationId } = data;
      
      socket.leave(`conversation:${conversationId}`);
      
    } catch (error) {
      logger.error('Error leaving conversation:', error);
    }
  });
  
  /**
   * Handle typing indicators
   */
  socket.on('typing:start', (data) => {
    try {
      const { conversationId } = data;
      const userId = socket.userId;
      
      socket.to(`conversation:${conversationId}`).emit('typing:start', {
        userId,
        conversationId,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error handling typing start:', error);
    }
  });
  
  socket.on('typing:stop', (data) => {
    try {
      const { conversationId } = data;
      const userId = socket.userId;
      
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        userId,
        conversationId,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Error handling typing stop:', error);
    }
  });
};

export default {
  registerMessageHandlers
};