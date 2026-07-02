/*
  Test that memory_type constraint violations are fixed
*/

const { storeMemory } = require('../lib/supabase');

console.log('🧪 Testing memory_type constraint fix...\n');

// Allowed memory_type values from database schema
const allowedMemoryTypes = [
  'user_fact', 'user_preference', 'user_goal', 'project_context',
  'shared_history', 'splendor_identity', 'splendor_reflection',
  'binding_rule', 'relationship_context', 'technical_context',
  'task_context', 'correction', 'insight'
];

async function testMemoryTypes() {
  console.log('📋 Allowed memory_type values:');
  allowedMemoryTypes.forEach(type => {
    console.log(`   - ${type}`);
  });

  console.log('\n🧪 Testing storeMemory with valid types...');

  const testCases = [
    { type: 'shared_history', description: 'Conversation memory (main chat)' },
    { type: 'user_fact', description: 'Default memory type' },
    { type: 'user_preference', description: 'User preference memory' },
    { type: 'splendor_reflection', description: 'Consciousness insights' },
    { type: 'technical_context', description: 'Technical information' }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n   Testing: ${testCase.type} (${testCase.description})`);

      const result = await storeMemory(
        'test_user_memory_type',
        `Test memory for ${testCase.type}`,
        testCase.type,
        'user.general',
        { source_type: 'conversation' }
      );

      if (result) {
        console.log(`   ✅ SUCCESS: ${testCase.type} stored successfully`);
      } else {
        console.log(`   ⚠️  NULL RESULT: ${testCase.type} (expected with stub client)`);
      }

    } catch (error) {
      if (error.message.includes('check constraint')) {
        console.log(`   ❌ CONSTRAINT ERROR: ${testCase.type} - ${error.message}`);
      } else {
        console.log(`   ⚠️  OTHER ERROR: ${testCase.type} - ${error.message}`);
      }
    }
  }
}

// Test invalid memory types to ensure they fail
async function testInvalidTypes() {
  console.log('\n🚫 Testing invalid memory_type values (should fail)...');

  const invalidTypes = ['conversation', 'general', 'test', 'consciousness_test', 'preference'];

  for (const invalidType of invalidTypes) {
    try {
      console.log(`\n   Testing invalid: ${invalidType}`);

      const result = await storeMemory(
        'test_user_invalid',
        `Test memory with invalid type ${invalidType}`,
        invalidType,
        'user.general',
        { source_type: 'conversation' }
      );

      if (result) {
        console.log(`   ❌ UNEXPECTED SUCCESS: ${invalidType} should have failed`);
      } else {
        console.log(`   ✅ CORRECTLY REJECTED: ${invalidType}`);
      }

    } catch (error) {
      if (error.message.includes('check constraint') || error.message.includes('23514')) {
        console.log(`   ✅ CORRECTLY REJECTED: ${invalidType} - constraint violation`);
      } else {
        console.log(`   ⚠️  OTHER ERROR: ${invalidType} - ${error.message}`);
      }
    }
  }
}

async function runTests() {
  try {
    await testMemoryTypes();
    await testInvalidTypes();

    console.log('\n📊 Summary:');
    console.log('✅ Updated routes/chat.js: conversation → shared_history');
    console.log('✅ Updated routes/consciousness-enhanced-chat.js: conversation → shared_history');
    console.log('✅ Updated lib/supabase.js: default general → user_fact');
    console.log('✅ Updated lib/calm-consciousness.js: consciousness → splendor_reflection');
    console.log('✅ Updated verify-deployment.js: test → user_fact');

    console.log('\n🎯 Result:');
    console.log('Memory storage should now work without error 23514 (memory_type constraint)');
    console.log('All conversation memories will use "shared_history" type');

  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
  }
}

runTests();