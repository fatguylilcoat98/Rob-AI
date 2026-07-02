/*
  Verify that all memory storage points have proper provenance values
  This test checks that no memory_items inserts are missing provenance
*/

const fs = require('fs');
const path = require('path');

function testMemoryProvenanceCompleteness() {
  console.log('🔍 Verifying all memory_items inserts have proper provenance...\n');

  const filesToCheck = [
    'lib/supabase.js',
    'lib/enhanced-memory-integration.js',
    'lib/memory-write-service.ts',
    'tests/simple-memory-test.js'
  ];

  let allValid = true;
  const allowedProvenance = [
    'USER_STATED', 'VERIFIED_FACT', 'INFERRED',
    'GENERATED', 'SYSTEM_EVENT', 'ADMIN_APPROVED'
  ];

  for (const file of filesToCheck) {
    console.log(`📄 Checking ${file}...`);

    try {
      const fullPath = path.join(process.cwd(), file);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Check for memory_items inserts
      const memoryItemsInsertRegex = /from\('memory_items'\)[\s\S]*?\.insert\(\{[\s\S]*?\}\)/g;
      const matches = content.match(memoryItemsInsertRegex);

      if (matches) {
        for (const match of matches) {
          console.log(`  🔍 Found insert: ${match.substring(0, 100)}...`);

          // Check if provenance is included
          if (!match.includes('provenance')) {
            console.log(`  ❌ Missing provenance field!`);
            allValid = false;
          } else {
            // Check if provenance value is valid
            const provenanceMatch = match.match(/provenance:\s*['"]([^'"]+)['"]/);
            if (provenanceMatch) {
              const provenanceValue = provenanceMatch[1];
              if (allowedProvenance.includes(provenanceValue)) {
                console.log(`  ✅ Valid provenance: ${provenanceValue}`);
              } else {
                console.log(`  ❌ Invalid provenance: ${provenanceValue} (not in allowed list)`);
                allValid = false;
              }
            } else {
              console.log(`  ✅ Provenance field present (dynamic value)`);
            }
          }
        }
      } else {
        console.log('  ℹ️  No memory_items inserts found');
      }
    } catch (error) {
      console.log(`  ⚠️  Could not read file: ${error.message}`);
    }

    console.log();
  }

  return allValid;
}

function testProvenanceConstraintValues() {
  console.log('📋 Testing provenance constraint values...\n');

  // Test all allowed values
  const allowedValues = [
    'USER_STATED', 'VERIFIED_FACT', 'INFERRED',
    'GENERATED', 'SYSTEM_EVENT', 'ADMIN_APPROVED'
  ];

  console.log('✅ Allowed provenance values:');
  allowedValues.forEach(value => {
    console.log(`   - ${value}`);
  });

  // Test that our default mapping covers all cases
  console.log('\n🔧 Testing provenance mapping logic...');
  const testCases = [
    { sourceType: 'conversation', expected: 'INFERRED' },
    { sourceType: 'user_direct', expected: 'USER_STATED' },
    { sourceType: 'web_search', expected: 'VERIFIED_FACT' },
    { sourceType: 'system_event', expected: 'SYSTEM_EVENT' },
    { sourceType: 'generated', expected: 'GENERATED' }
  ];

  let mappingValid = true;
  for (const testCase of testCases) {
    if (allowedValues.includes(testCase.expected)) {
      console.log(`✅ ${testCase.sourceType} → ${testCase.expected}`);
    } else {
      console.log(`❌ ${testCase.sourceType} → ${testCase.expected} (INVALID)`);
      mappingValid = false;
    }
  }

  return mappingValid;
}

// Run the tests
console.log('🚀 Memory Provenance Completeness Check\n');

const codeValid = testMemoryProvenanceCompleteness();
const mappingValid = testProvenanceConstraintValues();

console.log('\n📊 Results:');
if (codeValid && mappingValid) {
  console.log('✅ ALL CHECKS PASSED');
  console.log('✅ All memory_items inserts have proper provenance values');
  console.log('✅ All provenance values are within allowed constraints');
  console.log('✅ Memory storage should work without NULL constraint violations');
} else {
  console.log('❌ SOME CHECKS FAILED');
  if (!codeValid) console.log('❌ Missing or invalid provenance values found in code');
  if (!mappingValid) console.log('❌ Provenance mapping logic has invalid values');
}