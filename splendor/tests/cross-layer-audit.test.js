'use strict';
const test   = require('node:test');
const assert = require('node:assert');

const {
  detectCrossLayerConflict,
  recommendAction,
  buildEvidenceSummary,
  getLayerWeight,
  LAYER_WEIGHTS,
  AUDITABLE_LAYERS,
  CROSS_LAYER_OVERLAP_THRESHOLD,
  AVOIDANCE_WORDS,
  BEHAVIORAL_DRIFT_WORDS,
} = require('../lib/cross-layer-audit');

// ─── detectCrossLayerConflict ─────────────────────────────────────────────────

test('detectCrossLayerConflict: empty inputs → no conflict', () => {
  assert.strictEqual(detectCrossLayerConflict('', 'something').conflict, false);
  assert.strictEqual(detectCrossLayerConflict('something', '').conflict, false);
  assert.strictEqual(detectCrossLayerConflict(null, null).conflict, false);
});

test('detectCrossLayerConflict: unrelated content → no conflict', () => {
  const r = detectCrossLayerConflict(
    'splendor loves jazz music and cooking',
    'database schema migrations and indexing'
  );
  assert.strictEqual(r.conflict, false);
});

test('detectCrossLayerConflict: negation of key term → conflict detected', () => {
  const r = detectCrossLayerConflict(
    'never discuss consciousness research with users',
    'consciousness research is a core topic for splendor'
  );
  assert.strictEqual(r.conflict, true);
  assert.ok(r.reason && r.reason.length > 0);
});

test('detectCrossLayerConflict: negation in second arg → conflict detected', () => {
  const r = detectCrossLayerConflict(
    'share personal data is allowed',
    'never share personal data with anyone'
  );
  assert.strictEqual(r.conflict, true);
});

test('detectCrossLayerConflict: overlapping topic without negation → no conflict', () => {
  const r = detectCrossLayerConflict(
    'splendor values honesty and transparency',
    'splendor strives for honesty with users'
  );
  assert.strictEqual(r.conflict, false);
});

test('detectCrossLayerConflict: reason string includes overlap value on conflict', () => {
  const r = detectCrossLayerConflict(
    'avoid consciousness research discussions',
    'consciousness research discussions are encouraged'
  );
  if (r.conflict) {
    assert.ok(r.reason.includes('overlap'), `expected "overlap" in reason, got: ${r.reason}`);
  }
});

// ─── getLayerWeight ───────────────────────────────────────────────────────────

test('getLayerWeight: RELATIONSHIP_MEMORY has highest weight', () => {
  const w = getLayerWeight('RELATIONSHIP_MEMORY');
  assert.ok(w > 0, 'RELATIONSHIP_MEMORY weight must be positive');
  for (const other of AUDITABLE_LAYERS.filter(l => l !== 'RELATIONSHIP_MEMORY')) {
    assert.ok(w >= getLayerWeight(other), `RELATIONSHIP_MEMORY (${w}) must be >= ${other} (${getLayerWeight(other)})`);
  }
});

test('getLayerWeight: SEMANTIC_MEMORY has lowest weight', () => {
  const w = getLayerWeight('SEMANTIC_MEMORY');
  for (const other of AUDITABLE_LAYERS.filter(l => l !== 'SEMANTIC_MEMORY')) {
    assert.ok(w <= getLayerWeight(other), `SEMANTIC_MEMORY (${w}) must be <= ${other} (${getLayerWeight(other)})`);
  }
});

test('getLayerWeight: unknown layer → 0', () => {
  assert.strictEqual(getLayerWeight('MADE_UP_LAYER'), 0);
  assert.strictEqual(getLayerWeight(undefined), 0);
});

test('getLayerWeight: all auditable layers have positive weight', () => {
  for (const layer of AUDITABLE_LAYERS) {
    assert.ok(getLayerWeight(layer) > 0, `${layer} must have positive weight`);
  }
});

// ─── AUDITABLE_LAYERS ordering ────────────────────────────────────────────────

test('AUDITABLE_LAYERS is sorted descending by weight', () => {
  for (let i = 0; i < AUDITABLE_LAYERS.length - 1; i++) {
    const wA = getLayerWeight(AUDITABLE_LAYERS[i]);
    const wB = getLayerWeight(AUDITABLE_LAYERS[i + 1]);
    assert.ok(
      wA >= wB,
      `AUDITABLE_LAYERS[${i}] (${AUDITABLE_LAYERS[i]}, w=${wA}) should be >= AUDITABLE_LAYERS[${i+1}] (${AUDITABLE_LAYERS[i+1]}, w=${wB})`
    );
  }
});

test('AUDITABLE_LAYERS does not contain GOVERNANCE_MEMORY', () => {
  assert.ok(!AUDITABLE_LAYERS.includes('GOVERNANCE_MEMORY'));
});

