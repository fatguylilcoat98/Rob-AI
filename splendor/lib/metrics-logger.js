/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back
*/

/*
  Measurement layer (audit repair — Item 5).

  Observability ONLY for the work already shipped in Items 1–4. No new behavior,
  no autonomy, no dashboards, no new telemetry service. It reads the metrics
  objects those items already produce and emits ONE structured log line per
  surface with consistent metric names:

    [METRICS][chat]          — per chat/stream turn (accountability, identity,
                               memory, governance)
    [METRICS][consciousness] — per consciousness cycle (continuity)

  Pure builders (buildChatMetrics / buildCycleMetrics) are unit-tested; the
  emit* wrappers just log them and never throw.
*/

function num(x) { return Number.isFinite(x) ? x : 0; }
function bool(x) { return !!x; }

/**
 * Build the per-turn chat metric record from the objects Items 1, 2 and 4
 * already return, plus the governance verdict and a measured latency.
 *   accountability : lib/chat-accountability.js metrics
 *   identity       : lib/identity-context.js metrics
 *   recall         : splendor-brain pipeline.hippocampus.recallTelemetry
 *   governance     : the CLASPION verdict object
 */
function buildChatMetrics({ surface = 'chat', userId, accountability = {}, identity = {}, recall = {}, governance = {}, governanceLatencyMs = 0 } = {}) {
  const a = accountability || {};
  const i = identity || {};
  const r = recall || {};
  const g = governance || {};

  // fail_closed: a non-allow verdict that came from an outage/uncertainty
  // (fail-closed) rather than a real upstream policy block.
  const failClosed = g.outcome === 'fail_closed' ||
    (g.allow === false && g.outcome_cause && g.outcome_cause !== 'upstream');

  return {
    surface,
    ts: new Date().toISOString(),
    user_present: !!userId,
    accountability: {
      commitment_read_count: num(a.commitment_read_count != null ? a.commitment_read_count : a.commitments_read),
      contradiction_check_count: num(a.contradiction_check_count != null ? a.contradiction_check_count : a.contradiction_checked),
      contradiction_found_count: num(a.contradiction_found_count != null ? a.contradiction_found_count : a.contradictions_caught),
      supersession_count: num(a.supersession_count != null ? a.supersession_count : a.contradictions_caught),
      accountability_context_loaded: bool(a.accountability_context_loaded),
    },
    identity: {
      identity_state_loaded: bool(i.identity_state_loaded),
      identity_state_injected: bool(i.identity_state_injected),
      identity_state_age: i.identity_state_age_seconds != null ? i.identity_state_age_seconds : null,
      identity_state_row_id: i.identity_state_row_id != null ? i.identity_state_row_id : null,
    },
    memory: {
      supabase_candidate_count: num(r.supabase_candidates),
      pinecone_candidate_count: num(r.pinecone_candidates),
      pinecone_quarantined: bool(r.pinecone_quarantined),
      candidates_injected: num(r.candidates_injected),
      rerank_used: bool(r.reranked),
      final_source_distribution: r.source_distribution || {},
    },
    governance: {
      verdict_outcome: g.outcome != null ? g.outcome : (g.decision != null ? g.decision : null),
      verdict_cause: g.outcome_cause != null ? g.outcome_cause : null,
      conscience_name: g.conscience_name != null ? g.conscience_name : null,
      latency_ms: num(governanceLatencyMs),
      fail_closed: bool(failClosed),
    },
  };
}

function emitChatMetrics(args) {
  const m = buildChatMetrics(args);
  try { console.log(`[METRICS][chat] ${JSON.stringify(m)}`); } catch (_) { /* never throw */ }
  return m;
}

/**
 * Build the per-cycle continuity metric record from the consciousness
 * telemetry object (lib/consciousness-telemetry.js buildCycleTelemetry).
 * thoughts_created is derived: rows_produced minus the three created-counts.
 */
function buildCycleMetrics(t = {}) {
  const inquiries = num(t.inquiry_threads_created);
  const comms = num(t.pending_communications_created);
  const proactive = num(t.proactive_conversations_created);
  const thoughts = Math.max(0, num(t.rows_produced) - inquiries - comms - proactive);
  return {
    ts: new Date().toISOString(),
    worker_enabled: bool(t.worker_enabled),
    scheduler_enabled: bool(t.scheduler_enabled),
    last_successful_run: t.last_successful_run != null ? t.last_successful_run : null,
    thoughts_created: thoughts,
    inquiries_created: inquiries,
    communications_created: comms,
    proactive_conversations_created: proactive,
  };
}

function emitCycleMetrics(telemetry) {
  const m = buildCycleMetrics(telemetry);
  try { console.log(`[METRICS][consciousness] ${JSON.stringify(m)}`); } catch (_) { /* never throw */ }
  return m;
}

module.exports = { buildChatMetrics, emitChatMetrics, buildCycleMetrics, emitCycleMetrics };
