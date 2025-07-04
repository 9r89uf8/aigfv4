#!/usr/bin/env node
/**
 * AI Context Debug Script
 * 
 * Analyzes AI context construction for a specific conversation
 * to help debug why conversation history might be missing from AI message arrays.
 * 
 * Usage: node debugAIContext.js <conversationId>
 */

import { config } from '../config/environment.js';
import { getConversationContext } from '../services/conversationService.js';
import { buildMessageArray } from '../services/aiService/messageProcessor.js';
import { getCharacterById } from '../services/characterService.js';
import logger from '../utils/logger.js';

// Mock character for testing (minimal character structure)
const mockCharacter = {
  id: 'debug-character',
  name: 'Debug Character',
  personality: {
    traits: ['helpful', 'analytical'],
    speaking_style: 'professional',
    humor_level: 'moderate',
    empathy_level: 'high',
    creativity_level: 'high'
  },
  aiSettings: {
    model: 'deepseek-reasoner',
    temperature: 0.7,
    maxTokens: 2000
  }
};

// Mock current message for testing
const mockCurrentMessage = {
  id: 'debug-current-message',
  content: 'This is a debug message to test AI context construction',
  sender: 'user',
  timestamp: new Date().toISOString()
};

async function analyzeAIContext(conversationId) {
  console.log('\n🔍 AI CONTEXT DEBUG ANALYSIS');
  console.log('================================');
  console.log(`Conversation ID: ${conversationId}`);
  console.log(`Debug Mode: ${config.ai.debugContext ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Max Context Messages: ${config.ai.maxContextMessages}`);
  console.log(`Min Context Messages: ${config.ai.minContextMessages}`);
  console.log('================================\n');

  try {
    // Step 1: Get conversation context
    console.log('📥 STEP 1: Retrieving conversation context...');
    const context = await getConversationContext(conversationId, {
      maxMessages: config.ai.maxContextMessages,
      includeSystemPrompt: true
    });
    
    console.log(`✅ Context retrieved:
    - Total messages in conversation: ${context.messageCount || 0}
    - Messages in context: ${context.messages?.length || 0}
    - Started at: ${context.startedAt}
    - Last message at: ${context.lastMessageAt}
    - User ID: ${context.userId}
    - Character ID: ${context.characterId}`);
    
    if (!context.messages || context.messages.length === 0) {
      console.log('❌ NO MESSAGES IN CONTEXT - This explains why AI only gets system prompt!');
      console.log('\nPossible causes:');
      console.log('- Conversation has no messages');
      console.log('- Messages are not being saved properly');
      console.log('- Cache is returning empty context');
      console.log('- Firebase optimization is not working');
      return;
    }
    
    // Analyze raw context messages
    console.log('\n📊 Raw Context Messages Analysis:');
    context.messages.forEach((msg, index) => {
      console.log(`  ${index + 1}. ID: ${msg.id || 'NO_ID'} | Sender: ${msg.sender} | LLM Error: ${msg.hasLLMError || false}`);
      console.log(`     Timestamp: ${msg.timestamp}`);
      console.log(`     Content: "${msg.content?.substring(0, 80)}${msg.content?.length > 80 ? '...' : ''}"`);
      console.log('');
    });
    
    // Step 2: Get or mock character
    console.log('\n📥 STEP 2: Getting character data...');
    let character;
    try {
      character = await getCharacterById(context.characterId);
      console.log(`✅ Character retrieved: ${character.name} (ID: ${character.id})`);
    } catch (error) {
      console.log(`⚠️ Could not get character, using mock: ${error.message}`);
      character = mockCharacter;
    }
    
    // Step 3: Build message array
    console.log('\n🤖 STEP 3: Building AI message array...');
    
    // Temporarily enable debug logging for this operation
    const originalDebugSetting = config.ai.debugContext;
    config.ai.debugContext = true;
    
    const messageArray = await buildMessageArray(character, context, mockCurrentMessage);
    
    // Restore original debug setting
    config.ai.debugContext = originalDebugSetting;
    
    console.log(`✅ AI message array built with ${messageArray.length} messages`);
    
    // Step 4: Analyze final message array
    console.log('\n📊 FINAL AI MESSAGE ARRAY ANALYSIS:');
    console.log('===================================');
    
    messageArray.forEach((msg, index) => {
      console.log(`${index + 1}. Role: ${msg.role}`);
      console.log(`   Content Length: ${msg.content?.length || 0} characters`);
      console.log(`   Content Preview: "${msg.content?.substring(0, 100)}${msg.content?.length > 100 ? '...' : ''}"`);
      console.log('');
    });
    
    // Step 5: Compare input vs output
    console.log('\n📈 COMPARISON ANALYSIS:');
    console.log('======================');
    
    const systemMessages = messageArray.filter(msg => msg.role === 'system').length;
    const userMessages = messageArray.filter(msg => msg.role === 'user').length;
    const assistantMessages = messageArray.filter(msg => msg.role === 'assistant').length;
    
    console.log(`Context Messages Input: ${context.messages.length}`);
    console.log(`AI Message Array Output: ${messageArray.length}`);
    console.log(`  - System messages: ${systemMessages}`);
    console.log(`  - User messages: ${userMessages}`);
    console.log(`  - Assistant messages: ${assistantMessages}`);
    
    // Check for potential issues
    console.log('\n🔍 POTENTIAL ISSUES DETECTED:');
    console.log('=============================');
    
    if (context.messages.length > 2 && messageArray.length <= 2) {
      console.log('❌ MAJOR ISSUE: Many context messages but very few in AI array!');
      console.log('   This suggests messages are being filtered out during processing.');
    }
    
    const llmErrorCount = context.messages.filter(msg => msg.hasLLMError === true).length;
    if (llmErrorCount > 0) {
      console.log(`⚠️ LLM ERROR FILTERING: ${llmErrorCount}/${context.messages.length} messages have LLM errors and will be filtered out`);
      console.log('   This could explain missing conversation history.');
    }
    
    const emptyMessages = context.messages.filter(msg => !msg.content || msg.content.trim().length === 0).length;
    if (emptyMessages > 0) {
      console.log(`⚠️ EMPTY MESSAGES: ${emptyMessages} messages have no content`);
    }
    
    const unknownSenders = context.messages.filter(msg => !['user', 'character'].includes(msg.sender)).length;
    if (unknownSenders > 0) {
      console.log(`⚠️ UNKNOWN SENDERS: ${unknownSenders} messages have unknown sender types`);
    }
    
    if (messageArray.length === 2 && systemMessages === 1 && userMessages === 1) {
      console.log('❌ CRITICAL: Only system prompt + current message in AI array!');
      console.log('   This means NO conversation history is being included.');
    }
    
    console.log('\n✅ Debug analysis complete!');
    console.log('\nTip: Check the logs above for detailed step-by-step processing');
    console.log('     Look for 🔍 prefixed log entries showing where messages might be lost');
    
  } catch (error) {
    console.error('\n❌ ERROR during debug analysis:', error.message);
    console.error(error.stack);
  }
}

// Main execution
const conversationId = process.argv[2];

if (!conversationId) {
  console.error('Usage: node debugAIContext.js <conversationId>');
  console.error('Example: node debugAIContext.js user123_char456');
  process.exit(1);
}

// Run the analysis
analyzeAIContext(conversationId)
  .then(() => {
    console.log('\n🏁 Analysis finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  });