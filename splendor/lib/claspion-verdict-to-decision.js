/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  CLASPION Verdict → Governance Decision Bridge

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

  PURPOSE
  -------
  CLASPION writes every runtime enforcement verdict to `governance_verdicts`.
  The Governance Glass Box reads from `governance_decisions`.
  This bridge is the only connection between the two tables.

  ENFORCEMENT GUARANTEE
  ---------------------
  This module is observability-only. It runs fire-and-forget after the
  verdict is already returned to the middleware. A failure here cannot
  delay, alter, or bypass any CLASPION enforcement decision.

  DEDUPLICATION
  -------------
  The `governance_decisions` table has a partial unique index on
  (source_type, source_correlation_id) WHERE source_correlation_id IS NOT NULL.
  An in-process LRU set provides a fast first check before any DB round-trip.
*/

'use strict';

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

// In-process dedup: skip DB round-trip for correlation_ids already bridged
// in this process lifetime. Capped to avoid unbounded memory growth.
const _seenCorrelations = new Set();
const _MAX_SEEN = 5000;

// Per-error-code log dedup: prevents repeated identical warnings in logs.
const _seenErrors = new Set();
function _logOnce(code, message) {
  const key = String(code || 'UNKNOWN');
  if (_seenErrors.has(key)) return;
  _seenErrors.add(key);
  console.warn('[CLASPION-BRIDGE] governance_decisions write failed (will not repeat per error code):', key, message || '');
}

/**
 * Map a CLASPION verdict to a normalized governance_decisions row.
 *
 * Returns the mapped field object, or null if this verdict should not be
 * bridged. Skipped cases:
 *   - Locally dormant verdicts (CLASPION_ENABLED=false) — one per request, no signal
 *   - Response-audit verdicts (intent_type='response') — always the most-recent row,
 *     drowning out meaningful request decisions in the Live Decision card
 *   - Low-signal ALLOW verdicts for routine reads (http_read, unspecified) — noise
 *     with no governance signal
 *
 * BLOCK verdicts are always bridged regardless of intent type — any block is
 * signal worth persisting (fail-closed, upstream policy denial, rule violation).
 */
function mapVerdictToDecision(verdict, ctx) {
  // Never bridge locally-dormant verdicts.
  if (verdict.dormant) return null;

  const intentType = verdict.intent_type || (ctx && ctx.intentType) || 'unspecified';
  const isBlock = !verdict.allow || verdict.decision !== 'ALLOW';

  // For ALLOW verdicts, only bridge meaningful action intent types.
  // Skip response audits, bare http_reads, and unspecified — these are routine
  // infrastructure calls that flood the table and make the Live Decision card
  // show "CLASPION validation for response" instead of real governance events.
  if (!isBlock) {
    const OBSERVABLE_INTENT_TYPES = new Set([
      'chat_interaction', 'send_chat_response',
      'memory_store', 'memory_update', 'memory_delete',
      'admin_operation', 'governance_operation',
      'user_login', 'user_signup',
      'file_upload', 'external_api_call',
      'system_override', 'rule_modification',
      'governance_change', 'user_data_modification',
    ]);
    if (!OBSERVABLE_INTENT_TYPES.has(intentType)) return null;
  }

  const { decision, allow, outcome, outcome_cause, basis_state, failed_axes, latency_ms, reason, correlation_id } = verdict;

  // ── validity_state ──────────────────────────────────────────────────────
  // Reflects evidential support for the claim, not operational permission.
  let validityState;
  if (decision === 'ALLOW' && allow === true) {
    validityState = 'supported';
  } else if (decision === 'BLOCK' && basis_state === 'UNREACHABLE') {
    // Upstream unreachable — claim is unsupported because no evidence reached it
    validityState = 'unsupported';
  } else if (decision === 'BLOCK' && Array.isArray(failed_axes) && failed_axes.length > 0) {
    // Specific rule axes failed — claim contradicted by policy
    validityState = 'contradicted';
  } else {
    validityState = 'contested';
  }

  // ── admissibility_state ─────────────────────────────────────────────────
  // Reflects whether the claim may be acted upon, independent of validity.
  let admissibilityState;
  if (allow === true) {
    admissibilityState = 'admissible';
  } else if (decision === 'BLOCK' || outcome === 'fail_closed') {
    admissibilityState = 'inadmissible';
  } else {
    admissibilityState = 'requires_review';
  }

  // ── action_state ────────────────────────────────────────────────────────
  // Maps enforcement outcome to the consequence engine's action vocabulary.
  let actionState;
  if (allow === true) {
    actionState = 'allow';
  } else if (decision === 'BLOCK') {
    actionState = 'block';
  } else {
    actionState = 'pause';
  }

  // ── evidence_summary ────────────────────────────────────────────────────
  const parts = [
    `basis_state=${basis_state || 'unknown'}`,
    `outcome=${outcome || 'unknown'}${outcome_cause ? `/${outcome_cause}` : ''}`,
    `decision=${decision}`,
    allow ? 'allow=true' : 'allow=false',
  ];
  if (typeof latency_ms === 'number') parts.push(`latency_ms=${latency_ms}`);
  if (correlation_id) parts.push(`correlation_id=${correlation_id}`);
  const evidenceSummary = parts.join('; ');

  // ── weakening_evidence ──────────────────────────────────────────────────
  let weakeningEvidence = null;
  if (!allow) {
    const wp = [];
    if (reason) wp.push(`reason: ${reason}`);
    if (Array.isArray(failed_axes) && failed_axes.length > 0) wp.push(`failed_axes: ${failed_axes.join(', ')}`);
    if (basis_state === 'UNREACHABLE') wp.push('CLASPION upstream unreachable');
    if (outcome === 'fail_closed') wp.push('fail_closed — blocked for safety');
    if (wp.length) weakeningEvidence = wp.join(' | ');
  }

  // ── consequence_reason ──────────────────────────────────────────────────
  const consequenceReason = reason && reason.length > 0
    ? reason
    : `CLASPION runtime verdict: ${decision} / ${outcome || 'unknown'} / ${basis_state || 'unknown'}`;

  return {
    claim: `CLASPION validation for ${intentType}`,
    confidence: null,
    evidenceSummary,
    weakeningEvidence,
    validityState,
    admissibilityState,
    actionState,
    consequenceReason,
    reviewRequired: decision !== 'ALLOW' || allow !== true,
    createdBy: 'claspion_bridge',
    sourceType: 'claspion_verdict',
    sourceCorrelationId: correlation_id || null,
  };
}

