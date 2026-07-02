'use strict';
/*
  Silent-Failure Audit, Batch 3 — surface interior memory write failures.

  The interactive store_interior_memory tool wrote a belief (logBeliefEvent) and
  a position-conflict check (checkPositionConflict) with .catch(() => {}) — both
  helpers swallowed internally and never rejected, so a failed belief/position
  write vanished. The memory_items insert error was surfaced only as a generic
  console.error.

  Now: the memory_items insert, belief write, and position-conflict check each
  emit a structured [interior:ingest] diagnostic (success AND failure with
  actionable fields). The helpers return { ok, error, code } so the tool can
  detect real failures. Successful behavior (the returned tool_result string,
  the non-blocking helper calls) is unchanged.

  Run: node --test tests/interior-memory-observability.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const { executeStoreInteriorMemory, logInteriorIngest } = require('../lib/interior-memory-tool');
const { logBeliefEvent } = require('../lib/belief-archaeology');
const { checkPositionConflict } = require('../lib/position-revision');

// Injectable mock db: memory_items insert resolves to { error: insertErr };
// the positions SELECT either throws (selectThrows) or returns `existing`.
function makeDb({ insertErr = null, selectThrows = false, existing = [] } = {}) {
  return {
    from(table) {
      return {
        insert: async () => ({ error: table === 'memory_items' ? insertErr : null }),
        select() {
          if (selectThrows) throw new Error('select boom');
          const chain = { eq: () => chain, neq: () => chain, order: () => chain, limit: async () => ({ data: existing, error: null }) };
          return chain;
        },
      };
    },
  };
}

async function run(input, { db } = {}) {
  const records = [];
  const origErr = console.error, origLog = console.log;
  const grab = (channel) => (...a) => { if (a[0] === '[interior:ingest]') records.push({ channel, ...a[1] }); };
  console.error = grab('error'); console.log = grab('log');
  try {
    const result = await executeStoreInteriorMemory(input, 'user-123', { db });
    // Let the fire-and-forget belief/position diagnostics settle. A real timer is
    // reliable under full-suite scheduling load; microtask ticks alone are not.
    await new Promise(r => setTimeout(r, 50));
    return { result, records };
  } finally {
    console.error = origErr; console.log = origLog;
  }
}

// ── emitter ──────────────────────────────────────────────────────────────────
test('logInteriorIngest routes failures to console.error and successes to console.log', () => {
  const calls = [];
  const origErr = console.error, origLog = console.log;
  console.error = (...a) => calls.push(['error', a[1]]);
  console.log = (...a) => calls.push(['log', a[1]]);
  try {
    logInteriorIngest('memory_insert', 'success', { memory_id: 'm1' });
    logInteriorIngest('memory_insert', 'failure', { code: '23514' });
  } finally { console.error = origErr; console.log = origLog; }
  assert.equal(calls.find(c => c[1].outcome === 'success')[0], 'log');
  assert.equal(calls.find(c => c[1].outcome === 'failure')[0], 'error');
});

// ── req: successful memory write — success diagnostic + unchanged behavior ───
test('successful interior memory write emits a success diagnostic and returns the stored message', async () => {
  const { result, records } = await run(
    { type: 'self_reflection', content: 'I notice I hedge under pressure', confidence: 0.7 },
    { db: makeDb({}) });

  const ins = records.find(r => r.step === 'memory_insert');
  assert.ok(ins, 'memory_insert diagnostic emitted');
  assert.equal(ins.outcome, 'success');
  assert.equal(ins.channel, 'log');
  assert.equal(ins.memory_type, 'self_reflection');
  assert.ok(ins.memory_id);
  // behavior preserved
  assert.match(result, /^Stored as Self-Reflection:/);
});

// ── req: failed memory write — surfaced with actionable fields + unchanged ──
test('failed interior memory write emits a failure diagnostic with actionable fields and returns the error string', async () => {
  const insertErr = { code: '23514', message: 'violates check constraint "memory_items_source_type_check"', details: 'Failing row', hint: null };
  const { result, records } = await run(
    { type: 'self_reflection', content: 'x', confidence: 0.7 },
    { db: makeDb({ insertErr }) });

  const ins = records.find(r => r.step === 'memory_insert' && r.outcome === 'failure');
  assert.ok(ins, 'memory_insert failure diagnostic emitted');
  assert.equal(ins.channel, 'error');
  assert.equal(ins.code, '23514');
  assert.equal(ins.message, insertErr.message);
  assert.equal(ins.details, 'Failing row');
  assert.equal(ins.blocked, true);
  // behavior preserved: the tool still returns a descriptive error string
  assert.match(result, /^Error storing memory:/);
});

// ── req: belief write is no longer silent ────────────────────────────────────
test('belief write is surfaced as an [interior:ingest] step (not swallowed)', async () => {
  const { records } = await run(
    { type: 'self_reflection', content: 'a held self-observation', confidence: 0.7 },
    { db: makeDb({}) });
  const belief = records.find(r => r.step === 'belief_write');
  assert.ok(belief, 'belief_write diagnostic emitted (previously a silent .catch(()=>{}))');
});

// ── req: position-conflict failure surfaced ──────────────────────────────────
test('a position-conflict check failure is surfaced for developed_position', async () => {
  const { records } = await run(
    { type: 'developed_position', content: 'I hold that X because Y', confidence: 0.8 },
    { db: makeDb({ selectThrows: true }) }); // positions SELECT throws inside checkPositionConflict

  const pos = records.find(r => r.step === 'position_conflict');
  assert.ok(pos, 'position_conflict diagnostic emitted');
  assert.equal(pos.outcome, 'failure', 'a checkPositionConflict failure is surfaced, not swallowed');
  assert.equal(pos.channel, 'error');
});

test('position-conflict success path (no conflicts) reports success', async () => {
  const { records } = await run(
    { type: 'developed_position', content: 'I hold that X because Y', confidence: 0.8 },
    { db: makeDb({ existing: [] }) });
  const pos = records.find(r => r.step === 'position_conflict');
  assert.ok(pos, 'position_conflict diagnostic emitted');
  assert.equal(pos.outcome, 'success');
});

// ── helper status contracts (unit) ───────────────────────────────────────────
test('logBeliefEvent returns ok:false for missing args (status contract)', async () => {
  const res = await logBeliefEvent(null, 'u', 'created');
  assert.equal(res.ok, false);
});

test('checkPositionConflict returns ok:false when its query throws', async () => {
  const db = { from() { return { select() { throw new Error('boom'); } }; } };
  const res = await checkPositionConflict(db, 'user', 'some content', 'mem-1');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'boom');
});
