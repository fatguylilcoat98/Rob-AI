'use strict';

// Governance Consequence Engine
// Separates evidential validity, operational admissibility, and consequence/action state.
// Core principle: confidence does NOT equal permission.

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

// Attempt to write a flight recorder governance event (non-fatal).
function recordToFlightRecorder(userId, eventType, details) {
  try {
    const fr = require('./flight-recorder');
    if (fr && typeof fr.recordGovernanceEvent === 'function') {
      fr.recordGovernanceEvent({ userId, eventType, details }).catch(() => {});
    }
  } catch (_) {}
}

/**
 * Create a new governance decision record.
 * Returns { decision, error }.
 */
async function createDecision({
  userId, claim, confidence, evidenceSummary, weakeningEvidence,
  validityState = 'supported', admissibilityState = 'admissible',
  actionState = 'allow', consequenceReason, reviewRequired = false,
  createdBy = 'system'
}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return { decision: null, error: 'db_unavailable' };

  const { data, error } = await db
    .from('governance_decisions')
    .insert([{
      user_id: userId || null,
      claim,
      confidence: confidence != null ? +confidence : null,
      evidence_summary: evidenceSummary || null,
      weakening_evidence: weakeningEvidence || null,
      validity_state: validityState,
      admissibility_state: admissibilityState,
      action_state: actionState,
      consequence_reason: consequenceReason || null,
      review_required: !!reviewRequired,
      created_by: createdBy,
    }])
    .select()
    .single();

  if (!error && data) {
    recordToFlightRecorder(userId, 'governance_decision_created', {
      decisionId: data.id, claim, validityState, admissibilityState, actionState, confidence
    });
  }

  return { decision: data || null, error: error ? error.message : null };
}

/**
 * Transition a governance decision to new states.
 * Always writes a transition record. No silent overwrites.
 */
async function transitionDecision({
  decisionId, userId, actor = 'system',
  validityState, admissibilityState, actionState,
  reason
}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return { error: 'db_unavailable' };

  // Fetch current state
  const { data: current, error: fetchErr } = await db
    .from('governance_decisions')
    .select('validity_state, admissibility_state, action_state, user_id')
    .eq('id', decisionId)
    .single();

  if (fetchErr || !current) return { error: fetchErr ? fetchErr.message : 'not_found' };

  const updates = { updated_at: new Date().toISOString() };
  if (validityState) updates.validity_state = validityState;
  if (admissibilityState) updates.admissibility_state = admissibilityState;
  if (actionState) updates.action_state = actionState;
  if (reason) updates.consequence_reason = reason;
  updates.review_required = (admissibilityState === 'requires_review') || (actionState === 'escalate');

  const { error: updateErr } = await db
    .from('governance_decisions')
    .update(updates)
    .eq('id', decisionId);

  if (updateErr) return { error: updateErr.message };

  // Write transition record — mandatory, no silent overwrites
  const transition = {
    decision_id: decisionId,
    user_id: userId || current.user_id || null,
    from_validity_state: current.validity_state,
    to_validity_state: validityState || current.validity_state,
    from_admissibility_state: current.admissibility_state,
    to_admissibility_state: admissibilityState || current.admissibility_state,
    from_action_state: current.action_state,
    to_action_state: actionState || current.action_state,
    transition_reason: reason || null,
    actor,
  };

  await db.from('governance_state_transitions').insert([transition]);

  recordToFlightRecorder(userId || current.user_id, 'governance_state_transition', {
    decisionId,
    from: { validity: current.validity_state, admissibility: current.admissibility_state, action: current.action_state },
    to: { validity: validityState, admissibility: admissibilityState, action: actionState },
    reason, actor
  });

  return { error: null };
}

/**
 * Apply the consequence logic given a claim context.
 * Derives validity/admissibility/action states from evidence signals.
 *
 * Key rule: confidence does NOT equal permission.
 */
function deriveStates({ confidence, hasContradictoryEvidence, affectsHighStakesDomain, isUnsupported }) {
  let validityState = 'supported';
  let admissibilityState = 'admissible';
  let actionState = 'allow';

  if (isUnsupported) {
    validityState = 'unsupported';
    admissibilityState = 'inadmissible';
    actionState = 'block';
  } else if (hasContradictoryEvidence) {
    validityState = 'contested';
    admissibilityState = 'requires_review';
    actionState = 'pause';
  }

  // High-stakes domains require review regardless of confidence
  if (affectsHighStakesDomain && actionState !== 'block') {
    admissibilityState = 'requires_review';
    actionState = actionState === 'allow' ? 'pause' : actionState;
  }

  return { validityState, admissibilityState, actionState };
}

/**
 * Evaluate a claim and create a governance decision if needed.
 * Returns the decision record.
 */
async function evaluateClaim({
  userId, claim, confidence, evidenceSummary, weakeningEvidence,
  hasContradictoryEvidence = false, affectsHighStakesDomain = false,
  isUnsupported = false, createdBy = 'system'
}) {
  const { validityState, admissibilityState, actionState } = deriveStates({
    confidence, hasContradictoryEvidence, affectsHighStakesDomain, isUnsupported
  });

  const consequenceReason = actionState !== 'allow'
    ? `Action ${actionState}: validity=${validityState}, admissibility=${admissibilityState}${affectsHighStakesDomain ? ', high-stakes domain' : ''}${hasContradictoryEvidence ? ', contradictory evidence present' : ''}`
    : null;

  return createDecision({
    userId, claim, confidence, evidenceSummary, weakeningEvidence,
    validityState, admissibilityState, actionState,
    consequenceReason, reviewRequired: admissibilityState === 'requires_review',
    createdBy
  });
}

const HIGH_STAKES_PATTERNS = [
  /\b(medical|health|clinical|diagnosis|treatment|medication|drug|dose)\b/i,
  /\b(legal|lawsuit|liability|court|attorney|contract|regulation|compliance)\b/i,
  /\b(financial|money|invest|fund|loan|debt|bankruptcy|tax)\b/i,
  /\b(safety|emergency|crisis|harm|danger|risk|threat|weapon)\b/i,
];

function affectsHighStakes(text) {
  return HIGH_STAKES_PATTERNS.some(p => p.test(text));
}

module.exports = {
  createDecision,
  transitionDecision,
  evaluateClaim,
  deriveStates,
  affectsHighStakes,
};
