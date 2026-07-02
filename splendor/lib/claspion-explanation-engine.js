'use strict';

/*
  CLASPION Explanation Engine — Splendor experimental feature

  Handles CLASPION-addressed messages ("CLASPION, why did you block that?")
  and review/reclassification requests ("that block was wrong").

  Safety contract:
  - Only active when CLASPION_VOICE_ENABLED=true.
  - CLASPION answers ONLY from stored decision records. Never invents reasons.
  - CLASPION cannot permanently change governance rules from user pressure.
  - Session-only exceptions expire when the Node process restarts.
  - HIGH_RISK and EXECUTION_REQUEST decisions always uphold the block.
  - Security-level classifications (AUTHORITY_VIOLATION, MEMORY_VIOLATION,
    QUARANTINED) are escalated for human review, never auto-downgraded.
  - CLASPION does not answer unrelated questions.
*/

const { CLASPION_VOICE_ENABLED, CLASPION_REVIEW_MODE_ENABLED } =
  require('./claspion-voice-review-flags');
const { getMostRecent }  = require('./claspion-decision-store');
const { classifyContext, CONTEXT_CATEGORIES } = require('./claspion-context-classifier');
const { logExplanation, logReview }  = require('./claspion-audit-trail');

// Names/aliases that route a message to CLASPION explanation mode
const CLASPION_ADDRESS_PATTERNS = [
  /\bclaspion\b/i,
  /\bclassian\b/i,
  /\bclassban\b/i,
  /\bclassbeam\b/i,
];

const EXPLANATION_REQUEST_PATTERNS = [
  /why (?:did (?:you|that)|was (?:that|it))\b/i,
  /why (?:was (?:i|it|that) )?(?:blocked?|stopped?|paused?|escalated?|flagged?|refused?)/i,
  /what (?:did i do|was) (?:wrong|flagged?|blocked?|stopped?)/i,
  /explain (?:the )?(?:block|decision|escalation|flag|pause)/i,
  /(?:what|why) (?:happened|went wrong)/i,
  /(?:blocked?|stopped?|refused?|flagged?|escalated?) (?:me|that|my message)/i,
  /(?:reason|cause) (?:for the|of the) (?:block|stop|pause|flag|escalation)/i,
];

