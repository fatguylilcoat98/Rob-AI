'use strict';
require('dotenv').config();
require('../lib/sanitize-env').sanitizeEnv();
const gc = require('../lib/governance-continuity');

const OWNER = process.env.SPLENDOR_OWNER_EMAIL || 'chris';

async function main() {
  console.log('[governance-continuity-worker] Starting daily safeguard checks');

  const results = await gc.runAllChecks(OWNER);

  for (const [key, val] of Object.entries(results)) {
    const ok = val.ok !== false;
    console.log(`[governance-continuity-worker] ${key}: ${ok ? 'ok' : 'FAILED'} ${val.error ? '— ' + val.error : ''}`);
  }

  const emailSections = await gc.buildDailyEmailSections(OWNER);
  if (emailSections.length > 0) {
    console.log('[governance-continuity-worker] Daily email sections:');
    for (const s of emailSections) {
      console.log(`  [${s.title}] ${s.body}`);
    }
  } else {
    console.log('[governance-continuity-worker] All safeguards nominal — no email sections needed.');
  }

  console.log('[governance-continuity-worker] Done');
}

main().catch(err => {
  console.error('[governance-continuity-worker] Fatal:', err.message);
  process.exit(1);
});
