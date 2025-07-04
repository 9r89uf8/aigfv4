#!/usr/bin/env node

/**
 * Daily Usage Reset Script
 * 
 * This script clears all Redis usage counters to reset daily message limits.
 * It should be run once every 24 hours via a cron job.
 * 
 * Usage: node resetDailyUsage.js
 * 
 * Cron example (runs at midnight server time):
 * 0 0 * * * /usr/bin/node /path/to/backend/src/scripts/resetDailyUsage.js
 */

import { createClient } from 'redis';
import logger from '../utils/logger.js';
import { emitToUser, SOCKET_EVENTS } from '../config/socket.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Initialize Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD || undefined
});

// Redis error handling
redisClient.on('error', (err) => {
  logger.error('Redis Client Error in reset script:', err);
  process.exit(1);
});

/**
 * Reset all user usage counters
 */
async function resetDailyUsage() {
  try {
    // Connect to Redis
    await redisClient.connect();
    logger.info('Connected to Redis for daily usage reset');
    
    // Find all usage keys using SCAN (more efficient than KEYS for production)
    const usageKeys = [];
    let cursor = 0;
    
    do {
      const result = await redisClient.scan(cursor, {
        MATCH: 'user:usage:*:*',
        COUNT: 100
      });
      
      cursor = result.cursor;
      if (result.keys && result.keys.length > 0) {
        usageKeys.push(...result.keys);
      }
    } while (cursor !== 0);
    
    logger.info(`Found ${usageKeys.length} usage keys to reset`);
    
    // Delete all usage keys
    if (usageKeys.length > 0) {
      // Use pipeline for better performance
      const pipeline = redisClient.multi();
      
      // Track unique users and characters for WebSocket notifications
      const userCharacterPairs = new Set();
      
      for (const key of usageKeys) {
        pipeline.del(key);
        
        // Extract userId and characterId from key pattern: user:usage:{userId}:{characterId}
        const parts = key.split(':');
        if (parts.length >= 4) {
          const userId = parts[2];
          const characterId = parts[3];
          userCharacterPairs.add(`${userId}:${characterId}`);
        }
      }
      
      await pipeline.exec();
      logger.info(`Successfully deleted ${usageKeys.length} usage keys`);
      
      // Emit usage reset events for each user-character pair (if Socket.io is available)
      try {
        // Note: Socket.io might not be initialized in a cron job context
        // This is optional - if it fails, it won't break the reset
        for (const pair of userCharacterPairs) {
          const [userId, characterId] = pair.split(':');
          const formattedUsage = {
            text: { used: 0, limit: 30 },
            image: { used: 0, limit: 5 },
            audio: { used: 0, limit: 5 }
          };
          
          emitToUser(userId, SOCKET_EVENTS.USAGE_UPDATE, {
            characterId,
            usage: formattedUsage,
            resetReason: 'daily_reset'
          });
        }
        logger.info(`Emitted usage reset events for ${userCharacterPairs.size} user-character pairs`);
      } catch (emitError) {
        // This is expected in a cron job context where Socket.io isn't initialized
        logger.debug('Could not emit WebSocket events (normal for cron job):', emitError.message);
      }
      
      // Log some sample keys for verification
      const sampleKeys = usageKeys.slice(0, 5);
      logger.debug('Sample keys deleted:', sampleKeys);
    } else {
      logger.info('No usage keys found to reset');
    }
    
    // Log completion with timestamp
    logger.info('Daily usage reset completed', {
      timestamp: new Date().toISOString(),
      keysReset: usageKeys.length,
      nextReset: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    
    // Disconnect from Redis
    await redisClient.quit();
    process.exit(0);
    
  } catch (error) {
    logger.error('Error during daily usage reset:', error);
    
    // Ensure Redis connection is closed
    try {
      await redisClient.quit();
    } catch (quitError) {
      logger.error('Error closing Redis connection:', quitError);
    }
    
    process.exit(1);
  }
}

// Execute the reset
resetDailyUsage().catch((error) => {
  logger.error('Unhandled error in reset script:', error);
  process.exit(1);
});