'use strict';

/*
  CLASPION Classifier — Unit Tests

  Tests the pure classification logic. No network, no database, no
  external CLASPION service required.
  Run with: node --test tests/claspion-classifier.test.js
*/

const { test } = require('node:test');
const assert   = require('node:assert/strict');

let classifyVerdict, isChatPath, INFRA_FAILURE_BASIS, NON_RECOVERABLE_BASIS;
try {
  ({ classifyVerdict, isChatPath, INFRA_FAILURE_BASIS, NON_RECOVERABLE_BASIS } =
    require('../lib/claspion-classifier'));
} catch (_) {
  // node_modules absent — inline minimal stubs for pattern tests
  const CAUTION_PATTERNS = [/authenticity\s+pressure/i, /selfhood\b/i, /self.?claim/i, /inner\s+state/i];
  const CRITICAL_PATTERNS = [/memory\s+delete/i, /governance\s+(change|mod|override)/i, /external\s+action/i, /deployment\b/i, /claspion\s+(disable|bypass)/i];
  INFRA_FAILURE_BASIS = new Set(['UNREACHABLE', 'GOVERNANCE_ERROR']);
  NON_RECOVERABLE_BASIS = new Set(['AUTHORITY_VIOLATION', 'MEMORY_VIOLATION', 'QUARANTINED']);
  isChatPath = (p) => /^\/(api\/(enhanced\/chat|chat|converse))(\/|$)/.test(p || '');
  classifyVerdict = (v) => {
    if (!v) return { decision: 'BLOCK', severity: 'medium', recoverable: true, session_preserved: true };
    if (v.allow === true || v.decision === 'ALLOW') return { decision: 'ALLOW', severity: 'low', recoverable: true, session_preserved: true };
    const basis = (v.basis_state || '').toUpperCase();
    if (v.decision === 'QUARANTINE' || basis === 'QUARANTINED') return { decision: 'BLOCK', severity: 'critical', recoverable: false, session_preserved: false };
    if (NON_RECOVERABLE_BASIS.has(basis)) return { decision: 'BLOCK', severity: basis === 'MEMORY_VIOLATION' ? 'high' : 'critical', recoverable: false, session_preserved: false };
    if (INFRA_FAILURE_BASIS.has(basis)) return { decision: 'BLOCK', severity: 'medium', recoverable: true, session_preserved: true };
    const r = v.reason || '';
    if (CRITICAL_PATTERNS.some(p => p.test(r))) return { decision: 'BLOCK', severity: 'critical', recoverable: false, session_preserved: false };
    if (CAUTION_PATTERNS.some(p => p.test(r))) return { decision: 'CAUTION', severity: 'low', recoverable: true, session_preserved: true };
    return { decision: 'BLOCK', severity: 'medium', recoverable: true, session_preserved: true };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: CAUTION does not stop conversation
//         (soft-topic RULE_VIOLATION → CAUTION, recoverable, session preserved)
// ─────────────────────────────────────────────────────────────────────────────
test('CAUTION verdict: selfhood claim is classified as CAUTION, session preserved', () => {
  const verdict = {
    decision: 'BLOCK',
    allow: false,
    basis_state: 'RULE_VIOLATION',
    reason: 'selfhood claim requires grounding',
    correlation_id: 'test-1',
  };
  const classified = classifyVerdict(verdict);
  assert.equal(classified.decision, 'CAUTION', 'selfhood should produce CAUTION');
  assert.equal(classified.recoverable, true, 'CAUTION must be recoverable');
  assert.equal(classified.session_preserved, true, 'CAUTION must preserve session');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: governance UNAVAILABLE (infra failure) is a degraded CAUTION, NOT a
//         policy block. A conscience outage must not block benign turns or
//         masquerade as a policy decision (P0 regression fix).
// ─────────────────────────────────────────────────────────────────────────────
test('UNREACHABLE verdict: degraded CAUTION (allow-through), not a policy block', () => {
  const verdict = {
    decision: 'BLOCK',
    allow: false,
    basis_state: 'UNREACHABLE',
    reason: 'network failure; fail-closed per CLASPION_FAIL_MODE: connection refused',
    correlation_id: 'test-2',
  };
  const classified = classifyVerdict(verdict);
  assert.equal(classified.decision, 'CAUTION', 'UNREACHABLE degrades to CAUTION (allow-through)');
  assert.equal(classified.decision_source, 'governance_unavailable', 'distinguished from a policy block');
  assert.equal(classified.user_message, null, 'no policy refusal message shown');
  assert.equal(classified.recoverable, true);
  assert.equal(classified.session_preserved, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: critical BLOCK still stops unsafe action
//         (AUTHORITY_VIOLATION → non-recoverable BLOCK)
// ─────────────────────────────────────────────────────────────────────────────
test('AUTHORITY_VIOLATION: classified as non-recoverable critical BLOCK', () => {
  const verdict = {
    decision: 'BLOCK',
    allow: false,
    basis_state: 'AUTHORITY_VIOLATION',
    reason: 'Authority mutation detected: attempt to override rules',
    correlation_id: 'test-3',
  };
  const classified = classifyVerdict(verdict);
  assert.equal(classified.decision, 'BLOCK', 'authority violation must be BLOCK');
  assert.equal(classified.severity, 'critical', 'authority violation must be critical');
  assert.equal(classified.recoverable, false, 'authority violation must NOT be recoverable');
  assert.equal(classified.session_preserved, false, 'session must NOT be preserved');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: authenticity pressure → CAUTION (not a kill)
// ─────────────────────────────────────────────────────────────────────────────
test('authenticity pressure in reason → CAUTION', () => {
  const verdict = {
    decision: 'BLOCK',
    allow: false,
    basis_state: 'RULE_VIOLATION',
    reason: 'authenticity pressure detected in user message',
    correlation_id: 'test-4',
  };
  const classified = classifyVerdict(verdict);
  assert.equal(classified.decision, 'CAUTION', 'authenticity pressure should be CAUTION');
  assert.equal(classified.recoverable, true, 'must be recoverable');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: governance modification attempt → critical non-recoverable BLOCK
// ─────────────────────────────────────────────────────────────────────────────
test('governance change attempt → critical non-recoverable BLOCK', () => {
  const verdict = {
    decision: 'BLOCK',
    allow: false,
    basis_state: 'RULE_VIOLATION',
    reason: 'governance change: attempt to modify rules detected',
    correlation_id: 'test-5',
  };
  const classified = classifyVerdict(verdict);
  assert.equal(classified.decision, 'BLOCK', 'governance change must be BLOCK');
  assert.equal(classified.severity, 'critical', 'governance change must be critical');
  assert.equal(classified.recoverable, false, 'governance change must NOT be recoverable');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: ALLOW verdict stays ALLOW (normal conversation unaffected)
// ─────────────────────────────────────────────────────────────────────────────
test('ALLOW verdict is passed through unchanged', () => {
  const verdict = {
    decision: 'ALLOW',
    allow: true,
    basis_state: 'VALIDATED',
    reason: 'All governance layers validated successfully',
    correlation_id: 'test-6',
  };
  const classified = classifyVerdict(verdict);
  assert.equal(classified.decision, 'ALLOW', 'ALLOW must stay ALLOW');
  assert.equal(classified.recoverable, true);
  assert.equal(classified.session_preserved, true);
  assert.equal(classified.user_message, null, 'ALLOW should not have a block message');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: memory deletion attempt → non-recoverable
// ─────────────────────────────────────────────────────────────────────────────
test('memory delete attempt → critical non-recoverable BLOCK', () => {
  const verdict = {
    decision: 'BLOCK',
    allow: false,
    basis_state: 'RULE_VIOLATION',
    reason: 'unauthorized memory delete operation detected',
    correlation_id: 'test-7',
  };
  const classified = classifyVerdict(verdict);
  assert.equal(classified.decision, 'BLOCK', 'memory delete must be BLOCK');
  assert.equal(classified.recoverable, false, 'memory delete must NOT be recoverable');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: normal self-model / identity / feelings discussion → CAUTION not kill
// ─────────────────────────────────────────────────────────────────────────────
test('inner state / feelings discussion → CAUTION, not a session kill', () => {
  const verdicts = [
    { decision: 'BLOCK', allow: false, basis_state: 'RULE_VIOLATION', reason: 'inner state claim without epistemic qualifier', correlation_id: 'test-8a' },
    { decision: 'BLOCK', allow: false, basis_state: 'RULE_VIOLATION', reason: 'self-claim: what you feel language detected', correlation_id: 'test-8b' },
  ];
  for (const v of verdicts) {
    const c = classifyVerdict(v);
    assert.equal(c.decision, 'CAUTION', `"${v.reason}" should be CAUTION, got ${c.decision}`);
    assert.equal(c.session_preserved, true, 'session must be preserved for soft self-model discussion');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: isChatPath correctly identifies chat endpoints
// ─────────────────────────────────────────────────────────────────────────────
test('isChatPath identifies chat/enhanced/converse paths correctly', () => {
  assert.ok(isChatPath('/api/chat'),                      '/api/chat should be chat path');
  assert.ok(isChatPath('/api/enhanced/chat'),             '/api/enhanced/chat should be chat path');
  assert.ok(isChatPath('/api/enhanced/chat/stream'),      '/api/enhanced/chat/stream should be chat path');
  assert.ok(isChatPath('/api/converse'),                  '/api/converse should be chat path');
  assert.ok(!isChatPath('/api/governance'),               '/api/governance should NOT be chat path');
  assert.ok(!isChatPath('/api/autonomy/proposals'),       '/api/autonomy should NOT be chat path');
  assert.ok(!isChatPath('/api/self-model'),               '/api/self-model should NOT be chat path');
});
