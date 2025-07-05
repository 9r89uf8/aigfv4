/**
 * Simple Character Service
 * Basic character operations with Redis caching
 */
import { getFirebaseFirestore } from '../config/firebase.js';
import logger from '../utils/logger.js';
import { getCacheValue, setCacheValue, deleteCacheValue, buildCacheKey } from './cacheService.js';
import { config } from '../config/environment.js';

const db = getFirebaseFirestore();

/**
 * Get character by ID
 * @param {string} characterId - Character ID
 * @returns {Promise<Object|null>} Character data or null
 */
export const getCharacterById = async (characterId) => {
  try {
    // Build cache key
    const cacheKey = buildCacheKey('character', characterId);
    
    // Check cache first
    const cachedData = await getCacheValue(cacheKey);
    if (cachedData) {
      logger.debug(`Character ${characterId} retrieved from cache`);
      return cachedData;
    }
    
    // Cache miss - fetch from Firebase
    const characterRef = db.collection('characters').doc(characterId);
    const doc = await characterRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    const characterData = { id: doc.id, ...doc.data() };
    
    // Store in cache for future requests
    await setCacheValue(cacheKey, characterData, config.redis.ttl.character);
    logger.debug(`Character ${characterId} cached`);
    
    return characterData;
  } catch (error) {
    logger.error('Error getting character:', error);
    throw error;
  }
};

/**
 * Get all active characters
 * @param {number} limit - Maximum number of characters to return
 * @returns {Promise<Array>} Array of characters
 */
export const getAllCharacters = async (limit = 50) => {
  try {
    const charactersRef = db
      .collection('characters')
      .where('isActive', '==', true)
      .limit(limit);
    
    const snapshot = await charactersRef.get();
    const characters = [];
    
    snapshot.forEach(doc => {
      characters.push({ id: doc.id, ...doc.data() });
    });
    
    return characters;
  } catch (error) {
    logger.error('Error getting characters:', error);
    throw error;
  }
};

/**
 * Create a new character
 * @param {Object} characterData - Character data
 * @returns {Promise<Object>} Created character
 */
export const createCharacter = async (characterData) => {
  try {
    const newCharacter = {
      ...characterData,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const docRef = await db.collection('characters').add(newCharacter);
    
    logger.info('Character created', { characterId: docRef.id, name: characterData.name });
    
    return { id: docRef.id, ...newCharacter };
  } catch (error) {
    logger.error('Error creating character:', error);
    throw error;
  }
};

/**
 * Update character data
 * @param {string} characterId - Character ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated character
 */
export const updateCharacter = async (characterId, updates) => {
  try {
    const updateData = {
      ...updates,
      updatedAt: Date.now()
    };
    
    await db.collection('characters').doc(characterId).update(updateData);
    
    // Invalidate cache for this character
    const cacheKey = buildCacheKey('character', characterId);
    await deleteCacheValue(cacheKey);
    
    logger.info('Character updated', { characterId });
    
    return await getCharacterById(characterId);
  } catch (error) {
    logger.error('Error updating character:', error);
    throw error;
  }
};

/**
 * Delete character (soft delete)
 * @param {string} characterId - Character ID
 * @returns {Promise<void>}
 */
export const deleteCharacter = async (characterId) => {
  try {
    await db.collection('characters').doc(characterId).update({
      isActive: false,
      updatedAt: Date.now()
    });
    
    // Invalidate cache for this character
    const cacheKey = buildCacheKey('character', characterId);
    await deleteCacheValue(cacheKey);
    
    logger.info('Character deactivated', { characterId });
  } catch (error) {
    logger.error('Error deleting character:', error);
    throw error;
  }
};

export default {
  getCharacterById,
  getAllCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter
};