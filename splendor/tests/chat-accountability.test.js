'use strict';
/*
  Chat accountability wiring — regression guard (audit Item 1).

  Proves that the seam /api/chat now calls (buildAccountabilityContext) does
  the three things the audit found missing on the live path:
    1. reads binding commitments (splendor_decisions) and injects them;
    2. runs the contradiction loop over the user message and surfaces a
       [CONTRADICTION ALERT] block + a caught count (the loop's DB marking of
       status='contradicted' is the engine's own tested behavior — here we
       prove the live path actually INVOKES it with the user's message);
    3. uses the active-only reflexive loader, so superseded/contradicted
       interpretations do not govern the response.

  Dependencies are injected, so this runs with no Supabase / Anthropic / model.

  Run: node --test tests/chat-accountability.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

const { buildAccountabilityContext } = require('../lib/chat-accountability');

const USER = 'user-123';
const MSG = "Actually I love mornings now.";

// A faithful stand-in for loadReflexiveContext: the real one selects
// status='active' ONLY, so superseded beliefs never appear in its output.
function activeOnlyReflexive() {
  return '\n\n[SELF REFLECTION]\nI currently believe:\n- Chris is building Splendor (80% confident)\n';
}

test('reads commitments, runs contradiction loop, injects active reflection', async () => {
  const calls = { contradiction: null, commitments: null, reflexive: null };
  const out = await buildAccountabilityContext(USER, MSG, {
    buildDecisionContext: async (u) => { calls.commitments = u; return '\nBINDING DECISIONS v2 - ENFORCE THESE COMMITMENTS:\n[D1] Always cite sources'; },
    loadReflexiveContext: async (u) => { calls.reflexive = u; return activeOnlyReflexive(); },
    checkContradictions: async (u, m) => {
      calls.contradiction = { u, m };
      return {
        contradictions: [{ interpretation_id: 'i1', prior_belief: 'Chris hates mornings', new_claim: 'Chris loves mornings', flag_text: 'That differs from before.' }],
        promptBlock: '\n\n[CONTRADICTION ALERT — RESPOND TO THIS FIRST]\nflag it\n[END ALERT]\n',
      };
    },
  });

  // The live path invoked the contradiction loop with the user's message.
  assert.deepStrictEqual(calls.contradiction, { u: USER, m: MSG });
  assert.strictEqual(calls.commitments, USER);
  assert.strictEqual(calls.reflexive, USER);

  // All three are present in the injected context.
  assert.ok(out.context.includes('CONTRADICTION ALERT'), 'contradiction alert injected');
  assert.ok(out.context.includes('BINDING DECISIONS'), 'commitments injected');
  assert.ok(out.context.includes('[SELF REFLECTION]'), 'active reflection injected');

  // Metrics reflect what ran (original keys + Item 5 named metrics).
  assert.deepStrictEqual(out.metrics, {
    commitments_read: 1, contradiction_checked: 1, contradictions_caught: 1, reflexive_injected: 1,
    commitment_read_count: 1, contradiction_check_count: 1, contradiction_found_count: 1,
    supersession_count: 1, accountability_context_loaded: true,
  });
});

test('contradiction alert leads, then commitments, then reflection', async () => {
  const out = await buildAccountabilityContext(USER, MSG, {
    buildDecisionContext: async () => 'BINDING DECISIONS v2',
    loadReflexiveContext: async () => '[SELF REFLECTION]',
    checkContradictions: async () => ({ contradictions: [{ interpretation_id: 'x', flag_text: 'f' }], promptBlock: '[CONTRADICTION ALERT]' }),
  });
  const iAlert = out.context.indexOf('[CONTRADICTION ALERT]');
  const iCommit = out.context.indexOf('BINDING DECISIONS');
  const iReflect = out.context.indexOf('[SELF REFLECTION]');
  assert.ok(iAlert > -1 && iCommit > -1 && iReflect > -1);
  assert.ok(iAlert < iCommit, 'contradiction alert must precede commitments');
  assert.ok(iCommit < iReflect, 'commitments must precede reflection');
});

test('superseded interpretations do not govern: only active reflection is injected', async () => {
  // The reflexive loader returns active beliefs only (its real query filters
  // status='active'). The wiring must inject exactly that — a stale belief the
  // loader excluded must never reach the prompt.
  const out = await buildAccountabilityContext(USER, MSG, {
    buildDecisionContext: async () => '',
    loadReflexiveContext: async () => '\n\n[SELF REFLECTION]\nI currently believe:\n- Chris loves mornings (75% confident)\n',
    checkContradictions: async () => ({ contradictions: [], promptBlock: '' }),
  });
  assert.ok(out.context.includes('Chris loves mornings'), 'active belief present');
  assert.ok(!out.context.includes('Chris hates mornings'), 'superseded belief must not appear');
  assert.strictEqual(out.metrics.reflexive_injected, 1);
  assert.strictEqual(out.metrics.contradictions_caught, 0);
});

test('no contradictions found -> no alert, count 0, check still ran', async () => {
  const out = await buildAccountabilityContext(USER, MSG, {
    buildDecisionContext: async () => 'BINDING DECISIONS v2',
    loadReflexiveContext: async () => '[SELF REFLECTION]',
    checkContradictions: async () => ({ contradictions: [], promptBlock: '' }),
  });
  assert.ok(!out.context.includes('CONTRADICTION ALERT'));
  assert.strictEqual(out.metrics.contradiction_checked, 1);
  assert.strictEqual(out.metrics.contradictions_caught, 0);
});

test('best-effort: a failing dependency degrades to empty and never throws', async () => {
  const out = await buildAccountabilityContext(USER, MSG, {
    buildDecisionContext: async () => { throw new Error('supabase down'); },
    loadReflexiveContext: async () => { throw new Error('supabase down'); },
    checkContradictions: async () => ({ contradictions: [{ interpretation_id: 'i', flag_text: 'f' }], promptBlock: '[CONTRADICTION ALERT]' }),
  });
  // Contradiction still surfaced; failed pieces simply contribute nothing.
  assert.ok(out.context.includes('[CONTRADICTION ALERT]'));
  assert.strictEqual(out.metrics.commitments_read, 0);
  assert.strictEqual(out.metrics.reflexive_injected, 0);
  assert.strictEqual(out.metrics.contradictions_caught, 1);
});

test('missing user or message -> empty context, nothing runs', async () => {
  let called = false;
  const deps = {
    buildDecisionContext: async () => { called = true; return 'x'; },
    loadReflexiveContext: async () => { called = true; return 'x'; },
    checkContradictions: async () => { called = true; return { contradictions: [], promptBlock: '' }; },
  };
  const a = await buildAccountabilityContext('', MSG, deps);
  const b = await buildAccountabilityContext(USER, '', deps);
  assert.strictEqual(a.context, '');
  assert.strictEqual(b.context, '');
  assert.strictEqual(called, false, 'no engine calls when identity/message absent');
  assert.strictEqual(a.metrics.contradiction_checked, 0);
});
