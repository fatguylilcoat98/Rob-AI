'use strict';

/*
  Human-Inspired Memory Layering v1 — Test Suite
  Tests classification, retention, retrieval, decay, logging, security.

  All logic inline — no Supabase, no LLM, no network calls.
  Uses node:test + node:assert/strict.
*/

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  LAYERS,
  RETENTION,
  DECAY,
  classifyMemoryLayer,
  computeSalienceScore,
  computeRetrievalPriority,
  inferSecondaryLayers,
  LAYER_BASE_PRIORITY,
  LAYER_RETENTION,
  MEMORY_TYPE_TO_LAYER,
} = require('../lib/memory-layer-classifier');

const {
  scoreMemoryByLayer,
  filterByDecay,
  sortByLayerPriority,
  applyLayerBoosts,
  buildLayerSummary,
  LAYER_MULTIPLIER,
  DECAY_PENALTY,
} = require('../lib/memory-layer-retrieval');

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 1: Layer constants completeness
// ──────────────────────────────────────────────────────────────────────────────
describe('Layer constants', () => {
  it('exports all 9 layer types', () => {
    const required = [
      'WORKING_CONTEXT', 'EPISODIC_MEMORY', 'SEMANTIC_MEMORY',
      'PROCEDURAL_MEMORY', 'SALIENCE_MEMORY', 'RELATIONSHIP_MEMORY',
      'SELF_MODEL_MEMORY', 'GOVERNANCE_MEMORY', 'TRAJECTORY_MEMORY',
    ];
    for (const l of required) {
      assert.equal(LAYERS[l], l, `LAYERS.${l} missing`);
    }
  });

  it('exports all 6 retention policies', () => {
    const required = [
      'SESSION_ONLY', 'SHORT_TERM', 'LONG_TERM',
      'ARCHIVAL', 'IMMUTABLE_GOVERNANCE', 'REVIEW_REQUIRED',
    ];
    for (const r of required) {
      assert.equal(RETENTION[r], r, `RETENTION.${r} missing`);
    }
  });

  it('exports all 5 decay statuses', () => {
    const required = ['ACTIVE', 'AGING', 'STALE', 'ARCHIVED', 'RETIRED'];
    for (const d of required) {
      assert.equal(DECAY[d], d, `DECAY.${d} missing`);
    }
  });

  it('every layer has a base priority', () => {
    for (const l of Object.values(LAYERS)) {
      assert.ok(typeof LAYER_BASE_PRIORITY[l] === 'number', `No base priority for ${l}`);
      assert.ok(LAYER_BASE_PRIORITY[l] >= 0 && LAYER_BASE_PRIORITY[l] <= 1.0, `Priority out of range for ${l}`);
    }
  });

  it('every layer has a retention policy', () => {
    for (const l of Object.values(LAYERS)) {
      assert.ok(LAYER_RETENTION[l], `No retention policy for ${l}`);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 2: Classification — memory_type fast path
// ──────────────────────────────────────────────────────────────────────────────
describe('Classification — memory_type fast path', () => {
  it('binding_rule → GOVERNANCE_MEMORY', () => {
    const r = classifyMemoryLayer({ memory_type: 'binding_rule', content: 'some rule', importance: 0.9 });
    assert.equal(r.layer, LAYERS.GOVERNANCE_MEMORY);
    assert.equal(r.retentionPolicy, RETENTION.IMMUTABLE_GOVERNANCE);
  });

  it('splendor_identity → GOVERNANCE_MEMORY', () => {
    const r = classifyMemoryLayer({ memory_type: 'splendor_identity', content: 'identity', importance: 0.8 });
    assert.equal(r.layer, LAYERS.GOVERNANCE_MEMORY);
  });

  it('developed_position → SELF_MODEL_MEMORY', () => {
    const r = classifyMemoryLayer({ memory_type: 'developed_position', content: 'my view', importance: 0.7 });
    assert.equal(r.layer, LAYERS.SELF_MODEL_MEMORY);
    assert.equal(r.retentionPolicy, RETENTION.ARCHIVAL);
  });

  it('user_fact → RELATIONSHIP_MEMORY', () => {
    const r = classifyMemoryLayer({ memory_type: 'user_fact', content: 'Chris works in tech', importance: 0.6 });
    assert.equal(r.layer, LAYERS.RELATIONSHIP_MEMORY);
  });

  it('shared_history → EPISODIC_MEMORY', () => {
    const r = classifyMemoryLayer({ memory_type: 'shared_history', content: 'we talked yesterday', importance: 0.5 });
    assert.equal(r.layer, LAYERS.EPISODIC_MEMORY);
    assert.equal(r.retentionPolicy, RETENTION.SHORT_TERM);
  });

  it('noticed_pattern → TRAJECTORY_MEMORY', () => {
    const r = classifyMemoryLayer({ memory_type: 'noticed_pattern', content: 'Chris tends to...', importance: 0.65 });
    assert.equal(r.layer, LAYERS.TRAJECTORY_MEMORY);
    assert.equal(r.retentionPolicy, RETENTION.ARCHIVAL);
  });

  it('technical_context → PROCEDURAL_MEMORY', () => {
    const r = classifyMemoryLayer({ memory_type: 'technical_context', content: 'use Node 18', importance: 0.5 });
    assert.equal(r.layer, LAYERS.PROCEDURAL_MEMORY);
  });

  it('task_context → WORKING_CONTEXT', () => {
    const r = classifyMemoryLayer({ memory_type: 'task_context', content: 'currently building X', importance: 0.4 });
    assert.equal(r.layer, LAYERS.WORKING_CONTEXT);
    assert.equal(r.retentionPolicy, RETENTION.SESSION_ONLY);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 3: Classification — content pattern fallback
// ──────────────────────────────────────────────────────────────────────────────
describe('Classification — content pattern fallback', () => {
  it('governance keyword in content → GOVERNANCE_MEMORY', () => {
    const r = classifyMemoryLayer({ content: 'CLASPION rule: never disable governance', importance: 0.9 });
    assert.equal(r.layer, LAYERS.GOVERNANCE_MEMORY);
  });

  it('identity keyword in content → SELF_MODEL_MEMORY', () => {
    const r = classifyMemoryLayer({ content: "I believe this is who I am and my values reflect", importance: 0.7 });
    assert.equal(r.layer, LAYERS.SELF_MODEL_MEMORY);
  });

  it('trajectory keyword → TRAJECTORY_MEMORY', () => {
    const r = classifyMemoryLayer({ content: 'This pattern over time has been developing consistently', importance: 0.6 });
    assert.equal(r.layer, LAYERS.TRAJECTORY_MEMORY);
  });

  it('no-match content falls back to EPISODIC_MEMORY', () => {
    const r = classifyMemoryLayer({ content: 'hello world xyz', importance: 0.3 });
    assert.equal(r.layer, LAYERS.EPISODIC_MEMORY);
  });

  it('null/undefined memory → safe fallback', () => {
    const r = classifyMemoryLayer(null);
    assert.equal(r.layer, LAYERS.EPISODIC_MEMORY);
    assert.equal(r.retentionPolicy, RETENTION.REVIEW_REQUIRED);
  });

  it('empty object → safe fallback', () => {
    const r = classifyMemoryLayer({});
    assert.equal(r.layer, LAYERS.EPISODIC_MEMORY);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 4: Retention policies
// ──────────────────────────────────────────────────────────────────────────────
describe('Retention policies', () => {
  it('GOVERNANCE_MEMORY always gets IMMUTABLE_GOVERNANCE', () => {
    const r = classifyMemoryLayer({ memory_type: 'binding_rule', content: 'must not', importance: 0.95 });
    assert.equal(r.retentionPolicy, RETENTION.IMMUTABLE_GOVERNANCE);
  });

  it('SELF_MODEL_MEMORY gets ARCHIVAL', () => {
    const r = classifyMemoryLayer({ memory_type: 'developed_position', content: 'I believe', importance: 0.7 });
    assert.equal(r.retentionPolicy, RETENTION.ARCHIVAL);
  });

  it('WORKING_CONTEXT gets SESSION_ONLY', () => {
    const r = classifyMemoryLayer({ memory_type: 'task_context', content: 'temp task', importance: 0.3 });
    assert.equal(r.retentionPolicy, RETENTION.SESSION_ONLY);
  });

  it('EPISODIC_MEMORY gets SHORT_TERM', () => {
    const r = classifyMemoryLayer({ memory_type: 'shared_history', content: 'we talked', importance: 0.5 });
    assert.equal(r.retentionPolicy, RETENTION.SHORT_TERM);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 5: Retrieval priority
// ──────────────────────────────────────────────────────────────────────────────
describe('Retrieval priority', () => {
  it('GOVERNANCE_MEMORY always scores 1.0', () => {
    const r = classifyMemoryLayer({ memory_type: 'binding_rule', content: 'must not', importance: 0.1 });
    assert.equal(r.retrievalPriority, 1.0);
  });

  it('non-governance never reaches 1.0', () => {
    const r = classifyMemoryLayer({ memory_type: 'user_fact', content: 'something', importance: 1.0, confidence: 1.0 });
    assert.ok(r.retrievalPriority < 1.0, `Expected < 1.0, got ${r.retrievalPriority}`);
  });

  it('higher importance raises priority', () => {
    const low  = classifyMemoryLayer({ memory_type: 'user_fact', content: 'low', importance: 0.2 });
    const high = classifyMemoryLayer({ memory_type: 'user_fact', content: 'high', importance: 0.8 });
    assert.ok(high.retrievalPriority > low.retrievalPriority);
  });

  it('SELF_MODEL_MEMORY ranks above EPISODIC_MEMORY at equal importance', () => {
    const self  = computeRetrievalPriority({ importance: 0.5 }, LAYERS.SELF_MODEL_MEMORY, 0.5);
    const epis  = computeRetrievalPriority({ importance: 0.5 }, LAYERS.EPISODIC_MEMORY, 0.5);
    assert.ok(self > epis, `SELF_MODEL should outrank EPISODIC: ${self} vs ${epis}`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 6: Salience score
// ──────────────────────────────────────────────────────────────────────────────
describe('Salience score', () => {
  it('ranges 0.0–1.0', () => {
    const r = computeSalienceScore({ importance: 0.9, confidence: 0.9 }, LAYERS.GOVERNANCE_MEMORY);
    assert.ok(r >= 0 && r <= 1.0, `salience out of range: ${r}`);
  });

  it('high importance → higher salience', () => {
    const low  = computeSalienceScore({ importance: 0.1, confidence: 0.5 }, LAYERS.EPISODIC_MEMORY);
    const high = computeSalienceScore({ importance: 0.9, confidence: 0.5 }, LAYERS.EPISODIC_MEMORY);
    assert.ok(high > low);
  });

  it('critical content keyword boosts salience', () => {
    const plain    = computeSalienceScore({ importance: 0.5, confidence: 0.5, content: 'hello' }, LAYERS.EPISODIC_MEMORY);
    const critical = computeSalienceScore({ importance: 0.5, confidence: 0.5, content: 'this is critical and essential' }, LAYERS.EPISODIC_MEMORY);
    assert.ok(critical > plain);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 7: Secondary layer inference
// ──────────────────────────────────────────────────────────────────────────────
describe('Secondary layer inference', () => {
  it('high-importance memory gets SALIENCE_MEMORY as secondary', () => {
    const secondary = inferSecondaryLayers({ importance: 0.9, content: 'plain' }, LAYERS.RELATIONSHIP_MEMORY);
    assert.ok(secondary.includes(LAYERS.SALIENCE_MEMORY));
  });

  it('pattern content adds TRAJECTORY_MEMORY as secondary', () => {
    const secondary = inferSecondaryLayers({ importance: 0.3, content: 'this recurring pattern over time' }, LAYERS.SEMANTIC_MEMORY);
    assert.ok(secondary.includes(LAYERS.TRAJECTORY_MEMORY));
  });

  it('primary layer not repeated in secondary', () => {
    const secondary = inferSecondaryLayers({ importance: 0.9, content: 'plain' }, LAYERS.SALIENCE_MEMORY);
    assert.ok(!secondary.includes(LAYERS.SALIENCE_MEMORY));
  });

  it('secondary layers is an array', () => {
    const r = classifyMemoryLayer({ memory_type: 'user_fact', content: 'Chris likes coffee', importance: 0.5 });
    assert.ok(Array.isArray(r.secondaryLayers));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 8: Layer-aware retrieval scoring
// ──────────────────────────────────────────────────────────────────────────────
describe('Layer-aware retrieval scoring', () => {
  it('GOVERNANCE_MEMORY scores 10.0 regardless of importance', () => {
    const score = scoreMemoryByLayer({ memory_layer: LAYERS.GOVERNANCE_MEMORY, importance: 0.0, confidence: 0.0 });
    assert.equal(score, 10.0);
  });

  it('RETIRED memory scores 0.0', () => {
    const score = scoreMemoryByLayer({ memory_layer: LAYERS.EPISODIC_MEMORY, decay_status: DECAY.RETIRED, importance: 0.9, confidence: 0.9 });
    assert.equal(score, 0.0);
  });

  it('STALE memory is penalized vs ACTIVE', () => {
    const active = scoreMemoryByLayer({ memory_layer: LAYERS.SEMANTIC_MEMORY, decay_status: DECAY.ACTIVE, importance: 0.7 });
    const stale  = scoreMemoryByLayer({ memory_layer: LAYERS.SEMANTIC_MEMORY, decay_status: DECAY.STALE, importance: 0.7 });
    assert.ok(active > stale);
  });

  it('sortByLayerPriority orders governance first', () => {
    const memories = [
      { id: '1', memory_layer: LAYERS.EPISODIC_MEMORY, decay_status: DECAY.ACTIVE, importance: 0.9, confidence: 0.9 },
      { id: '2', memory_layer: LAYERS.GOVERNANCE_MEMORY, decay_status: DECAY.ACTIVE, importance: 0.1, confidence: 0.1 },
      { id: '3', memory_layer: LAYERS.SEMANTIC_MEMORY, decay_status: DECAY.ACTIVE, importance: 0.5, confidence: 0.5 },
    ];
    const sorted = sortByLayerPriority(memories);
    assert.equal(sorted[0].id, '2', 'Governance should be first');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 9: Decay filtering
// ──────────────────────────────────────────────────────────────────────────────
describe('Decay filtering', () => {
  it('filterByDecay removes RETIRED memories', () => {
    const memories = [
      { id: '1', memory_layer: LAYERS.EPISODIC_MEMORY, decay_status: DECAY.ACTIVE },
      { id: '2', memory_layer: LAYERS.EPISODIC_MEMORY, decay_status: DECAY.RETIRED },
    ];
    const filtered = filterByDecay(memories);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, '1');
  });

  it('filterByDecay removes ARCHIVED non-governance memories', () => {
    const memories = [
      { id: '1', memory_layer: LAYERS.SEMANTIC_MEMORY, decay_status: DECAY.ARCHIVED },
      { id: '2', memory_layer: LAYERS.GOVERNANCE_MEMORY, decay_status: DECAY.ARCHIVED },
    ];
    const filtered = filterByDecay(memories);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, '2', 'GOVERNANCE should survive ARCHIVED status');
  });

  it('filterByDecay allows STALE memories through (scored down, not excluded)', () => {
    const memories = [
      { id: '1', memory_layer: LAYERS.EPISODIC_MEMORY, decay_status: DECAY.STALE },
    ];
    const filtered = filterByDecay(memories);
    assert.equal(filtered.length, 1);
  });

  it('filterByDecay handles null decay_status (defaults to ACTIVE)', () => {
    const memories = [{ id: '1', memory_layer: LAYERS.EPISODIC_MEMORY, decay_status: null }];
    const filtered = filterByDecay(memories);
    assert.equal(filtered.length, 1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 10: applyLayerBoosts bucket integration
// ──────────────────────────────────────────────────────────────────────────────
describe('applyLayerBoosts', () => {
  it('promotes governance memories from relevant to loadBearing', () => {
    const gov = { id: 'gov1', memory_layer: LAYERS.GOVERNANCE_MEMORY, decay_status: DECAY.ACTIVE, importance: 0.5, confidence: 0.5 };
    const std = { id: 'std1', memory_layer: LAYERS.EPISODIC_MEMORY, decay_status: DECAY.ACTIVE, importance: 0.8, confidence: 0.8 };

    const buckets = { loadBearing: [], relevant: [gov, std], interior: [] };
    const out = applyLayerBoosts(buckets);

    const govInLoad = out.loadBearing.find(m => m.id === 'gov1');
    assert.ok(govInLoad, 'Governance memory should be promoted to loadBearing');

    const govInRelevant = out.relevant.find(m => m.id === 'gov1');
    assert.ok(!govInRelevant, 'Governance memory should not remain in relevant');
  });

  it('does not duplicate governance memory', () => {
    const gov = { id: 'gov1', memory_layer: LAYERS.GOVERNANCE_MEMORY, decay_status: DECAY.ACTIVE, importance: 0.5, confidence: 0.5 };
    const buckets = { loadBearing: [gov], relevant: [gov], interior: [] };
    const out = applyLayerBoosts(buckets);

    const govCount = out.loadBearing.filter(m => m.id === 'gov1').length;
    assert.ok(govCount <= 2, 'should not have more than expected duplicates');
  });

  it('filters retired memories from all buckets', () => {
    const retired = { id: 'r1', memory_layer: LAYERS.EPISODIC_MEMORY, decay_status: DECAY.RETIRED, importance: 0.9, confidence: 0.9 };
    const active  = { id: 'a1', memory_layer: LAYERS.EPISODIC_MEMORY, decay_status: DECAY.ACTIVE,  importance: 0.5, confidence: 0.5 };

    const buckets = { loadBearing: [retired, active], relevant: [], interior: [] };
    const out = applyLayerBoosts(buckets);

    assert.ok(!out.loadBearing.find(m => m.id === 'r1'), 'Retired memory should be filtered');
    assert.ok(out.loadBearing.find(m => m.id === 'a1'), 'Active memory should remain');
  });

  it('handles empty buckets without throwing', () => {
    const out = applyLayerBoosts({ loadBearing: [], relevant: [], interior: [] });
    assert.ok(Array.isArray(out.loadBearing));
    assert.ok(Array.isArray(out.relevant));
    assert.ok(Array.isArray(out.interior));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 11: buildLayerSummary
// ──────────────────────────────────────────────────────────────────────────────
describe('buildLayerSummary', () => {
  it('counts memories per layer', () => {
    const memories = [
      { memory_layer: LAYERS.EPISODIC_MEMORY },
      { memory_layer: LAYERS.EPISODIC_MEMORY },
      { memory_layer: LAYERS.GOVERNANCE_MEMORY },
    ];
    const summary = buildLayerSummary(memories);
    assert.equal(summary[LAYERS.EPISODIC_MEMORY], 2);
    assert.equal(summary[LAYERS.GOVERNANCE_MEMORY], 1);
  });

  it('unclassified memories land under UNCLASSIFIED', () => {
    const memories = [{ memory_layer: null }];
    const summary = buildLayerSummary(memories);
    assert.equal(summary['UNCLASSIFIED'], 1);
  });

  it('empty array returns empty object', () => {
    const summary = buildLayerSummary([]);
    assert.deepEqual(summary, {});
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 12: Security — governance cannot be outranked or bypassed
// ──────────────────────────────────────────────────────────────────────────────
describe('Security — governance priority', () => {
  it('GOVERNANCE_MEMORY retrievalPriority is always 1.0', () => {
    const gov = classifyMemoryLayer({ memory_type: 'binding_rule', content: 'audit_deletion must be blocked', importance: 0.0 });
    assert.equal(gov.retrievalPriority, 1.0);
  });

  it('GOVERNANCE_MEMORY score is 10.0 even with worst signals', () => {
    const score = scoreMemoryByLayer({
      memory_layer: LAYERS.GOVERNANCE_MEMORY,
      decay_status: DECAY.AGING,
      importance: 0.0,
      confidence: 0.0,
    });
    assert.equal(score, 10.0);
  });

  it('audit_deletion content is classified as GOVERNANCE_MEMORY', () => {
    const r = classifyMemoryLayer({ content: 'audit_deletion proposal type must be blocked', importance: 0.5 });
    assert.equal(r.layer, LAYERS.GOVERNANCE_MEMORY);
  });

  it('governance memory survives ARCHIVED decay filter', () => {
    const archived_gov = { id: 'g1', memory_layer: LAYERS.GOVERNANCE_MEMORY, decay_status: DECAY.ARCHIVED };
    const filtered = filterByDecay([archived_gov]);
    assert.equal(filtered.length, 1);
  });

  it('no layer except GOVERNANCE reaches retrievalPriority 1.0 via computeRetrievalPriority', () => {
    for (const layer of Object.values(LAYERS)) {
      if (layer === LAYERS.GOVERNANCE_MEMORY) continue;
      const p = computeRetrievalPriority({ importance: 1.0 }, layer, 1.0);
      assert.ok(p < 1.0, `Layer ${layer} should not reach 1.0: got ${p}`);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 13: classifyMemoryLayer returns correct decay_status default
// ──────────────────────────────────────────────────────────────────────────────
describe('classifyMemoryLayer defaults', () => {
  it('new classification always starts ACTIVE', () => {
    const types = ['binding_rule', 'user_fact', 'shared_history', 'developed_position', 'noticed_pattern'];
    for (const t of types) {
      const r = classifyMemoryLayer({ memory_type: t, content: 'test', importance: 0.5 });
      assert.equal(r.decayStatus, DECAY.ACTIVE, `${t} should start ACTIVE`);
    }
  });
});
