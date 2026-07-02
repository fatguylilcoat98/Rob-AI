'use strict';
/*
  Shared capability router — Phase 2 regression guard.

  runArtCapability() is the single detect-and-generate path that every surface
  now calls. It must: skip when an image is attached, skip non-art messages,
  normalize a successful generation, and normalize a failure with the shared
  user-facing error line. Dependencies are injected — no network.

  Run: node --test tests/capability-router.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const { runArtCapability, artErrorMessage } = require('../lib/capability-router');

const USER = '7fa3e095-6156-484a-a1d1-c29fc1ba9e33';

// Real-ish detector stub: art only when the word "paint"/"draw" appears.
const detect = (m) => /\b(paint|draw)\b/i.test(m || '');

test('attached image is never art (vision input, not generation)', async () => {
  let called = false;
  const r = await runArtCapability({
    userId: USER, message: 'draw what you see', imageData: 'BASE64', source: 'chat',
    deps: { isArtRequest: detect, generateArt: async () => { called = true; return {}; } },
  });
  assert.strictEqual(r.isArt, false);
  assert.strictEqual(called, false, 'generateArt must not run when an image is attached');
});

test('non-art message returns isArt:false without generating', async () => {
  let called = false;
  const r = await runArtCapability({
    userId: USER, message: 'what is the capital of France?', source: 'chat',
    deps: { isArtRequest: detect, generateArt: async () => { called = true; return {}; } },
  });
  assert.strictEqual(r.isArt, false);
  assert.strictEqual(called, false);
});

test('successful generation is normalized and tagged with the source', async () => {
  const seen = {};
  const r = await runArtCapability({
    userId: USER, message: 'paint a quiet forest', source: 'converse',
    deps: {
      isArtRequest: detect,
      generateArt: async (args) => {
        Object.assign(seen, args);
        return { ok: true, requestId: 'rid-1', imageUrl: 'https://img/x.png', audioB64: 'AAAA', revisedPrompt: 'a quiet forest', description: 'Here — a forest.', model: 'dall-e-3' };
      },
    },
  });
  assert.strictEqual(seen.source, 'converse');
  assert.strictEqual(seen.userMessage, 'paint a quiet forest');
  assert.deepStrictEqual(r, {
    isArt: true, ok: true, requestId: 'rid-1', imageUrl: 'https://img/x.png',
    audioB64: 'AAAA', revisedPrompt: 'a quiet forest', description: 'Here — a forest.', model: 'dall-e-3',
  });
});

test('failure is normalized with the shared user-facing error line', async () => {
  const r = await runArtCapability({
    userId: USER, message: 'paint a sunset', source: 'chat',
    deps: {
      isArtRequest: detect,
      generateArt: async () => ({ ok: false, requestId: 'rid-2', errorCategory: 'permission', errorMessage: '401 unauthorized', attempts: [] }),
    },
  });
  assert.strictEqual(r.isArt, true);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorCategory, 'permission');
  assert.match(r.userFacing, /isn't authorized/i);
});

test('a thrown generator is caught and surfaced as a clean unknown failure', async () => {
  const r = await runArtCapability({
    userId: USER, message: 'draw a cat', source: 'chat',
    deps: { isArtRequest: detect, generateArt: async () => { throw new Error('boom'); } },
  });
  assert.strictEqual(r.isArt, true);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorCategory, 'unknown');
  assert.match(r.userFacing, /couldn't be generated/i);
});

test('artErrorMessage maps each known category', () => {
  assert.match(artErrorMessage({ errorCategory: 'policy_block' }), /content policy/i);
  assert.match(artErrorMessage({ errorCategory: 'timeout' }), /too long/i);
  assert.match(artErrorMessage({ errorCategory: 'rate_limit' }), /rate-limited/i);
  assert.match(artErrorMessage({ errorCategory: 'permission' }), /isn't authorized/i);
  assert.match(artErrorMessage({ errorCategory: 'weird', errorMessage: 'x' }), /couldn't be generated/i);
});
