'use strict';
/*
  CLASPION governance — verdict classification + persistence.

  Proves the stop-condition for stabilization item 1: a failed upstream
  governance call is recorded DIFFERENTLY from a real policy denial, so an
  operator can always answer "why was this turn blocked?".

  Zero dependencies: uses node:test + node:assert, an injected fetch
  (opts.fetchImpl), and an injected persister (opts.persist) that captures the
  exact row that would be written to governance_verdicts. No network, no DB.

  Run: node --test tests/claspion-governance.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const { ClaspionGovernance } = require('../lib/claspion-governance');

// A persister that records every row the client would write.
function makeCapture() {
  const rows = [];
  return { rows, persist: (row) => rows.push(row) };
}

// Fake fetch helpers -------------------------------------------------------
const okJson = (obj) => async () => ({
  ok: true, status: 200, statusText: 'OK',
  json: async () => obj,
  text: async () => JSON.stringify(obj),
});
const httpError = (status) => async () => ({
  ok: false, status, statusText: `HTTP ${status}`,
  json: async () => ({}),
  text: async () => 'upstream error body',
});
const okButBadJson = () => async () => ({
  ok: true, status: 200, statusText: 'OK',
  json: async () => { throw new Error('Unexpected token < in JSON'); },
  text: async () => '<html>not json</html>',
});
const throwsAbort = () => async () => { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; };
const throwsNetwork = () => async () => { throw new TypeError('fetch failed'); };

function client(opts) {
  const cap = makeCapture();
  const gov = new ClaspionGovernance({
    url: 'http://claspion.test',
    enabled: true,
    apiKey: 'unused-in-tests',
    failMode: 'block',
    persist: cap.persist,
    logger: { log: () => {} }, // silence
    ...opts,
  });
  return { gov, cap };
}

const INTENT = { type: 'send_chat_response', target: 'owner', domain: 'conversation' };

test('real upstream BLOCK is classified outcome=block, cause=upstream', async () => {
  const { gov, cap } = client({
    fetchImpl: okJson({
      decision: 'BLOCK', allow: false, reason: 'violates rule X',
      basis_state: 'ESTABLISHED', conscience_name: 'gng-core', verdict_id: 'v-real-123',
      failed_axes: ['truth'],
    }),
  });
  const v = await gov.validate({ thought: { content: 'x' }, intent: INTENT });
  assert.equal(v.decision, 'BLOCK');
  assert.equal(v.allow, false);
  assert.equal(v.outcome, 'block');
  assert.equal(v.outcome_cause, 'upstream');
  assert.equal(v.verdict_id, 'v-real-123');
  assert.equal(v.basis_state, 'ESTABLISHED');
  const row = cap.rows.at(-1);
  assert.equal(row.outcome, 'block');
  assert.equal(row.outcome_cause, 'upstream');
  assert.equal(row.error_code, null);
});

test('real upstream ALLOW is classified outcome=allow, cause=upstream', async () => {
  const { gov, cap } = client({
    fetchImpl: okJson({ decision: 'ALLOW', allow: true, reason: 'ok', basis_state: 'ESTABLISHED', conscience_name: 'gng-core', verdict_id: 'v-allow-1' }),
  });
  const v = await gov.validate({ intent: INTENT });
  assert.equal(v.outcome, 'allow');
  assert.equal(v.allow, true);
  assert.equal(cap.rows.at(-1).outcome, 'allow');
});

test('timeout fails closed: outcome=fail_closed, cause=timeout, BLOCK', async () => {
  const { gov, cap } = client({ fetchImpl: throwsAbort() });
  const v = await gov.validate({ intent: INTENT });
  assert.equal(v.decision, 'BLOCK');
  assert.equal(v.allow, false);
  assert.equal(v.outcome, 'fail_closed');
  assert.equal(v.outcome_cause, 'timeout');
  assert.equal(v.basis_state, 'UNREACHABLE');
  assert.equal(v.conscience_name, 'splendor-failure-handler');
  assert.match(v.verdict_id, /^local-fail-/);
  assert.equal(cap.rows.at(-1).error_code, 'TIMEOUT');
});

test('network failure fails closed: cause=network', async () => {
  const { gov } = client({ fetchImpl: throwsNetwork() });
  const v = await gov.validate({ intent: INTENT });
  assert.equal(v.outcome, 'fail_closed');
  assert.equal(v.outcome_cause, 'network');
  assert.equal(v.error_code, 'NETWORK');
});

test('HTTP 500 fails closed: cause=http_5xx, http_status=500', async () => {
  const { gov } = client({ fetchImpl: httpError(500) });
  const v = await gov.validate({ intent: INTENT });
  assert.equal(v.outcome, 'fail_closed');
  assert.equal(v.outcome_cause, 'http_5xx');
  assert.equal(v.http_status, 500);
});

test('HTTP 401 fails closed: cause=http_4xx', async () => {
  const { gov } = client({ fetchImpl: httpError(401) });
  const v = await gov.validate({ intent: INTENT });
  assert.equal(v.outcome, 'fail_closed');
  assert.equal(v.outcome_cause, 'http_4xx');
  assert.equal(v.http_status, 401);
});

test('200 with non-JSON body is malformed, not a real decision', async () => {
  const { gov } = client({ fetchImpl: okButBadJson() });
  const v = await gov.validate({ intent: INTENT });
  assert.equal(v.outcome, 'fail_closed');
  assert.equal(v.outcome_cause, 'malformed');
  assert.equal(v.error_code, 'MALFORMED_RESPONSE');
});

test('200 with missing decision is malformed (cannot masquerade as ALLOW)', async () => {
  const { gov } = client({ fetchImpl: okJson({ allow: true, reason: 'no decision field' }) });
  const v = await gov.validate({ intent: INTENT });
  assert.equal(v.outcome, 'fail_closed');
  assert.equal(v.outcome_cause, 'malformed');
});

test('fail-open mode: network failure allows but is still marked fail_open', async () => {
  const { gov } = client({ fetchImpl: throwsNetwork(), failMode: 'allow' });
  const v = await gov.validate({ intent: INTENT });
  assert.equal(v.decision, 'ALLOW');
  assert.equal(v.allow, true);
  assert.equal(v.outcome, 'fail_open');
  assert.equal(v.outcome_cause, 'network');
});

test('disabled client is dormant ALLOW, never touches transport', async () => {
  let called = false;
  const { gov, cap } = client({ enabled: false, fetchImpl: async () => { called = true; throw new Error('should not fetch'); } });
  const v = await gov.validate({ intent: INTENT });
  assert.equal(called, false);
  assert.equal(v.outcome, 'dormant');
  assert.equal(v.outcome_cause, 'disabled');
  assert.equal(v.allow, true);
  assert.equal(v.dormant, true);
  assert.equal(cap.rows.at(-1).dormant, true);
});

// THE STOP-CONDITION TEST -------------------------------------------------
test('a fail-closed outage is recorded DIFFERENTLY from a real policy denial', async () => {
  const realBlock = client({
    fetchImpl: okJson({ decision: 'BLOCK', allow: false, reason: 'policy: disallowed action',
      basis_state: 'ESTABLISHED', conscience_name: 'gng-core', verdict_id: 'v-real-999', failed_axes: ['safety'] }),
  });
  const outage = client({ fetchImpl: throwsAbort() }); // upstream down → fail-closed

  const blockV = await realBlock.gov.validate({ intent: INTENT });
  const outageV = await outage.gov.validate({ intent: INTENT });

  // Both BLOCK the turn...
  assert.equal(blockV.decision, 'BLOCK');
  assert.equal(outageV.decision, 'BLOCK');

  // ...but every distinguishing field separates them.
  assert.notEqual(blockV.outcome, outageV.outcome);            // block vs fail_closed
  assert.notEqual(blockV.outcome_cause, outageV.outcome_cause);// upstream vs timeout
  assert.notEqual(blockV.basis_state, outageV.basis_state);    // ESTABLISHED vs UNREACHABLE
  assert.notEqual(blockV.conscience_name, outageV.conscience_name);
  assert.equal(blockV.error_code, null);
  assert.equal(outageV.error_code, 'TIMEOUT');

  // And the persisted rows carry the distinction.
  const a = realBlock.cap.rows.at(-1);
  const b = outage.cap.rows.at(-1);
  assert.equal(a.outcome, 'block');
  assert.equal(a.outcome_cause, 'upstream');
  assert.equal(b.outcome, 'fail_closed');
  assert.equal(b.outcome_cause, 'timeout');
  // "Why was this turn blocked?" is answerable from the row alone.
});

// No secrets in the persisted row ----------------------------------------
test('persisted row contains no secrets and no thought/intent content', async () => {
  const { gov, cap } = client({
    fetchImpl: okJson({ decision: 'ALLOW', allow: true, reason: 'ok', basis_state: 'ESTABLISHED', conscience_name: 'c', verdict_id: 'v1' }),
  });
  await gov.validate({ thought: { content: 'SECRET THOUGHT CONTENT' }, intent: { type: 'send_chat_response', secret_field: 'SECRET INTENT' } });
  const row = cap.rows.at(-1);
  const serialized = JSON.stringify(row);
  assert.ok(!serialized.includes('SECRET THOUGHT CONTENT'));
  assert.ok(!serialized.includes('SECRET INTENT'));
  assert.ok(!serialized.includes('unused-in-tests')); // api key never persisted
  assert.ok(!serialized.includes('claspion.test'));    // url never persisted
  assert.equal(row.intent_type, 'send_chat_response');  // label only
});
