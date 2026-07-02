'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Memory Housekeeping — Q3

  Retires stale interior memories by age. Without retirement, every open
  question, noticed pattern, and self-reflection accumulates indefinitely.
  Old resolved questions keep surfacing. The interior layer becomes noise.

  Pure age-based retirement — no LLM, no guessing. If a memory type has
  sat longer than its threshold without being refreshed, it is retired.
  Developed positions persist longest because they are the most considered.

  Runs at the start of each reflection cycle. Best-effort; any error is
  logged and silently swallowed so it never blocks the cycle.
*/

const RETIREMENT_THRESHOLDS = {
  self_reflection:    60,  // days — reflections fade; newer ones supersede
  noticed_pattern:    45,  // days — patterns are time-bound observations
  open_question:      30,  // days — questions should evolve or close faster
  developed_position: 90,  // days — positions persist longer, harder-won
};

/**
 * Retire interior memories that have aged past their type threshold.
 * Works without userId — uses service key to operate across all users.
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 */
async function runInteriorHousekeeping(db) {
  if (!db) return;

  for (const [memoryType, days] of Object.entries(RETIREMENT_THRESHOLDS)) {
    try {
      const cutoff = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: stale, error } = await db
        .from('memory_items')
        .select('id')
        .eq('memory_type', memoryType)
        .eq('active', true)
        .lt('created_at', cutoff);

      if (error || !stale || stale.length === 0) continue;

      await db
        .from('memory_items')
        .update({ active: false, updated_at: new Date().toISOString() })
        .in('id', stale.map(r => r.id));

      console.log(
        `[housekeeping] Retired ${stale.length} stale ${memoryType} ` +
        `(>${days} days old)`
      );
    } catch (err) {
      console.warn(`[housekeeping] ${memoryType} cleanup failed (non-fatal):`, err.message);
    }
  }
}

module.exports = { runInteriorHousekeeping };
