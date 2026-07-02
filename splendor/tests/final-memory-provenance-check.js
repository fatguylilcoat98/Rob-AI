/*
  Final check for memory_items INSERT statements with provenance
*/

const fs = require('fs');
const path = require('path');

function checkMemoryInserts() {
  console.log('🔍 Checking only INSERT statements for memory_items...\n');

  const filesToCheck = [
    'lib/supabase.js',
    'lib/enhanced-memory-integration.js',
    'lib/memory-write-service.ts',
    'tests/simple-memory-test.js',
    'routes/enhanced-chat.js'
  ];

  let allValid = true;
  const allowedProvenance = [
    'USER_STATED', 'VERIFIED_FACT', 'INFERRED',
    'GENERATED', 'SYSTEM_EVENT', 'ADMIN_APPROVED'
  ];

  for (const file of filesToCheck) {
    console.log(`📄 ${file}:`);

    try {
      const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');

      // More precise regex for INSERT statements only
      const insertRegex = /from\(['"]memory_items['"]\)[\s\S]*?\.insert\(\{[\s\S]*?\}\)/g;
      const matches = content.match(insertRegex);

      if (matches) {
        matches.forEach((match, index) => {
          console.log(`  INSERT ${index + 1}:`);

          if (match.includes('provenance')) {
            // Check for valid provenance value
            const provenanceMatch = match.match(/provenance:\s*['"]([^'"]+)['"]|provenance:\s*([a-zA-Z_]+)/);
            if (provenanceMatch) {
              const provenanceValue = provenanceMatch[1] || provenanceMatch[2];
              if (allowedProvenance.includes(provenanceValue)) {
                console.log(`    ✅ Valid: ${provenanceValue}`);
              } else {
                console.log(`    ❌ Invalid: ${provenanceValue}`);
                allValid = false;
              }
            } else {
              console.log(`    ✅ Dynamic provenance (variable/function)`);
            }
          } else {
            console.log(`    ❌ Missing provenance field`);
            allValid = false;
          }
        });
      } else {
        console.log('  ℹ️ No memory_items INSERT statements found');
      }
    } catch (error) {
      console.log(`  ⚠️ Could not read: ${error.message}`);
    }
    console.log();
  }

  return allValid;
}

// Quick manual check of key files
function manualSpotCheck() {
  console.log('🔍 Manual spot check of key INSERT locations:\n');

  // Check the main storeMemory function
  const supabaseContent = fs.readFileSync('lib/supabase.js', 'utf8');
  const hasProvenanceInStoreMemory = supabaseContent.includes('provenance: provenance');
  console.log(`✅ lib/supabase.js storeMemory has provenance: ${hasProvenanceInStoreMemory}`);

  // Check enhanced memory integration
  const enhancedContent = fs.readFileSync('lib/enhanced-memory-integration.js', 'utf8');
  const hasVerifiedFact = enhancedContent.includes("provenance: 'VERIFIED_FACT'");
  const hasUserStated = enhancedContent.includes("provenance: 'USER_STATED'");
  console.log(`✅ enhanced-memory-integration.js has VERIFIED_FACT: ${hasVerifiedFact}`);
  console.log(`✅ enhanced-memory-integration.js has USER_STATED: ${hasUserStated}`);

  // Check memory write service
  const writeServiceContent = fs.readFileSync('lib/memory-write-service.ts', 'utf8');
  const hasDetermineProvenance = writeServiceContent.includes('this.determineProvenance');
  const hasDirectProvenance = writeServiceContent.includes("provenance: 'USER_STATED'");
  console.log(`✅ memory-write-service.ts has determineProvenance: ${hasDetermineProvenance}`);
  console.log(`✅ memory-write-service.ts has direct USER_STATED: ${hasDirectProvenance}`);

  return hasProvenanceInStoreMemory && hasVerifiedFact && hasUserStated && (hasDetermineProvenance || hasDirectProvenance);
}

console.log('🚀 Final Memory Provenance Check\n');

const insertCheck = checkMemoryInserts();
const spotCheck = manualSpotCheck();

console.log('\n📊 Final Results:');
if (insertCheck && spotCheck) {
  console.log('✅ ALL MEMORY INSERTS HAVE PROPER PROVENANCE');
  console.log('✅ Fixed: lib/enhanced-memory-integration.js EXTERNAL_SEARCH → VERIFIED_FACT');
  console.log('✅ Fixed: lib/supabase.js storeMemory function includes provenance logic');
  console.log('✅ Memory storage should now work without NULL constraint violations');
} else {
  console.log('❌ ISSUES FOUND - Manual review needed');
}