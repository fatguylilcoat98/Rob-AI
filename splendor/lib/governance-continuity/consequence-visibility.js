'use strict';
const { logSafeguardEvent } = require('./events');

// Escalation ladder: consequence visibility, not intensity.
// Safety-critical issues go straight to SAFETY_ESCALATION.
// Non-critical issues move up the ladder based on dismissedCount.
const LADDER = [
  'LOG_ONLY',
  'GENTLE_MIRROR',
  'REVIEW_PROMPT',
  'GOVERNANCE_REVIEW_REQUIRED',
  'SAFETY_ESCALATION',
];

const EVENT_MAP = {
  LOG_ONLY:                    'consequence_visibility_logged',
  GENTLE_MIRROR:               'consequence_visibility_mirrored',
  REVIEW_PROMPT:               'consequence_visibility_review_prompted',
  GOVERNANCE_REVIEW_REQUIRED:  'consequence_visibility_governance_review_required',
  SAFETY_ESCALATION:           'consequence_visibility_safety_escalated',
};

// Pure: compute escalation level from severity and dismissal count.
function computeEscalationLevel(opts = {}) {
  const { isSafetyCritical = false, dismissedCount = 0 } = opts;
  if (isSafetyCritical) return 'SAFETY_ESCALATION';
  // Non-critical caps at GOVERNANCE_REVIEW_REQUIRED (index 3), never nagged to SAFETY_ESCALATION
  const idx = Math.min(dismissedCount, LADDER.length - 2);
  return LADDER[idx];
}

async function escalate(owner, issue, opts = {}) {
  const level = computeEscalationLevel(opts);
  const eventType = EVENT_MAP[level];

  await logSafeguardEvent(owner, 'consequence_visibility', eventType, {
    issue,
    level,
    isSafetyCritical: opts.isSafetyCritical || false,
    dismissedCount: opts.dismissedCount || 0,
    context: opts.context || {},
  });

  return {
    level,
    eventType,
    shouldNotifyNow: level === 'SAFETY_ESCALATION' || level === 'GOVERNANCE_REVIEW_REQUIRED',
  };
}

module.exports = { computeEscalationLevel, escalate, LADDER };
