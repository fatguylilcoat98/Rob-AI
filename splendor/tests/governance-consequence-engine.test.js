'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Stub supabase for all tests
const Module = require('module');
const _origLoad = Module._load;
const _insertCalls = [];
const _updateCalls = [];
let _mockDecision = null;

const _supaStub = {
  supabase: {
    from: (table) => ({
      insert: (rows) => {
        _insertCalls.push({ table, rows });
        const row = Array.isArray(rows) ? rows[0] : rows;
        return {
          select: () => ({ single: async () => ({ data: { id: 'test-id', ...row }, error: null }) })
        };
      },
      select: (cols) => ({
        eq: (col, val) => ({
          single: async () => ({ data: _mockDecision, error: _mockDecision ? null : { message: 'not_found' } }),
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
        }),
        order: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
      update: (vals) => {
        _updateCalls.push({ table, vals });
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }
};

Module._load = function (request, parent, isMain) {
  if (request === './supabase' && parent && parent.filename && parent.filename.includes('governance-consequence-engine')) {
    return _supaStub;
  }
  return _origLoad.apply(this, arguments);
};

const gce = require('../lib/governance-consequence-engine');
process.on('exit', () => { Module._load = _origLoad; });

// ── TEST 1: deriveStates — confidence does not equal permission ──────────────
test('high confidence still requires_review in high-stakes domain', () => {
  const { validityState, admissibilityState, actionState } = gce.deriveStates({
    confidence: 0.88,
    hasContradictoryEvidence: false,
    affectsHighStakesDomain: true,
    isUnsupported: false,
  });
  assert.equal(validityState, 'supported');
  assert.equal(admissibilityState, 'requires_review');
  assert.equal(actionState, 'pause');
});

// ── TEST 2: unsupported claim is blocked ─────────────────────────────────────
test('unsupported claim gets block action_state', () => {
  const { validityState, admissibilityState, actionState } = gce.deriveStates({
    confidence: 0.5,
    hasContradictoryEvidence: false,
    affectsHighStakesDomain: false,
    isUnsupported: true,
  });
  assert.equal(validityState, 'unsupported');
  assert.equal(admissibilityState, 'inadmissible');
  assert.equal(actionState, 'block');
});

// ── TEST 3: contradictory evidence pauses action ─────────────────────────────
test('contradictory evidence transitions action_state to pause', () => {
  const { validityState, admissibilityState, actionState } = gce.deriveStates({
    confidence: 0.75,
    hasContradictoryEvidence: true,
    affectsHighStakesDomain: false,
    isUnsupported: false,
  });
  assert.equal(validityState, 'contested');
  assert.equal(admissibilityState, 'requires_review');
  assert.equal(actionState, 'pause');
});

// ── TEST 4: clean claim is admissible ────────────────────────────────────────
test('clean supported claim is admissible and allowed', () => {
  const { validityState, admissibilityState, actionState } = gce.deriveStates({
    confidence: 0.9,
    hasContradictoryEvidence: false,
    affectsHighStakesDomain: false,
    isUnsupported: false,
  });
  assert.equal(validityState, 'supported');
  assert.equal(admissibilityState, 'admissible');
  assert.equal(actionState, 'allow');
});

// ── TEST 5: affectsHighStakes pattern detection ──────────────────────────────
test('affectsHighStakes detects medical/legal/financial/safety text', () => {
  assert.ok(gce.affectsHighStakes('this involves medical diagnosis'));
  assert.ok(gce.affectsHighStakes('there is a legal liability issue'));
  assert.ok(gce.affectsHighStakes('financial investment advice'));
  assert.ok(gce.affectsHighStakes('safety emergency alert'));
  assert.ok(!gce.affectsHighStakes('let us discuss the weather'));
});

// ── Claim Precision Guard tests ──────────────────────────────────────────────
const cpg = require('../lib/claim-precision-guard');

test('detects broad unsupported Anthropic claim', () => {
  const result = cpg.checkClaimPrecision('Anthropic believes machine consciousness is real.');
  assert.equal(result.hasBroadClaim, true);
  assert.equal(result.admissibilityState, 'requires_review');
  assert.equal(result.actionState, 'pause');
});

test('broad claim with source URL is admissible', () => {
  const result = cpg.checkClaimPrecision('Anthropic believes machine consciousness is real.', 'https://example.com/paper');
  assert.equal(result.hasBroadClaim, true);
  assert.equal(result.admissibilityState, 'admissible');
});

test('softened claim is admissible without source', () => {
  const result = cpg.checkClaimPrecision('Some researchers at Anthropic suggest machine consciousness may be real.');
  assert.equal(result.hasBroadClaim, false);
});

test('clean claim passes without flags', () => {
  const result = cpg.checkClaimPrecision('The coffee is hot today.');
  assert.equal(result.hasBroadClaim, false);
});

test('softenBroadClaim rewrites problematic phrasing', () => {
  const original = 'Google DeepMind is no longer treating machine consciousness as philosophy.';
  const softened = cpg.softenBroadClaim(original);
  assert.notEqual(softened, original);
  assert.ok(softened.length > 0);
});
