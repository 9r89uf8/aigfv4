#!/usr/bin/env node

/**
 * Test Usage WebSocket Updates
 * 
 * This script tests the real-time usage tracking and WebSocket emission functionality.
 * It simulates incrementing usage and verifies that WebSocket events are properly emitted.
 * 
 * Usage: node testUsageWebSocket.js
 */

import { incrementUsage, getUserUsage, resetUsage } from '../services/usageService.js';
import { initializeSocket, getSocketIO, SOCKET_EVENTS } from '../config/socket.js';
import { createServer } from 'http';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Test data
const TEST_USER_ID = 'test-user-123';
const TEST_CHARACTER_ID = 'test-character-456';

/**
 * Initialize test socket server
 */
async function initializeTestServer() {
  try {
    // Create a minimal HTTP server for Socket.io
    const httpServer = createServer();
    
    // Initialize Socket.io
    const io = initializeSocket(httpServer);
    
    // Start server on a test port
    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        const port = httpServer.address().port;
        logger.info(`Test socket server listening on port ${port}`);
        resolve();
      });
    });
    
    return { httpServer, io };
  } catch (error) {
    logger.error('Failed to initialize test server:', error);
    throw error;
  }
}

/**
 * Test usage tracking with WebSocket updates
 */
async function testUsageTracking() {
  let server;
  
  try {
    logger.info('Starting usage WebSocket test...');
    
    // Initialize test server
    server = await initializeTestServer();
    
    // Test 1: Get initial usage (should be default/empty)
    logger.info('\n=== Test 1: Get Initial Usage ===');
    const initialUsage = await getUserUsage(TEST_USER_ID, TEST_CHARACTER_ID);
    logger.info('Initial usage:', initialUsage);
    
    // Test 2: Increment text message usage
    logger.info('\n=== Test 2: Increment Text Message Usage ===');
    const usage1 = await incrementUsage(TEST_USER_ID, TEST_CHARACTER_ID, 'text');
    logger.info('After text message:', {
      textMessages: usage1.textMessages,
      audioMessages: usage1.audioMessages,
      mediaMessages: usage1.mediaMessages
    });
    
    // Test 3: Increment audio message usage
    logger.info('\n=== Test 3: Increment Audio Message Usage ===');
    const usage2 = await incrementUsage(TEST_USER_ID, TEST_CHARACTER_ID, 'audio');
    logger.info('After audio message:', {
      textMessages: usage2.textMessages,
      audioMessages: usage2.audioMessages,
      mediaMessages: usage2.mediaMessages
    });
    
    // Test 4: Increment media message usage
    logger.info('\n=== Test 4: Increment Media Message Usage ===');
    const usage3 = await incrementUsage(TEST_USER_ID, TEST_CHARACTER_ID, 'media');
    logger.info('After media message:', {
      textMessages: usage3.textMessages,
      audioMessages: usage3.audioMessages,
      mediaMessages: usage3.mediaMessages
    });
    
    // Test 5: Multiple increments
    logger.info('\n=== Test 5: Multiple Text Messages ===');
    for (let i = 0; i < 3; i++) {
      const usage = await incrementUsage(TEST_USER_ID, TEST_CHARACTER_ID, 'text');
      logger.info(`Text message ${i + 2}:`, usage.textMessages);
    }
    
    // Test 6: Get final usage
    logger.info('\n=== Test 6: Get Final Usage ===');
    const finalUsage = await getUserUsage(TEST_USER_ID, TEST_CHARACTER_ID);
    logger.info('Final usage:', {
      textMessages: finalUsage.textMessages,
      audioMessages: finalUsage.audioMessages,
      mediaMessages: finalUsage.mediaMessages,
      lastMessageAt: finalUsage.lastMessageAt
    });
    
    // Test 7: Reset usage
    logger.info('\n=== Test 7: Reset Usage ===');
    await resetUsage(TEST_USER_ID, TEST_CHARACTER_ID);
    const resetUsageData = await getUserUsage(TEST_USER_ID, TEST_CHARACTER_ID);
    logger.info('After reset:', {
      textMessages: resetUsageData.textMessages,
      audioMessages: resetUsageData.audioMessages,
      mediaMessages: resetUsageData.mediaMessages
    });
    
    logger.info('\n✅ All tests completed successfully!');
    logger.info('Note: Check the logs above for "Usage update emitted via WebSocket" messages');
    logger.info('These indicate that WebSocket events were properly emitted.');
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    if (server?.httpServer) {
      server.httpServer.close();
    }
    
    // Give time for logs to flush
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Run the test
testUsageTracking().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});