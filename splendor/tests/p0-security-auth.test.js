'use strict';
/*
  P0 security patch — route auth + secret-leak regression guard.

  The security audit found a cluster of sensitive endpoints reachable with NO
  authentication, plus an API key written to logs:

    - routes/cognitive-dashboard.js  GET /:userId , /api/:userId/profile ,
      /api/:userId/evolution        → leaked any user's cognitive profile
    - routes/master-continuity.js    entire Shadow-Mode admin surface (reads +
      approve/reject/archive/toggle-shadow-mode/run-engine/capture) → ungated,
      with client-supplied user_id (IDOR)
    - routes/memory-debug.js         /debug/* including POST /approve-promotion
      (service-key mutation into foundational rules) → ungated
    - routes/enhanced-chat.js        PUT /workspace/:id → no auth, IDOR
    - routes/voice.js                POST /choose → unauthenticated Anthropic
      spend + config write
    - routes/video.js                logged the full ModelsLab request body,
      which contains MODELSLAB_API_KEY

  These tests pin the fix WITHOUT a server or network:
    1. Static inspection of each router's Express layer stack asserts the
       previously-exposed routes now carry requireAuth (+ requireOwner where
       owner-only), accounting for both per-route guards and router-level
       `router.use(...)` middleware (Express evaluates these in stack order).
    2. Intentionally-public voice endpoints (/options, /current) must NOT
       regress into being gated.
    3. A functional check that requireAuth rejects an anonymous request (401,
       no next()) — the mechanism behind "anonymous is denied".
    4. A source check that video.js no longer logs the raw request body.

  Run: node --test tests/p0-security-auth.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Several modules build a Supabase/Anthropic client at load time. Provide
// dummy env so the require chain loads; nothing here opens a socket.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key';

const { requireAuth } = require('../middleware/auth');

// Build "METHOD /path" -> Set(effective guard names). Walks the router stack
// in order: router-level middleware (layers with no `.route`, e.g. added via
// router.use) accumulate as globals that apply to every subsequent route, and
// each route's effective guards are those globals plus its own handler names.
function effectiveGuards(r) {
  const map = new Map();
  const globals = [];
  for (const layer of r.stack) {
    if (layer.route) {
      const p = layer.route.path;
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
      const own = layer.route.stack.map((l) => l.handle && l.handle.name).filter(Boolean);
      const names = new Set([...globals, ...own]);
      for (const m of methods) map.set(`${m.toUpperCase()} ${p}`, names);
    } else if (layer.handle && layer.handle.name) {
      globals.push(layer.handle.name);
    }
  }
  return map;
}

function assertGuarded(routes, key, { owner = true } = {}) {
  assert.ok(routes.has(key), `route ${key} not found`);
  const names = routes.get(key);
  assert.ok(names.has('requireAuth'), `${key} missing requireAuth`);
  if (owner) assert.ok(names.has('requireOwner'), `${key} missing requireOwner`);
}

// ── cognitive-dashboard: owner-gated, identity from req.userId ──────────────
test('cognitive-dashboard endpoints are owner-gated', () => {
  const routes = effectiveGuards(require('../routes/cognitive-dashboard'));
  assertGuarded(routes, 'GET /:userId');
  assertGuarded(routes, 'GET /api/:userId/profile');
  assertGuarded(routes, 'GET /api/:userId/evolution');
});

// ── master-continuity: entire admin surface owner-gated via router.use ──────
test('master-continuity admin surface is owner-gated', () => {
  const routes = effectiveGuards(require('../routes/master-continuity'));
  for (const key of [
    'GET /dashboard',
    'GET /reflection/:id',
    'POST /reflection/:id/approve',
    'POST /reflection/:id/reject',
    'POST /reflection/:id/archive',
    'POST /system/toggle-shadow-mode',
    'POST /system/run-engine',
    'POST /capture',
    'GET /admin',
  ]) {
    assertGuarded(routes, key);
  }
});

// ── memory-debug: all routes (incl. the service-key mutation) owner-gated ───
test('memory-debug routes are owner-gated', () => {
  const routes = effectiveGuards(require('../routes/memory-debug'));
  assertGuarded(routes, 'GET /memory-load');
  assertGuarded(routes, 'GET /memory-audit/:memoryId');
  assertGuarded(routes, 'GET /promotion-queue');
  assertGuarded(routes, 'POST /approve-promotion/:promotionId');
});

// ── enhanced-chat: workspace update now requires auth (ownership enforced
//    inline against the stored row's user_id) ────────────────────────────────
test('enhanced-chat PUT /workspace/:workspaceId requires auth', () => {
  const routes = effectiveGuards(require('../routes/enhanced-chat'));
  assertGuarded(routes, 'PUT /workspace/:workspaceId', { owner: false });
});

// ── voice: /choose owner-gated; /options & /current stay public ─────────────
test('voice /choose is owner-gated and read-only endpoints stay public', () => {
  const routes = effectiveGuards(require('../routes/voice'));
  assertGuarded(routes, 'POST /choose');

  for (const key of ['GET /options', 'GET /current']) {
    assert.ok(routes.has(key), `route ${key} not found`);
    const names = routes.get(key);
    assert.ok(!names.has('requireAuth'), `${key} should stay public (no requireAuth)`);
    assert.ok(!names.has('requireOwner'), `${key} should stay public (no requireOwner)`);
  }
  // The pre-existing speak endpoints must remain owner-gated.
  assertGuarded(routes, 'POST /speak');
  assertGuarded(routes, 'POST /speak-chunk');
});

// ── functional: anonymous request is denied (the basis of every gate) ───────
test('requireAuth denies an anonymous request (401, no next)', async () => {
  let nextCalled = false;
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await requireAuth({ headers: {} }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, 'next() must not run for an anonymous request');
  assert.equal(res.statusCode, 401);
});

// ── video: the ModelsLab API key must not be logged ─────────────────────────
test('video.js does not log the raw request body (no key leak)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../routes/video.js'), 'utf8');
  assert.ok(
    !/console\.log\([^)]*JSON\.stringify\(\s*body\b/.test(src),
    'video.js must not console.log JSON.stringify(body) — body contains MODELSLAB_API_KEY'
  );
  // The send-to-ModelsLab log should report safe metadata instead.
  assert.ok(/prompt_length/.test(src), 'video.js should log prompt_length metadata, not the body');
});
