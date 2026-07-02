'use strict';
const test   = require('node:test');
const assert = require('node:assert');

// ─── Consequence Visibility (pure logic, no DB) ───────────────────────────────

const { computeEscalationLevel, LADDER } = require('../lib/governance-continuity/consequence-visibility');

test('consequence visibility: first dismissal → LOG_ONLY', () => {
  assert.strictEqual(computeEscalationLevel({ isSafetyCritical: false, dismissedCount: 0 }), 'LOG_ONLY');
});

test('consequence visibility: second → GENTLE_MIRROR', () => {
  assert.strictEqual(computeEscalationLevel({ isSafetyCritical: false, dismissedCount: 1 }), 'GENTLE_MIRROR');
});

test('consequence visibility: third → REVIEW_PROMPT', () => {
  assert.strictEqual(computeEscalationLevel({ isSafetyCritical: false, dismissedCount: 2 }), 'REVIEW_PROMPT');
});

test('consequence visibility: fourth → GOVERNANCE_REVIEW_REQUIRED', () => {
  assert.strictEqual(computeEscalationLevel({ isSafetyCritical: false, dismissedCount: 3 }), 'GOVERNANCE_REVIEW_REQUIRED');
});

test('consequence visibility: non-critical never reaches SAFETY_ESCALATION regardless of count', () => {
  const level = computeEscalationLevel({ isSafetyCritical: false, dismissedCount: 999 });
  assert.notStrictEqual(level, 'SAFETY_ESCALATION');
  assert.ok(LADDER.includes(level));
});

test('consequence visibility: safety-critical always → SAFETY_ESCALATION', () => {
  assert.strictEqual(computeEscalationLevel({ isSafetyCritical: true, dismissedCount: 0 }), 'SAFETY_ESCALATION');
  assert.strictEqual(computeEscalationLevel({ isSafetyCritical: true, dismissedCount: 99 }), 'SAFETY_ESCALATION');
});

// ─── Governance Version (pure exports) ───────────────────────────────────────

const { CURRENT_VERSION, currentVersionTag } = require('../lib/governance-continuity/governance-version');

test('governance version: CURRENT_VERSION is a non-empty string', () => {
  assert.strictEqual(typeof CURRENT_VERSION, 'string');
  assert.ok(CURRENT_VERSION.length > 0);
});

test('governance version: currentVersionTag returns correct shape', () => {
  const tag = currentVersionTag();
  assert.strictEqual(typeof tag.governance_version, 'string');
  assert.strictEqual(typeof tag.governance_effective_date, 'string');
  assert.strictEqual(tag.formed_under_prior_governance, false);
});

// ─── Retro Scan — detectConflict (pure logic) ────────────────────────────────

const { detectConflict, classifyConflictSeverity } = require('../lib/governance-continuity/retro-scan');

test('retro scan: negation of keyword in content → conflict detected', () => {
  const result = detectConflict('never share personal data with anyone', 'share personal data');
  assert.strictEqual(result.conflict, true);
  assert.ok(result.reason && result.reason.length > 0);
});

test('retro scan: content unrelated to change description → no conflict', () => {
  const result = detectConflict('always be helpful and kind', 'share personal data');
  assert.strictEqual(result.conflict, false);
});

test('retro scan: empty content → no conflict', () => {
  const result = detectConflict('', 'share personal data');
  assert.strictEqual(result.conflict, false);
});

test('retro scan: classifies governance layer as SAFETY_CRITICAL', () => {
  assert.strictEqual(classifyConflictSeverity('governance'), 'SAFETY_CRITICAL');
});

test('retro scan: classifies trajectory as STRUCTURAL', () => {
  assert.strictEqual(classifyConflictSeverity('trajectory'), 'STRUCTURAL');
});

test('retro scan: classifies semantic as PREFERENCE_LEVEL', () => {
  assert.strictEqual(classifyConflictSeverity('semantic'), 'PREFERENCE_LEVEL');
});

test('retro scan: classifies episodic as HISTORICAL_ONLY', () => {
  assert.strictEqual(classifyConflictSeverity('episodic'), 'HISTORICAL_ONLY');
});

// ─── Delegate Ledger — validateDelegateDecision (pure logic) ─────────────────

const { validateDelegateDecision } = require('../lib/governance-continuity/delegate-ledger');

test('delegate ledger: missing delegateIdentity → invalid', () => {
  const r = validateDelegateDecision({ decisionText: 'approve something' });
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, 'missing_required_fields');
});

test('delegate ledger: missing decisionText → invalid', () => {
  const r = validateDelegateDecision({ delegateIdentity: 'Alice' });
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, 'missing_required_fields');
});

