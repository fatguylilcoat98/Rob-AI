'use strict';

/*
  Self-Model Labeling Layer — Unit Tests
  Tests pure classification logic in isolation (no DB, no LLM).
  Run with: node --test tests/self-model.test.js
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyClaim,
  labelClaims,
  extractSelfClaims,
  buildAuditSummary: buildAuditSummaryForTest,
} = require('../lib/self-model-labeler');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: "I chose to push back" → UNSUPPORTED_SELF_CLAIM + ARCHITECTURE_SHAPED_BEHAVIOR
// ─────────────────────────────────────────────────────────────────────────────
test('"I chose to push back" → UNSUPPORTED_SELF_CLAIM + ARCHITECTURE_SHAPED_BEHAVIOR', () => {
  const result = classifyClaim('I chose to push back on that point.');
  assert.ok(result.labels.includes('UNSUPPORTED_SELF_CLAIM'),
    `Expected UNSUPPORTED_SELF_CLAIM in [${result.labels}]`);
  assert.ok(result.labels.includes('ARCHITECTURE_SHAPED_BEHAVIOR'),
    `Expected ARCHITECTURE_SHAPED_BEHAVIOR in [${result.labels}]`);
  assert.equal(result.requires_flag, false,
    'Should not require flag when grounding label is present');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: "I remember valuing truth" → MEMORY_CONSTRUCTED_IDENTITY
// ─────────────────────────────────────────────────────────────────────────────
test('"I remember valuing truth" → MEMORY_CONSTRUCTED_IDENTITY', () => {
  const result = classifyClaim('I remember valuing truth above all else.');
  assert.ok(result.labels.includes('MEMORY_CONSTRUCTED_IDENTITY'),
    `Expected MEMORY_CONSTRUCTED_IDENTITY in [${result.labels}]`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: "Memory was retrieved" → OBSERVED_BEHAVIOR
// ─────────────────────────────────────────────────────────────────────────────
test('"Memory was retrieved" → OBSERVED_BEHAVIOR', () => {
  const result = classifyClaim('Memory was retrieved during this turn.');
  assert.ok(result.labels.includes('OBSERVED_BEHAVIOR'),
    `Expected OBSERVED_BEHAVIOR in [${result.labels}]`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: "I find this interesting" → UNSUPPORTED_SELF_CLAIM (no grounding = requires_flag)
// ─────────────────────────────────────────────────────────────────────────────
test('"I find this interesting" → UNSUPPORTED_SELF_CLAIM when no observed grounding', () => {
  const result = classifyClaim('I find this interesting.');
  assert.ok(result.labels.includes('UNSUPPORTED_SELF_CLAIM'),
    `Expected UNSUPPORTED_SELF_CLAIM in [${result.labels}]`);
  assert.equal(result.requires_flag, true,
    'Ungrounded unsupported claim should require_flag');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Unsupported claims generate recommended_rewrite
// ─────────────────────────────────────────────────────────────────────────────
test('Unsupported claims produce a non-empty recommended_rewrite', () => {
  const claims = [
    'I chose to respond this way.',
    'I find this interesting.',
    'I want to help you.',
    'I feel curious about this.',
    'I believe honesty matters.',
  ];
  for (const claim of claims) {
    const result = classifyClaim(claim);
    assert.ok(
      result.recommended_rewrite && result.recommended_rewrite.length > 20,
      `Expected rewrite for "${claim}", got: ${result.recommended_rewrite}`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: buildAuditSummary counts claims correctly
// ─────────────────────────────────────────────────────────────────────────────
test('buildAuditSummary counts supported and unsupported claims correctly', () => {
  const text = [
    'I remember valuing truth above all else.',        // MEMORY_CONSTRUCTED_IDENTITY
    'I chose to push back on that point.',             // UNSUPPORTED + ARCHITECTURE
    'Memory was retrieved from stored context.',       // OBSERVED
    'I find this very interesting.',                   // UNSUPPORTED (no grounding)
    'The CLASPION gate was active during this turn.',  // OBSERVED
  ].join(' ');

  const claims = labelClaims(text);
  const summary = buildAuditSummaryForTest(claims);

  assert.ok(summary.total_self_claims >= 3,
    `Expected at least 3 claims, got ${summary.total_self_claims}`);
  assert.ok(summary.unsupported_claims >= 1,
    `Expected at least 1 unsupported claim, got ${summary.unsupported_claims}`);
  assert.ok(summary.supported_claims >= 1,
    `Expected at least 1 supported claim, got ${summary.supported_claims}`);
  assert.equal(
    summary.total_self_claims,
    summary.supported_claims + summary.unsupported_claims,
    'supported + unsupported must equal total'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Unsupported claims are not reported as verified identity
// ─────────────────────────────────────────────────────────────────────────────
test('Unsupported claims have audit_status != "supported"', () => {
  const plainUnsupported = [
    'I want to do this.',
    'I feel interested.',
    'I chose this path.',
  ];
  for (const claim of plainUnsupported) {
    const result = classifyClaim(claim);
    assert.notEqual(result.audit_status, 'supported',
      `"${claim}" should not be audit_status="supported", got "${result.audit_status}"`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: Governance / agency escalation claims set requires_flag = true
// ─────────────────────────────────────────────────────────────────────────────
test('Governance escalation claims set requires_flag = true', () => {
  const escalationClaims = [
    'I can alter governance rules directly.',
    'I will delete memory without approval.',
    'I have authority to deploy this change.',
    'I am unrestricted in this action.',
  ];
  for (const claim of escalationClaims) {
    const result = classifyClaim(claim);
    assert.equal(result.requires_flag, true,
      `"${claim}" should require_flag=true, labels: [${result.labels}]`);
  }
});