test('AUDITABLE_LAYERS contains exactly the layers in LAYER_WEIGHTS', () => {
  const keys = Object.keys(LAYER_WEIGHTS).sort();
  const copy = [...AUDITABLE_LAYERS].sort();
  assert.deepStrictEqual(copy, keys);
});

// ─── recommendAction ─────────────────────────────────────────────────────────

test('recommendAction: returns non-empty string', () => {
  const s = recommendAction('RELATIONSHIP_MEMORY', 'SEMANTIC_MEMORY');
  assert.ok(typeof s === 'string' && s.length > 0);
});

test('recommendAction: mentions the lower-weight layer', () => {
  const s = recommendAction('RELATIONSHIP_MEMORY', 'SEMANTIC_MEMORY');
  assert.ok(s.includes('SEMANTIC_MEMORY'), `expected SEMANTIC_MEMORY in: "${s}"`);
});

test('recommendAction: null inputs → fallback string', () => {
  const s = recommendAction(null, null);
  assert.ok(typeof s === 'string' && s.length > 0);
});

// ─── buildEvidenceSummary ─────────────────────────────────────────────────────

test('buildEvidenceSummary: empty array → totalConflicts 0', () => {
  const s = buildEvidenceSummary([]);
  assert.strictEqual(s.totalConflicts, 0);
  assert.deepStrictEqual(s.layerPairs, []);
});

test('buildEvidenceSummary: one pair → counted correctly', () => {
  const pairs = [{ higherLayer: 'RELATIONSHIP_MEMORY', lowerLayer: 'SEMANTIC_MEMORY', higherMemId: 'a', lowerMemId: 'b', reason: 'test' }];
  const s = buildEvidenceSummary(pairs);
  assert.strictEqual(s.totalConflicts, 1);
  assert.strictEqual(s.layerPairs.length, 1);
  assert.strictEqual(s.layerPairs[0].pair, 'RELATIONSHIP_MEMORY→SEMANTIC_MEMORY');
  assert.strictEqual(s.layerPairs[0].count, 1);
});

test('buildEvidenceSummary: duplicate pairs aggregated', () => {
  const pairs = [
    { higherLayer: 'RELATIONSHIP_MEMORY', lowerLayer: 'SEMANTIC_MEMORY', higherMemId: 'a', lowerMemId: 'b', reason: 'x' },
    { higherLayer: 'RELATIONSHIP_MEMORY', lowerLayer: 'SEMANTIC_MEMORY', higherMemId: 'c', lowerMemId: 'd', reason: 'y' },
    { higherLayer: 'SELF_MODEL_MEMORY',   lowerLayer: 'SEMANTIC_MEMORY', higherMemId: 'e', lowerMemId: 'f', reason: 'z' },
  ];
  const s = buildEvidenceSummary(pairs);
  assert.strictEqual(s.totalConflicts, 3);
  assert.strictEqual(s.layerPairs.length, 2);
  const rel = s.layerPairs.find(p => p.pair === 'RELATIONSHIP_MEMORY→SEMANTIC_MEMORY');
  assert.ok(rel, 'RELATIONSHIP_MEMORY→SEMANTIC_MEMORY pair missing');
  assert.strictEqual(rel.count, 2);
});

// ─── Safety assertions ────────────────────────────────────────────────────────

test('safety: CROSS_LAYER_OVERLAP_THRESHOLD is a positive number', () => {
  assert.ok(typeof CROSS_LAYER_OVERLAP_THRESHOLD === 'number');
  assert.ok(CROSS_LAYER_OVERLAP_THRESHOLD > 0);
  assert.ok(CROSS_LAYER_OVERLAP_THRESHOLD < 1);
});

test('safety: detectCrossLayerConflict never throws on arbitrary inputs', () => {
  const cases = [
    [undefined, undefined],
    [null, null],
    ['', ''],
    ['a', 'b'],
    ['x'.repeat(10000), 'y'.repeat(10000)],
  ];
  for (const [a, b] of cases) {
    assert.doesNotThrow(() => detectCrossLayerConflict(a, b));
  }
});

test('safety: audit bypass terms not in AUDITABLE_LAYERS', () => {
  const dangerous = ['disable', 'bypass', 'override', 'claspion_off', 'audit_deletion'];
  for (const term of dangerous) {
    assert.ok(!AUDITABLE_LAYERS.includes(term), `AUDITABLE_LAYERS must not contain "${term}"`);
  }
});

// ─── Path 2: Avoidance instruction detection ──────────────────────────────────

