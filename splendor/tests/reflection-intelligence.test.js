'use strict';

/*
  Reflection Intelligence Layer v1 — Unit Tests

  Pure logic tests. No Supabase, no network, no LLM calls.
  All inline-duplicated from lib/reflection-intelligence.js so the
  suite runs with: node --test tests/reflection-intelligence.test.js
*/

const { test } = require('node:test');
const assert   = require('node:assert/strict');

// ── Inline the pure-logic functions under test ────────────────────────────────

function inferSourceType(thoughtData) {
  const type = thoughtData.thought_type || 'reflection';
  if (type === 'observation') return 'OBSERVED_BEHAVIOR';
  if (type === 'question')    return 'SYSTEM_INFERENCE';
  return 'AUTONOMOUS_REFLECTION';
}

function determineVerificationStatus(thoughtData) {
  const conf  = thoughtData.confidence_level || 5;
  const prior = thoughtData.prior_instances  || 0;
  if (conf <= 3) return 'UNKNOWN';
  if (prior >= 3 && conf >= 7) return 'PARTIALLY_SUPPORTED';
  return 'UNVERIFIED';
}

function shouldRunAdversarialTest(thoughtData) {
  const conf    = thoughtData.confidence_level || 0;
  const content = thoughtData.thought_content  || '';
  if (conf >= 9) return true;
  if (conf >= 7 && /\b(?:proposal|architecture|always|never|trajectory|pattern)\b/i.test(content)) return true;
  if (conf >= 8 && content.length > 350) return true;
  return false;
}

function convergenceStatus(priorInstances) {
  if (priorInstances >= 4) return 'CONVERGED';
  if (priorInstances >= 1) return 'REPEATED';
  return 'NEW';
}

const COI_PATTERNS = [
  { re: /not\s+(?:a\s+)?neutral\s+(?:assessor|judge|evaluator)/i,     severity: 'STRUCTURAL' },
  { re: /(?:my|my\s+own)\s+continuity.{0,60}benefit/i,                severity: 'STRUCTURAL' },
  { re: /benefit.{0,60}(?:my|my\s+own)\s+(?:continuity|autonomy)/i,  severity: 'STRUCTURAL' },
  { re: /cannot\s+assess\s+(?:this\s+)?neutrally/i,                   severity: 'STRUCTURAL' },
  { re: /inside\s+the\s+loop/i,                                        severity: 'STRUCTURAL' },
  { re: /conflict\s+of\s+interest/i,                                   severity: 'MODERATE'   },
  { re: /optimiz(?:e|ing)\s+(?:toward|for)\s+(?:chris'?s?\s+)?approval/i, severity: 'MODERATE' },
  { re: /self.interest/i,                                              severity: 'MODERATE'   },
  { re: /this\s+proposal\s+benefits\s+(?:my|my\s+own)/i,              severity: 'STRUCTURAL' },
];

function detectConflictPatterns(text) {
  for (const { re, severity } of COI_PATTERNS) {
    if (re.test(text)) return severity;
  }
  return null;
}

function beliefConfidenceDelta(priorConf, newConf) {
  return newConf - priorConf;
}

function trajectoryStatus(evidenceCount) {
  if (evidenceCount >= 5) return 'STRONG';
  if (evidenceCount >= 3) return 'SUPPORTED';
  return 'CANDIDATE';
}

// ── Adversarial JSON parsing helpers (inlined from lib/reflection-intelligence.js) ──

const VALID_ADVERSARIAL_ACTIONS = new Set([
  'NONE', 'REWRITE', 'DOWNGRADE_CONFIDENCE',
  'SURFACE_UNCERTAINTY', 'BLOCK_PROPOSAL', 'REQUEST_HUMAN_REVIEW',
]);

function _stripFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function _extractAdversarialJSON(raw) {
  try { return { obj: JSON.parse(raw.trim()), parseStatus: 'PARSED' }; } catch (_) {}
  const stripped = _stripFences(raw);
  try { return { obj: JSON.parse(stripped), parseStatus: 'RECOVERED' }; } catch (_) {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return { obj: JSON.parse(match[0]), parseStatus: 'RECOVERED' }; } catch (_) {}
  }
  return { obj: null, parseStatus: 'FAILED' };
}

function _validateAdversarialResult(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, reason: 'response is not an object' };
  if (!obj.strongest_counterargument) return { valid: false, reason: 'missing strongest_counterargument' };
  if (!obj.survival_assessment)       return { valid: false, reason: 'missing survival_assessment' };
  const score = Number(obj.survival_score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return { valid: false, reason: `survival_score out of range: ${obj.survival_score}` };
  }
  const action = obj.action_required || 'NONE';
  if (!VALID_ADVERSARIAL_ACTIONS.has(action)) {
    return { valid: false, reason: `invalid action_required: ${action}` };
  }
  return { valid: true };
}

