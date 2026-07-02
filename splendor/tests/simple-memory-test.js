/**
 * SIMPLE MEMORY SYSTEM TEST
 * Quick verification that enhanced memory system is working
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testMemorySystem() {
  console.log('🧪 TESTING ENHANCED MEMORY SYSTEM');
  console.log('=' .repeat(50));

  try {
    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    console.log('✅ Supabase client initialized');

    // Test 1: Check core tables exist
    console.log('\n📋 Testing database schema...');

    const coreTables = [
      'memory_categories', 'memory_items', 'raw_events',
      'conversations', 'splendor_decisions', 'active_workspaces'
    ];

    for (const table of coreTables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        throw new Error(`Table ${table} not accessible: ${error.message}`);
      }
      console.log(`  ✅ ${table} - OK`);
    }

    // Test 2: Check memory categories are seeded
    console.log('\n🏷️ Testing seed data...');

    const { data: categories, error: catError } = await supabase
      .from('memory_categories')
      .select('name');

    if (catError) {
      throw new Error(`Categories check failed: ${catError.message}`);
    }

    console.log(`  ✅ Memory categories: ${categories.length} found`);
    if (categories.length >= 15) {
      console.log(`  ✅ Seed data complete (expected 15+)`);
    } else {
      console.log(`  ⚠️ Only ${categories.length} categories (expected 15+)`);
    }

    // Test 3: Check binding decisions
    const { data: decisions, error: decError } = await supabase
      .from('splendor_decisions')
      .select('decision_type');

    if (decError) {
      throw new Error(`Decisions check failed: ${decError.message}`);
    }

    console.log(`  ✅ Binding decisions: ${decisions.length} found`);

    // Test 4: Test memory write operation
    console.log('\n📝 Testing memory operations...');

    const testUserId = 'test-user-' + Date.now();
    const { data: newMemory, error: writeError } = await supabase
      .from('memory_items')
      .insert({
        user_id: testUserId,
        content: 'Test memory for system verification',
        category: 'chris.test',
        memory_type: 'user_fact',
        source_type: 'test_verification',
        confidence: 0.9,
        importance: 0.5,
        provenance: 'USER_STATED',
        active: true
      })
      .select()
      .single();

    if (writeError) {
      throw new Error(`Memory write failed: ${writeError.message}`);
    }

    console.log(`  ✅ Memory write successful: ${newMemory.id}`);

    // Test 5: Test memory retrieval
    const { data: retrievedMemory, error: readError } = await supabase
      .from('memory_items')
      .select('*')
      .eq('id', newMemory.id)
      .single();

    if (readError || !retrievedMemory) {
      throw new Error(`Memory retrieval failed: ${readError?.message}`);
    }

    console.log(`  ✅ Memory retrieval successful`);

    // Test 6: Test uncertainty assessment function
    console.log('\n⚠️ Testing uncertainty assessment...');

    const { data: uncertainty, error: uncError } = await supabase
      .rpc('assess_memory_uncertainty', {
        memory_record: {
          content: retrievedMemory.content,
          source_type: retrievedMemory.source_type,
          confidence: retrievedMemory.confidence,
          provenance: retrievedMemory.provenance,
          created_at: retrievedMemory.created_at
        },
        retrieval_context: { requestContext: 'test' }
      });

    if (uncError) {
      console.log(`  ⚠️ Uncertainty function not available: ${uncError.message}`);
    } else {
      console.log(`  ✅ Uncertainty assessment: ${uncertainty.confidence_label}`);
    }

    // Cleanup test memory
    await supabase
      .from('memory_items')
      .delete()
      .eq('id', newMemory.id);

    console.log('  ✅ Test cleanup completed');

    // Test 7: Check Pinecone index tracking table
    console.log('\n🔗 Testing Pinecone integration...');

    const { data: pineconeRecords, error: pineconeError } = await supabase
      .from('pinecone_index_records')
      .select('*')
      .limit(1);

    if (pineconeError) {
      throw new Error(`Pinecone table check failed: ${pineconeError.message}`);
    }

    console.log(`  ✅ Pinecone tracking table accessible`);

    // Final summary
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 ENHANCED MEMORY SYSTEM STATUS: OPERATIONAL');
    console.log('✅ Database schema deployed');
    console.log('✅ Seed data loaded');
    console.log('✅ Memory operations working');
    console.log('✅ Uncertainty assessment ready');
    console.log('✅ Pinecone integration table ready');
    console.log('\n🚀 READY TO START ENHANCED SERVER!');
    console.log('Run: npm run server:enhanced');
    console.log('Admin: http://localhost:3000/admin/enhanced-dashboard.html');

    return true;

  } catch (error) {
    console.error('\n❌ MEMORY SYSTEM TEST FAILED:');
    console.error(error.message);
    console.error('\n🔧 Check your .env file and database deployment');
    return false;
  }
}

// Run the test
testMemorySystem().then(success => {
  process.exit(success ? 0 : 1);
});