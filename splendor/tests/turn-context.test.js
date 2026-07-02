'use strict';
/*
  Shared turn-context builder — Phase 1 regression guard.

  buildTurnContext() must compose identity + accountability the SAME way the
  inline chat.js code did, be best-effort (never throw), and return the exact
  metric shapes routes feed to emitChatMetrics. Dependencies are injected so
  this runs fully offline with no Supabase/network.

  Run: node --test tests/turn-context.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const { buildTurnContext, emptyAccountability, emptyIdentity } = require('../lib/turn-context');

const USER = '7fa3e095-6156-484a-a1d1-c29fc1ba9e33';

function deps(acct, identity) {
  return {
    buildAccountabilityContext: acct,
    buildIdentityStateContext: identity,
  };
}

test('composes both blocks from the injected builders', async () => {
  const calls = {};
  const turn = await buildTurnContext({
    userId: USER,
    message: 'remember you promised to be honest',
    deps: deps(
      async (uid, msg) => { calls.acct = { uid, msg }; return { context: 'ACCT', metrics: { commitments_read: 2, contradiction_checked: 1, contradictions_caught: 0, reflexive_injected: 1 } }; },
      async (uid) => { calls.identity = { uid }; return { context: 'IDENT', metrics: { identity_state_loaded: true, identity_state_row_id: 'r1', identity_state_age_seconds: 5, identity_state_version: 3, identity_state_injected: true } }; },
    ),
  });

  assert.strictEqual(turn.accountability.context, 'ACCT');
  assert.strictEqual(turn.identity.context, 'IDENT');
  // accountability gets userId + message; identity gets userId only.
  assert.deepStrictEqual(calls.acct, { uid: USER, msg: 'remember you promised to be honest' });
  assert.deepStrictEqual(calls.identity, { uid: USER });
  assert.strictEqual(turn.accountability.metrics.commitments_read, 2);
  assert.strictEqual(turn.identity.metrics.identity_state_injected, true);
});

test('best-effort: a throwing accountability builder degrades to empty, never throws', async () => {
  const turn = await buildTurnContext({
    userId: USER,
    message: 'hi',
    deps: deps(
      async () => { throw new Error('supabase down'); },
      async () => ({ context: 'IDENT', metrics: { ...emptyIdentity().metrics, identity_state_loaded: true } }),
    ),
  });
  // Accountability failed → fully-shaped empty; identity still present.
  assert.deepStrictEqual(turn.accountability, emptyAccountability());
  assert.strictEqual(turn.identity.context, 'IDENT');
});

test('best-effort: a throwing identity builder degrades to empty, never throws', async () => {
  const turn = await buildTurnContext({
    userId: USER,
    message: 'hi',
    deps: deps(
      async () => ({ context: 'ACCT', metrics: emptyAccountability().metrics }),
      async () => { throw new Error('identity_states 500'); },
    ),
  });
  assert.strictEqual(turn.accountability.context, 'ACCT');
  assert.deepStrictEqual(turn.identity, emptyIdentity());
});

test('empty defaults carry the exact metric shapes routes expect', () => {
  assert.deepStrictEqual(Object.keys(emptyAccountability().metrics).sort(),
    ['commitments_read', 'contradiction_checked', 'contradictions_caught', 'reflexive_injected'].sort());
  assert.deepStrictEqual(Object.keys(emptyIdentity().metrics).sort(),
    ['identity_state_age_seconds', 'identity_state_injected', 'identity_state_loaded', 'identity_state_row_id', 'identity_state_version'].sort());
  // Fresh objects each call — a caller mutating one must not poison the next.
  const a = emptyAccountability(); a.metrics.commitments_read = 99;
  assert.strictEqual(emptyAccountability().metrics.commitments_read, 0);
});
