'use strict';

/*
 * Environmental Scan Provenance
 *
 * For every environmental scan item surfaced or emailed, record why it
 * was surfaced, what confidence was assigned, what uncertainty was preserved,
 * and what governance/admissibility check was applied.
 *
 * Answers these questions post-hoc:
 *   1. What source triggered this?
 *   2. Why did Splendor think it mattered?
 *   3. What confidence was assigned?
 *   4. What uncertainty was preserved?
 *   5. Why was it emailed instead of only stored?
 *   6. Was any governance/admissibility check applied?
 */

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

const VALID_ACTIONS = ['ignored','stored','surfaced','emailed','quarantined'];

async function recordScanItem({
  userId,
  scanCycleId,
  title,
  sourceUrl = null,
  sourceType = null,
  summary = null,
  confidence = null,
  uncertaintyNotes = null,
  whySurfaced = null,
  actionTaken = 'stored',
  governanceReason = null,
}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return { error: 'db_unavailable' };

  const { data, error } = await db
    .from('environmental_scan_provenance')
    .insert([{
      user_id: userId || null,
      scan_cycle_id: scanCycleId || null,
      title: title || '(untitled)',
      source_url: sourceUrl || null,
      source_type: sourceType || null,
      summary: summary || null,
      confidence: confidence != null ? +confidence : null,
      uncertainty_notes: uncertaintyNotes || null,
      why_surfaced: whySurfaced || null,
      action_taken: VALID_ACTIONS.includes(actionTaken) ? actionTaken : 'stored',
      governance_reason: governanceReason || null,
    }])
    .select()
    .single();

  return { record: data || null, error: error ? error.message : null };
}

async function getRecentScans({ userId, limit = 50 } = {}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return { records: [], error: 'db_unavailable' };

  let q = db.from('environmental_scan_provenance').select('*').order('created_at', { ascending: false }).limit(limit);
  if (userId) q = q.eq('user_id', userId);

  const { data, error } = await q;
  return { records: data || [], error: error ? error.message : null };
}

module.exports = { recordScanItem, getRecentScans };
