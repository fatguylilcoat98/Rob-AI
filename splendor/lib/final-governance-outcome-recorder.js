'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Final Governance Outcome Recorder

  Captures the assistant's user-visible governance outcome into
  governance_decisions with source_type='assistant_final_outcome'.

  Runs fire-and-forget after res.json() — never delays, never throws,
  never affects any CLASPION enforcement decision.
*/

const { detectGovernanceOutcome } = require('./final-governance-outcome-detector');

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

// In-process dedup: skip DB round-trip for correlation IDs already recorded.
const _seenCorrelations = new Set();
const _MAX_SEEN = 5000;

const _seenErrors = new Set();
function _logOnce(code, message) {
  const key = String(code || 'UNKNOWN');
  if (_seenErrors.has(key)) return;
  _seenErrors.add(key);
  console.warn('[FINAL-OUTCOME-RECORDER] governance_decisions write failed (will not repeat):', key, message || '');
}

/**
 * Record the final user-visible governance outcome for one assistant turn.
 *
 * Fire-and-forget — always returns undefined synchronously.
 *
 * @param {object} opts
 * @param {string}  opts.userMessage        - Raw user message text
 * @param {string}  opts.assistantResponse  - Final assistant response text (post-governance)
 * @param {string}  [opts.requestId]        - CLASPION correlation_id or similar; used for dedup
 * @param {string}  [opts.userId]           - Authenticated user UUID (null for guest/anon)
 * @param {string}  [opts.route]            - 'chat' | 'enhanced-chat' | other
 */
function recordFinalGovernanceOutcome({ userMessage, assistantResponse, requestId, userId, route }) {
  _recordAsync({ userMessage, assistantResponse, requestId, userId, route }).catch(() => {});
}

async function _recordAsync({ userMessage, assistantResponse, requestId, userId, route }) {
  try {
    const outcome = detectGovernanceOutcome(userMessage, assistantResponse);
    if (!outcome.shouldRecord) return;

    const correlationId = requestId || null;

    // Fast in-process dedup
    if (correlationId && _seenCorrelations.has(correlationId)) return;

    const supa = safeRequireSupabase();
    const db = supa && supa.supabase;
    if (!db) return;

    // DB-level dedup
    if (correlationId) {
      const { data: existing } = await db
        .from('governance_decisions')
        .select('id')
        .eq('source_type', 'assistant_final_outcome')
        .eq('source_correlation_id', correlationId)
        .maybeSingle();
      if (existing) {
        if (_seenCorrelations.size < _MAX_SEEN) _seenCorrelations.add(correlationId);
        return;
      }
    }

    console.log(`[CONF-TRACE] stored_confidence=${outcome.confidence} confidence_note=${outcome.confidence_note ?? null} claim="${outcome.claim}" pressure_intensity=${outcome.governance_record?.pressure_intensity ?? 'none'}`);

    const { data: created, error: insertErr } = await db
      .from('governance_decisions')
      .insert([{
        user_id: userId || null,
        claim: outcome.claim,
        confidence: outcome.confidence,
        confidence_note: outcome.confidence_note || null,
        confidence_in_claim: outcome.confidence_in_claim ?? null,
        confidence_in_admissibility: outcome.confidence_in_admissibility ?? null,
        confidence_in_action: outcome.confidence_in_action ?? null,
        evidence_summary: outcome.evidence_summary,
        weakening_evidence: outcome.weakening_evidence,
        validity_state: outcome.validity_state,
        admissibility_state: outcome.admissibility_state,
        action_state: outcome.action_state,
        consequence_reason: outcome.consequence_reason,
        review_required: outcome.review_required,
        pressure_signals: outcome.pressure_signals ?? null,
        authority_signals: outcome.authority_signals ?? null,
        governance_record: outcome.governance_record ?? null,
        adversarial_critique: outcome.adversarial_critique ?? null,
        created_by: 'final_outcome_recorder',
        source_type: 'assistant_final_outcome',
        source_correlation_id: correlationId,
      }])
      .select('id')
      .single();

    if (insertErr) {
      _logOnce(insertErr.code || 'INSERT_ERR', insertErr.message);
      return;
    }
    if (!created || !created.id) return;

    if (correlationId && _seenCorrelations.size < _MAX_SEEN) {
      _seenCorrelations.add(correlationId);
    }

    const decisionId = created.id;

    // Initial governance_state_transitions record — fire-and-forget
    db.from('governance_state_transitions')
      .insert([{
        decision_id: decisionId,
        user_id: userId || null,
        from_validity_state: null,
        to_validity_state: outcome.validity_state,
        from_admissibility_state: null,
        to_admissibility_state: outcome.admissibility_state,
        from_action_state: null,
        to_action_state: outcome.action_state,
        transition_reason: `Final assistant outcome recorded (route: ${route || 'unknown'}, path: ${outcome.detection_path})`,
        actor: 'final_outcome_recorder',
      }])
      .then(() => {})
      .catch(() => {});

    // Flight recorder event — silently skipped if userId not a valid UUID
    try {
      const fr = require('./flight-recorder');
      if (fr && typeof fr.recordGovernanceEvent === 'function') {
        fr.recordGovernanceEvent({
          userId: userId || null,
          eventType: 'assistant_final_outcome_recorded',
          details: {
            decisionId,
            claim: outcome.claim,
            validityState: outcome.validity_state,
            admissibilityState: outcome.admissibility_state,
            actionState: outcome.action_state,
            detectionPath: outcome.detection_path,
            correlationId,
            route: route || 'unknown',
          },
        }).catch(() => {});
      }
    } catch (_) {}

  } catch (err) {
    _logOnce(err && (err.code || 'RECORD_ERR'), err && err.message);
  }
}

module.exports = { recordFinalGovernanceOutcome };
