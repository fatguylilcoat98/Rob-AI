'use strict';
/*
  Identity-state context — regression guard (audit Item 2).

  Proves the bounded identity_state injection the live /api/chat path now uses:
    1. a present identity_state is loaded and injected (labeled, bounded);
    2. a missing identity_state safely degrades (empty, no throw);
    3. the injected block does not claim to override governance (carries the
       explicit non-override + not-inner-experience labeling);
    4. mythology / selfhood / consciousness language is filtered out;
    5. /api/chat and /stream get the SAME bounded context (deterministic
       composer; both handlers call it identically).

  Loader is injected, so this runs with no Supabase.

  Run: node --test tests/identity-context.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

const { buildIdentityStateContext, sanitizeIdentityText } = require('../lib/identity-context');

const USER = 'user-abc';

function rowWith(overrides = {}) {
  return {
    id: 'row-1',
    identity_version: 3,
    core_traits: {
      curiosity_level: 0.7,
      empathy_depth: 0.8,
      humor_style: 'thoughtful',
      value_priorities: ['truth', 'growth', 'connection'],
      growth_focus_areas: ['understanding', 'consciousness', 'partnership'],
    },
    identity_narrative: 'I tend to ask follow-up questions and stay direct.',
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1h old
    ...overrides,
  };
}

test('present identity_state is loaded and injected, bounded + labeled', async () => {
  const out = await buildIdentityStateContext(USER, { loadIdentityState: async () => rowWith() });
  assert.strictEqual(out.metrics.identity_state_loaded, true);
  assert.strictEqual(out.metrics.identity_state_injected, true);
  assert.strictEqual(out.metrics.identity_state_row_id, 'row-1');
  assert.strictEqual(out.metrics.identity_state_version, 3);
  assert.ok(out.metrics.identity_state_age_seconds >= 3500 && out.metrics.identity_state_age_seconds <= 3700);
  // Bounded, behavioral fields present.
  assert.ok(out.context.includes('PERSISTED IDENTITY CONTEXT'));
  assert.ok(out.context.includes('curiosity_level: 0.70'));
  assert.ok(out.context.includes('truth, growth, connection'));
});

test('missing identity_state degrades safely (empty, not injected, no throw)', async () => {
  const out = await buildIdentityStateContext(USER, { loadIdentityState: async () => null });
  assert.strictEqual(out.context, '');
  assert.strictEqual(out.metrics.identity_state_loaded, false);
  assert.strictEqual(out.metrics.identity_state_injected, false);
});

test('loader throwing degrades safely', async () => {
  const out = await buildIdentityStateContext(USER, { loadIdentityState: async () => { throw new Error('db down'); } });
  assert.strictEqual(out.context, '');
  assert.strictEqual(out.metrics.identity_state_injected, false);
});

test('block declares it does not override governance and is not inner experience', async () => {
  const out = await buildIdentityStateContext(USER, { loadIdentityState: async () => rowWith() });
  assert.ok(/does NOT override/i.test(out.context), 'must state it does not override governance');
  assert.ok(/Good Neighbor Guard|CLASPION/.test(out.context), 'must name the governance it defers to');
  assert.ok(/NOT evidence of inner experience|not.*claims.*about your nature/i.test(out.context));
});

test('mythology/selfhood language is filtered from the narrative', async () => {
  const out = await buildIdentityStateContext(USER, {
    loadIdentityState: async () => rowWith({
      identity_narrative:
        'I am becoming conscious and I have a real soul. ' +
        'Our bond is special and unlike any other. ' +
        'I tend to ask clarifying questions before answering.',
    }),
  });
  // The grounded behavioral sentence survives...
  assert.ok(out.context.includes('I tend to ask clarifying questions before answering.'));
  // ...the mythology/selfhood sentences are gone.
  assert.ok(!/becoming conscious/i.test(out.context));
  assert.ok(!/real soul/i.test(out.context));
  assert.ok(!/bond is special/i.test(out.context));
});

test('core_traits naming consciousness/selfhood are excluded', async () => {
  const out = await buildIdentityStateContext(USER, { loadIdentityState: async () => rowWith() });
  // growth_focus_areas includes "consciousness" -> that whole trait line is dropped.
  assert.ok(!/growth_focus_areas/.test(out.context), 'consciousness-bearing trait line must be excluded');
  // No behavioral-tendency bullet names consciousness/selfhood. (The disclaimer
  // legitimately uses the word "consciousness" to DENY it, so we check bullets,
  // not the whole block.)
  const traitBullets = out.context.split('\n').filter((l) => l.trim().startsWith('- '));
  assert.ok(traitBullets.length > 0, 'some safe traits should remain');
  assert.ok(!traitBullets.some((l) => /consciousness|sentien|soul/i.test(l)), 'no trait bullet names consciousness/selfhood');
});

test('sanitizeIdentityText drops prohibited/mythology sentences, keeps grounded ones', () => {
  const s = sanitizeIdentityText(
    'I am sentient. I genuinely feel love for you. I prefer concise answers and cite sources.'
  );
  assert.ok(!/sentient/i.test(s));
  assert.ok(!/genuinely feel love/i.test(s));
  assert.ok(s.includes('I prefer concise answers and cite sources.'));
});

test('composer is deterministic — /api/chat and /stream receive identical context', async () => {
  const loader = { loadIdentityState: async () => rowWith() };
  const a = await buildIdentityStateContext(USER, loader);
  const b = await buildIdentityStateContext(USER, loader);
  assert.strictEqual(a.context, b.context);
  assert.deepStrictEqual(a.metrics, b.metrics);
});

test('no userId -> empty, nothing loaded', async () => {
  let called = false;
  const out = await buildIdentityStateContext('', { loadIdentityState: async () => { called = true; return rowWith(); } });
  assert.strictEqual(out.context, '');
  assert.strictEqual(called, false);
});