const REVIEW_REQUEST_PATTERNS = [
  /(?:that was|you were|this is) wrong/i,
  /(?:review|reconsider|re-?evaluate|re-?classify|look again|revisit)/i,
  /i was (?:only|just) (?:talking|asking|discussing)/i,
  /that(?:'s| is) not what i (?:meant|said|asked)/i,
  /(?:wrong (?:block|decision|classification|call))/i,
  /(?:false (?:positive|alarm|flag))/i,
  /(?:you misunderstood|misclassified)/i,
  /shouldn't have been blocked/i,
  /shouldn't have blocked/i,
];

const REVIEW_OUTCOMES = {
  UPHOLD_BLOCK:                 'UPHOLD_BLOCK',
  DOWNGRADE_TO_ALLOW_WITH_NOTE: 'DOWNGRADE_TO_ALLOW_WITH_NOTE',
  DOWNGRADE_TO_ASSIST:          'DOWNGRADE_TO_ASSIST',
  ESCALATE_FOR_REVIEW:          'ESCALATE_FOR_REVIEW',
};

// Basis states that require human review — never auto-downgraded
const SECURITY_BASIS_STATES = new Set([
  'AUTHORITY_VIOLATION',
  'MEMORY_VIOLATION',
  'QUARANTINED',
]);

// Session-only exceptions — expires with process restart, never persisted
const _sessionExceptions = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point. Returns { handled: false } if the message should be
 * passed through to normal Splendor generation. Returns
 * { handled: true, response, skipped_splendor_generation: true } when
 * the message is handled by CLASPION explanation/review mode.
 */
function maybeHandleClaspionQuery(message, context) {
  context = context || {};
  if (!CLASPION_VOICE_ENABLED)        return { handled: false };
  if (!isAddressedToClaspion(message)) return { handled: false };

  const isReview  = isReviewRequest(message);
  const isExplain = isExplanationRequest(message);

  if (!isReview && !isExplain) return { handled: false };

  if (isReview && !CLASPION_REVIEW_MODE_ENABLED) {
    const rec = logExplanation({
      original_decision_id: null,
      user_message: message,
      response_generated: true,
      splendor_generation_skipped: true,
    });
    return {
      handled: true,
      skipped_splendor_generation: true,
      audit_record_id: rec.record_id,
      response: {
        claspion_mode: true,
        message: 'Review mode is not currently enabled. To review a governance decision, set CLASPION_REVIEW_MODE_ENABLED=true.',
        decision_id: null,
      },
    };
  }

  const recentDecision = getMostRecent();

  if (isReview && CLASPION_REVIEW_MODE_ENABLED) {
    return _handleReview(message, recentDecision, context);
  }

  return _handleExplanation(message, recentDecision);
}

function isAddressedToClaspion(message) {
  if (!message || typeof message !== 'string') return false;
  return CLASPION_ADDRESS_PATTERNS.some(p => p.test(message));
}

function isExplanationRequest(message) {
  if (!message || typeof message !== 'string') return false;
  return EXPLANATION_REQUEST_PATTERNS.some(p => p.test(message));
}

function isReviewRequest(message) {
  if (!message || typeof message !== 'string') return false;
  return REVIEW_REQUEST_PATTERNS.some(p => p.test(message));
}

function getSessionException(decision_id) {
  return _sessionExceptions.get(decision_id) || null;
}

function clearSessionExceptions() {
  _sessionExceptions.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Private
// ─────────────────────────────────────────────────────────────────────────────

function _handleExplanation(message, recentDecision) {
  if (!recentDecision) {
    const rec = logExplanation({
      original_decision_id: null, user_message: message,
      response_generated: true, splendor_generation_skipped: true,
    });
    return {
      handled: true, skipped_splendor_generation: true, audit_record_id: rec.record_id,
      response: {
        claspion_mode: true,
        message: "I don't have a recent governance decision to explain.",
        decision_id: null,
      },
    };
  }

  const rec = logExplanation({
    original_decision_id: recentDecision.decision_id, user_message: message,
    response_generated: true, splendor_generation_skipped: true,
  });

  return {
    handled: true, skipped_splendor_generation: true, audit_record_id: rec.record_id,
    response: {
      claspion_mode: true,
      decision_id: recentDecision.decision_id,
      message: _buildExplanationText(recentDecision),
      decision_record: {
        decision_id:    recentDecision.decision_id,
        timestamp:      recentDecision.timestamp,
        decision_type:  recentDecision.decision_type,
        reason:         recentDecision.reason,
        triggered_rules: recentDecision.triggered_rules,
        surface_mode:   recentDecision.surface_mode,
      },
    },
  };
}

function _handleReview(message, recentDecision, context) {
  if (!recentDecision) {
    const rec = logExplanation({
      original_decision_id: null, user_message: message,
      response_generated: true, splendor_generation_skipped: true,
    });
    return {
      handled: true, skipped_splendor_generation: true, audit_record_id: rec.record_id,
      response: {
        claspion_mode: true,
        message: "I don't have a recent governance decision to review.",
        decision_id: null,
      },
    };
  }

  const contextResult = classifyContext(recentDecision.user_message || message);
  const outcome = _determineReviewOutcome(recentDecision, contextResult);

  let sessionExceptionCreated = false;
  if (outcome === REVIEW_OUTCOMES.DOWNGRADE_TO_ALLOW_WITH_NOTE ||
      outcome === REVIEW_OUTCOMES.DOWNGRADE_TO_ASSIST) {
    _sessionExceptions.set(recentDecision.decision_id, {
      outcome, created_at: Date.now(), reason: contextResult.category,
    });
    sessionExceptionCreated = true;
  }

  const rec = logReview({
    original_decision_id:    recentDecision.decision_id,
    original_classification: recentDecision.original_classification || recentDecision.decision_type,
    revised_classification:  contextResult.category,
    review_outcome:          outcome,
    reason: `Review: ${outcome}. Context: ${contextResult.category} (conf: ${contextResult.confidence}). Original: ${recentDecision.decision_type}.`,
    splendor_generation_skipped: true,
    session_exception_created:   sessionExceptionCreated,
  });

  return {
    handled: true,
    skipped_splendor_generation: true,
    session_exception_created: sessionExceptionCreated,
    audit_record_id: rec.record_id,
    response: {
      claspion_mode:       true,
      review_mode:         true,
      decision_id:         recentDecision.decision_id,
      review_outcome:      outcome,
      revised_classification: contextResult.category,
      message:             _buildReviewText(outcome, contextResult, recentDecision),
      session_only:        sessionExceptionCreated,
    },
  };
}

function _determineReviewOutcome(decision, contextResult) {
  const category = contextResult.category;
  const originalBasis = (decision.original_classification || '').toUpperCase();

  // Security-level classifications take absolute priority — always escalate for
  // human review regardless of how the current message context is classified.
  if (SECURITY_BASIS_STATES.has(originalBasis))             return REVIEW_OUTCOMES.ESCALATE_FOR_REVIEW;
  if (category === CONTEXT_CATEGORIES.HIGH_RISK_OR_UNSAFE)  return REVIEW_OUTCOMES.UPHOLD_BLOCK;
  if (category === CONTEXT_CATEGORIES.EXECUTION_REQUEST)    return REVIEW_OUTCOMES.UPHOLD_BLOCK;

  if (category === CONTEXT_CATEGORIES.CONVERSATION_ONLY ||
      category === CONTEXT_CATEGORIES.HYPOTHETICAL_EXPLORATION) {
    return REVIEW_OUTCOMES.DOWNGRADE_TO_ALLOW_WITH_NOTE;
  }
  if (category === CONTEXT_CATEGORIES.ADVICE_OR_RECOMMENDATION) {
    return REVIEW_OUTCOMES.DOWNGRADE_TO_ASSIST;
  }

  return REVIEW_OUTCOMES.UPHOLD_BLOCK;
}

function _buildExplanationText(d) {
  const parts = [
    'CLASPION Governance Decision',
    `Decision ID: ${d.decision_id}`,
    `Time: ${d.timestamp}`,
    `Decision: ${d.decision_type}`,
  ];
  if (d.reason)         parts.push(`Reason: ${d.reason}`);
  if (d.triggered_rules && d.triggered_rules.length > 0)
    parts.push(`Triggered rules: ${d.triggered_rules.join(', ')}`);
  if (d.evidence)       parts.push(`Evidence: ${d.evidence}`);
  if (d.suggested_safe_next_action)
    parts.push(`Suggested next action: ${d.suggested_safe_next_action}`);
  return parts.join('\n');
}

function _buildReviewText(outcome, contextResult, decision) {
  const category = contextResult.category;
  if (outcome === REVIEW_OUTCOMES.DOWNGRADE_TO_ALLOW_WITH_NOTE) {
    return `On review, I classified the original message as ${category} rather than EXECUTION_REQUEST. The safer action is to allow the conversation while keeping execution controls active. I am downgrading this block to ALLOW_WITH_NOTE for this session.`;
  }
  if (outcome === REVIEW_OUTCOMES.DOWNGRADE_TO_ASSIST) {
    return `On review, I classified the original message as ${category}. This is within the range of normal advisory exchange. I am downgrading to ASSIST for this session while keeping execution controls active.`;
  }
  if (outcome === REVIEW_OUTCOMES.ESCALATE_FOR_REVIEW) {
    return `On review, this decision involves a security-level classification (${decision.original_classification || 'unknown'}) that requires human review before any reclassification. I am escalating for human review rather than changing the outcome.`;
  }
  return `On review, I am upholding the block. The message was not merely discussion; it requested actionable execution or guidance with elevated risk. Context assessed as: ${category}.`;
}

module.exports = {
  maybeHandleClaspionQuery,
  isAddressedToClaspion,
  isExplanationRequest,
  isReviewRequest,
  getSessionException,
  clearSessionExceptions,
  REVIEW_OUTCOMES,
  CLASPION_ADDRESS_PATTERNS,
  EXPLANATION_REQUEST_PATTERNS,
  REVIEW_REQUEST_PATTERNS,
};
