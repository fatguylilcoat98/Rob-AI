'use strict';
/*
  H6 regression — consciousness_state readers must match the deployed schema.

  The deployed consciousness_state table (read-only introspection of project
  ksbyzduayettfwsmsqwy, 2026-06-22) is a single-owner time-series: it has NO
  user_id column, uses `current_mood` (not `mood`), an INTEGER `energy_level`
  (~1-10, default 7, not a 0-1 float), and has no `total_cycles`. The dashboard
  and continuous-engine readers queried `.eq('user_id', …)` and read
  state.mood / state.energy_level (as a fraction) / state.total_cycles — all of
  which error or read undefined against the live schema.

  This pins the normalization mapping and that the readers query by
  state_timestamp instead of a (nonexistent) user_id column.

  Run: node --test tests/consciousness-state-schema.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const { normalizeConsciousnessState } = require('../lib/consciousness-dashboard');

test('null row → safe defaults in the consumer shape', () => {
  assert.deepEqual(normalizeConsciousnessState(null), {
    mood: 'unknown', energy_level: 0.5, last_interaction: null, total_cycles: 0,
  });
});

test('live row maps onto the consumer shape (current_mood, int energy → 0-1, counters)', () => {
  const out = normalizeConsciousnessState({
    current_mood: 'curious',
    energy_level: 7,                       // integer in the live schema
    last_user_interaction: '2026-06-22T00:00:00Z',
    recent_thoughts_generated: 12,
  });
  assert.equal(out.mood, 'curious');
  assert.equal(out.energy_level, 0.7);      // 7/10
  assert.equal(out.last_interaction, '2026-06-22T00:00:00Z');
  assert.equal(out.total_cycles, 12);
});

test('integer energy_level is clamped to 0-1', () => {
  assert.equal(normalizeConsciousnessState({ energy_level: 15 }).energy_level, 1);
  assert.equal(normalizeConsciousnessState({ energy_level: 0 }).energy_level, 0);
  assert.equal(normalizeConsciousnessState({ energy_level: 5 }).energy_level, 0.5);
});

test('dashboard reads consciousness_state by state_timestamp, not user_id', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/consciousness-dashboard.js'), 'utf8');
  // The consciousness_state read must not filter by the nonexistent user_id column.
  assert.ok(
    !/consciousness_state'\)[\s\S]{0,140}\.eq\('user_id'/.test(src),
    'consciousness_state read must not filter by user_id'
  );
  assert.ok(
    /consciousness_state'\)[\s\S]{0,160}state_timestamp/.test(src),
    'consciousness_state read should order by state_timestamp'
  );
});

test('continuous-engine reads/writes consciousness_state with deployed columns', () => {
  const src = fs.readFileSync(path.join(__dirname, '../workers/continuous-consciousness-engine.js'), 'utf8');
  assert.ok(
    !/consciousness_state'\)[\s\S]{0,140}\.eq\('user_id'/.test(src),
    'engine consciousness_state read must not filter by user_id'
  );
  assert.ok(/state_timestamp/.test(src), 'engine should order by state_timestamp');
  assert.ok(/current_mood/.test(src), 'engine should read/write current_mood');
  // The old insert referenced columns that do not exist in the deployed schema.
  assert.ok(!/active_projects:\s*'\[\]'/.test(src), 'engine must not insert nonexistent active_projects column');
});
