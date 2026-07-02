'use strict';
/*
  Silent-Failure Audit, Batch 1 — surface reflection helper failures.

  persistLayerClassification / runContradictionGate / persistGateResult used to
  warn-and-resolve, so the reflection worker's .then() always saw "success" even
  when the underlying memory_items write failed. They now return a structured
  { ok, error, code } status, and the worker classifies the [reflection:ingest]
  diagnostic on it — so a real helper failure is logged as a FAILURE, not a
  success. Successful paths are unchanged.

  Run: node --test tests/reflection-helper-failure-surfacing.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const { ingestReflectionToMemory } = require('../workers/autonomous-reflection-worker');
const { persistLayerClassification } = require('../lib/memory-layer-classifier');
const { runContradictionGate, persistGateResult } = require('../lib/cross-layer-contradiction-gate');

// Stateful chainable mock. Owner select resolves to `owner`; memory_items
// insert resolves to { error: insertErr }; an awaited memory_items UPDATE
// resolves to { error: updateErr } (drives the helpers' ok:false path).
function makeDb({ owner = { user_id: 'owner-uuid' }, ownerErr = null, insertErr = null, updateErr = null } = {}) {
  const make = (table) => {
    let afterUpdate = false;
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain, gte: () => chain, lte: () => chain,
      neq: () => chain, not: () => chain, order: () => chain, limit: () => chain,
      single: async () => ({ data: owner, error: ownerErr }),
      maybeSingle: async () => ({ data: owner, error: ownerErr }),
      update: () => { afterUpdate = true; return chain; },
      upsert: () => chain, delete: () => chain,
      insert: () => Promise.resolve({ data: null, error: table === 'memory_items' ? insertErr : null }),
      then: (resolve) => resolve({ data: null, error: afterUpdate ? updateErr : null }),
    };
    return chain;
  };
  return { from: (t) => make(t) };
}

async function captureIngest(db) {
  const records = [];
  const origErr = console.error, origLog = console.log;
  const grab = (channel) => (...a) => { if (a[0] === '[reflection:ingest]') records.push({ channel, ...a[1] }); };
  console.error = grab('error'); console.log = grab('log');
  try {
    const result = await ingestReflectionToMemory(db, {
      thought: { id: 7 },
      thoughtData: { thought_content: 'a reflective thought', confidence_level: 7 },
      domain: { memoryType: 'self_reflection' },
    });
    // let the fire-and-forget layer/gate chains settle
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    return { result, records };
  } finally {
    console.error = origErr; console.log = origLog;
  }
}

// ── helper status contract (unit) ────────────────────────────────────────────
test('persistLayerClassification returns ok:true on success, ok:false+code on update failure', async () => {
  const okRes = await persistLayerClassification(makeDb({}), 'm1', { layer: 'X' });
  assert.equal(okRes.ok, true);

  const badRes = await persistLayerClassification(
    makeDb({ updateErr: { message: 'permission denied', code: '42501' } }), 'm1', { layer: 'X' });
  assert.equal(badRes.ok, false);
  assert.equal(badRes.code, '42501');
  assert.equal(badRes.error, 'permission denied');
});

test('persistGateResult returns ok:false+code on update failure', async () => {
  const badRes = await persistGateResult(
    makeDb({ updateErr: { message: 'permission denied', code: '42501' } }), 'm1', { status: 'UNKNOWN' }, 'X');
  assert.equal(badRes.ok, false);
  assert.equal(badRes.code, '42501');
});

test('runContradictionGate returns ok:true on a normal (non-throwing) run', async () => {
  const res = await runContradictionGate(makeDb({}), 'm1',
    { content: 'x', memory_type: 'self_reflection', user_id: 'owner-uuid', confidence: 0.7 }, 'SELF_MODEL_MEMORY');
  assert.notEqual(res.ok, false); // ok:true on success (or skip), never false here
});

// ── req 1 + 2: helper failures surface as [reflection:ingest] failures ───────
test('a memory_items write failure surfaces layer_classification AND contradiction_gate failures', async () => {
  const { result, records } = await captureIngest(
    makeDb({ updateErr: { message: 'permission denied', code: '42501' } }));

  // The main reflection insert still succeeded (insert path, not update path).
  const ins = records.find(r => r.step === 'memory_insert');
  assert.equal(ins.outcome, 'success');
  assert.equal(result.persisted, true);

  const layer = records.find(r => r.step === 'layer_classification');
  assert.ok(layer, 'layer_classification diagnostic emitted');
  assert.equal(layer.outcome, 'failure', 'layer classifier failure surfaced (not silent success)');
  assert.equal(layer.channel, 'error');
  assert.equal(layer.code, '42501');
  assert.equal(layer.message, 'permission denied');

  const gate = records.find(r => r.step === 'contradiction_gate');
  assert.ok(gate, 'contradiction_gate diagnostic emitted');
  assert.equal(gate.outcome, 'failure', 'contradiction gate failure surfaced');
  assert.equal(gate.channel, 'error');
});

// ── req 3: successful helper paths still report success ──────────────────────
test('when helper writes succeed, the steps still report success', async () => {
  const { records } = await captureIngest(makeDb({})); // no updateErr

  const layer = records.find(r => r.step === 'layer_classification');
  assert.ok(layer, 'layer_classification diagnostic emitted');
  assert.equal(layer.outcome, 'success');
  assert.equal(layer.channel, 'log');

  const gate = records.find(r => r.step === 'contradiction_gate');
  if (gate) { // only when the classified layer is gated
    assert.equal(gate.outcome, 'success');
  }
});
