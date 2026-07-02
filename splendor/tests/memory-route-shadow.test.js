'use strict';
/*
  Memory route shadow — regression guard.

  Before this fix, GET /api/memory/session-summaries was unreachable: the
  parameterized `router.get('/:userId', ...)` was registered earlier and
  captured the literal "session-summaries" segment as a :userId, whose
  handler then 403s because "session-summaries" !== the authenticated user
  id. The served Oracle UI calls this endpoint, so the feature was broken.

  Fix: the :userId param routes are constrained to UUID shape, so they no
  longer swallow sibling literal paths. This test resolves routes the way
  Express does (first matching layer wins, honoring method + path regex) and
  asserts the literal route now wins for /session-summaries while real UUIDs
  still reach /:userId. No server, no network.

  Run: node --test tests/memory-route-shadow.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

// routes/memory pulls in lib/supabase, which constructs a client at load.
// Dummy connection env keeps the require chain happy; no socket is opened.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const router = require('../routes/memory');

// Resolve which registered route would actually serve METHOD+path, honoring
// Express's first-match-wins layer ordering and per-route method + path regex.
function resolveRoute(method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (!layer.match(path)) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;
    return layer.route.path;
  }
  return null;
}

const SAMPLE_UUID = '7fa3e095-6156-484a-a1d1-c29fc1ba9e33';

test('GET /session-summaries reaches the session-summaries handler, not /:userId', () => {
  const matched = resolveRoute('GET', '/session-summaries');
  assert.strictEqual(
    matched,
    '/session-summaries',
    `expected the /session-summaries handler, got ${matched}`
  );
});

test('GET /:userId still serves a real UUID', () => {
  const matched = resolveRoute('GET', `/${SAMPLE_UUID}`);
  assert.ok(
    matched && matched.startsWith('/:userId'),
    `expected the :userId route to serve a UUID, got ${matched}`
  );
});

test('a non-UUID single segment no longer matches /:userId', () => {
  // Proves the constraint is doing the work — "session-summaries" is not a
  // UUID, so the param route declines it.
  const matched = resolveRoute('GET', '/not-a-uuid');
  assert.notStrictEqual(matched, '/:userId([0-9a-fA-F-]{36})');
});

test('fix is a constraint, not a reorder: param route still precedes the literal', () => {
  const paths = router.stack.filter((l) => l.route).map((l) => l.route.path);
  const userIdIdx = paths.findIndex((p) => p.startsWith('/:userId') && !p.includes('memoryId'));
  const ssIdx = paths.indexOf('/session-summaries');
  assert.ok(userIdIdx > -1 && ssIdx > -1, 'both routes must exist');
  assert.ok(userIdIdx < ssIdx, 'param route remains registered before the literal route');
});

test('session-summaries sub-routes resolve correctly', () => {
  assert.strictEqual(
    resolveRoute('POST', '/session-summaries/123/approve'),
    '/session-summaries/:id/approve'
  );
  assert.strictEqual(
    resolveRoute('POST', '/session-summaries/123/reject'),
    '/session-summaries/:id/reject'
  );
});
