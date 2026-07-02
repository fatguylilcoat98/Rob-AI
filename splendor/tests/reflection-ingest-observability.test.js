'use strict';
/*
  Reflection ingestion observability — silent failures become structured,
  actionable [reflection:ingest] diagnostics.

  Before: the memory_items insert error was never captured (logged "Persisted"
  regardless), and the adjacent steps (layer classification, contradiction gate,
  belief archaeology, position-conflict) used `.catch(() => {})` / empty
  `catch (_) {}` — every failure vanished. Now each step emits a structured
  diagnostic on success AND failure, with step name, ids, domain, mapped
  memory_type, and error code/message/details on failure; nothing is swallowed.

  Control flow is unchanged — only diagnostics (and capturing the formerly
  unchecked insert error) were added.

  Run: node --test tests/reflection-ingest-observability.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const {
  logReflectionIngest,
  ingestReflectionToMemory,
} = require('../workers/autonomous-reflection-worker');

// Capture [reflection:ingest] records emitted to console.log/error during fn().
async function captureIngest(fn) {
  const records = [];
  const origErr = console.error, origLog = console.log;
  const grab = (channel) => (...a) => { if (a[0] === '[reflection:ingest]') records.push({ channel, ...a[1] }); };
  console.error = grab('error');
  console.log = grab('log');
  try {
    const result = await fn();
    // let fire-and-forget adjacent .then/.catch settle
    await new Promise(r => setImmediate(r));
    return { result, records };
  } finally {
    console.error = origErr;
    console.log = origLog;
  }
}

// Universal chainable Supabase mock: owner select resolves to `owner`, insert
// resolves to { error: insertErr }; every other call is benign so the real
// adjacent helpers can run without throwing.
function makeDb({ owner = { user_id: 'owner-uuid' }, ownerErr = null, insertErr = null, onInsert } = {}) {
  const make = (table) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => chain,
      order: () => chain,
      single: async () => ({ data: owner, error: ownerErr }),
      maybeSingle: async () => ({ data: owner, error: ownerErr }),
      update: () => chain,
      upsert: () => chain,
      delete: () => chain,
      insert: (payload) => {
        // Only the memory_items insert (and its error) is the subject under test;
        // adjacent steps (e.g. belief archaeology) also insert into other tables.
        if (table === 'memory_items') {
          if (onInsert) onInsert(payload);
          return Promise.resolve({ data: null, error: insertErr });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve) => resolve({ data: null, error: null }),
    };
    return chain;
  };
  return { from: (table) => make(table) };
}

const THOUGHT = { id: 7 };
const THOUGHT_DATA = { thought_content: 'a reflective thought', confidence_level: 7 };
const DOMAIN = { memoryType: 'self_reflection' };

// ── emitter ──────────────────────────────────────────────────────────────────
test('logReflectionIngest routes failures to console.error and successes to console.log', () => {
  const calls = [];
  const origErr = console.error, origLog = console.log;
  console.error = (...a) => calls.push(['error', a[0], a[1]]);
  console.log = (...a) => calls.push(['log', a[0], a[1]]);
  try {
    const ok = logReflectionIngest('memory_insert', 'success', { memory_items_id: 'm1' });
    const bad = logReflectionIngest('memory_insert', 'failure', { code: '23502', message: 'boom' });
    assert.deepEqual(ok, { step: 'memory_insert', outcome: 'success', memory_items_id: 'm1' });
    assert.equal(bad.code, '23502');
  } finally {
    console.error = origErr; console.log = origLog;
  }
  assert.deepEqual(calls.find(c => c[2].outcome === 'success').slice(0, 2), ['log', '[reflection:ingest]']);
  assert.deepEqual(calls.find(c => c[2].outcome === 'failure').slice(0, 2), ['error', '[reflection:ingest]']);
});

// ── req 1: successful insert emits a structured success diagnostic ───────────
test('successful reflection→memory insert emits a structured success diagnostic', async () => {
  let inserted = null;
  const db = makeDb({ onInsert: (p) => { inserted = p; } });
  const { result, records } = await captureIngest(() =>
    ingestReflectionToMemory(db, { thought: THOUGHT, thoughtData: THOUGHT_DATA, domain: DOMAIN }));

  const ins = records.find(r => r.step === 'memory_insert');
  assert.ok(ins, 'a memory_insert diagnostic was emitted');
  assert.equal(ins.outcome, 'success');
  assert.equal(ins.channel, 'log');
  assert.equal(ins.thought_id, 7);
  assert.equal(ins.domain, 'self_reflection');
  assert.equal(ins.mapped_memory_type, 'splendor_reflection');
  assert.ok(ins.memory_items_id, 'success diagnostic carries the memory_items id');
  assert.equal(result.persisted, true);
});

// ── req 4: existing ingestion behavior unchanged except diagnostics ──────────
test('the insert payload is unchanged (schema-aligned values preserved)', async () => {
  let inserted = null;
  const db = makeDb({ onInsert: (p) => { inserted = p; } });
  await captureIngest(() => ingestReflectionToMemory(db, { thought: THOUGHT, thoughtData: THOUGHT_DATA, domain: DOMAIN }));
  assert.ok(inserted, 'an insert was attempted');
  assert.equal(inserted.source_type, 'reflection');
  assert.equal(inserted.provenance, 'GENERATED');
  assert.equal(inserted.source_id, null);
  assert.equal(inserted.owner, 'splendor');
  assert.equal(inserted.memory_type, 'splendor_reflection');
  assert.deepEqual(inserted.source_metadata, { origin: 'autonomous_reflection', thought_id: 7, domain: 'self_reflection' });
});

test('non-interior thoughts attempt no insert and report not_interior (behavior preserved)', async () => {
  let insertCalled = false;
  const db = makeDb({ onInsert: () => { insertCalled = true; } });
  const { result } = await captureIngest(() =>
    ingestReflectionToMemory(db, { thought: THOUGHT, thoughtData: { thought_content: '' }, domain: DOMAIN }));
  assert.equal(insertCalled, false);
  assert.equal(result.persisted, false);
  assert.equal(result.reason, 'not_interior');
});

// ── req 2: failed insert emits a structured failure diagnostic ───────────────
test('failed memory insert emits a structured failure diagnostic with actionable error fields', async () => {
  const insertErr = { code: '23502', message: 'null value in column "content"', details: 'Failing row', hint: null };
  const db = makeDb({ insertErr });
  const { result, records } = await captureIngest(() =>
    ingestReflectionToMemory(db, { thought: THOUGHT, thoughtData: THOUGHT_DATA, domain: DOMAIN }));

  const fail = records.find(r => r.step === 'memory_insert' && r.outcome === 'failure');
  assert.ok(fail, 'a memory_insert failure diagnostic was emitted');
  assert.equal(fail.channel, 'error', 'failures go to console.error');
  assert.equal(fail.code, '23502');
  assert.equal(fail.message, 'null value in column "content"');
  assert.equal(fail.details, 'Failing row');
  assert.equal(fail.blocked, true);
  assert.equal(fail.non_fatal, true);
  assert.equal(result.persisted, false);
});

// ── req 3: adjacent non-fatal step failure is surfaced, not swallowed ────────
test('owner-resolution failure is surfaced (not the old silent skip)', async () => {
  const db = makeDb({ owner: null, ownerErr: { code: 'PGRST116', message: 'no rows' } });
  const { result, records } = await captureIngest(() =>
    ingestReflectionToMemory(db, { thought: THOUGHT, thoughtData: THOUGHT_DATA, domain: DOMAIN }));

  const owner = records.find(r => r.step === 'owner_resolution');
  assert.ok(owner, 'owner_resolution failure was surfaced');
  assert.equal(owner.outcome, 'failure');
  assert.equal(owner.channel, 'error');
  assert.equal(owner.blocked, true);
  assert.equal(result.reason, 'no_owner');
});

test('an unexpected exception in the ingestion path is surfaced, not swallowed', async () => {
  const db = { from() { throw new Error('connection refused'); } };
  const { result, records } = await captureIngest(() =>
    ingestReflectionToMemory(db, { thought: THOUGHT, thoughtData: THOUGHT_DATA, domain: DOMAIN }));

  const ex = records.find(r => r.step === 'memory_ingest' && r.outcome === 'failure');
  assert.ok(ex, 'the catch-all surfaced the exception');
  assert.equal(ex.message, 'connection refused');
  assert.equal(result.persisted, false);
});

// ── the silent swallows are gone from the ingestion path ─────────────────────
test('the reflection ingestion path no longer contains silent .catch(()=>{}) / empty catch', () => {
  const src = fs.readFileSync(path.join(__dirname, '../workers/autonomous-reflection-worker.js'), 'utf8');
  const fnStart = src.indexOf('async function ingestReflectionToMemory');
  assert.ok(fnStart !== -1, 'ingestReflectionToMemory exists');
  const fnBody = src.slice(fnStart, src.indexOf('\nmodule.exports', fnStart));
  assert.ok(!/\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(fnBody), 'no silent .catch(() => {}) in the ingestion path');
  assert.ok(!/catch\s*\(_\)\s*\{\s*\}/.test(fnBody), 'no empty catch (_) {} in the ingestion path');
  // every adjacent step routes through the structured emitter
  for (const step of ['layer_classification', 'contradiction_gate', 'belief_archaeology', 'position_conflict']) {
    assert.ok(fnBody.includes(`'${step}'`), `${step} is instrumented`);
  }
});