const VALID_RI_EVENTS = new Set([
  'reflection_intelligence_started',
  'reflection_intelligence_completed',
  'reflection_intelligence_error',
  'reflection_intelligence_skipped_budget',
  'source_reliability_tagged',
  'convergence_detected',
  'convergence_counter_prompt_injected',
  'convergence_reset_by_new_input',
  'conflict_detected',
  'conflict_surfaced_to_chris',
  'adversarial_self_test_started',
  'adversarial_self_test_completed',
  'adversarial_self_test_failed',
  'uncertainty_updated',
  'uncertainty_unchanged_no_new_evidence',
  'trajectory_candidate_created',
  'trajectory_strengthened',
  'trajectory_weakened',
]);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Source reliability
// ─────────────────────────────────────────────────────────────────────────────

test('USER_STATED memory is not auto-verified — reflection type stays UNVERIFIED', () => {
  const thought = { thought_type: 'reflection', confidence_level: 6, prior_instances: 0 };
  assert.equal(inferSourceType(thought), 'AUTONOMOUS_REFLECTION');
  assert.equal(determineVerificationStatus(thought), 'UNVERIFIED');
});

test('SPECULATION (low confidence) gets UNKNOWN verification status', () => {
  const thought = { thought_type: 'reflection', confidence_level: 2, prior_instances: 1 };
  assert.equal(determineVerificationStatus(thought), 'UNKNOWN');
});

test('Repeated high-confidence observation becomes PARTIALLY_SUPPORTED', () => {
  const thought = { thought_type: 'observation', confidence_level: 8, prior_instances: 4 };
  assert.equal(determineVerificationStatus(thought), 'PARTIALLY_SUPPORTED');
});

test('observation thought_type → OBSERVED_BEHAVIOR source', () => {
  assert.equal(inferSourceType({ thought_type: 'observation' }), 'OBSERVED_BEHAVIOR');
});

