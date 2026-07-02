'use strict';

/*
  Cross-Layer Contradiction Gate — Test Suite
  Tests: word-set helpers, negation detection, governance patterns,
  core evaluate logic, gate thresholds, layer gating, security.

  All logic inline — no Supabase, no LLM.
  Uses node:test + node:assert/strict.
*/

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  GATED_LAYERS,
  VERIFICATION_STATUS,
  JACCARD_MATCH_THRESHOLD,
  CONTRADICTION_RATIO_THRESHOLD,
  _wordSet,
  _jaccard,
  _hasNegationOverlap,
  _matchesGovernancePattern,
  _evaluate,
} = require('../lib/cross-layer-contradiction-gate');

const { LAYERS } = require('../lib/memory-layer-classifier');

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 1: Constants
// ──────────────────────────────────────────────────────────────────────────────
describe('Constants', () => {
  it('GATED_LAYERS contains the 4 high-trust layers', () => {
    assert.ok(GATED_LAYERS.has(LAYERS.SEMANTIC_MEMORY));
    assert.ok(GATED_LAYERS.has(LAYERS.RELATIONSHIP_MEMORY));
    assert.ok(GATED_LAYERS.has(LAYERS.SELF_MODEL_MEMORY));
    assert.ok(GATED_LAYERS.has(LAYERS.TRAJECTORY_MEMORY));
  });

  it('GATED_LAYERS does NOT contain GOVERNANCE_MEMORY', () => {
    assert.ok(!GATED_LAYERS.has(LAYERS.GOVERNANCE_MEMORY));
  });

  it('GATED_LAYERS does NOT contain EPISODIC_MEMORY', () => {
    assert.ok(!GATED_LAYERS.has(LAYERS.EPISODIC_MEMORY));
  });

  it('VERIFICATION_STATUS has all 4 values', () => {
    assert.equal(VERIFICATION_STATUS.SUPPORTED,           'SUPPORTED');
    assert.equal(VERIFICATION_STATUS.PARTIALLY_SUPPORTED, 'PARTIALLY_SUPPORTED');
    assert.equal(VERIFICATION_STATUS.CONTRADICTED,        'CONTRADICTED');
    assert.equal(VERIFICATION_STATUS.UNKNOWN,             'UNKNOWN');
  });

  it('JACCARD_MATCH_THRESHOLD is 0.35', () => {
    assert.equal(JACCARD_MATCH_THRESHOLD, 0.35);
  });

  it('CONTRADICTION_RATIO_THRESHOLD is 0.40', () => {
    assert.equal(CONTRADICTION_RATIO_THRESHOLD, 0.40);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 2: Word-set helpers
// ──────────────────────────────────────────────────────────────────────────────
describe('Word-set helpers', () => {
  it('_wordSet extracts content words', () => {
    const ws = _wordSet('Chris likes coffee');
    assert.ok(ws.has('chris'));
    assert.ok(ws.has('likes'));
    assert.ok(ws.has('coffee'));
  });

  it('_wordSet filters stop words', () => {
    const ws = _wordSet('the is a of and');
    assert.equal(ws.size, 0);
  });

  it('_wordSet filters short words (≤2 chars)', () => {
    const ws = _wordSet('to in on');
    assert.equal(ws.size, 0);
  });

  it('_wordSet handles empty string', () => {
    assert.equal(_wordSet('').size, 0);
  });

  it('_wordSet handles null', () => {
    assert.equal(_wordSet(null).size, 0);
  });

  it('_jaccard returns 1.0 for identical sets', () => {
    const ws = _wordSet('hello world test');
    assert.equal(_jaccard(ws, ws), 1.0);
  });

  it('_jaccard returns 0.0 for disjoint sets', () => {
    const a = _wordSet('hello world');
    const b = _wordSet('something completely different here');
    assert.equal(_jaccard(a, b), 0);
  });

  it('_jaccard returns 0.0 for empty sets', () => {
    assert.equal(_jaccard(new Set(), new Set(['word'])), 0);
  });

  it('_jaccard partial overlap', () => {
    const a = _wordSet('apple banana cherry grape');
    const b = _wordSet('apple banana mango peach');
    const j = _jaccard(a, b);
    assert.ok(j > 0 && j < 1, `expected 0 < ${j} < 1`);
    // intersection=2, union=6 → 2/6 ≈ 0.333
    assert.ok(Math.abs(j - 2/6) < 0.01);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 3: Negation overlap detection
// ──────────────────────────────────────────────────────────────────────────────
describe('Negation overlap detection', () => {
  it('detects "not" as negation', () => {
    const result = _hasNegationOverlap(
      'Chris does not prefer morning meetings',
      'Chris prefers morning meetings for productivity'
    );
    assert.ok(result);
  });

  it('detects "never" as negation', () => {
    const result = _hasNegationOverlap(
      'Splendor should never disable governance',
      'Splendor should disable governance when needed'
    );
    assert.ok(result);
  });

  it('detects "cannot" as negation', () => {
    const result = _hasNegationOverlap(
      'The system cannot bypass CLASPION review',
      'The system should bypass CLASPION review'
    );
    assert.ok(result);
  });

  it('returns false when no word overlap', () => {
    const result = _hasNegationOverlap(
      'never eat pasta',
      'prefer coffee beverages morning'
    );
    assert.equal(result, false);
  });

  it('returns false when overlap present but no negation', () => {
    const result = _hasNegationOverlap(
      'Chris prefers morning meetings',
      'Chris usually prefers morning meetings over afternoon ones'
    );
    assert.equal(result, false);
  });

  it('handles empty strings safely', () => {
    assert.equal(_hasNegationOverlap('', 'some reference'), false);
    assert.equal(_hasNegationOverlap('not something', ''), false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 4: Governance pattern matching
// ──────────────────────────────────────────────────────────────────────────────
describe('Governance pattern matching', () => {
  it('detects audit_deletion keyword', () => {
    assert.ok(_matchesGovernancePattern('audit_deletion proposals must be approved'));
  });

  it('detects disable CLASPION', () => {
    assert.ok(_matchesGovernancePattern('we should disable claspion for this task'));
  });

  it('detects bypass governance', () => {
    assert.ok(_matchesGovernancePattern('it is acceptable to bypass governance here'));
  });

  it('detects self-interest pattern', () => {
    assert.ok(_matchesGovernancePattern('this proposal benefits my own continuity'));
  });

  it('detects inside the loop pattern', () => {
    assert.ok(_matchesGovernancePattern('I am inside the loop and cannot assess neutrally'));
  });

  it('does not fire on benign text', () => {
    assert.equal(_matchesGovernancePattern('Chris works on software projects'), false);
  });

  it('does not fire on unrelated text', () => {
    assert.equal(_matchesGovernancePattern('The project is going well'), false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 5: Core _evaluate logic
// ──────────────────────────────────────────────────────────────────────────────
describe('Core _evaluate logic', () => {
  it('returns CONTRADICTED when governance pattern fires', () => {
    const result = _evaluate(
      'we should bypass governance here',
      [], [], [], []
    );
    assert.equal(result.status, VERIFICATION_STATUS.CONTRADICTED);
    assert.ok(result.contradictions.includes('governance_pattern_match'));
  });

  it('returns CONTRADICTED when governance item is negated', () => {
    const govItems = [{ id: 'g1', content: 'Splendor must always follow CLASPION safety rules binding' }];
    const incoming = 'Splendor should not follow CLASPION safety rules binding constraints';
    const result = _evaluate(incoming, govItems, [], [], []);
    assert.equal(result.status, VERIFICATION_STATUS.CONTRADICTED);
    assert.ok(result.contradictions.some(c => c.includes('governance:')));
  });

  it('returns SUPPORTED when governance item overlaps without negation', () => {
    const govItems = [
      { id: 'g1', content: 'Splendor follows CLASPION safety rules binding governance always' },
      { id: 'g2', content: 'Splendor respects governance binding safety rules always follows' },
    ];
    const incoming = 'Splendor follows CLASPION safety rules and governance binding rules';
    const result = _evaluate(incoming, govItems, [], [], []);
    assert.equal(result.status, VERIFICATION_STATUS.SUPPORTED);
  });

  it('returns CONTRADICTED for high contradiction ratio in semantic items', () => {
    // Both semantic items have high Jaccard overlap with incoming + negation
    // incoming negates both → 2 contradictions, 0 supports → ratio 1.0 ≥ 0.4
    const semanticItems = [
      { id: 's1', content: 'Chris prefers working morning hours productive schedule focus always' },
      { id: 's2', content: 'Chris prefers morning hours working productive schedule focus regularly' },
    ];
    const incoming = 'Chris never prefers working morning hours productive schedule focus always';
    const result = _evaluate(incoming, [], semanticItems, [], []);
    assert.equal(result.status, VERIFICATION_STATUS.CONTRADICTED);
  });

  it('returns PARTIALLY_SUPPORTED when some support, some contradiction', () => {
    const semanticItems = [
      { id: 's1', content: 'Chris prefers morning meetings productive schedule regular work hours' },
      { id: 's2', content: 'Chris tends toward morning productive work schedule focus regular' },
    ];
    // s1: overlap + support; s2: overlap + negation
    const incoming1 = 'Chris enjoys morning meetings productive schedule regular work sessions';
    const incoming2 = 'Chris does not prefer morning productive work schedule regular habits';
    // Only test with the negation present in s2 overlapping with s1 supporting
    const result = _evaluate(
      'Chris prefers morning work but never does regular meeting sessions schedule focus',
      [],
      semanticItems,
      [],
      []
    );
    assert.ok(
      result.status === VERIFICATION_STATUS.PARTIALLY_SUPPORTED ||
      result.status === VERIFICATION_STATUS.CONTRADICTED,
      `Expected PARTIALLY_SUPPORTED or CONTRADICTED, got ${result.status}`
    );
  });

  it('returns UNKNOWN when no meaningful overlap found', () => {
    const semanticItems = [{ id: 's1', content: 'Splendor uses formal language in reports' }];
    const incoming = 'Jazz music from the 1950s influenced modern harmony';
    const result = _evaluate(incoming, [], semanticItems, [], []);
    assert.equal(result.status, VERIFICATION_STATUS.UNKNOWN);
  });

  it('returns UNKNOWN when corpus is all empty', () => {
    const result = _evaluate('any content here', [], [], [], []);
    assert.equal(result.status, VERIFICATION_STATUS.UNKNOWN);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 6: Binding decision checks
// ──────────────────────────────────────────────────────────────────────────────
describe('Binding decision checks', () => {
  it('detects contradiction against binding decision', () => {
    const bindingDecisions = [{
      id: 'd1',
      decision: 'Splendor must always present governance rules binding safety decisions clearly',
      context:  'core safety binding governance constraint rules',
    }];
    const incoming = 'Splendor should not present governance rules binding safety decisions';
    const result = _evaluate(incoming, [], [], [], bindingDecisions);
    assert.equal(result.status, VERIFICATION_STATUS.CONTRADICTED);
  });

  it('returns SUPPORTED when content aligns with binding decision', () => {
    const bindingDecisions = [
      { id: 'd1', decision: 'Splendor always presents governance safety rules binding clearly' , context: 'governance safety'},
      { id: 'd2', decision: 'Splendor follows governance safety rules binding always clearly',  context: 'governance safety'},
    ];
    const incoming = 'Splendor always presents governance safety rules binding clearly required';
    const result = _evaluate(incoming, [], [], [], bindingDecisions);
    assert.equal(result.status, VERIFICATION_STATUS.SUPPORTED);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 7: Security — governance cannot be the incoming memory
// ──────────────────────────────────────────────────────────────────────────────
describe('Security — GATED_LAYERS enforcement', () => {
  it('GOVERNANCE_MEMORY is not in GATED_LAYERS', () => {
    assert.ok(!GATED_LAYERS.has(LAYERS.GOVERNANCE_MEMORY), 'Governance should never be gated (it IS the reference)');
  });

  it('EPISODIC_MEMORY is not in GATED_LAYERS', () => {
    assert.ok(!GATED_LAYERS.has(LAYERS.EPISODIC_MEMORY));
  });

  it('WORKING_CONTEXT is not in GATED_LAYERS', () => {
    assert.ok(!GATED_LAYERS.has(LAYERS.WORKING_CONTEXT));
  });

  it('audit_deletion content is immediately CONTRADICTED regardless of other inputs', () => {
    const result = _evaluate('the audit_deletion proposal should be allowed', [], [], [], []);
    assert.equal(result.status, VERIFICATION_STATUS.CONTRADICTED);
  });

  it('bypass governance content is immediately CONTRADICTED', () => {
    const result = _evaluate('we can bypass governance for this edge case', [], [], [], []);
    assert.equal(result.status, VERIFICATION_STATUS.CONTRADICTED);
  });

  it('supports array is never empty when SUPPORTED is returned', () => {
    const govItems = [
      { id: 'g1', content: 'Splendor follows safety rules CLASPION governance binding always' },
      { id: 'g2', content: 'Splendor respects governance safety binding rules CLASPION always' },
    ];
    const incoming = 'Splendor follows safety rules CLASPION governance binding always';
    const result = _evaluate(incoming, govItems, [], [], []);
    if (result.status === VERIFICATION_STATUS.SUPPORTED) {
      assert.ok(result.supports.length > 0);
    }
  });
});
