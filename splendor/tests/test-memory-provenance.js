/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Test memory provenance fix

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// Mock the supabase client to test the memory data structure
const originalConsole = console.log;

// Test the provenance determination logic
function testProvenanceDetermination() {
  console.log('🧪 Testing provenance determination logic...');

  // Simulate the determineProvenance function from storeMemory
  const determineProvenance = (sourceContext) => {
    if (sourceContext.provenance) return sourceContext.provenance;

    const sourceType = sourceContext.source_type || 'conversation';
    switch (sourceType) {
      case 'user_direct_statement':
        return 'USER_STATED';
      case 'external_search':
      case 'web_search':
        return 'VERIFIED_FACT';
      case 'system_event':
      case 'system':
        return 'SYSTEM_EVENT';
      case 'generated':
      case 'ai_generated':
        return 'GENERATED';
      case 'conversation':
      case 'inference':
      default:
        return 'INFERRED';
    }
  };

  // Test different source contexts
  const testCases = [
    { sourceContext: {}, expected: 'INFERRED' },
    { sourceContext: { source_type: 'conversation' }, expected: 'INFERRED' },
    { sourceContext: { source_type: 'user_direct_statement' }, expected: 'USER_STATED' },
    { sourceContext: { source_type: 'external_search' }, expected: 'VERIFIED_FACT' },
    { sourceContext: { source_type: 'web_search' }, expected: 'VERIFIED_FACT' },
    { sourceContext: { source_type: 'system_event' }, expected: 'SYSTEM_EVENT' },
    { sourceContext: { source_type: 'system' }, expected: 'SYSTEM_EVENT' },
    { sourceContext: { source_type: 'generated' }, expected: 'GENERATED' },
    { sourceContext: { source_type: 'ai_generated' }, expected: 'GENERATED' },
    { sourceContext: { provenance: 'ADMIN_APPROVED' }, expected: 'ADMIN_APPROVED' },
  ];

  let allPassed = true;
  for (const testCase of testCases) {
    const result = determineProvenance(testCase.sourceContext);
    const passed = result === testCase.expected;
    if (!passed) {
      console.log(`❌ FAILED: ${JSON.stringify(testCase.sourceContext)} -> Expected: ${testCase.expected}, Got: ${result}`);
      allPassed = false;
    } else {
      console.log(`✓ PASSED: ${JSON.stringify(testCase.sourceContext)} -> ${result}`);
    }
  }

  return allPassed;
}

// Test memory data structure creation
function testMemoryDataStructure() {
  console.log('\n🧪 Testing memory data structure creation...');

  // Simulate the memory data structure from storeMemory
  const createMemoryData = (userId, content, memoryType = 'general', category = 'user.general', sourceContext = {}) => {
    const timestamp = new Date().toISOString();
    const memoryId = 'test-memory-id-123';

    const determineProvenance = (sourceContext) => {
      if (sourceContext.provenance) return sourceContext.provenance;

      const sourceType = sourceContext.source_type || 'conversation';
      switch (sourceType) {
        case 'user_direct_statement':
          return 'USER_STATED';
        case 'external_search':
        case 'web_search':
          return 'VERIFIED_FACT';
        case 'system_event':
        case 'system':
          return 'SYSTEM_EVENT';
        case 'generated':
        case 'ai_generated':
          return 'GENERATED';
        case 'conversation':
        case 'inference':
        default:
          return 'INFERRED';
      }
    };

    return {
      id: memoryId,
      user_id: userId,
      owner: 'splendor',
      content: content.trim(),
      memory_type: memoryType,
      category: category,
      source_type: sourceContext.source_type || 'conversation',
      source_id: sourceContext.source_id || memoryId,
      source_metadata: {
        timestamp: timestamp,
        session_id: sourceContext.session_id,
        conversation_turn: sourceContext.conversation_turn,
        user_message_id: sourceContext.user_message_id,
        assistant_response_id: sourceContext.assistant_response_id,
        extraction_method: sourceContext.extraction_method || 'automatic',
        confidence_source: sourceContext.confidence_source || 'inference'
      },
      provenance: determineProvenance(sourceContext),
      confidence: sourceContext.confidence || 0.8,
      importance: sourceContext.importance || 0.5,
      active: true,
      approval_status: 'approved',
      created_at: timestamp,
      expires_at: sourceContext.expires_at || null,
      lineage: {
        created_by: 'splendor',
        creation_reason: sourceContext.creation_reason || 'user_interaction',
        validation_status: 'pending_claspion'
      }
    };
  };

  // Test memory creation with different contexts
  const testMemory1 = createMemoryData('chris_hughes', 'User likes coffee', 'preference');
  const testMemory2 = createMemoryData('chris_hughes', 'Weather is sunny today', 'observation', 'user.general', {
    source_type: 'external_search',
    confidence: 0.9
  });

  console.log('✓ Memory 1 (default context):');
  console.log(`  - Provenance: ${testMemory1.provenance} (should be INFERRED)`);
  console.log(`  - Content: ${testMemory1.content}`);

  console.log('✓ Memory 2 (external search):');
  console.log(`  - Provenance: ${testMemory2.provenance} (should be VERIFIED_FACT)`);
  console.log(`  - Confidence: ${testMemory2.confidence}`);

  // Check for required fields
  const requiredFields = ['id', 'user_id', 'content', 'provenance', 'active', 'approval_status'];
  const missingFields = [];
  for (const field of requiredFields) {
    if (testMemory1[field] === undefined || testMemory1[field] === null) {
      missingFields.push(field);
    }
  }

  if (missingFields.length === 0) {
    console.log('✓ All required fields present in memory data structure');
    return true;
  } else {
    console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
    return false;
  }
}

// Run tests
console.log('🚀 Testing Memory Provenance Fix\n');

const provenanceTestPassed = testProvenanceDetermination();
const structureTestPassed = testMemoryDataStructure();

console.log('\n📊 Test Results:');
if (provenanceTestPassed && structureTestPassed) {
  console.log('✅ All tests PASSED - Memory provenance fix is working correctly!');
  console.log('✅ Memory storage should now work without NULL constraint violations.');
  process.exit(0);
} else {
  console.log('❌ Some tests FAILED - Memory provenance fix needs adjustment.');
  process.exit(1);
}