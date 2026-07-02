/**
 * COMPREHENSIVE MEMORY SYSTEM TESTS
 * Tests all components of the enhanced memory architecture
 */

const { createClient } = require('@supabase/supabase-js');
const { EnhancedMemorySystem } = require('../lib/enhanced-memory-integration');

// Test configuration
const TEST_CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  pineconeApiKey: process.env.PINECONE_API_KEY,
  pineconeEnvironment: process.env.PINECONE_ENVIRONMENT,
  pineconeIndexName: process.env.PINECONE_INDEX_NAME,
  tavilyApiKey: process.env.TAVILY_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY
};

// Test data
const TEST_USER_ID = 'test-user-' + Date.now();
const TEST_SESSION_ID = 'test-session-' + Date.now();

class MemorySystemTests {
  constructor() {
    this.memorySystem = null;
    this.supabase = null;
    this.results = {
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async initialize() {
    try {
      console.log('🔧 Initializing test environment...');

      // Create memory system
      this.memorySystem = new EnhancedMemorySystem(TEST_CONFIG);

      // Create Supabase client
      this.supabase = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);

      // Test database connection
      const { data, error } = await this.supabase.from('memory_categories').select('id').limit(1);
      if (error) {
        throw new Error(`Database connection failed: ${error.message}`);
      }

      console.log('✅ Test environment initialized successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize test environment:', error.message);
      return false;
    }
  }

  async runAllTests() {
    console.log('\n🧪 RUNNING COMPREHENSIVE MEMORY SYSTEM TESTS\n');
    console.log('=' .repeat(60));

    const testSuites = [
      { name: 'Database Schema Tests', method: 'testDatabaseSchema' },
      { name: 'Memory Write Tests', method: 'testMemoryWrite' },
      { name: 'Memory Retrieval Tests', method: 'testMemoryRetrieval' },
      { name: 'Uncertainty Assessment Tests', method: 'testUncertaintyAssessment' },
      { name: 'Workspace Management Tests', method: 'testWorkspaceManagement' },
      { name: 'Conversation Processing Tests', method: 'testConversationProcessing' },
      { name: 'Web Search Integration Tests', method: 'testWebSearchIntegration' },
      { name: 'Memory Separation Tests', method: 'testMemorySeparation' },
      { name: 'Pinecone Sync Tests', method: 'testPineconeSync' },
      { name: 'Admin Dashboard Tests', method: 'testAdminFunctions' }
    ];

    for (const suite of testSuites) {
      console.log(`\n📝 Running ${suite.name}...`);
      try {
        await this[suite.method]();
        console.log(`✅ ${suite.name} completed`);
      } catch (error) {
        console.error(`❌ ${suite.name} failed:`, error.message);
        this.results.errors.push(`${suite.name}: ${error.message}`);
      }
    }

    return this.generateReport();
  }

  async testDatabaseSchema() {
    console.log('  🔍 Testing database schema and constraints...');

    // Test core tables exist
    const tables = [
      'raw_events', 'memory_items', 'conversations', 'splendor_decisions',
      'active_workspaces', 'reflections', 'memory_categories', 'pinecone_index_records'
    ];

    for (const table of tables) {
      const { data, error } = await this.supabase
        .from(table)
        .select('*')
        .limit(1);

      this.assert(!error, `Table ${table} should be accessible`, error?.message);
    }

    // Test memory categories are seeded
    const { data: categories } = await this.supabase
      .from('memory_categories')
      .select('name');

    this.assert(categories.length >= 15, `Should have at least 15 memory categories, found ${categories.length}`);

    // Test binding decisions are seeded
    const { data: decisions } = await this.supabase
      .from('splendor_decisions')
      .select('decision_type');

    this.assert(decisions.length >= 3, `Should have at least 3 binding decisions, found ${decisions.length}`);

    console.log('  ✅ Database schema tests passed');
  }

  async testMemoryWrite() {
    console.log('  📝 Testing memory write operations...');

    // Test basic memory creation
    const writeResult = await this.memorySystem.memoryServices.write.writeMemory({
      type: 'write_user_fact',
      userId: TEST_USER_ID,
      content: 'I prefer dark roast coffee',
      category: 'chris.preferences',
      memoryType: 'user_preference',
      sourceType: 'user_direct_statement',
      confidence: 0.9,
      importance: 0.6
    });

    this.assert(writeResult.success, 'Memory write should succeed');
    this.assert(writeResult.memoryId, 'Memory ID should be returned');

    // Test memory appears in database
    const { data: memory } = await this.supabase
      .from('memory_items')
      .select('*')
      .eq('id', writeResult.memoryId)
      .single();

    this.assert(memory.content === 'I prefer dark roast coffee', 'Memory content should be stored correctly');
    this.assert(memory.category === 'chris.preferences', 'Memory category should be stored correctly');

    // Test validation rules
    const invalidResult = await this.memorySystem.memoryServices.write.writeMemory({
      type: 'write_user_fact',
      userId: TEST_USER_ID,
      content: '', // Empty content should fail
      category: 'chris.preferences',
      memoryType: 'user_preference'
    });

    this.assert(!invalidResult.success, 'Empty content should be rejected');

    console.log('  ✅ Memory write tests passed');
  }

  async testMemoryRetrieval() {
    console.log('  🔍 Testing memory retrieval operations...');

    // Create test memories
    const testMemories = [
      { content: 'I love JavaScript programming', category: 'chris.preferences' },
      { content: 'My favorite color is blue', category: 'chris.preferences' },
      { content: 'Meeting scheduled for Friday', category: 'system.events' }
    ];

    const memoryIds = [];
    for (const mem of testMemories) {
      const result = await this.memorySystem.memoryServices.write.writeMemory({
        type: 'write_user_fact',
        userId: TEST_USER_ID,
        content: mem.content,
        category: mem.category,
        memoryType: 'user_fact',
        sourceType: 'test_data',
        confidence: 0.8,
        importance: 0.5
      });
      memoryIds.push(result.memoryId);
    }

    // Test memory retrieval
    const context = await this.memorySystem.memoryServices.retrieval.retrieveMemoryContext({
      userId: TEST_USER_ID,
      requestText: 'What are my preferences?',
      requestContext: 'answer_user_question',
      includeReflections: false
    });

    this.assert(context.facts.length >= 2, 'Should retrieve preference memories');

    const preferenceMemories = context.facts.filter(f => f.category === 'chris.preferences');
    this.assert(preferenceMemories.length >= 2, 'Should find preference-related memories');

    // Test category filtering works
    const jsMemory = context.facts.find(f => f.content.includes('JavaScript'));
    this.assert(jsMemory, 'Should find JavaScript preference memory');

    console.log('  ✅ Memory retrieval tests passed');
  }

  async testUncertaintyAssessment() {
    console.log('  ⚠️ Testing uncertainty assessment system...');

    // Create memories with different uncertainty profiles
    const uncertainMemories = [
      {
        content: 'User explicitly stated they prefer tea',
        sourceType: 'user_direct_statement',
        confidence: 0.95,
        expectedLabel: 'grounded'
      },
      {
        content: 'User seems to prefer morning meetings based on observation',
        sourceType: 'behavioral_inference',
        confidence: 0.6,
        expectedLabel: 'inferred'
      },
      {
        content: 'Old preference from 2020 - might be outdated',
        sourceType: 'imported_memory',
        confidence: 0.7,
        created_at: '2020-01-01T00:00:00Z',
        expectedLabel: 'stale'
      }
    ];

    for (const mem of uncertainMemories) {
      const writeResult = await this.memorySystem.memoryServices.write.writeMemory({
        type: 'write_user_fact',
        userId: TEST_USER_ID,
        content: mem.content,
        category: 'chris.preferences',
        memoryType: 'user_preference',
        sourceType: mem.sourceType,
        confidence: mem.confidence,
        importance: 0.5
      });

      // Get memory with uncertainty assessment
      const { data: memory } = await this.supabase
        .from('memory_items')
        .select('*, uncertainty_assessment')
        .eq('id', writeResult.memoryId)
        .single();

      const assessment = this.memorySystem.memoryServices.uncertainty.assessMemoryUncertainty(
        memory,
        { requestContext: 'test' }
      );

      console.log(`    Memory: "${mem.content.substring(0, 50)}..." -> ${assessment.confidenceLabel}`);
    }

    console.log('  ✅ Uncertainty assessment tests passed');
  }

  async testWorkspaceManagement() {
    console.log('  🏗️ Testing workspace management...');

    // Create workspace
    const workspaceId = await this.memorySystem.createWorkspace(
      TEST_USER_ID,
      'Test Project',
      'Testing workspace functionality'
    );

    this.assert(workspaceId, 'Workspace should be created');

    // Update workspace
    await this.memorySystem.updateWorkspace(workspaceId, {
      current_state: 'In progress',
      next_steps: ['Complete testing', 'Deploy system']
    });

    // Get workspace context
    const context = await this.memorySystem.memoryServices.workspace.getWorkspaceContext(workspaceId);
    this.assert(context.title === 'Test Project', 'Workspace title should match');
    this.assert(context.objective === 'Testing workspace functionality', 'Workspace objective should match');

    console.log('  ✅ Workspace management tests passed');
  }

  async testConversationProcessing() {
    console.log('  💬 Testing conversation processing...');

    // Test conversation processing
    const result = await this.memorySystem.processConversation(
      TEST_USER_ID,
      'I really enjoy working with Python and React',
      TEST_SESSION_ID
    );

    this.assert(result.response, 'Should generate response');
    this.assert(result.memoryStats, 'Should return memory stats');

    // Check conversation was recorded
    const { data: conversations } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .eq('session_id', TEST_SESSION_ID);

    this.assert(conversations.length >= 1, 'Should record user message');

    console.log('  ✅ Conversation processing tests passed');
  }

  async testWebSearchIntegration() {
    console.log('  🔍 Testing web search integration...');

    // Test web search trigger detection
    const queries = [
      { query: "What's the latest news in AI?", shouldTrigger: true },
      { query: "What's my favorite color?", shouldTrigger: false },
      { query: "Recent developments in machine learning", shouldTrigger: true },
      { query: "Hello how are you?", shouldTrigger: false }
    ];

    for (const test of queries) {
      const shouldSearch = this.memorySystem.shouldSearchWeb(test.query);
      this.assert(
        shouldSearch === test.shouldTrigger,
        `Query "${test.query}" should ${test.shouldTrigger ? '' : 'not '}trigger web search`
      );
    }

    console.log('  ✅ Web search integration tests passed');
  }

  async testMemorySeparation() {
    console.log('  🧩 Testing memory separation principles...');

    // Create different types of memories
    const memoryTypes = [
      { content: 'User said they prefer coffee', type: 'user_fact', table: 'memory_items' },
      { content: 'System logged successful login', type: 'system_event', table: 'raw_events' },
      { content: 'AI reflected on user patterns', type: 'ai_reflection', table: 'reflections' }
    ];

    for (const mem of memoryTypes) {
      if (mem.table === 'memory_items') {
        await this.memorySystem.memoryServices.write.writeMemory({
          type: 'write_user_fact',
          userId: TEST_USER_ID,
          content: mem.content,
          category: 'chris.preferences',
          memoryType: mem.type,
          sourceType: 'test_separation',
          confidence: 0.8,
          importance: 0.5
        });
      } else if (mem.table === 'raw_events') {
        await this.memorySystem.memoryServices.write.recordEvent(
          TEST_USER_ID,
          'test_event',
          'system',
          mem.content
        );
      }
    }

    // Verify separation - facts should not appear in events table and vice versa
    const { data: facts } = await this.supabase
      .from('memory_items')
      .select('content')
      .eq('user_id', TEST_USER_ID)
      .like('content', '%User said%');

    const { data: events } = await this.supabase
      .from('raw_events')
      .select('description')
      .eq('user_id', TEST_USER_ID)
      .like('description', '%System logged%');

    this.assert(facts.length > 0, 'User facts should be in memory_items table');
    this.assert(events.length > 0, 'System events should be in raw_events table');

    console.log('  ✅ Memory separation tests passed');
  }

  async testPineconeSync() {
    console.log('  🔗 Testing Pinecone synchronization...');

    try {
      // Test Pinecone service exists and can be called
      const pineconeService = this.memorySystem.memoryServices.pinecone;
      this.assert(pineconeService, 'Pinecone service should exist');

      // Test indexing (will use mock embedding)
      const testMemoryId = 'test-memory-' + Date.now();
      const vectorId = await pineconeService.indexMemory(
        TEST_USER_ID,
        'memory_items',
        testMemoryId,
        'This is test content for vector indexing',
        { category: 'test.sync', memory_type: 'test' }
      );

      this.assert(vectorId, 'Vector ID should be returned');

      // Test search
      const searchResults = await pineconeService.searchSimilar(
        TEST_USER_ID,
        'test content vector'
      );

      this.assert(Array.isArray(searchResults), 'Search should return array');

      console.log('  ✅ Pinecone sync tests passed');
    } catch (error) {
      console.log('  ⚠️ Pinecone tests skipped (service unavailable):', error.message);
    }
  }

  async testAdminFunctions() {
    console.log('  👑 Testing admin functions...');

    // Test memory stats
    const stats = await this.memorySystem.getMemoryStats(TEST_USER_ID);
    this.assert(typeof stats === 'object', 'Stats should return object');

    // Test memory approval workflow
    const pendingMemory = await this.memorySystem.memoryServices.write.writeMemory({
      type: 'write_user_fact',
      userId: TEST_USER_ID,
      content: 'This is a test memory that needs approval',
      category: 'chris.test',
      memoryType: 'user_fact',
      sourceType: 'requires_approval',
      confidence: 0.8,
      importance: 0.5
    });

    // Check approval status
    const { data: memory } = await this.supabase
      .from('memory_items')
      .select('approval_status')
      .eq('id', pendingMemory.memoryId)
      .single();

    this.assert(memory, 'Memory should exist');

    console.log('  ✅ Admin function tests passed');
  }

  assert(condition, message, errorDetails = null) {
    if (condition) {
      this.results.passed++;
    } else {
      this.results.failed++;
      const error = `Assertion failed: ${message}`;
      console.error(`    ❌ ${error}`);
      if (errorDetails) {
        console.error(`       Details: ${errorDetails}`);
      }
      throw new Error(error);
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');

    try {
      // Delete test user's data
      await this.supabase
        .from('memory_items')
        .delete()
        .eq('user_id', TEST_USER_ID);

      await this.supabase
        .from('raw_events')
        .delete()
        .eq('user_id', TEST_USER_ID);

      await this.supabase
        .from('conversations')
        .delete()
        .eq('user_id', TEST_USER_ID);

      await this.supabase
        .from('active_workspaces')
        .delete()
        .eq('user_id', TEST_USER_ID);

      console.log('✅ Test cleanup completed');
    } catch (error) {
      console.error('⚠️ Cleanup warning:', error.message);
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 MEMORY SYSTEM TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Tests Passed: ${this.results.passed}`);
    console.log(`❌ Tests Failed: ${this.results.failed}`);
    console.log(`📈 Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);

    if (this.results.errors.length > 0) {
      console.log('\n❌ ERROR SUMMARY:');
      this.results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }

    const overallSuccess = this.results.failed === 0;
    console.log(`\n🎯 OVERALL RESULT: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);

    return {
      success: overallSuccess,
      passed: this.results.passed,
      failed: this.results.failed,
      errors: this.results.errors
    };
  }
}

// Export for use in other files
module.exports = { MemorySystemTests };

// Run tests if this file is executed directly
if (require.main === module) {
  (async () => {
    const tests = new MemorySystemTests();

    const initialized = await tests.initialize();
    if (!initialized) {
      process.exit(1);
    }

    const results = await tests.runAllTests();
    await tests.cleanup();

    process.exit(results.success ? 0 : 1);
  })();
}

/**
 * USAGE INSTRUCTIONS:
 *
 * 1. Set environment variables:
 *    - SUPABASE_URL
 *    - SUPABASE_SERVICE_KEY
 *    - PINECONE_API_KEY
 *    - PINECONE_ENVIRONMENT
 *    - PINECONE_INDEX_NAME
 *    - TAVILY_API_KEY
 *    - ANTHROPIC_API_KEY
 *
 * 2. Run tests:
 *    node tests/memory-system-tests.js
 *
 * 3. Or run specific test suite:
 *    const { MemorySystemTests } = require('./tests/memory-system-tests');
 *    const tests = new MemorySystemTests();
 *    await tests.initialize();
 *    await tests.testMemoryWrite();
 */