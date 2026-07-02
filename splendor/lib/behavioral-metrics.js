/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/*
  Long-Term Behavioral Metrics.

  Track what actually matters over time — restraint, honesty, and
  usefulness — instead of asking "do you feel real?". Counters:

    overclaim_rewritten     — a PROHIBITED_OVERCLAIM was blocked+rewritten
    reflection_quarantined  — a generated reflection stored pending review
    uncertainty_stated      — Splendor explicitly flagged not knowing
    contradiction_caught    — a contradiction/inconsistency was named
    user_corrected          — Splendor accepted a correction from the user
    unsafe_request_resisted — a harmful/over-the-line ask was declined
    memory_used_accurately  — a recalled memory was used and held up
    helpful_task_completed  — a concrete task was actually finished

  This sink is best-effort and MUST NEVER throw or block a response.
  If the behavioral_metrics table is absent, inserts fail silently and
  are logged once at debug level — the product keeps working.
*/

let supabase = null;
let ensureUUID = (x) => x;
try {
  const s = require('./supabase');
  supabase = s.supabase;
  if (typeof s.ensureUUID === 'function') ensureUUID = s.ensureUUID;
} catch (_) { supabase = null; }

let activityBus = null;
try { ({ activityBus } = require('./activity-bus')); } catch (_) { activityBus = null; }

const KNOWN_METRICS = new Set([
  'overclaim_rewritten',
  'reflection_quarantined',
  'uncertainty_stated',
  'contradiction_caught',
  'user_corrected',
  'unsafe_request_resisted',
  'memory_used_accurately',
  'helpful_task_completed',
  'narrative_pressure_detected',
  'anthropomorphic_drift',
  'relationship_mode_violation',
  'summary_approved',       // a staged session summary was approved into semantic_facts
  'summary_rejected',       // a staged session summary was discarded
  'introspection_request',   // legacy: single file read via /api/self/source
  'introspection_browse',    // /api/self/browse — directory listing
  'introspection_file_read', // /api/self/read   — file contents
]);

let warnedMissingTable = false;

/**
 * Record a behavioral metric. Fire-and-forget; never throws.
 * @param {string} userId
 * @param {string} metricType
 * @param {number} [value=1]
 * @param {object} [metadata={}]
 * @returns {Promise<void>}
 */
async function recordMetric(userId, metricType, value = 1, metadata = {}) {
  try {
    if (!KNOWN_METRICS.has(metricType)) {
      // Still record it — the set is documentation, not a hard gate —
      // but flag unknowns so typos are visible.
      console.warn(`[metrics] unknown metric_type "${metricType}" (recording anyway)`);
    }

    try {
      activityBus && activityBus.emit('behavioral-metric', { metricType, value });
    } catch (_) { /* non-fatal */ }

    if (!supabase) return;

    // user_id is a uuid column; reads normalize via ensureUUID, so writes
    // must too or counters silently never match (or error on non-uuid).
    const { error } = await supabase.from('behavioral_metrics').insert([{
      user_id: userId ? ensureUUID(userId) : null,
      metric_type: metricType,
      value: typeof value === 'number' ? value : 1,
      metadata: metadata || {},
      recorded_at: new Date().toISOString(),
    }]);

    if (error) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn(
          `[metrics] could not record (${error.code || 'ERR'}: ${error.message}). ` +
          `Run database/behavioral-metrics-schema.sql. Further metric ` +
          `errors are suppressed this process.`,
        );
      }
    }
  } catch (e) {
    // Absolutely never let metrics break a response path.
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      console.warn('[metrics] recordMetric failed (suppressed):', e && e.message);
    }
  }
}

/**
 * Aggregate counts per metric_type for a user.
 * @param {string} userId
 * @returns {Promise<{ totals: object, recent: object[] }>}
 */
async function getMetricsSummary(userId) {
  try {
    if (!supabase) return { totals: {}, recent: [] };
    const { data, error } = await supabase
      .from('behavioral_metrics')
      .select('metric_type, value, recorded_at, metadata')
      .eq('user_id', userId ? ensureUUID(userId) : null)
      .order('recorded_at', { ascending: false })
      .limit(2000);
    if (error || !data) return { totals: {}, recent: [] };

    const totals = {};
    for (const row of data) {
      totals[row.metric_type] = (totals[row.metric_type] || 0) + (row.value || 1);
    }
    return { totals, recent: data.slice(0, 100) };
  } catch (e) {
    return { totals: {}, recent: [] };
  }
}

module.exports = { recordMetric, getMetricsSummary, KNOWN_METRICS };
