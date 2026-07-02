// workers/continuity-shadow-cron.js
// Cron entry for Master Continuity — Shadow Mode.
// One-shot: runs the pattern-detection reflection engine for the owner,
// stages reflections to the `reflections` table for human admin review
// (nothing auto-surfaces), then exits. Scheduled via render.yaml cron.
//
// Run manually:  node workers/continuity-shadow-cron.js
require('dotenv').config();
require('../lib/sanitize-env').sanitizeEnv();

const { createClient } = require('@supabase/supabase-js');
const { runReflectionEngine } = require('../lib/master-continuity-engine');

async function main() {
  const userId = process.env.SPLENDOR_OWNER_USER_ID;

  if (!userId) {
    console.error('[shadow-cron] SPLENDOR_OWNER_USER_ID not set — cannot pick a user');
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[shadow-cron] missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[shadow-cron] missing ANTHROPIC_API_KEY');
    process.exit(1);
  }

  // ── Startup self-test ──────────────────────────────────────────────────────
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const testQuery = await supabase
    .from('memory_items')
    .select('*', { count: 'exact', head: true });
  if (testQuery.error) {
    console.error(`[STARTUP SELF-TEST] ❌ FAILED: ${testQuery.error.message}`);
    process.exit(1);
  }
  console.log(`[STARTUP SELF-TEST] ✅ DB connected. ${testQuery.count} memory_items in system.`);
  // ────────────────────────────────────────────────────────────────────────────

  try {
    const r = await runReflectionEngine(userId, { lookbackHours: 24 });
    console.log(
      `[shadow-cron] done — processed=${r.processed} staged=${r.reflections} success=${r.success} (${r.duration}ms)`
    );
    process.exit(r.success ? 0 : 1);
  } catch (e) {
    console.error('[shadow-cron] failed:', (e && e.message) || e);
    process.exit(1);
  }
}

main();
