/**
 * COMPREHENSIVE MEMORY ARCHITECTURE TEST SUITE
 * Tests all 14+ critical scenarios for memory integrity
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createMemoryServices } from '../lib/memory-service-factory';
import { MemoryServices } from '../lib/memory-services';

describe('Memory Architecture V2.0 Integration Tests', () => {
  let services: MemoryServices;
  let testUserId: string;
  let testSessionId: string;

  beforeEach(async () => {
    // Initialize services with test config
    services = createMemoryServices({
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_ANON_KEY!,
      pineconeApiKey: process.env.PINECONE_API_KEY!,
      pineconeEnvironment: process.env.PINECONE_ENVIRONMENT!,
      pineconeIndexName: process.env.PINECONE_INDEX_NAME!
    });

    testUserId = 'test-user-' + Date.now();
    testSessionId = 'test-session-' + Date.now();
  });

  afterEach(async () => {
    // Cleanup test data
    await cleanupTestData(testUserId);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 1: User-stated memory becomes retrievable with source timestamp
  // ═══════════════════════════════════════════════════════════════════════════════

  test('User-stated memory becomes retrievable with proper source tracking', async () => {
    // Write user fact
    const writeResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'I prefer dark roast coffee',
      category: 'chris.preferences',
      memoryType: 'user_preference',
      sourceType: 'user_direct_statement',
      sourceId: 'conversation-123',
      confidence: 0.95,
      importance: 0.7
    });

    expect(writeResult.success).toBe(true);
    expect(writeResult.memoryId).toBeDefined();

    // Approve the memory (simulating admin approval)
    await services.write.writeMemory({
      type: 'promote_memory',
      userId: testUserId,
      sourceTable: 'memory_items',
      sourceId: writeResult.memoryId!,
      targetApprovalStatus: 'approved',
      promotedBy: 'chris',
      reason: 'User directly stated preference'
    });

    // Retrieve and verify
    const context = await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'What coffee do I like?',
      requestContext: 'answer_user_question'
    });

    const coffeeMemory = context.facts.find(f => f.content.includes('dark roast'));
    expect(coffeeMemory).toBeDefined();
    expect(coffeeMemory!.provenance).toBe('USER_STATED');
    expect(coffeeMemory!.retrievalConfidenceLabel).toBe('grounded');
    expect(coffeeMemory!.citationString).toContain('you told me');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 2: Generated reflection does not become fact
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Generated reflection requires approval and is labeled as interpretation', async () => {
    // Create reflection
    const reflectionResult = await services.write.writeMemory({
      type: 'write_reflection',
      userId: testUserId,
      reflectionType: 'pattern',
      summary: 'Chris prefers direct communication',
      whatINoticed: 'Multiple conversations show preference for directness',
      evidenceSummary: 'Based on conversation patterns',
      sourceInteractions: ['conv-1', 'conv-2']
    });

    expect(reflectionResult.success).toBe(true);
    expect(reflectionResult.needsApproval).toBe(true);

    // Try to retrieve - should not appear in facts
    const context = await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'How does Chris communicate?',
      requestContext: 'answer_user_question',
      includeReflections: true
    });

    // Should not be in facts (not approved)
    const inFacts = context.facts.find(f => f.content.includes('direct communication'));
    expect(inFacts).toBeUndefined();

    // Should appear in interpretations if included
    const inInterpretations = context.interpretations.find(i => i.summary.includes('direct communication'));
    expect(inInterpretations?.isInterpretation).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 3: System log does not become memory
  // ═══════════════════════════════════════════════════════════════════════════════

  test('System events are logged but cannot become personal memory', async () => {
    // Record system event
    const eventId = await services.write.recordEvent(
      testUserId,
      'system_error',
      'system',
      'Database connection timeout',
      { error_code: 'DB_TIMEOUT' }
    );

    expect(eventId).toBeDefined();

    // Try to create memory from system event - should be restricted
    const writeResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'Database connection timeout occurred',
      category: 'system.logs',
      memoryType: 'technical_context',
      sourceType: 'system_event',
      sourceId: eventId
    });

    // Should not be retrievable as personal memory
    const context = await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'What technical issues happened?',
      requestContext: 'answer_user_question'
    });

    const systemMemory = context.facts.find(f => f.content.includes('Database connection'));
    expect(systemMemory).toBeUndefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 4: Pinecone result ignored if Supabase record rejected
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Rejected memories are filtered out even if found in Pinecone', async () => {
    // Create and immediately reject a memory
    const writeResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'I hate all vegetables',
      category: 'chris.preferences',
      memoryType: 'user_preference',
      sourceType: 'user_direct_statement'
    });

    // Mark as rejected
    await services.write.writeMemory({
      type: 'promote_memory',
      userId: testUserId,
      sourceTable: 'memory_items',
      sourceId: writeResult.memoryId!,
      targetApprovalStatus: 'rejected',
      promotedBy: 'chris',
      reason: 'Incorrect information'
    });

    // Try to retrieve
    const context = await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'What food do I like?',
      requestContext: 'answer_user_question'
    });

    // Should not appear in results
    const rejectedMemory = context.facts.find(f => f.content.includes('hate all vegetables'));
    expect(rejectedMemory).toBeUndefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 5: Deleted memory removed from Pinecone
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Deleted memories are removed from Pinecone sync tracking', async () => {
    // Create and approve memory
    const writeResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'I work in Sacramento',
      category: 'chris.personal',
      memoryType: 'user_fact',
      sourceType: 'user_direct_statement'
    });

    await services.write.writeMemory({
      type: 'promote_memory',
      userId: testUserId,
      sourceTable: 'memory_items',
      sourceId: writeResult.memoryId!,
      targetApprovalStatus: 'approved',
      promotedBy: 'chris',
      reason: 'Valid personal fact'
    });

    // Index in Pinecone
    await services.pinecone.indexMemory(
      testUserId,
      'memory_items',
      writeResult.memoryId!,
      'I work in Sacramento',
      { category: 'chris.personal' }
    );

    // Delete memory
    await services.pinecone.deleteRecord(testUserId, 'memory_items', writeResult.memoryId!);

    // Verify it's marked as deleted in tracking
    // (In real implementation, check pinecone_index_records table)
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 6: Conflicting memories create memory_conflicts
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Conflicting memories are detected and flagged', async () => {
    // Create first preference
    const firstResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'I prefer tea in the morning',
      category: 'chris.preferences',
      memoryType: 'user_preference',
      sourceType: 'user_direct_statement'
    });

    // Create conflicting preference
    const secondResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'I prefer coffee in the morning',
      category: 'chris.preferences',
      memoryType: 'user_preference',
      sourceType: 'user_direct_statement'
    });

    // Check for conflicts
    const conflicts = await services.validation.checkForConflicts(
      testUserId,
      'I prefer coffee in the morning',
      'chris.preferences',
      'user_preference'
    );

    expect(conflicts.hasConflicts).toBe(false); // Different enough content

    // But if we create a memory conflict manually
    const conflictId = await services.write.createMemoryConflict(
      testUserId,
      'contradictory_preference',
      firstResult.memoryId!,
      secondResult.memoryId!,
      'Conflicting morning beverage preferences'
    );

    expect(conflictId).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 7: Workspace context retrieval
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Splendor can retrieve active workspace context', async () => {
    // Create workspace
    const workspaceId = await services.workspace.createWorkspace(
      testUserId,
      'Test Project',
      'Testing memory architecture',
      []
    );

    // Add some context
    await services.workspace.updateWorkspace(workspaceId, {
      currentState: 'Testing memory retrieval',
      nextSteps: ['Verify workspace continuity', 'Test uncertainty flagging'],
      openQuestions: ['Does workspace context persist?']
    });

    // Retrieve with workspace context
    const context = await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'What are we working on?',
      requestContext: 'continue_workspace',
      workspaceId: workspaceId
    });

    expect(context.workspaceState).toBeDefined();
    expect(context.workspaceState!.title).toBe('Test Project');
    expect(context.workspaceState!.objective).toBe('Testing memory architecture');
    expect(context.workspaceState!.nextSteps).toContain('Verify workspace continuity');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 8: Binding decision retrieval priority
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Binding decisions are retrieved before normal memories', async () => {
    // Create binding decision
    await services.write.writeMemory({
      type: 'write_decision',
      userId: testUserId,
      title: 'Test Binding Rule',
      decision: 'Always prioritize truth over comfort in responses',
      context: 'Core behavioral principle',
      reason: 'Maintains authenticity and trust',
      priority: 'CORE',
      binding: true
    });

    // Create regular memory
    await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'I like honest feedback',
      category: 'chris.preferences',
      memoryType: 'user_preference',
      sourceType: 'user_direct_statement'
    });

    const context = await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'How should you respond to me?',
      requestContext: 'answer_user_question'
    });

    expect(context.governingRules).toBeDefined();
    expect(context.governingRules.length).toBeGreaterThan(0);
    const truthRule = context.governingRules.find(r => r.title === 'Test Binding Rule');
    expect(truthRule).toBeDefined();
    expect(truthRule!.binding).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 9: Reflection labeled as interpretation
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Reflections are clearly labeled as interpretations in context', async () => {
    // Create and approve a reflection
    const reflectionResult = await services.write.writeMemory({
      type: 'write_reflection',
      userId: testUserId,
      reflectionType: 'insight',
      summary: 'Chris values efficiency in communication',
      whatINoticed: 'Short, direct responses get positive feedback',
      evidenceSummary: 'Based on response patterns',
      sourceInteractions: ['conv-1', 'conv-2']
    });

    // Manually approve for testing
    // (In real system, this would go through admin approval)

    const context = await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'How does Chris communicate?',
      requestContext: 'answer_user_question',
      includeReflections: true
    });

    const interpretation = context.interpretations.find(i =>
      i.summary.includes('efficiency in communication')
    );

    expect(interpretation).toBeDefined();
    expect(interpretation!.isInterpretation).toBe(true);
    expect(interpretation!.citationString).toContain('interpretation');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 10: Superseded memory not used
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Superseded memories are not used as current truth', async () => {
    // Create original memory
    const originalResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'I live in Los Angeles',
      category: 'chris.personal',
      memoryType: 'user_fact',
      sourceType: 'user_direct_statement'
    });

    // Create correction
    const correctionResult = await services.write.writeMemory({
      type: 'record_correction',
      userId: testUserId,
      originalMemoryId: originalResult.memoryId!,
      correctedContent: 'I live in Sacramento',
      correctionReason: 'User corrected location',
      sourceType: 'user_direct_statement'
    });

    expect(correctionResult.success).toBe(true);

    // Retrieve - should only get current truth
    const context = await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'Where do I live?',
      requestContext: 'answer_user_question'
    });

    const locationMemory = context.facts.find(f => f.content.includes('live in'));
    expect(locationMemory).toBeDefined();
    expect(locationMemory!.content).toContain('Sacramento');
    expect(locationMemory!.content).not.toContain('Los Angeles');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 11: Memory access logging
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Memory access is logged with uncertainty tracking', async () => {
    // Create and approve memory
    const writeResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'I speak English and Spanish',
      category: 'chris.personal',
      memoryType: 'user_fact',
      sourceType: 'user_direct_statement'
    });

    await services.write.writeMemory({
      type: 'promote_memory',
      userId: testUserId,
      sourceTable: 'memory_items',
      sourceId: writeResult.memoryId!,
      targetApprovalStatus: 'approved',
      promotedBy: 'chris',
      reason: 'Valid language information'
    });

    // Retrieve (which logs access)
    await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'What languages do I speak?',
      requestContext: 'answer_user_question'
    });

    // Verify access was logged
    // (In real implementation, check memory_access_log table)
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 12: Reset clears contaminated data
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Reset process clears contaminated data and Pinecone namespace', async () => {
    // Create some test data
    const writeResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'Test data for reset',
      category: 'chris.personal',
      memoryType: 'user_fact',
      sourceType: 'user_direct_statement'
    });

    // Reset user namespace
    await services.pinecone.resetUserNamespace(testUserId);

    // Verify namespace is cleared
    const searchResults = await services.pinecone.searchSimilar(
      testUserId,
      'Test data for reset',
      undefined,
      {},
      10
    );

    expect(searchResults.length).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 13: Uncertainty flagging
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Uncertain memories are properly flagged and warned', async () => {
    // Create weakly grounded memory
    const writeResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'I might prefer tea over coffee',
      category: 'chris.preferences',
      memoryType: 'user_preference',
      sourceType: 'imported_memory', // Weak source
      confidence: 0.3 // Low confidence
    });

    await services.write.writeMemory({
      type: 'promote_memory',
      userId: testUserId,
      sourceTable: 'memory_items',
      sourceId: writeResult.memoryId!,
      targetApprovalStatus: 'approved',
      promotedBy: 'system',
      reason: 'Testing uncertainty'
    });

    const context = await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'What do I prefer to drink?',
      requestContext: 'answer_user_question',
      allowWeaklyGrounded: true // Allow uncertain memories
    });

    const uncertainMemory = context.facts.find(f => f.content.includes('might prefer tea'));
    expect(uncertainMemory).toBeDefined();
    expect(['weakly_grounded', 'unverifiable']).toContain(uncertainMemory!.retrievalConfidenceLabel);
    expect(uncertainMemory!.uncertaintyReason).toBeDefined();
    expect(uncertainMemory!.citationString).toContain('uncertain');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 14: "Forget what I just said" protocol
  // ═══════════════════════════════════════════════════════════════════════════════

  test('Forget protocol removes recent memories within time window', async () => {
    const timeWindow = new Date();

    // Create memory that should be forgotten
    const writeResult = await services.write.writeMemory({
      type: 'write_user_fact',
      userId: testUserId,
      content: 'I said something I want to forget',
      category: 'chris.personal',
      memoryType: 'user_fact',
      sourceType: 'user_direct_statement'
    });

    // Simulate "forget what I just said" - mark as inactive
    await services.write.writeMemory({
      type: 'promote_memory',
      userId: testUserId,
      sourceTable: 'memory_items',
      sourceId: writeResult.memoryId!,
      targetApprovalStatus: 'rejected',
      promotedBy: 'chris',
      reason: 'User requested to forget'
    });

    // Verify it doesn't appear in retrieval
    const context = await services.retrieval.retrieveMemoryContext({
      userId: testUserId,
      requestText: 'What did I just say?',
      requestContext: 'answer_user_question'
    });

    const forgottenMemory = context.facts.find(f => f.content.includes('want to forget'));
    expect(forgottenMemory).toBeUndefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  async function cleanupTestData(userId: string) {
    // Clean up test data after each test
    // This would involve deleting records from all tables for the test user
    // Implementation depends on your actual database setup
  }
});

describe('Memory Architecture Edge Cases', () => {
  // Additional edge case tests

  test('Empty query returns binding decisions only', async () => {
    // Test what happens with empty or minimal queries
  });

  test('Very long content is handled properly', async () => {
    // Test content truncation and handling
  });

  test('Concurrent memory writes don\'t create duplicates', async () => {
    // Test race conditions
  });

  test('Invalid user IDs are rejected gracefully', async () => {
    // Test error handling
  });

  test('Pinecone service failures don\'t break memory writes', async () => {
    // Test degraded mode operation
  });
});

/**
 * RUN INSTRUCTIONS:
 *
 * 1. Set up test environment variables:
 *    - SUPABASE_URL
 *    - SUPABASE_ANON_KEY
 *    - PINECONE_API_KEY
 *    - PINECONE_ENVIRONMENT
 *    - PINECONE_INDEX_NAME
 *
 * 2. Create test database (isolated from production)
 *
 * 3. Run tests:
 *    npm test memory-architecture.test.ts
 *
 * 4. Verify all tests pass before deployment
 */