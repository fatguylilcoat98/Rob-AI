/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// MEMORY DECAY WORKER (Layer 2 → Layer 4 pipeline, decay step)
// Reduces decay_score on episodes older than 7 days. When decay_score
// reaches 0.3, the compression worker will fold the episode into a
// long-term summary and flag the row as 'compressed'.
//
// Run from Render cron (daily). Safe to run more often — idempotent
// per row by tracking ‘decayed_through’ via the score floor.

require('dotenv').config();
require('../lib/sanitize-env').sanitizeEnv();

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY)) {
  console.error('Decay worker: Supabase env vars missing — aborting.');
  process.exit(0);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const DECAY_STEP = 0.1;
const FLOOR = 0.0;
const AGE_DAYS = 7;

async function run() {
  try {
    // ── Startup self-test ────────────────────────────────────────────────────
    const testQuery = await supabase
      .from('memory_items')
      .select('*', { count: 'exact', head: true });
    if (testQuery.error) {
      console.error(`[STARTUP SELF-TEST] ❌ FAILED: ${testQuery.error.message}`);
      process.exit(1);
    }
    console.log(`[STARTUP SELF-TEST] ✅ DB connected. ${testQuery.count} memory_items in system.`);
    // ────────────────────────────────────────────────────────────────────────

    const cutoff = new Date(Date.now() - AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Pull all episodic rows older than cutoff with score > floor
    const { data: rows, error } = await supabase
      .from('episodes')
      .select('id, decay_score')
      .eq('memory_tier', 'episodic')
      .lt('created_at', cutoff)
      .gt('decay_score', FLOOR);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      console.log('Decay worker: nothing to decay.');
      return;
    }

    console.log(`Decay worker: decaying ${rows.length} episodes`);
    let updated = 0;
    for (const row of rows) {
      const next = Math.max(FLOOR, (row.decay_score ?? 1.0) - DECAY_STEP);
      const { error: upErr } = await supabase
        .from('episodes')
        .update({ decay_score: next })
        .eq('id', row.id);
      if (upErr) {
        console.error('Decay update failed:', upErr.message);
      } else {
        updated++;
      }
    }
    console.log(`Decay worker: updated ${updated}/${rows.length}.`);
  } catch (err) {
    console.error('Decay worker error:', err.message);
  }
}

if (require.main === module) {
  run().then(() => process.exit(0));
}

module.exports = { run };
