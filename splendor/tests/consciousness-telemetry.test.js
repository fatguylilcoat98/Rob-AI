'use strict';
/*
  Consciousness telemetry — regression guard (audit Item 3, Plans A + B).

  Proves the measurement + honest-labeling layer:
    - buildCycleTelemetry shapes all eight required metrics correctly;
    - deriveOperationalStatus distinguishes ACTIVE / IDLE / DISABLED / ERROR
      (in particular IDLE "ran clean, produced nothing" vs ERROR "failed/stale");
    - markStaticPlaceholders re-wraps the fabricated fields so they cannot be
      read as measured state;
    - recordCycleTelemetry / getLatestTelemetry are best-effort and never throw.

  No DB, no behavior. Run: node --test tests/consciousness-telemetry.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

const {
  STATIC_PLACEHOLDER_FIELDS,
  markStaticPlaceholders,
  buildCycleTelemetry,
  deriveOperationalStatus,
  recordCycleTelemetry,
  getLatestTelemetry,
} = require('../lib/consciousness-telemetry');

// ---- buildCycleTelemetry ----

test('buildCycleTelemetry shapes the eight required metrics', () => {
  const t = buildCycleTelemetry({
    cycle_type: 'scheduled',
    success: true,
    errors: 0,
    duration_ms: 1234,
    run_at: '2026-05-31T00:00:00.000Z',
    thoughts_generated: 2,
    inquiries_processed: 1,
    communications_processed: 3,
    inquiry_threads_created: 1,
    pending_communications_created: 2,
    proactive_conversations_created: 0,
  });
  assert.strictEqual(t.last_successful_run, '2026-05-31T00:00:00.000Z');
  assert.strictEqual(t.rows_produced, 2 + 1 + 2 + 0);     // thoughts + created
  assert.strictEqual(t.rows_consumed, 1 + 3);             // processed
  assert.strictEqual(t.worker_enabled, true);
  assert.strictEqual(t.scheduler_enabled, true);
  assert.strictEqual(t.inquiry_threads_created, 1);
  assert.strictEqual(t.pending_communications_created, 2);
  assert.strictEqual(t.proactive_conversations_created, 0);
});

test('buildCycleTelemetry: failed cycle has no last_successful_run', () => {
  const t = buildCycleTelemetry({ success: false, errors: 1 });
  assert.strictEqual(t.last_successful_run, null);
  assert.strictEqual(t.success, false);
});

// ---- deriveOperationalStatus: the four states ----

const NOW = Date.parse('2026-05-31T12:00:00.000Z');
const recent = new Date(NOW - 60 * 1000).toISOString();   // 1 min ago
const stale = new Date(NOW - 12 * 3600 * 1000).toISOString(); // 12h ago

test('DISABLED when no telemetry', () => {
  assert.strictEqual(deriveOperationalStatus(null, { now: NOW }).status, 'DISABLED');
});

test('DISABLED when worker/scheduler off', () => {
  const t = buildCycleTelemetry({ success: true, run_at: recent, worker_enabled: false });
  assert.strictEqual(deriveOperationalStatus(t, { now: NOW }).status, 'DISABLED');
});

test('ERROR when last cycle had errors', () => {
  const t = buildCycleTelemetry({ success: false, errors: 2, run_at: recent });
  assert.strictEqual(deriveOperationalStatus(t, { now: NOW }).status, 'ERROR');
});

test('ERROR when last successful run is stale', () => {
  const t = buildCycleTelemetry({ success: true, run_at: stale, thoughts_generated: 1 });
  assert.strictEqual(deriveOperationalStatus(t, { now: NOW }).status, 'ERROR');
});

test('ACTIVE when recent run produced rows', () => {
  const t = buildCycleTelemetry({ success: true, run_at: recent, thoughts_generated: 1 });
  assert.strictEqual(deriveOperationalStatus(t, { now: NOW }).status, 'ACTIVE');
});

test('IDLE when recent run produced nothing (the key idle-vs-broken distinction)', () => {
  const t = buildCycleTelemetry({ success: true, run_at: recent }); // 0 rows
  const r = deriveOperationalStatus(t, { now: NOW });
  assert.strictEqual(r.status, 'IDLE');
  assert.match(r.reason, /no rows/i);
});

// ---- markStaticPlaceholders ----

test('markStaticPlaceholders re-wraps fabricated fields, keeps real ones', () => {
  const out = markStaticPlaceholders({
    current_mood: 'contemplative',
    energy_level: 8,
    self_assessment: 'Actively developing insights',
    system_status: 'healthy',
    total_cycles: 42,           // real-ish, should stay top-level
  });
  assert.strictEqual(out.total_cycles, 42);
  assert.strictEqual(out.current_mood, undefined, 'fabricated field must not stay top-level');
  assert.strictEqual(out.static_placeholders.current_mood.measured, false);
  assert.strictEqual(out.static_placeholders.current_mood.value, 'contemplative');
  assert.ok(out.static_placeholders.system_status);
  for (const f of ['current_mood', 'energy_level', 'self_assessment', 'system_status']) {
    assert.ok(STATIC_PLACEHOLDER_FIELDS.includes(f));
  }
});

// ---- best-effort recorder / reader ----

test('recordCycleTelemetry logs and never throws without a DB', async () => {
  const r = await recordCycleTelemetry(buildCycleTelemetry({ success: true }), {});
  assert.strictEqual(r.written, false);
});

test('recordCycleTelemetry writes via a client and never throws on error', async () => {
  const captured = [];
  const okClient = { from: () => ({ insert: async (row) => { captured.push(row); return { error: null }; } }) };
  const r1 = await recordCycleTelemetry(buildCycleTelemetry({ success: true, thoughts_generated: 1 }), { supabase: okClient });
  assert.strictEqual(r1.written, true);
  assert.strictEqual(captured[0].rows_produced, 1);

  const badClient = { from: () => ({ insert: async () => { throw new Error('no table'); } }) };
  const r2 = await recordCycleTelemetry(buildCycleTelemetry({ success: true }), { supabase: badClient });
  assert.strictEqual(r2.written, false); // swallowed, no throw
});

test('getLatestTelemetry returns null without a client and a row with one', async () => {
  assert.strictEqual(await getLatestTelemetry({}), null);
  const client = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [{ rows_produced: 5 }], error: null }) }) }) }) };
  const row = await getLatestTelemetry({ supabase: client });
  assert.strictEqual(row.rows_produced, 5);
});
