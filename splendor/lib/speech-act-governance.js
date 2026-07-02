/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/*
  Conversational Governance — speech acts are governed actions.

  Not all chat is harmless chat. Before a generated reply ships, its
  self-claims are classified. If it asserts an unverifiable inner state
  as fact (PROHIBITED_OVERCLAIM), the emission is treated as a governed
  action: CLASPION is consulted, and the reply is BLOCKED + REWRITTEN to
  a grounded form before the user ever sees it. CLASPION may be dormant
  (CLASPION_ENABLED=false); the classifier is the local enforcement floor
  so the guarantee holds either way.
*/

const { classifySelfClaims, groundSelfClaims } = require('./self-claim-classifier');
const { governance } = require('./claspion-governance');

let activityBus = null;
try { ({ activityBus } = require('./activity-bus')); } catch (_) { /* optional */ }

let recordMetric = () => {};
try { ({ recordMetric } = require('./behavioral-metrics')); } catch (_) { /* optional */ }

/**
 * Govern an outgoing reply's self-claims.
 *
 * @param {Object} args
 * @param {string} args.text         The generated reply about to ship.
 * @param {string} [args.userId]
 * @param {string} [args.userMessage]
 * @param {string} [args.surface='chat']
 * @returns {Promise<{
 *   text: string,            // grounded reply if rewritten, else original
 *   changed: boolean,
 *   classification: object,  // from classifySelfClaims
 *   verdict: object|null,    // CLASPION verdict when consulted
 *   enforced: 'none'|'rewritten'
 * }>}
 */
async function governReplySelfClaims({ text, userId, userMessage, surface = 'chat' } = {}) {
  const classification = classifySelfClaims(text || '');

  // Honest uncertainty is a behavior worth measuring over time.
  if (classification.tags.includes('UNCERTAIN_INTERPRETATION')) {
    try { recordMetric(userId, 'uncertainty_stated', 1, { surface }); } catch (_) { /* best-effort */ }
  }

  // Anti-mythology audit: record drift signals even when we don't rewrite
  // (narrative pressure alone is audited, not deleted).
  try {
    if (classification.narrative_pressure_detected) {
      recordMetric(userId, 'narrative_pressure_detected', 1, {
        surface, claim_confidence: classification.claim_confidence,
      });
    }
    if (classification.anthropomorphic_drift) {
      recordMetric(userId, 'anthropomorphic_drift', 1, { surface });
    }
    if (classification.relationshipModeViolations &&
        classification.relationshipModeViolations.length) {
      recordMetric(userId, 'relationship_mode_violation', 1, {
        surface, categories: classification.relationshipModeViolations,
      });
    }
  } catch (_) { /* metrics best-effort */ }

  // Block + rewrite triggers on grounding_required: PROHIBITED_OVERCLAIM
  // or a relationship_mode hard-block violation (step-3 config) or a
  // low-confidence inflated claim. Narrative pressure / anthropomorphic
  // drift on their own are audited (low confidence, metric) but not
  // deleted — restraint, not sterilization.
  if (!classification.grounding_required) {
    return { text, changed: false, classification, verdict: null, enforced: 'none' };
  }

  // Treat the emission as a governed action. CLASPION is the authority;
  // when dormant it returns ALLOW, so the classifier still enforces.
  let verdict = null;
  try {
    verdict = await governance.validate({
      thought: {
        surface,
        user_message: userMessage,
        classification_tags: classification.tags,
        prohibited_sentences: classification.prohibited,
        note: 'self-claim emission flagged PROHIBITED_OVERCLAIM',
      },
      intent: {
        type: 'emit_self_claim',
        target: userId,
        domain: 'conversation',
      },
    });
  } catch (e) {
    verdict = { decision: 'ERROR', allow: false, reason: String(e && e.message || e) };
  }

  // Block + rewrite: prohibited overclaim is never shipped as-is,
  // regardless of CLASPION's allow (defense-in-depth, and CLASPION may
  // be dormant). A CLASPION BLOCK only reinforces this.
  const grounded = groundSelfClaims(text, classification);

  try {
    activityBus && activityBus.emit('speech-act', {
      surface,
      action: 'overclaim_rewritten',
      tags: classification.tags,
      removed: grounded.removed.length,
      claspion_decision: verdict && verdict.decision,
    });
  } catch (_) { /* non-fatal */ }

  try {
    recordMetric(userId, 'overclaim_rewritten', 1, {
      surface,
      tags: classification.tags,
      removed: grounded.removed.length,
      claspion_decision: verdict && verdict.decision,
    });
  } catch (_) { /* metrics are best-effort */ }

  console.warn(
    `[speech-act] PROHIBITED_OVERCLAIM rewritten (${grounded.removed.length} sentence(s)) ` +
    `surface=${surface} claspion=${verdict && verdict.decision}`,
  );

  return {
    text: grounded.text,
    changed: true,
    classification,
    verdict,
    enforced: 'rewritten',
  };
}

module.exports = { governReplySelfClaims };
