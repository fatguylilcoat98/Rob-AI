'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Action/Outcome Feedback Tracker

  When Splendor surfaces a concrete recommendation with high confidence
  (pending_communication.should_share AND confidence_level >= 7), record it
  as a flagged_action so the owner can mark whether it was acted on.

  Splendor's reflection context loader (gatherReflectionContext) queries
  pending flagged actions so she knows what's still outstanding and whether
  her flags are being heard.
*/

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

const VALID_STATUSES = ['pending', 'acted', 'dismissed', 'noted'];

/**
 * Record a flagged action from a saved autonomous thought.
 *
 * Fire-and-forget — never throws to caller.
 *
 * @param {object} opts
 * @param {number}  opts.thoughtId    - autonomous_thoughts.id (bigint)
 * @param {string}  [opts.domain]     - domain tag e.g. "revenue"
 * @param {string}  opts.title        - one-line summary of the recommendation
 * @param {string}  [opts.description]- fuller explanation
 * @param {string}  [opts.userId]     - owner UUID
 */
function recordFlaggedAction({ thoughtId, domain, title, description, userId }) {
  _recordAsync({ thoughtId, domain, title, description, userId }).catch(() => {});
}

async function _recordAsync({ thoughtId, domain, title, description, userId }) {
  if (!title) return;

  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return;

  const { error } = await db.from('flagged_actions').insert([{
    user_id:     userId || null,
    thought_id:  thoughtId || null,
    domain:      domain   || null,
    title:       String(title).slice(0, 500),
    description: description ? String(description).slice(0, 2000) : null,
  }]);

  if (error) {
    console.warn('[ACTION-TRACKER] flagged_actions insert failed:', error.message);
  }
}

/**
 * Mark a flagged action with an outcome.
 *
 * @param {string} id     - flagged_actions.id (UUID)
 * @param {string} status - 'acted'|'dismissed'|'noted'
 * @param {string} [notes]
 * @returns {{ ok: boolean, error?: string }}
 */
async function updateOutcome(id, status, notes) {
  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, error: `invalid status "${status}"` };
  }

  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return { ok: false, error: 'db_unavailable' };

  const { error } = await db
    .from('flagged_actions')
    .update({
      status,
      outcome_notes:       notes || null,
      outcome_recorded_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Get pending (unresolved) flagged actions for context injection.
 *
 * @param {{ userId?: string, limit?: number }}
 * @returns {Array}
 */
async function getPendingActions({ userId, limit = 20 } = {}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return [];

  let q = db
    .from('flagged_actions')
    .select('id, domain, title, description, flagged_at, status')
    .eq('status', 'pending')
    .order('flagged_at', { ascending: false })
    .limit(limit);

  if (userId) q = q.eq('user_id', userId);

  const { data, error } = await q;
  if (error) {
    console.warn('[ACTION-TRACKER] getPendingActions failed:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Get all flagged actions (any status) for the owner dashboard.
 */
async function getAllActions({ userId, limit = 50 } = {}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return [];

  let q = db
    .from('flagged_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) q = q.eq('user_id', userId);

  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

module.exports = { recordFlaggedAction, updateOutcome, getPendingActions, getAllActions };
