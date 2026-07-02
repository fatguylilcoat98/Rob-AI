'use strict';
/*
  /api/chat art-intent intercept — regression guard.

  Bug: with Council mode ON/AUTO the frontend routes every turn to POST
  /api/chat (routes/chat.js), which had no isArtRequest -> generateArt
  intercept, so image requests reached the raw model and it refused
  ("I can't generate images"). Fix: mirror the enhanced-chat / converse
  intercept at the top of the POST / handler, before the council/brain/model
  branch.

  This test invokes the real POST / handler offline. lib/art-generator is
  replaced with a spy (real isArtRequest, fake generateArt) and the heavy
  downstream (model, brain, memory, governance, …) is stubbed so a non-art
  turn returns a deterministic sentinel without any network. No server.

  Run: node --test tests/chat-art-intercept.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

// Keep require chains that build clients at load time happy. No socket opens.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';

// Grab the REAL detector before we shadow the module, so detection stays honest.
const realIsArtRequest = require('../lib/art-generator').isArtRequest;

function injectModule(relPath, exports) {
  const p = require.resolve(relPath);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

// Spy state.
let generateArtCalls = [];
let nextArtResult = null;
let modelReplies = [];
const SENTINEL_MODEL_REPLY = 'SENTINEL_MODEL_REPLY';

// Shadow the art generator: real detection, fake generation.
injectModule('../lib/art-generator', {
  isArtRequest: realIsArtRequest,
  generateArt: async (args) => { generateArtCalls.push(args); return nextArtResult; },
  categorizeError: () => ({ category: 'unknown', message: 'x' }),
});

// Stub the downstream so a NON-art turn completes deterministically offline.
injectModule('../lib/anthropic', {
  generateSplendorResponse: async (...a) => { modelReplies.push(a); return SENTINEL_MODEL_REPLY; },
});
injectModule('../splendor-brain', {
  processSplendorBrainTurn: async () => { throw new Error('no-brain-in-test'); },
});
injectModule('../lib/supabase', {
  getMemoriesForUser: async () => [],
  storeMemory: async () => ({}),
});
injectModule('../lib/claspion-governance', {
  governance: { validate: async () => ({ allow: true, decision: 'allow', dormant: true }) },
});
injectModule('../lib/speech-act-governance', {
  governReplySelfClaims: async ({ text }) => ({ text }),
});
injectModule('../lib/chat-accountability', {
  buildAccountabilityContext: async () => ({ context: '', metrics: {} }),
});
injectModule('../lib/identity-context', {
  buildIdentityStateContext: async () => ({ context: '', metrics: {} }),
});
injectModule('../lib/metrics-logger', { emitChatMetrics: () => {} });
injectModule('../lib/behavioral-metrics', { recordMetric: () => {} });
injectModule('../lib/master-continuity-engine', { captureInteraction: async () => ({ success: true }) });

const chatRouter = require('../routes/chat');

// Pull the POST / handler (last layer after requireAuth/requireOwner).
const postRoot = chatRouter.stack.find(
  (l) => l.route && l.route.path === '/' && l.route.methods.post
);
const handler = postRoot.route.stack[postRoot.route.stack.length - 1].handle;

const USER = '7fa3e095-6156-484a-a1d1-c29fc1ba9e33';
function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
}
function reset() { generateArtCalls = []; modelReplies = []; nextArtResult = null; }

test('1. /api/chat detects art requests (and leaves non-art alone)', () => {
  assert.ok(realIsArtRequest('paint me a quiet forest at dusk'), 'art verb detected');
  assert.ok(realIsArtRequest('draw a sunset'), 'art verb detected');
  assert.strictEqual(realIsArtRequest('what is the capital of France?'), false, 'non-art not detected');
});

test('2 & 4. art request calls generateArt before any council/model call (Council ON)', async () => {
  reset();
  nextArtResult = {
    ok: true, requestId: 'rid-1', imageUrl: 'https://img/x.png', audioB64: 'AAAA',
    revisedPrompt: 'a quiet forest', model: 'dall-e-3',
    description: 'Here — a quiet forest I made for you.',
  };
  const req = { body: { message: 'paint me a quiet forest', councilMode: true }, userId: USER };
  const res = makeRes();
  await handler(req, res);

  // generateArt ran, with the chat source tag.
  assert.strictEqual(generateArtCalls.length, 1, 'generateArt called exactly once');
  assert.strictEqual(generateArtCalls[0].source, 'chat');
  // The raw model was NEVER reached — even though Council was ON.
  assert.strictEqual(modelReplies.length, 0, 'generateSplendorResponse must NOT be called');
  // Art payload shipped (message + art block), no council fall-through.
  assert.strictEqual(res.body.art.generated, true);
  assert.strictEqual(res.body.art.image_url, 'https://img/x.png');
  assert.strictEqual(res.body.message, 'Here — a quiet forest I made for you.');
  assert.ok(!('council' in res.body), 'short-circuited before the council branch');
});

test('art failure returns a clean labeled error, never the raw model refusal', async () => {
  reset();
  nextArtResult = { ok: false, requestId: 'rid-2', errorCategory: 'permission', errorMessage: '401 unauthorized' };
  const req = { body: { message: 'draw a sunset', councilMode: 'auto' }, userId: USER };
  const res = makeRes();
  await handler(req, res);

  assert.strictEqual(generateArtCalls.length, 1, 'generateArt attempted');
  assert.strictEqual(modelReplies.length, 0, 'no fall-through to the model');
  assert.strictEqual(res.body.art.generated, false);
  assert.strictEqual(res.body.art.error_category, 'permission');
  assert.match(res.body.message, /isn't authorized/i);
});

test('3a. non-art request follows the existing model path unchanged', async () => {
  reset();
  const req = { body: { message: 'how are you feeling today?', councilMode: false }, userId: USER };
  const res = makeRes();
  await handler(req, res);

  assert.strictEqual(generateArtCalls.length, 0, 'generateArt must NOT be called for non-art');
  assert.strictEqual(res.body.message, SENTINEL_MODEL_REPLY, 'reaches the existing model path');
  assert.ok('council' in res.body, 'existing response shape (council key) preserved');
});

test('3b. art-looking message WITH an attached image is NOT intercepted (vision input)', async () => {
  reset();
  const req = { body: { message: 'draw what you see here', imageData: 'BASE64DATA', councilMode: false }, userId: USER };
  const res = makeRes();
  await handler(req, res);

  assert.strictEqual(generateArtCalls.length, 0, 'attached image skips art generation');
  assert.strictEqual(res.body.message, SENTINEL_MODEL_REPLY, 'falls through to vision/model path');
});
