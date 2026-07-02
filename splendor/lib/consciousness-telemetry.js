/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back
*/

/*
  Consciousness telemetry (audit repair — Item 3, Plans A + B).

  This module adds MEASUREMENT and HONEST LABELING only. It does NOT change
  generation logic, does NOT make any subsystem smarter, and does NOT touch
  CLASPION.

  Plan B — telemetry: buildCycleTelemetry() shapes the per-cycle metrics the
  audit asked for; recordCycleTelemetry() logs them and best-effort writes a
  row to consciousness_telemetry (no-op if the table/DB is absent);
  getLatestTelemetry() reads the most recent row.

  Plan A — honest labeling: STATIC_PLACEHOLDER_FIELDS lists the consciousness_state
  fields that are written as constants (never measured); markStaticPlaceholders()
  re-wraps them so a surface presents them as static placeholders, not measured
  state.

  Operator status: deriveOperationalStatus() reduces telemetry to one of
  ACTIVE / IDLE / DISABLED / ERROR so an operator can tell what is really
  happening — crucially distinguishing IDLE (ran clean, produced nothing) from
  ERROR (failed/stale) from DISABLED (not running).
*/

// consciousness_state fields that are hardcoded constants (see
// workers/autonomous-reflection-worker.js updateConsciousnessState). They must
// never be presented to an operator as measured state.
const STATIC_PLACEHOLDER_FIELDS = ['current_mood', 'mood', 'energy_level', 'self_assessment', 'system_status'];

/**
 * Re-wrap any static-placeholder fields on a state object so they cannot be
 * read as measured values. Returns a shallow copy with those keys moved under
 * `static_placeholders: { <field>: { value, measured:false, note } }`.
 */
function markStaticPlaceholders(state) {
  if (!state || typeof state !== 'object') return state;
  const out = {};
  const placeholders = {};
  for (const [k, v] of Object.entries(state)) {
    if (STATIC_PLACEHOLDER_FIELDS.includes(k)) {
      placeholders[k] = { value: v, measured: false, note: 'static placeholder — not a measured value' };
    } else {
      out[k] = v;
    }
  }
  if (Object.keys(placeholders).length) out.static_placeholders = placeholders;
  return out;
}

/**
 * Shape one cycle's telemetry. Pure — no I/O. All counts default to 0.
 */
function buildCycleTelemetry(input = {}) {
  const n = (x) => (Number.isFinite(x) ? x : 0);
  const inquiryCreated = n(input.inquiry_threads_created);
  const commsCreated = n(input.pending_communications_created);
  const proactiveCreated = n(input.proactive_conversations_created);
  const thoughts = n(input.thoughts_generated);
  const inquiriesProcessed = n(input.inquiries_processed);
  const commsProcessed = n(input.communications_processed);

  return {
    cycle_type: input.cycle_type || 'scheduled',
    success: input.success !== false,
    errors: n(input.errors),
    duration_ms: n(input.duration_ms),
    // The eight metrics the audit requested:
    last_successful_run: input.success !== false ? (input.run_at || new Date().toISOString()) : null,
    rows_produced: thoughts + inquiryCreated + commsCreated + proactiveCreated,
    rows_consumed: inquiriesProcessed + commsProcessed,
    worker_enabled: input.worker_enabled !== false,
    scheduler_enabled: input.scheduler_enabled !== false,
    inquiry_threads_created: inquiryCreated,
    pending_communications_created: commsCreated,
    proactive_conversations_created: proactiveCreated,
    recorded_at: input.run_at || new Date().toISOString(),
  };
}

/**
 * Reduce telemetry to a single operator status. Pure.
 *   DISABLED — worker/scheduler not running, or no telemetry at all.
 *   ERROR    — last cycle failed, or no/stale successful run.
 *   ACTIVE   — recent successful run that produced rows.
 *   IDLE     — recent successful run that produced nothing (ran clean, no work).
 */
function deriveOperationalStatus(t, opts = {}) {
  const now = opts.now || Date.now();
  const maxAgeMs = opts.maxAgeMs || 6 * 60 * 60 * 1000; // a cycle should land within ~6h
  if (!t) return { status: 'DISABLED', reason: 'no telemetry recorded yet' };
  if (t.worker_enabled === false || t.scheduler_enabled === false) {
    return { status: 'DISABLED', reason: 'consciousness worker/scheduler not enabled' };
  }
  if (t.success === false || (t.errors || 0) > 0) {
    return { status: 'ERROR', reason: `last cycle reported ${t.errors || 0} error(s)` };
  }
  const last = t.last_successful_run ? new Date(t.last_successful_run).getTime() : null;
  if (!last || Number.isNaN(last)) return { status: 'ERROR', reason: 'no successful run recorded' };
  if (now - last > maxAgeMs) {
    return { status: 'ERROR', reason: `last successful run is stale (> ${Math.round(maxAgeMs / 3600000)}h)` };
  }
  if ((t.rows_produced || 0) > 0) return { status: 'ACTIVE', reason: 'recent cycle produced rows' };
  return { status: 'IDLE', reason: 'recent cycle ran clean but produced no rows' };
}

/**
 * Record cycle telemetry: always logs a structured line; best-effort writes a
 * consciousness_telemetry row. Never throws. `deps.supabase` is the client;
 * when absent or the table is missing, only the log line is emitted.
 */
async function recordCycleTelemetry(telemetry, deps = {}) {
  try {
    console.log(`[CONSCIOUSNESS][telemetry] ${JSON.stringify(telemetry)}`);
  } catch (_) { /* logging must not throw */ }

  const supabase = deps.supabase || null;
  if (!supabase) return { written: false, reason: 'no supabase client' };
  try {
    const { error } = await supabase.from('consciousness_telemetry').insert({
      cycle_type: telemetry.cycle_type,
      success: telemetry.success,
      errors: telemetry.errors,
      duration_ms: telemetry.duration_ms,
      last_successful_run: telemetry.last_successful_run,
      rows_produced: telemetry.rows_produced,
      rows_consumed: telemetry.rows_consumed,
      worker_enabled: telemetry.worker_enabled,
      scheduler_enabled: telemetry.scheduler_enabled,
      inquiry_threads_created: telemetry.inquiry_threads_created,
      pending_communications_created: telemetry.pending_communications_created,
      proactive_conversations_created: telemetry.proactive_conversations_created,
    });
    if (error) return { written: false, reason: error.message };
    return { written: true };
  } catch (e) {
    return { written: false, reason: e && e.message };
  }
}

/**
 * Read the most recent telemetry row. Best-effort; returns null on any failure
 * (including the table not existing yet).
 */
async function getLatestTelemetry(deps = {}) {
  const supabase = deps.supabase || null;
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('consciousness_telemetry')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0];
  } catch (_) {
    return null;
  }
}

module.exports = {
  STATIC_PLACEHOLDER_FIELDS,
  markStaticPlaceholders,
  buildCycleTelemetry,
  deriveOperationalStatus,
  recordCycleTelemetry,
  getLatestTelemetry,
};