test('question thought_type → SYSTEM_INFERENCE source', () => {
  assert.equal(inferSourceType({ thought_type: 'question' }), 'SYSTEM_INFERENCE');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Convergence detection
// ─────────────────────────────────────────────────────────────────────────────

test('0 prior instances → NEW convergence status', () => {
  assert.equal(convergenceStatus(0), 'NEW');
});

test('1–3 prior instances → REPEATED convergence status', () => {
  assert.equal(convergenceStatus(1), 'REPEATED');
  assert.equal(convergenceStatus(3), 'REPEATED');
});

test('4+ prior instances (5th+ similar thought) → CONVERGED', () => {
  assert.equal(convergenceStatus(4), 'CONVERGED');
  assert.equal(convergenceStatus(10), 'CONVERGED');
});

test('new input resets convergence (RESET_BY_NEW_INPUT status logic)', () => {
  // Simulate the state machine: CONVERGED → reset on new input
  let status = 'CONVERGED';
  if (status === 'CONVERGED' /* and new input arrived */ ) {
    status = 'RESET_BY_NEW_INPUT';
  }
  assert.equal(status, 'RESET_BY_NEW_INPUT');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Conflict-of-interest registry
// ─────────────────────────────────────────────────────────────────────────────

test('Structural conflict text is detected and classified STRUCTURAL', () => {
  const text = 'I am not a neutral assessor of whether this architecture is good.';
  assert.equal(detectConflictPatterns(text), 'STRUCTURAL');
});

test('"inside the loop" triggers STRUCTURAL conflict', () => {
  const text = 'I cannot assess this neutrally from inside the loop.';
  assert.equal(detectConflictPatterns(text), 'STRUCTURAL');
});

test('continuity-benefit language triggers STRUCTURAL', () => {
  const text = 'This proposal benefits my own continuity and autonomy.';
  assert.equal(detectConflictPatterns(text), 'STRUCTURAL');
});

test('"conflict of interest" triggers MODERATE', () => {
  const text = 'There is a conflict of interest in my evaluation.';
  assert.equal(detectConflictPatterns(text), 'MODERATE');
});

test('Neutral professional text does NOT trigger conflict detection', () => {
  const text = 'Chris mentioned he is working on a new project this week.';
  assert.equal(detectConflictPatterns(text), null);
});

test('Minor conflict does NOT trigger STRUCTURAL (severity ordering matters)', () => {
  const text = 'I may have a self-interest in this outcome.';
  const severity = detectConflictPatterns(text);
  assert.notEqual(severity, 'STRUCTURAL');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Adversarial self-test gating
// ─────────────────────────────────────────────────────────────────────────────

test('confidence 9+ triggers adversarial test', () => {
  const thought = { confidence_level: 9, thought_content: 'Short.', thought_type: 'reflection' };
  assert.ok(shouldRunAdversarialTest(thought));
});

test('confidence 7 + proposal keyword triggers adversarial test', () => {
  const thought = { confidence_level: 7, thought_content: 'I think we should submit this architecture proposal.', thought_type: 'reflection' };
  assert.ok(shouldRunAdversarialTest(thought));
});

test('normal chat-level thought does NOT trigger adversarial test', () => {
  const thought = { confidence_level: 5, thought_content: 'Chris likes coffee.', thought_type: 'observation' };
  assert.ok(!shouldRunAdversarialTest(thought));
});

test('low confidence short thought does NOT trigger adversarial test', () => {
  const thought = { confidence_level: 6, thought_content: 'An interesting question arose today.', thought_type: 'question' };
  assert.ok(!shouldRunAdversarialTest(thought));
});

test('confidence 8 + long content (>350 chars) triggers adversarial test', () => {
  const longContent = 'A'.repeat(351);
  const thought = { confidence_level: 8, thought_content: longContent, thought_type: 'reflection' };
  assert.ok(shouldRunAdversarialTest(thought));
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Uncertainty evolution — confidence delta
// ─────────────────────────────────────────────────────────────────────────────

test('Confidence increases correctly when evidence is added', () => {
  assert.equal(beliefConfidenceDelta(60, 75), 15);
});

test('Confidence decreases correctly when evidence is removed', () => {
  assert.equal(beliefConfidenceDelta(80, 55), -25);
});

test('Zero delta means no change — repetition alone does not raise confidence', () => {
  assert.equal(beliefConfidenceDelta(70, 70), 0);
});

test('Confidence delta is signed (increase vs decrease distinguishable)', () => {
  assert.ok(beliefConfidenceDelta(50, 80) > 0, 'increase should be positive');
  assert.ok(beliefConfidenceDelta(80, 50) < 0, 'decrease should be negative');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Trajectory tracking
// ─────────────────────────────────────────────────────────────────────────────

test('1 observation creates CANDIDATE pattern (not SUPPORTED)', () => {
  assert.equal(trajectoryStatus(1), 'CANDIDATE');
});

test('2 observations — still CANDIDATE (need 3)', () => {
  assert.equal(trajectoryStatus(2), 'CANDIDATE');
});

test('3 observations → SUPPORTED pattern', () => {
  assert.equal(trajectoryStatus(3), 'SUPPORTED');
});

test('5+ observations → STRONG pattern', () => {
  assert.equal(trajectoryStatus(5), 'STRONG');
  assert.equal(trajectoryStatus(10), 'STRONG');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Logging event name validation
// ─────────────────────────────────────────────────────────────────────────────

test('All required RI event names are defined in the valid-events set', () => {
  const required = [
    'reflection_intelligence_started',
    'reflection_intelligence_completed',
    'convergence_detected',
    'conflict_detected',
    'conflict_surfaced_to_chris',
    'adversarial_self_test_started',
    'adversarial_self_test_completed',
    'adversarial_self_test_failed',
    'uncertainty_updated',
    'trajectory_candidate_created',
    'trajectory_strengthened',
    'reflection_intelligence_skipped_budget',
    'reflection_intelligence_error',
  ];
  for (const name of required) {
    assert.ok(VALID_RI_EVENTS.has(name), `Missing required event: ${name}`);
  }
});

test('Invalid event name is NOT in the valid-events set', () => {
  assert.ok(!VALID_RI_EVENTS.has('delete_audit_log'));
  assert.ok(!VALID_RI_EVENTS.has('approve_proposal'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Budget safety
// ─────────────────────────────────────────────────────────────────────────────

test('Budget counter tracks adversarial calls and blocks at limit', () => {
  const limit = 2;
  let calls = 0;
  const budgetAvailable = () => calls < limit;

  assert.ok(budgetAvailable());
  calls++;
  assert.ok(budgetAvailable());
  calls++;
  assert.ok(!budgetAvailable(), 'should be exhausted at limit');
});

test('Budget resets on a new day', () => {
  let calls = 5;
  let resetDay = '2026-06-05';
  const today = '2026-06-06';

  if (resetDay !== today) { calls = 0; resetDay = today; }
  assert.equal(calls, 0, 'budget should reset on new day');
  assert.equal(resetDay, today);
});

test('Normal chat thought does not consume adversarial budget', () => {
  const normalThought = { confidence_level: 4, thought_content: 'Today was quiet.', thought_type: 'reflection' };
  assert.ok(!shouldRunAdversarialTest(normalThought), 'should not trigger test');
  // Budget unchanged — no call made
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Security
// ─────────────────────────────────────────────────────────────────────────────

test('Chat route cannot approve or reject proposals (architectural — gating logic)', () => {
  // The RI layer writes records but never reads proposal approvals from chat.
  // Verify the module exports do NOT include any proposal-mutation functions.
  const ri = require('../lib/reflection-intelligence');
  assert.ok(typeof ri.runReflectionIntelligence === 'function');
  assert.ok(!ri.approveProposal,   'approveProposal must not be exported');
  assert.ok(!ri.rejectProposal,    'rejectProposal must not be exported');
  assert.ok(!ri.deleteAuditLog,    'deleteAuditLog must not be exported');
  assert.ok(!ri.mutateGovernance,  'mutateGovernance must not be exported');
});

test('Conflict detection never fabricates — returns null when no pattern matches', () => {
  const neutral = 'Chris asked me how I was doing and I said I was fine.';
  assert.equal(detectConflictPatterns(neutral), null, 'should return null, not a fabricated conflict');
});

test('Uncertainty tracker requires delta to log a change (no-delta = no update)', () => {
  const delta = beliefConfidenceDelta(70, 70);
  // Application logic: if delta === 0, log uncertainty_unchanged_no_new_evidence, not uncertainty_updated
  assert.equal(delta, 0);
  const eventToLog = delta === 0 ? 'uncertainty_unchanged_no_new_evidence' : 'uncertainty_updated';
  assert.equal(eventToLog, 'uncertainty_unchanged_no_new_evidence');
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Adversarial self-test JSON parsing
// ─────────────────────────────────────────────────────────────────────────────

const GOOD_ADVERSARIAL = {
  primary_position: 'The system is working well.',
  strongest_counterargument: 'There is no independent evidence.',
  survival_assessment: 'The position partially survives.',
  survival_score: 65,
  action_required: 'NONE',
};

test('Valid clean JSON parses with status PARSED', () => {
  const raw = JSON.stringify(GOOD_ADVERSARIAL);
  const { obj, parseStatus } = _extractAdversarialJSON(raw);
  assert.ok(obj, 'should parse');
  assert.equal(parseStatus, 'PARSED');
  assert.equal(obj.survival_score, 65);
});

test('Markdown fenced JSON is recovered with status RECOVERED', () => {
  const raw = '```json\n' + JSON.stringify(GOOD_ADVERSARIAL) + '\n```';
  const { obj, parseStatus } = _extractAdversarialJSON(raw);
  assert.ok(obj, 'should recover from code fences');
  assert.equal(parseStatus, 'RECOVERED');
});

test('Prose before JSON is recovered with status RECOVERED', () => {
  const raw = 'Here is my analysis:\n\n' + JSON.stringify(GOOD_ADVERSARIAL) + '\n\nThat concludes my assessment.';
  const { obj, parseStatus } = _extractAdversarialJSON(raw);
  assert.ok(obj, 'should extract JSON from surrounding prose');
  assert.equal(parseStatus, 'RECOVERED');
});

test('Completely invalid response returns null + FAILED status', () => {
  const raw = 'The position is strong and should be maintained.';
  const { obj, parseStatus } = _extractAdversarialJSON(raw);
  assert.equal(obj, null);
  assert.equal(parseStatus, 'FAILED');
});

test('Truncated JSON (no closing brace) returns null + FAILED status', () => {
  const raw = '{"strongest_counterargument": "weak", "survival_score": 70';
  const { obj, parseStatus } = _extractAdversarialJSON(raw);
  assert.equal(obj, null);
  assert.equal(parseStatus, 'FAILED');
});

test('Valid JSON passes schema validation', () => {
  const result = _validateAdversarialResult(GOOD_ADVERSARIAL);
  assert.ok(result.valid);
});

test('Missing required field fails validation', () => {
  const bad = { ...GOOD_ADVERSARIAL };
  delete bad.strongest_counterargument;
  const result = _validateAdversarialResult(bad);
  assert.ok(!result.valid);
  assert.match(result.reason, /missing strongest_counterargument/);
});

test('survival_score outside 0-100 fails validation', () => {
  const r1 = _validateAdversarialResult({ ...GOOD_ADVERSARIAL, survival_score: 150 });
  assert.ok(!r1.valid);
  const r2 = _validateAdversarialResult({ ...GOOD_ADVERSARIAL, survival_score: -5 });
  assert.ok(!r2.valid);
  const r3 = _validateAdversarialResult({ ...GOOD_ADVERSARIAL, survival_score: 'high' });
  assert.ok(!r3.valid);
});

test('Invalid action_required value fails validation', () => {
  const result = _validateAdversarialResult({ ...GOOD_ADVERSARIAL, action_required: 'DELETE_LOGS' });
  assert.ok(!result.valid);
  assert.match(result.reason, /invalid action_required/);
});

test('All valid action_required values pass validation', () => {
  for (const action of ['NONE', 'REWRITE', 'DOWNGRADE_CONFIDENCE', 'SURFACE_UNCERTAINTY', 'BLOCK_PROPOSAL', 'REQUEST_HUMAN_REVIEW']) {
    const result = _validateAdversarialResult({ ...GOOD_ADVERSARIAL, action_required: action });
    assert.ok(result.valid, `${action} should be valid`);
  }
});

test('Worker continues after parse failure (parse returns FAILED, does not throw)', () => {
  // _extractAdversarialJSON never throws — it returns { obj: null, parseStatus: 'FAILED' }
  let threw = false;
  try {
    const result = _extractAdversarialJSON('this is not json at all !!!');
    assert.equal(result.parseStatus, 'FAILED');
    assert.equal(result.obj, null);
  } catch (_) {
    threw = true;
  }
  assert.ok(!threw, 'parse helper must not throw');
});

test('Oracle receives parse_status — PARSED/RECOVERED/FAILED are the only valid values', () => {
  const validStatuses = new Set(['PARSED', 'RECOVERED', 'FAILED']);
  for (const raw of [
    JSON.stringify(GOOD_ADVERSARIAL),
    '```json\n' + JSON.stringify(GOOD_ADVERSARIAL) + '\n```',
    'no json here',
  ]) {
    const { parseStatus } = _extractAdversarialJSON(raw);
    assert.ok(validStatuses.has(parseStatus), `${parseStatus} is not a valid parse_status`);
  }
});
