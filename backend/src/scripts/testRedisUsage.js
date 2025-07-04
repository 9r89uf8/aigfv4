#!/usr/bin/env node

/**
 * Test Script for Redis-based Usage Tracking
 * 
 * This script tests the Redis usage tracking implementation
 * to ensure it's working correctly.
 */

import * as usageService from '../services/usageService.js';
import { createClient } from 'redis';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Test user and character IDs
const TEST_USER_ID = 'test-user-123';
const TEST_CHARACTER_ID = 'test-character-456';

async function runTests() {
  logger.info('Starting Redis usage tracking tests...\n');
  
  try {
    // Test 1: Check initial usage (should be 0)
    logger.info('Test 1: Checking initial usage...');
    const initialUsage = await usageService.getUserUsage(TEST_USER_ID, TEST_CHARACTER_ID);
    logger.info('Initial usage:', initialUsage);
    console.assert(initialUsage.textMessages === 0, 'Initial text messages should be 0');
    
    // Test 2: Check if user can send message
    logger.info('\nTest 2: Checking if user can send message...');
    const canSendInitial = await usageService.canSendMessage(TEST_USER_ID, TEST_CHARACTER_ID);
    logger.info('Can send message:', canSendInitial);
    console.assert(canSendInitial.allowed === true, 'User should be allowed to send message');
    console.assert(canSendInitial.remainingMessages === 30, 'Should have 30 messages remaining');
    
    // Test 3: Increment usage
    logger.info('\nTest 3: Incrementing usage...');
    await usageService.incrementUsage(TEST_USER_ID, TEST_CHARACTER_ID, 'text');
    const afterIncrement = await usageService.getUserUsage(TEST_USER_ID, TEST_CHARACTER_ID);
    logger.info('Usage after increment:', afterIncrement);
    console.assert(afterIncrement.textMessages === 1, 'Text messages should be 1');
    
    // Test 4: Check remaining messages
    logger.info('\nTest 4: Checking remaining messages...');
    const canSendAfter = await usageService.canSendMessage(TEST_USER_ID, TEST_CHARACTER_ID);
    logger.info('Can send after increment:', canSendAfter);
    console.assert(canSendAfter.remainingMessages === 29, 'Should have 29 messages remaining');
    
    // Test 5: Test hitting the limit
    logger.info('\nTest 5: Testing usage limit...');
    // Increment to 30 messages
    for (let i = 0; i < 29; i++) {
      await usageService.incrementUsage(TEST_USER_ID, TEST_CHARACTER_ID, 'text');
    }
    
    const atLimit = await usageService.canSendMessage(TEST_USER_ID, TEST_CHARACTER_ID);
    logger.info('At limit check:', atLimit);
    console.assert(atLimit.allowed === false, 'User should NOT be allowed to send message');
    console.assert(atLimit.remainingMessages === 0, 'Should have 0 messages remaining');
    console.assert(atLimit.error === 'Daily message limit reached', 'Should have correct error message');
    
    // Test 6: Test different message types
    logger.info('\nTest 6: Testing different message types...');
    await usageService.incrementUsage(TEST_USER_ID, TEST_CHARACTER_ID, 'audio');
    await usageService.incrementUsage(TEST_USER_ID, TEST_CHARACTER_ID, 'media');
    
    const mixedUsage = await usageService.getUserUsage(TEST_USER_ID, TEST_CHARACTER_ID);
    logger.info('Mixed usage:', mixedUsage);
    console.assert(mixedUsage.textMessages === 30, 'Should have 30 text messages');
    console.assert(mixedUsage.audioMessages === 1, 'Should have 1 audio message');
    console.assert(mixedUsage.mediaMessages === 1, 'Should have 1 media message');
    
    // Test 7: Check audio and media limits
    logger.info('\nTest 7: Checking audio and media limits...');
    const canSendAudio = await usageService.canSendMessage(TEST_USER_ID, TEST_CHARACTER_ID, 'audio');
    const canSendMedia = await usageService.canSendMessage(TEST_USER_ID, TEST_CHARACTER_ID, 'media');
    
    logger.info('Can send audio:', canSendAudio);
    logger.info('Can send media:', canSendMedia);
    console.assert(canSendAudio.allowed === true, 'Should be able to send audio');
    console.assert(canSendAudio.remainingMessages === 4, 'Should have 4 audio messages remaining');
    console.assert(canSendMedia.allowed === true, 'Should be able to send media');
    console.assert(canSendMedia.remainingMessages === 4, 'Should have 4 media messages remaining');
    
    // Test 8: Test reset time
    logger.info('\nTest 8: Checking reset time...');
    const withResetTime = await usageService.canSendMessage(TEST_USER_ID, TEST_CHARACTER_ID);
    logger.info('Reset time:', withResetTime.resetTime);
    console.assert(withResetTime.resetTime !== null, 'Should have a reset time');
    
    // Clean up test data
    logger.info('\nCleaning up test data...');
    const redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || undefined
    });
    
    await redis.connect();
    const key = `aim:user:usage:${TEST_USER_ID}:${TEST_CHARACTER_ID}`;
    await redis.del(key);
    await redis.quit();
    
    logger.info('\n✅ All tests passed successfully!');
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the tests
runTests().catch((error) => {
  logger.error('Unhandled error in test script:', error);
  process.exit(1);
});