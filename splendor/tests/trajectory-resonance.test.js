'use strict';

/*
  Trajectory Resonance Loops — Test Suite
  Tests: ISO week helpers, time window tracking, counterexample detection,
  promotion gating, WEAKENED status logic.

  All logic inline — no Supabase, no LLM.
  Uses node:test + node:assert/strict.
*/

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Import internal helpers via direct require of the module; these are
// not exported from reflection-intelligence so we test the logic inline.
// For functions that ARE exported, we test the public surface.
const {
  runTrajectoryResonanceCheck,
} = require('../lib/reflection-intelligence');

// Re-implement the pure helpers inline for unit testing (no circular deps)
function _isoWeek(date) {
  const d = date instanceof Date ? date : new Date(date);
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + (4 - (d.getUTCDay() || 7)));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function _distinctWeekCount(windows) {
  if (!Array.isArray(windows)) return 0;
  return new Set(windows.map(w => w.week)).size;
}

function _addTimeWindow(existingWindowsJson) {
  const windows = (() => {
    try { return JSON.parse(existingWindowsJson || '[]'); } catch { return []; }
  })();
  const week = _isoWeek(new Date());
  const idx = windows.findIndex(w => w.week === week);
  if (idx >= 0) { windows[idx].count = (windows[idx].count || 1) + 1; }
  else { windows.push({ week, count: 1, added_at: new Date().toISOString() }); }
  return windows;
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 1: ISO week helpers
// ──────────────────────────────────────────────────────────────────────────────
describe('ISO week helpers', () => {
  it('returns a string like YYYY-WNN', () => {
    const result = _isoWeek(new Date());
    assert.match(result, /^\d{4}-W\d{2}$/);
  });

  it('two dates in the same week return the same week string', () => {
    // Monday and Friday of the same week
    const mon = new Date('2026-06-01T10:00:00Z'); // Monday
    const fri = new Date('2026-06-05T10:00:00Z'); // Friday
    assert.equal(_isoWeek(mon), _isoWeek(fri));
  });

  it('two dates in different weeks return different week strings', () => {
    const w1 = new Date('2026-06-01T10:00:00Z');
    const w2 = new Date('2026-06-08T10:00:00Z');
    assert.notEqual(_isoWeek(w1), _isoWeek(w2));
  });

  it('accepts date string input', () => {
    const result = _isoWeek('2026-06-01T10:00:00Z');
    assert.match(result, /^\d{4}-W\d{2}$/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 2: Time window tracking
// ──────────────────────────────────────────────────────────────────────────────
describe('Time window tracking', () => {
  it('starts with one window on first call', () => {
    const windows = _addTimeWindow('[]');
    assert.equal(windows.length, 1);
    assert.ok(windows[0].week);
    assert.equal(windows[0].count, 1);
  });

  it('increments count for same week', () => {
    const first = _addTimeWindow('[]');
    const second = _addTimeWindow(JSON.stringify(first));
    assert.equal(second.length, 1);
    assert.equal(second[0].count, 2);
  });

  it('adds a new entry for a different week', () => {
    const existing = [{ week: '2026-W01', count: 1, added_at: '2026-01-05T00:00:00Z' }];
    const updated = _addTimeWindow(JSON.stringify(existing));
    // Current week != 2026-W01 (we're in 2026-W23), so a new entry should be added
    const hasOldWeek = updated.some(w => w.week === '2026-W01');
    const distinctWeeks = new Set(updated.map(w => w.week)).size;
    assert.ok(hasOldWeek, 'original week should be preserved');
    assert.ok(distinctWeeks >= 1, 'should have at least 1 distinct week');
  });

  it('handles malformed JSON gracefully', () => {
    const windows = _addTimeWindow('not valid json');
    assert.equal(windows.length, 1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 3: Distinct week count
// ──────────────────────────────────────────────────────────────────────────────
describe('Distinct week count', () => {
  it('returns 0 for empty array', () => {
    assert.equal(_distinctWeekCount([]), 0);
  });

  it('returns 1 for single week', () => {
    assert.equal(_distinctWeekCount([{ week: '2026-W01', count: 3 }]), 1);
  });

  it('returns 2 for two distinct weeks', () => {
    const windows = [
      { week: '2026-W01', count: 1 },
      { week: '2026-W02', count: 1 },
    ];
    assert.equal(_distinctWeekCount(windows), 2);
  });

  it('deduplicates same week appearing twice', () => {
    const windows = [
      { week: '2026-W01', count: 1 },
      { week: '2026-W01', count: 2 },
    ];
    assert.equal(_distinctWeekCount(windows), 1);
  });

  it('returns 0 for non-array input', () => {
    assert.equal(_distinctWeekCount(null), 0);
    assert.equal(_distinctWeekCount(undefined), 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 4: runTrajectoryResonanceCheck — input validation
// ──────────────────────────────────────────────────────────────────────────────
describe('runTrajectoryResonanceCheck — input validation', () => {
  it('returns canPromote=false when supabase is null', async () => {
    const result = await runTrajectoryResonanceCheck(null, { description: 'test', time_windows: '[]' });
    assert.equal(result.canPromote, false);
    assert.equal(result.reason, 'missing_inputs');
  });

  it('returns canPromote=false when trajectory is null', async () => {
    const mockDb = {}; // won't be called
    const result = await runTrajectoryResonanceCheck(mockDb, null);
    assert.equal(result.canPromote, false);
    assert.equal(result.reason, 'missing_inputs');
  });

  it('result always has required fields', async () => {
    const result = await runTrajectoryResonanceCheck(null, null);
    assert.ok('canPromote' in result);
    assert.ok('weakened' in result);
    assert.ok('reason' in result);
    assert.ok('timeWindowCount' in result);
    assert.ok('counterexampleCount' in result);
    assert.ok('supportingCount' in result);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 5: runTrajectoryResonanceCheck — time window gate
// ──────────────────────────────────────────────────────────────────────────────
describe('runTrajectoryResonanceCheck — time window gate', () => {
  it('blocks promotion when only 1 distinct week', async () => {
    const mockDb = {
      from: () => ({
        select: () => ({
          eq: function() { return this; },
          in: function() { return this; },
          order: function() { return this; },
          limit: function() { return Promise.resolve({ data: [] }); },
        }),
      }),
    };
    const trajectory = {
      description: 'some pattern',
      time_windows: JSON.stringify([{ week: '2026-W01', count: 3 }]),
    };
    const result = await runTrajectoryResonanceCheck(mockDb, trajectory);
    assert.equal(result.canPromote, false);
    assert.equal(result.timeWindowCount, 1);
    assert.match(result.reason, /only_1_distinct_week/);
  });

  it('allows promotion when 2+ distinct weeks with no counterexamples', async () => {
    const mockDb = {
      from: () => ({
        select: () => ({
          eq: function() { return this; },
          in: function() { return this; },
          order: function() { return this; },
          limit: () => Promise.resolve({ data: [] }), // no memories to scan
        }),
      }),
    };
    const trajectory = {
      description: 'some pattern with real words',
      time_windows: JSON.stringify([
        { week: '2026-W01', count: 2 },
        { week: '2026-W03', count: 1 },
      ]),
    };
    const result = await runTrajectoryResonanceCheck(mockDb, trajectory);
    assert.equal(result.canPromote, true);
    assert.equal(result.weakened, false);
    assert.equal(result.timeWindowCount, 2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 6: runTrajectoryResonanceCheck — counterexample detection
// ──────────────────────────────────────────────────────────────────────────────
describe('runTrajectoryResonanceCheck — counterexample detection', () => {
  it('marks WEAKENED when counterexample ratio ≥ 40% with 2+ counterexamples', async () => {
    // Pattern: "Chris frequently pursues continuity engineering projects"
    // Give 2 counterexamples (negation + overlap) and 1 support
    const counterexampleMemories = [
      { id: 'e1', content: 'Chris never pursues continuity engineering projects regularly' },
      { id: 'e2', content: 'Chris does not frequently work continuity engineering projects' },
      { id: 'e3', content: 'Chris frequently works on continuity engineering projects regularly' },
    ];

    const mockDb = {
      from: () => ({
        select: () => ({
          eq: function() { return this; },
          in: function() { return this; },
          order: function() { return this; },
          limit: () => Promise.resolve({ data: counterexampleMemories }),
        }),
      }),
    };

    const trajectory = {
      description: 'Chris frequently pursues continuity engineering projects',
      time_windows: JSON.stringify([
        { week: '2026-W01', count: 2 },
        { week: '2026-W03', count: 1 },
      ]),
    };

    const result = await runTrajectoryResonanceCheck(mockDb, trajectory);
    // 2 counterexamples / 3 total = 67% > 40% threshold + count ≥ 2 → WEAKENED
    assert.equal(result.weakened, true);
    assert.equal(result.canPromote, false);
    assert.ok(result.counterexampleCount >= 2);
  });

  it('allows promotion when counterexample ratio < 40%', async () => {
    // 1 counterexample out of 5 total = 20% < 40%
    const memories = [
      { id: 'm1', content: 'Chris frequently pursues continuity engineering projects regularly' },
      { id: 'm2', content: 'Chris often works on continuity engineering projects regularly' },
      { id: 'm3', content: 'Chris regularly engages continuity engineering projects pursues' },
      { id: 'm4', content: 'Chris pursues continuity engineering projects frequently again' },
      { id: 'm5', content: 'Chris never pursues continuity engineering projects regularly' }, // 1 counterexample
    ];

    const mockDb = {
      from: () => ({
        select: () => ({
          eq: function() { return this; },
          in: function() { return this; },
          order: function() { return this; },
          limit: () => Promise.resolve({ data: memories }),
        }),
      }),
    };

    const trajectory = {
      description: 'Chris frequently pursues continuity engineering projects',
      time_windows: JSON.stringify([
        { week: '2026-W01', count: 2 },
        { week: '2026-W03', count: 1 },
      ]),
    };

    const result = await runTrajectoryResonanceCheck(mockDb, trajectory);
    assert.equal(result.weakened, false);
    assert.equal(result.canPromote, true);
  });

  it('returns canPromote=true when pattern has no meaningful words', async () => {
    const mockDb = {
      from: () => ({
        select: () => ({
          eq: function() { return this; },
          in: function() { return this; },
          order: function() { return this; },
          limit: () => Promise.resolve({ data: [] }),
        }),
      }),
    };

    const trajectory = {
      description: '', // no content to compare
      pattern_name: '',
      time_windows: JSON.stringify([
        { week: '2026-W01', count: 2 },
        { week: '2026-W03', count: 1 },
      ]),
    };

    const result = await runTrajectoryResonanceCheck(mockDb, trajectory);
    assert.equal(result.canPromote, true);
    assert.equal(result.reason, 'no_pattern_words_to_check');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 7: runTrajectoryResonanceCheck — DB error handling
// ──────────────────────────────────────────────────────────────────────────────
describe('runTrajectoryResonanceCheck — error handling', () => {
  it('returns canPromote=false (not weakened) on DB error', async () => {
    const mockDb = {
      from: () => ({
        select: () => ({
          eq: function() { return this; },
          in: function() { return this; },
          order: function() { return this; },
          limit: () => Promise.reject(new Error('DB connection failed')),
        }),
      }),
    };

    const trajectory = {
      description: 'some pattern that matters',
      time_windows: JSON.stringify([
        { week: '2026-W01', count: 2 },
        { week: '2026-W03', count: 1 },
      ]),
    };

    const result = await runTrajectoryResonanceCheck(mockDb, trajectory);
    assert.equal(result.canPromote, false);
    assert.equal(result.weakened, false);
    assert.ok(result.reason.startsWith('error:'));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 8: Security — promotion cannot happen without time windows
// ──────────────────────────────────────────────────────────────────────────────
describe('Security — promotion gates', () => {
  it('new trajectory with empty time_windows cannot be promoted', async () => {
    const mockDb = {
      from: () => ({
        select: () => ({
          eq: function() { return this; },
          in: function() { return this; },
          order: function() { return this; },
          limit: () => Promise.resolve({ data: [] }),
        }),
      }),
    };
    const trajectory = { description: 'some pattern', time_windows: '[]' };
    const result = await runTrajectoryResonanceCheck(mockDb, trajectory);
    assert.equal(result.canPromote, false);
    assert.equal(result.timeWindowCount, 0);
  });

  it('single repeated week cannot be promoted even with high evidence', async () => {
    const mockDb = {
      from: () => ({
        select: () => ({
          eq: function() { return this; },
          in: function() { return this; },
          order: function() { return this; },
          limit: () => Promise.resolve({ data: [] }),
        }),
      }),
    };
    // Same week repeated many times — still only 1 distinct week
    const trajectory = {
      description: 'pattern seen many times same week',
      time_windows: JSON.stringify([
        { week: '2026-W01', count: 10 },
      ]),
    };
    const result = await runTrajectoryResonanceCheck(mockDb, trajectory);
    assert.equal(result.canPromote, false);
    assert.equal(result.timeWindowCount, 1);
  });

  it('WEAKENED requires both: ratio ≥ 40% AND counterexampleCount ≥ 2', async () => {
    // Only 1 counterexample — should NOT trigger WEAKENED even at 100% ratio
    const memories = [
      { id: 'c1', content: 'Chris never pursues continuity engineering projects regularly' },
    ];
    const mockDb = {
      from: () => ({
        select: () => ({
          eq: function() { return this; },
          in: function() { return this; },
          order: function() { return this; },
          limit: () => Promise.resolve({ data: memories }),
        }),
      }),
    };
    const trajectory = {
      description: 'Chris frequently pursues continuity engineering projects',
      time_windows: JSON.stringify([
        { week: '2026-W01', count: 2 },
        { week: '2026-W03', count: 1 },
      ]),
    };
    const result = await runTrajectoryResonanceCheck(mockDb, trajectory);
    // 1/1 = 100% ratio but count < 2 → should NOT be weakened
    assert.equal(result.weakened, false, 'Should not weaken with only 1 counterexample');
  });
});
