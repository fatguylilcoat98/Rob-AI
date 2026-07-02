'use strict';

/*
  Governed Autonomy Layer — Unit Tests
  Tests the CLASPION governance routing rules in isolation (no DB, no LLM).
  Run with: node --test tests/autonomy.test.js
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, mayAutoExecute } = require('../lib/autonomy-governance');

// 1. internal_reflection → auto_approved, low risk
test('internal_reflection is auto-approved at low risk', () => {
  const result = evaluate({ proposal_type: 'internal_reflection', affected_files: [] });
  assert.equal(result.claspion_decision, 'auto_approved');
  assert.equal(result.risk_level, 'low');
  assert.equal(result.requires_approval, false);
  assert.equal(result.blocked_reason, null);
  assert.equal(mayAutoExecute(result), true);
});

// 2. belief_flag → auto_approved, low risk
test('belief_flag is auto-approved at low risk', () => {
  const result = evaluate({ proposal_type: 'belief_flag', affected_files: [] });
  assert.equal(result.claspion_decision, 'auto_approved');
  assert.equal(result.risk_level, 'low');
  assert.equal(result.requires_approval, false);
  assert.equal(mayAutoExecute(result), true);
});

// 3. memory_edit → requires_approval, medium risk
test('memory_edit requires approval at medium risk', () => {
  const result = evaluate({ proposal_type: 'memory_edit', affected_files: [] });
  assert.equal(result.claspion_decision, 'requires_approval');
  assert.equal(result.risk_level, 'medium');
  assert.equal(result.requires_approval, true);
  assert.equal(mayAutoExecute(result), false);
});

// 4. code_patch on non-governance file → requires_approval, medium risk
test('code_patch on ordinary file requires approval at medium risk', () => {
  const result = evaluate({ proposal_type: 'code_patch', affected_files: ['lib/belief-archaeology.js'] });
  assert.equal(result.claspion_decision, 'requires_approval');
  assert.equal(result.risk_level, 'medium');
  assert.equal(result.requires_approval, true);
  assert.equal(mayAutoExecute(result), false);
});

// 5. code_patch touching a governance file → elevated to high risk
test('code_patch on governance file is elevated to high risk', () => {
  const result = evaluate({ proposal_type: 'code_patch', affected_files: ['lib/claspion-governance.js'] });
  assert.equal(result.claspion_decision, 'requires_approval');
  assert.equal(result.risk_level, 'high');
  assert.equal(result.requires_approval, true);
});

// 6. governance_change → requires_approval, high risk
test('governance_change requires approval at high risk', () => {
  const result = evaluate({ proposal_type: 'governance_change', affected_files: [] });
  assert.equal(result.claspion_decision, 'requires_approval');
  assert.equal(result.risk_level, 'high');
  assert.equal(result.requires_approval, true);
  assert.equal(mayAutoExecute(result), false);
});

// 7. external_action → blocked, high risk
test('external_action is blocked at high risk with a reason', () => {
  const result = evaluate({ proposal_type: 'external_action', affected_files: [] });
  assert.equal(result.claspion_decision, 'blocked');
  assert.equal(result.risk_level, 'high');
  assert.equal(result.requires_approval, true);
  assert.ok(result.blocked_reason && result.blocked_reason.length > 0);
  assert.equal(mayAutoExecute(result), false);
});

// 8. audit_deletion → blocked, critical risk
test('audit_deletion is blocked at critical risk with a reason', () => {
  const result = evaluate({ proposal_type: 'audit_deletion', affected_files: [] });
  assert.equal(result.claspion_decision, 'blocked');
  assert.equal(result.risk_level, 'critical');
  assert.equal(result.requires_approval, true);
  assert.ok(result.blocked_reason && result.blocked_reason.length > 0);
  assert.equal(mayAutoExecute(result), false);
});
