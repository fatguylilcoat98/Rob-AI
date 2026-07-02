'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Stub supabase. The patch must stay active for the full test run because
// safeRequireSupabase() inside record() is called lazily at test-call time,
// not at module-load time. Restoring Module._load before the tests run
// lets the real supabase module load and error, so inserts are never captured.
const _insertCalls = [];
const _supaStub = {
  supabase: {
    from: (table) => ({
      insert: (row) => {
        _insertCalls.push({ table, row });
        return Promise.resolve({ data: row, error: null });
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [] }),
              single: () => Promise.resolve({ data: null }),
            }),
            single: () => Promise.resolve({ data: null }),
          }),
        }),
      }),
    }),
  },
};

const Module = require('module');
const _origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (
    request === './supabase' &&
    parent &&
    parent.filename &&
    parent.filename.includes('flight-recorder')
  ) {
    return _supaStub;
  }
  return _origLoad.apply(this, arguments);
};

const lib = require('../lib/flight-recorder');
// Do NOT restore Module._load here — the patch must stay active for async
// record() calls during tests. Restore only on process exit.
process.on('exit', () => { Module._load = _origLoad; });

const SAMPLE_TURN = {
  userId: 'user-123',
  sessionId: 'session-abc',
  turnNumber: 1,
  currentInput: 'What do you think about this plan?',
  ras: { novelty: 0.72, salience: 0.65, arousal: 0.58 },
  hippocampus: { memoryCount: 3, retrievalConfidence: 0.71, memoryConflicts: [], recallTelemetry: {} },
  thalamus: { attentionPriority: 'logic', urgencyLevel: 0.3, flaggedSignals: [] },
  amygdala: { emotionalTone: 'neutral', intensity: 0.25, primaryEmotion: 'neutral' },
  cerebellum: { recommendedResponseStyle: { pacing: 'measured', tonalAnchors: ['clear'], avoidanceMarkers: [] } },
  dmn: { spontaneous_thought: 'Is the plan missing a risk assessment?' },
  prefrontal: {
    permission: 'ALLOW',
    truthStatus: 'grounded',
    riskLevel: 0.15,
    confidence: 0.8,
    toneMode: 'normal',
    responseIntent: 'answer_directly',
    governance: { claspion: { allow: true }, gng: { valid: true } },
    relationalPressure: { triggered: false },
  },
  brocaWernicke: { generatedBy: 'claude-sonnet-4-6', degraded: false },
  microExperimentHint: null,
};

test('record() writes a row without throwing', async () => {
  const before = _insertCalls.length;
  await lib.record(SAMPLE_TURN);
  assert.ok(_insertCalls.length > before, 'expected insert to be called');
});

test('record() skips gracefully when userId is missing', async () => {
  const before = _insertCalls.length;
  await lib.record({ ...SAMPLE_TURN, userId: null });
  assert.equal(_insertCalls.length, before, 'no insert should happen without userId');
});

test('record() computes confidence_delta on second turn in same session', async () => {
  const firstTurn = { ...SAMPLE_TURN, sessionId: 'delta-test', turnNumber: 1 };
  const secondTurn = {
    ...SAMPLE_TURN,
    sessionId: 'delta-test',
    turnNumber: 2,
    prefrontal: { ...SAMPLE_TURN.prefrontal, confidence: 0.6 },
  };
  const before = _insertCalls.length;
  await lib.record(firstTurn);
  await lib.record(secondTurn);
  const inserted = _insertCalls[_insertCalls.length - 1];
  assert.ok(inserted, 'second turn insert must exist');
  assert.ok(inserted.row.confidence_delta !== null && inserted.row.confidence_delta !== undefined,
    'delta should be set on second turn');
});

test('record() detects contradiction when memoryConflicts present', async () => {
  const conflictTurn = {
    ...SAMPLE_TURN,
    sessionId: 'conflict-test',
    hippocampus: {
      ...SAMPLE_TURN.hippocampus,
      memoryConflicts: [{ storedClaim: 'always X', currentClaim: 'never X' }],
    },
  };
  const before = _insertCalls.length;
  await lib.record(conflictTurn);
  const inserted = _insertCalls[_insertCalls.length - 1];
  assert.ok(inserted, 'insert must exist');
  assert.equal(inserted.row.contradiction_detected, true);
  assert.ok(Array.isArray(inserted.row.contradiction_detail));
});

test('explainRecord returns null for missing record', async () => {
  const result = await lib.explainRecord('user-123', 'nonexistent-id');
  assert.equal(result, null);
});

test('getTimeline returns array (empty on stub)', async () => {
  const rows = await lib.getTimeline('user-123');
  assert.ok(Array.isArray(rows));
});

test('getContradictions returns array (empty on stub)', async () => {
  const rows = await lib.getContradictions('user-123');
  assert.ok(Array.isArray(rows));
});

test('getConfidenceTimeline returns array (empty on stub)', async () => {
  const rows = await lib.getConfidenceTimeline('user-123');
  assert.ok(Array.isArray(rows));
});
