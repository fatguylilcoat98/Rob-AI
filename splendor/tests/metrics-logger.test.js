'use strict';
/*
  Measurement layer — regression guard (audit Item 5).

  Proves the pure metric builders map the existing Item 1/2/4 metrics objects
  and the CLASPION verdict into the consistently-named records, and that the
  continuity builder derives thoughts_created correctly. Observability only.

  Run: node --test tests/metrics-logger.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

const { buildChatMetrics, buildCycleMetrics, emitChatMetrics, emitCycleMetrics } = require('../lib/metrics-logger');

test('buildChatMetrics maps accountability/identity/memory/governance', () => {
  const m = buildChatMetrics({
    surface: 'chat',
    userId: 'u1',
    accountability: {
      commitment_read_count: 3, contradiction_check_count: 1,
      contradiction_found_count: 2, supersession_count: 2, accountability_context_loaded: true,
    },
    identity: {
      identity_state_loaded: true, identity_state_injected: true,
      identity_state_age_seconds: 3600, identity_state_row_id: 'row-9',
    },
    recall: {
      supabase_candidates: 5, pinecone_candidates: 0, pinecone_quarantined: true,
      candidates_injected: 4, reranked: true, source_distribution: { supabase: 4 },
    },
    governance: { outcome: 'allow', outcome_cause: 'upstream', conscience_name: 'CLASPION', decision: 'ALLOW', allow: true },
    governanceLatencyMs: 42,
  });

  assert.strictEqual(m.surface, 'chat');
  assert.strictEqual(m.user_present, true);
  assert.deepStrictEqual(m.accountability, {
    commitment_read_count: 3, contradiction_check_count: 1, contradiction_found_count: 2,
    supersession_count: 2, accountability_context_loaded: true,
  });
  assert.deepStrictEqual(m.identity, {
    identity_state_loaded: true, identity_state_injected: true,
    identity_state_age: 3600, identity_state_row_id: 'row-9',
  });
  assert.deepStrictEqual(m.memory, {
    supabase_candidate_count: 5, pinecone_candidate_count: 0, pinecone_quarantined: true,
    candidates_injected: 4, rerank_used: true, final_source_distribution: { supabase: 4 },
  });
  assert.strictEqual(m.governance.verdict_outcome, 'allow');
  assert.strictEqual(m.governance.verdict_cause, 'upstream');
  assert.strictEqual(m.governance.conscience_name, 'CLASPION');
  assert.strictEqual(m.governance.latency_ms, 42);
  assert.strictEqual(m.governance.fail_closed, false);
});

test('buildChatMetrics falls back to original metric keys when named ones absent', () => {
  // Old-shape accountability (Item 1 original keys only) still maps.
  const m = buildChatMetrics({
    accountability: { commitments_read: 1, contradiction_checked: 1, contradictions_caught: 0, reflexive_injected: 1 },
  });
  assert.strictEqual(m.accountability.commitment_read_count, 1);
  assert.strictEqual(m.accountability.contradiction_check_count, 1);
  assert.strictEqual(m.accountability.contradiction_found_count, 0);
});

test('buildChatMetrics: fail_closed true on a non-upstream block', () => {
  const m = buildChatMetrics({ governance: { allow: false, outcome: 'fail_closed', outcome_cause: 'timeout', conscience_name: 'CLASPION' } });
  assert.strictEqual(m.governance.fail_closed, true);
  assert.strictEqual(m.governance.verdict_outcome, 'fail_closed');
  assert.strictEqual(m.governance.verdict_cause, 'timeout');
});

test('buildChatMetrics: a real upstream policy block is NOT fail_closed', () => {
  const m = buildChatMetrics({ governance: { allow: false, outcome: 'block', outcome_cause: 'upstream' } });
  assert.strictEqual(m.governance.fail_closed, false);
});

test('buildChatMetrics tolerates empty inputs (no throw, zeroed)', () => {
  const m = buildChatMetrics({});
  assert.strictEqual(m.user_present, false);
  assert.strictEqual(m.accountability.commitment_read_count, 0);
  assert.strictEqual(m.identity.identity_state_loaded, false);
  assert.strictEqual(m.memory.supabase_candidate_count, 0);
  assert.deepStrictEqual(m.memory.final_source_distribution, {});
  assert.strictEqual(m.governance.verdict_outcome, null);
});

test('buildCycleMetrics derives thoughts_created from rows_produced minus created-counts', () => {
  const t = {
    worker_enabled: true, scheduler_enabled: true,
    last_successful_run: '2026-05-31T00:00:00.000Z',
    rows_produced: 5, inquiry_threads_created: 1,
    pending_communications_created: 1, proactive_conversations_created: 0,
  };
  const m = buildCycleMetrics(t);
  assert.strictEqual(m.thoughts_created, 3);     // 5 - 1 - 1 - 0
  assert.strictEqual(m.inquiries_created, 1);
  assert.strictEqual(m.communications_created, 1);
  assert.strictEqual(m.proactive_conversations_created, 0);
  assert.strictEqual(m.worker_enabled, true);
  assert.strictEqual(m.scheduler_enabled, true);
  assert.strictEqual(m.last_successful_run, '2026-05-31T00:00:00.000Z');
});

test('buildCycleMetrics never returns negative thoughts_created', () => {
  const m = buildCycleMetrics({ rows_produced: 1, inquiry_threads_created: 2 });
  assert.strictEqual(m.thoughts_created, 0);
});

test('emit* wrappers return the record and never throw', () => {
  assert.ok(emitChatMetrics({}).accountability);
  assert.ok(emitCycleMetrics({}).hasOwnProperty('thoughts_created'));
});