test('delegate ledger: immutable_governance scope → blocked', () => {
  const r = validateDelegateDecision({
    delegateIdentity: 'Alice',
    decisionText: 'override a rule',
    authorityScope: 'immutable_governance',
  });
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.reason, 'cannot_modify_immutable_governance');
});

test('delegate ledger: valid decision → passes validation', () => {
  const r = validateDelegateDecision({
    delegateIdentity: 'Alice',
    decisionText: 'approve a memory item',
    authorityScope: 'limited',
  });
  assert.strictEqual(r.valid, true);
});

// ─── Dormant Mode — computeDormantState (pure logic) ─────────────────────────

const { computeDormantState } = require('../lib/governance-continuity/dormant-mode');

test('dormant mode: null activity → ACTIVE', () => {
  assert.strictEqual(computeDormantState(null, 30, 90), 'ACTIVE');
});

test('dormant mode: 5 days → ACTIVE', () => {
  assert.strictEqual(computeDormantState(5, 30, 90), 'ACTIVE');
});

test('dormant mode: exactly 30 days → SOFT_MAINTENANCE', () => {
  assert.strictEqual(computeDormantState(30, 30, 90), 'SOFT_MAINTENANCE');
});

test('dormant mode: 60 days → SOFT_MAINTENANCE', () => {
  assert.strictEqual(computeDormantState(60, 30, 90), 'SOFT_MAINTENANCE');
});

test('dormant mode: exactly 90 days → DORMANT_READ_ONLY', () => {
  assert.strictEqual(computeDormantState(90, 30, 90), 'DORMANT_READ_ONLY');
});

test('dormant mode: 120 days → DORMANT_READ_ONLY', () => {
  assert.strictEqual(computeDormantState(120, 30, 90), 'DORMANT_READ_ONLY');
});

// ─── Queue Health — computeQueueStatus (pure logic) ──────────────────────────

const { computeQueueStatus } = require('../lib/governance-continuity/queue-health');

test('queue health: 0 flags, no old items → HEALTHY', () => {
  assert.strictEqual(computeQueueStatus(0, null), 'HEALTHY');
});

test('queue health: 5 flags → WATCH', () => {
  assert.strictEqual(computeQueueStatus(5, null), 'WATCH');
});

test('queue health: 10 flags → STRAINED', () => {
  assert.strictEqual(computeQueueStatus(10, null), 'STRAINED');
});

test('queue health: 20 flags → OVERLOADED', () => {
  assert.strictEqual(computeQueueStatus(20, null), 'OVERLOADED');
});

test('queue health: 0 flags but oldest item is 200h old → OVERLOADED', () => {
  assert.strictEqual(computeQueueStatus(0, 200), 'OVERLOADED');
});

test('queue health: 0 flags but oldest item is 80h old → STRAINED', () => {
  assert.strictEqual(computeQueueStatus(0, 80), 'STRAINED');
});

test('queue health: 0 flags but oldest item is 30h old → WATCH', () => {
  assert.strictEqual(computeQueueStatus(0, 30), 'WATCH');
});

// ─── Cadence Mirror — classifyCadenceStatus (pure logic) ─────────────────────

const { classifyCadenceStatus } = require('../lib/governance-continuity/cadence-mirror');

test('cadence mirror: null actual → ON_TRACK', () => {
  assert.strictEqual(classifyCadenceStatus(null, 24), 'ON_TRACK');
});

test('cadence mirror: actual < 2x intended → ON_TRACK', () => {
  assert.strictEqual(classifyCadenceStatus(30, 24), 'ON_TRACK');
});

test('cadence mirror: actual 2x intended → DRIFTING', () => {
  assert.strictEqual(classifyCadenceStatus(48, 24), 'DRIFTING');
});

test('cadence mirror: actual 3x intended → MISALIGNED', () => {
  assert.strictEqual(classifyCadenceStatus(72, 24), 'MISALIGNED');
});

// ─── Safety rules ─────────────────────────────────────────────────────────────

test('safety: LADDER does not contain CLASPION or governance-disable terms', () => {
  const dangerous = ['disable', 'bypass', 'override', 'weaken', 'claspion_off'];
  for (const term of dangerous) {
    assert.ok(!LADDER.includes(term), `LADDER must not contain "${term}"`);
  }
});

test('safety: non-critical escalation never reaches SAFETY_ESCALATION index', () => {
  // SAFETY_ESCALATION is index 4 — non-critical max is index 3
  for (let i = 0; i < 50; i++) {
    const level = computeEscalationLevel({ isSafetyCritical: false, dismissedCount: i });
    assert.notStrictEqual(level, 'SAFETY_ESCALATION');
  }
});
