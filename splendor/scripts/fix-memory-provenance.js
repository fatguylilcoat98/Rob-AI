/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Fix missing provenance column in memory_items table

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { supabase } = require('../lib/supabase');

async function fixMemoryProvenance() {
  console.log('[FIX-PROVENANCE] Starting memory_items provenance column fix...');

  try {
    // Add provenance column if it doesn't exist
    console.log('[FIX-PROVENANCE] Adding provenance column...');
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}'::jsonb;`
    });

    if (alterError) {
      // Try alternative approach using raw SQL
      console.log('[FIX-PROVENANCE] RPC method failed, trying direct query...');
      console.log('[FIX-PROVENANCE] Error:', alterError.message);

      // Update existing rows that might have NULL provenance
      const { error: updateError } = await supabase
        .from('memory_items')
        .update({ provenance: {} })
        .is('provenance', null);

      if (updateError) {
        console.error('[FIX-PROVENANCE] Update failed:', updateError.message);
        console.log('[FIX-PROVENANCE] This might be normal if provenance column doesn\'t exist yet.');
      }
    }

    // Create index for performance
    console.log('[FIX-PROVENANCE] Creating provenance index...');
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: `CREATE INDEX IF NOT EXISTS idx_memory_items_provenance ON memory_items USING GIN(provenance);`
    });

    if (indexError) {
      console.log('[FIX-PROVENANCE] Index creation failed (might already exist):', indexError.message);
    }

    // Test memory storage with provenance
    console.log('[FIX-PROVENANCE] Testing memory storage...');
    const testMemory = {
      user_id: 'test_user_provenance_fix',
      owner: 'splendor',
      content: 'Test memory for provenance fix',
      memory_type: 'test',
      category: 'user.general',
      source_type: 'test',
      source_id: 'provenance_fix_test',
      source_metadata: { test: true },
      confidence: 0.9,
      importance: 0.5,
      active: true,
      approval_status: 'approved',
      lineage: {
        created_by: 'provenance_fix_script',
        creation_reason: 'testing_provenance_fix',
        validation_status: 'approved'
      },
      provenance: {
        fix_script: true,
        timestamp: new Date().toISOString(),
        purpose: 'provenance_column_fix_test'
      }
    };

    const { data: testData, error: testError } = await supabase
      .from('memory_items')
      .insert([testMemory])
      .select();

    if (testError) {
      console.error('[FIX-PROVENANCE] Test memory insertion failed:', testError.message);
      console.error('[FIX-PROVENANCE] This indicates the provenance column fix did not work.');

      // Try to provide more specific guidance
      if (testError.message.includes('provenance')) {
        console.log('\n[FIX-PROVENANCE] Manual fix required:');
        console.log('Run this SQL command against your database:');
        console.log('ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT \'{}\'::jsonb;');
      }

      return false;
    } else {
      console.log('[FIX-PROVENANCE] ✓ Test memory stored successfully with provenance!');

      // Clean up test memory
      await supabase
        .from('memory_items')
        .delete()
        .eq('id', testData[0].id);

      console.log('[FIX-PROVENANCE] ✓ Provenance fix completed successfully!');
      return true;
    }

  } catch (error) {
    console.error('[FIX-PROVENANCE] Unexpected error:', error.message);
    console.log('\n[FIX-PROVENANCE] Manual fix required:');
    console.log('Run this SQL command against your database:');
    console.log('ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT \'{}\'::jsonb;');
    return false;
  }
}

// Run the fix
if (require.main === module) {
  fixMemoryProvenance()
    .then(success => {
      if (success) {
        console.log('\n✓ Memory provenance fix completed successfully!');
        console.log('✓ Memory storage should now work without errors.');
        process.exit(0);
      } else {
        console.log('\n✗ Memory provenance fix failed.');
        console.log('✗ Manual database fix may be required.');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n✗ Fix script error:', error.message);
      process.exit(1);
    });
}

module.exports = { fixMemoryProvenance };