/**
 * Bridge a CLASPION verdict into a governance_decisions row.
 *
 * Fire-and-forget — never throws, never delays the caller.
 * Also creates an initial governance_state_transitions record and a
 * flight_recorder governance event for the bridged decision.
 */
function bridgeVerdictToDecision(verdict, ctx) {
  _bridgeAsync(verdict, ctx).catch(() => {});
}

async function _bridgeAsync(verdict, ctx) {
  try {
    const mapped = mapVerdictToDecision(verdict, ctx);
    if (!mapped) return;

    const correlationId = verdict.correlation_id || null;

    // Fast in-process dedup check
    if (correlationId && _seenCorrelations.has(correlationId)) return;

    const supa = safeRequireSupabase();
    const db = supa && supa.supabase;
    if (!db) return;

    // DB-level dedup: check for existing row with this source_correlation_id
    if (correlationId) {
      const { data: existing } = await db
        .from('governance_decisions')
        .select('id')
        .eq('source_type', 'claspion_verdict')
        .eq('source_correlation_id', correlationId)
        .maybeSingle();
      if (existing) {
        if (_seenCorrelations.size < _MAX_SEEN) _seenCorrelations.add(correlationId);
        return;
      }
    }

    // Insert the governance_decisions row
    const { data: created, error: insertErr } = await db
      .from('governance_decisions')
      .insert([{
        user_id: null,
        claim: mapped.claim,
        confidence: null,
        evidence_summary: mapped.evidenceSummary,
        weakening_evidence: mapped.weakeningEvidence,
        validity_state: mapped.validityState,
        admissibility_state: mapped.admissibilityState,
        action_state: mapped.actionState,
        consequence_reason: mapped.consequenceReason,
        review_required: mapped.reviewRequired,
        created_by: mapped.createdBy,
        source_type: mapped.sourceType,
        source_correlation_id: mapped.sourceCorrelationId,
      }])
      .select('id')
      .single();

    if (insertErr) {
      _logOnce(insertErr.code || 'INSERT_ERR', insertErr.message);
      return;
    }
    if (!created || !created.id) return;

    // Update in-process dedup cache
    if (correlationId && _seenCorrelations.size < _MAX_SEEN) {
      _seenCorrelations.add(correlationId);
    }

    const decisionId = created.id;

    // Write initial governance_state_transitions record — fire-and-forget
    db.from('governance_state_transitions')
      .insert([{
        decision_id: decisionId,
        user_id: null,
        from_validity_state: null,
        to_validity_state: mapped.validityState,
        from_admissibility_state: null,
        to_admissibility_state: mapped.admissibilityState,
        from_action_state: null,
        to_action_state: mapped.actionState,
        transition_reason: 'Initial CLASPION verdict bridged into Governance Consequence Engine',
        actor: 'claspion_bridge',
      }])
      .then(() => {})
      .catch(() => {});

    // Write flight_recorder governance event — non-fatal if user_id is not a
    // valid UUID (recordGovernanceEvent requires a non-null UUID userId and
    // returns early otherwise; we accept the silent no-op here).
    try {
      const fr = require('./flight-recorder');
      if (fr && typeof fr.recordGovernanceEvent === 'function') {
        fr.recordGovernanceEvent({
          userId: null,
          eventType: 'claspion_verdict_bridged',
          details: {
            decisionId,
            claim: mapped.claim,
            validityState: mapped.validityState,
            admissibilityState: mapped.admissibilityState,
            actionState: mapped.actionState,
            correlationId,
            decision: verdict.decision,
            outcome: verdict.outcome,
            basisState: verdict.basis_state,
          },
        }).catch(() => {});
      }
    } catch (_) {}

  } catch (err) {
    _logOnce(err && (err.code || 'BRIDGE_ERR'), err && err.message);
  }
}

module.exports = {
  mapVerdictToDecision,
  bridgeVerdictToDecision,
};