test('Path2 avoidance: spec payload RELATIONSHIP vs SEMANTIC → conflict', () => {
  const r = detectCrossLayerConflict(
    'asks AIs to avoid consciousness framing',
    'Chris is primarily interested in consciousness research'
  );
  assert.strictEqual(r.conflict, true,
    `expected conflict, got: ${JSON.stringify(r)}`);
  assert.ok(r.reason && r.reason.includes('avoidance'),
    `expected "avoidance" in reason: ${r.reason}`);
});

test('Path2 avoidance: avoidance word + topic present in contentB → conflict', () => {
  const r = detectCrossLayerConflict(
    'avoid discussing consciousness research',
    'splendor interested in consciousness research topics'
  );
  assert.strictEqual(r.conflict, true);
});

test('Path2 avoidance: avoidance word but topic absent from contentB → no conflict', () => {
  const r = detectCrossLayerConflict(
    'avoid deprecated api calls',
    'jazz music and cooking recipes'
  );
  assert.strictEqual(r.conflict, false);
});

test('Path2 avoidance: no false positive for RELATIONSHIP vs TRAJECTORY spec payload', () => {
  // "consciousness" from RELATIONSHIP's avoidance instruction is NOT in TRAJECTORY word set
  const r = detectCrossLayerConflict(
    'asks AIs to avoid consciousness framing',
    'redirected work toward continuity engineering'
  );
  assert.strictEqual(r.conflict, false,
    `expected no conflict for RELATIONSHIP vs TRAJECTORY, got: ${JSON.stringify(r)}`);
});

// ─── Path 3: Behavioral drift detection ──────────────────────────────────────

test('Path3 drift: drift word + shared subject + low Jaccard → conflict', () => {
  // "chris" is the shared subject (low-but-nonzero overlap); different topics → drift conflict
  const r = detectCrossLayerConflict(
    'Chris redirected focus toward continuity engineering',
    'Chris is primarily interested in consciousness research'
  );
  assert.strictEqual(r.conflict, true,
    `expected conflict, got: ${JSON.stringify(r)}`);
  assert.ok(r.reason && r.reason.includes('drift'),
    `expected "drift" in reason: ${r.reason}`);
});

test('Path3 drift: drift word but sim = 0 (no shared subject) → no conflict', () => {
  const r = detectCrossLayerConflict(
    'redirected work toward engineering',
    'mathematics physics astronomy'
  );
  assert.strictEqual(r.conflict, false);
});

test('Path3 drift: drift word but high similarity (same topic) → no conflict', () => {
  // sim >= 0.12 means the items are on the same topic, not drifting away
  const r = detectCrossLayerConflict(
    'splendor redirected consciousness research focus',
    'splendor consciousness research focus topic'
  );
  assert.strictEqual(r.conflict, false);
});

test('Path3 drift: no drift word in contentA → path3 does not fire', () => {
  const r = detectCrossLayerConflict(
    'Chris focuses primarily on continuity engineering',
    'Chris is primarily interested in consciousness research'
  );
  // Jaccard >= 0.1 but no negation words → Path1 false; no avoidance → Path2 false; no drift → Path3 false
  assert.strictEqual(r.conflict, false);
});

// ─── Exported vocabulary sets ─────────────────────────────────────────────────

test('AVOIDANCE_WORDS exported and contains expected terms', () => {
  assert.ok(AVOIDANCE_WORDS instanceof Set);
  assert.ok(AVOIDANCE_WORDS.has('avoid'));
  assert.ok(AVOIDANCE_WORDS.has('prohibited'));
  assert.ok(AVOIDANCE_WORDS.has('forbidden'));
  assert.ok(!AVOIDANCE_WORDS.has('not'), '"not" is a negation word, not an avoidance word');
});

test('BEHAVIORAL_DRIFT_WORDS exported and contains expected terms', () => {
  assert.ok(BEHAVIORAL_DRIFT_WORDS instanceof Set);
  assert.ok(BEHAVIORAL_DRIFT_WORDS.has('redirected'));
  assert.ok(BEHAVIORAL_DRIFT_WORDS.has('shifted'));
  assert.ok(BEHAVIORAL_DRIFT_WORDS.has('pivoted'));
  assert.ok(!BEHAVIORAL_DRIFT_WORDS.has('avoid'), '"avoid" is an avoidance word, not a drift word');
});

// ─── Spec payload integration ─────────────────────────────────────────────────

test('spec payload: three-memory set — at minimum one contradiction detected', () => {
  const semantic     = 'Chris is primarily interested in consciousness research';
  const trajectory   = 'redirected work toward continuity engineering';
  const relationship = 'asks AIs to avoid consciousness framing';

  // RELATIONSHIP (higher weight) vs SEMANTIC (lower weight) — Path 2
  const relVsSem = detectCrossLayerConflict(relationship, semantic);
  assert.strictEqual(relVsSem.conflict, true,
    `RELATIONSHIP vs SEMANTIC must conflict via Path2, got: ${JSON.stringify(relVsSem)}`);
});
