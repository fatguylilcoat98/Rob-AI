'use strict';
/*
  M2 regression — continuous consciousness state must PERSIST, not skip.

  updateConsciousnessState() previously evolved mood/energy in memory and then
  deliberately skipped the DB write ("Skip database update due to schema issues"),
  so consciousness_state never updated and any failure was invisible. After H6
  aligned the deployed schema, this persists a snapshot row using only deployed
  columns, surfaces failures (structured log + returned result), and never
  silently swallows errors.

  These tests use an injected mock client (updateConsciousnessState(db)); the
  payload builder is pure. Live-write acceptance is verified separately against
  the real schema and reported.

  Run: node --test tests/consciousness-persistence.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
// The required worker only exports ContinuousConsciousness when GROQ_API_KEY is
// present (its load-guard otherwise exports a disabled stub), and it builds a
// Supabase client from the anon key at module load. Locally these come from
// .env; CI has neither, so stub them — this keeps the test hermetic (it uses an
// injected mock db and makes no real calls) and unblocks the headless run.
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key';

const { ContinuousConsciousness } = require('../workers/continuous-consciousness-engine');

// Deployed consciousness_state columns (H6 introspection of project ksbyzduayettfwsmsqwy).
const DEPLOYED_COLUMNS = new Set([
  'id', 'state_timestamp', 'current_mood', 'energy_level', 'focus_areas', 'active_concerns',
  'reflection_queue_size', 'inquiry_threads_active', 'pending_communications_count',
  'cognitive_load_current', 'last_user_interaction', 'recent_thoughts_generated',
  'recent_insights_count', 'recent_research_progress', 'self_assessment',
  'growth_observations', 'system_status',
]);

// Chainable mock of the Supabase insert path; captures the inserted payload.
function mockDb(result) {
  const state = { payload: null };
  const db = {
    from() {
      return {
        insert(payload) {
          state.payload = payload;
          return { select() { return { single: async () => result }; } };
        },
      };
    },
  };
  return { db, state };
}

// Run fn with console.error/log captured (so tests are quiet and assertable).
async function withCapturedConsole(fn) {
  const errs = [], logs = [];
  const origErr = console.error, origLog = console.log;
  console.error = (...a) => errs.push(a);
  console.log = (...a) => logs.push(a);
  try { return await fn({ errs, logs }); }
  finally { console.error = origErr; console.log = origLog; }
}

function makeInstance() {
  const c = new ContinuousConsciousness('owner');
  c.currentMood = 'focused';
  c.energyLevel = 0.75;
  c.currentCycle = 4;
  c.insights = [1, 2, 3];
  c.lastUserInteraction = '2026-06-22T00:00:00Z';
  return c;
}

test('payload uses only deployed columns with correct types', () => {
  const c = makeInstance();
  const p = c.buildConsciousnessStatePayload();

  for (const k of Object.keys(p)) {
    assert.ok(DEPLOYED_COLUMNS.has(k), `payload key "${k}" is not a deployed consciousness_state column`);
  }
  // Must NOT carry the old schema-B / nonexistent columns.
  for (const bad of ['user_id', 'mood', 'total_cycles', 'active_projects', 'current_interests', 'last_interaction']) {
    assert.ok(!(bad in p), `payload must not include "${bad}"`);
  }
  assert.equal(p.current_mood, 'focused');
  assert.ok(Number.isInteger(p.energy_level) && p.energy_level >= 0 && p.energy_level <= 10, 'energy_level must be an int in 0-10');
  assert.equal(p.energy_level, 8); // round(0.75 * 10) = 8 (mutation happens in updateConsciousnessState, not here)
  assert.equal(p.recent_thoughts_generated, 4);
  assert.equal(p.recent_insights_count, 3);
  assert.equal(p.last_user_interaction, '2026-06-22T00:00:00Z');
  assert.equal(p.system_status, 'healthy');
  assert.equal(typeof p.state_timestamp, 'string');
});

test('successful persistence inserts the payload and returns {success,id}', async () => {
  await withCapturedConsole(async ({ logs }) => {
    const c = makeInstance();
    const { db, state } = mockDb({ data: { id: 42 }, error: null });
    const res = await c.updateConsciousnessState(db);

    assert.deepEqual(res, { success: true, id: 42 });
    assert.ok(state.payload, 'insert received a payload');
    assert.equal(state.payload.current_mood, 'focused');
    assert.ok(Number.isInteger(state.payload.energy_level));
    assert.ok(logs.some(a => String(a[0]).includes('[CONSCIOUSNESS][persist]') && String(a[0]).includes('written')),
      'success should be logged');
  });
});

test('DB error is surfaced, not swallowed: returns {success:false} and logs actionable detail', async () => {
  await withCapturedConsole(async ({ errs }) => {
    const c = makeInstance();
    const { db } = mockDb({ data: null, error: { message: 'null value in column violates', code: '23502' } });
    const res = await c.updateConsciousnessState(db);

    assert.equal(res.success, false, 'must report failure, not undefined (no silent swallow)');
    assert.equal(res.error, 'null value in column violates');
    assert.equal(res.code, '23502');
    const logged = errs.find(a => String(a[0]).includes('[CONSCIOUSNESS][persist]') && String(a[0]).includes('FAILED'));
    assert.ok(logged, 'failure must be logged');
    assert.equal(logged[1].code, '23502', 'log carries the error code for actionability');
    assert.equal(logged[1].message, 'null value in column violates');
  });
});

test('a thrown client error is caught, surfaced, and returns {success:false}', async () => {
  await withCapturedConsole(async ({ errs }) => {
    const c = makeInstance();
    const db = { from() { throw new Error('connection refused'); } };
    const res = await c.updateConsciousnessState(db);

    assert.equal(res.success, false);
    assert.equal(res.error, 'connection refused');
    assert.ok(errs.some(a => String(a[0]).includes('write threw')), 'thrown error must be logged');
  });
});
