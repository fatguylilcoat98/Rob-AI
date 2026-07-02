'use strict';
/*
  Governance route auth — regression guard.

  Before this fix, POST /state, /toggle, /reset and /quarantine/exit were
  unauthenticated: anyone could disable CLASPION. GET /state/status/audit/
  enhanced/state leaked config (CLASPION_URL) and the audit log.

  This test inspects the Express router's layer stack and asserts that every
  sensitive endpoint carries BOTH requireAuth and requireOwner, and that the
  intentionally-public endpoints (/health, /rules) do not regress into being
  gated (which would break uptime/rules display). No server, no network.

  Run: node --test tests/governance-route-auth.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

// Some modules in the require chain construct a Supabase client at load time.
// Provide dummy connection env so the router loads; createClient is lazy and
// opens no socket here. These values are never used to reach a real service.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const router = require('../routes/governance');

// Build: "METHOD /path" -> Set(handler function names)
function routeMap(r) {
  const map = new Map();
  for (const layer of r.stack) {
    if (!layer.route) continue;
    const path = layer.route.path;
    const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
    const names = layer.route.stack.map((l) => l.handle && l.handle.name).filter(Boolean);
    for (const m of methods) map.set(`${m.toUpperCase()} ${path}`, new Set(names));
  }
  return map;
}

const routes = routeMap(router);

const MUST_BE_OWNER_GATED = [
  'GET /state',
  'GET /status',
  'POST /state',
  'POST /toggle',
  'POST /reset',
  'GET /enhanced/state',
  'POST /validate',
  'GET /audit',
  'POST /quarantine/exit',
];

for (const key of MUST_BE_OWNER_GATED) {
  test(`${key} is owner-gated (requireAuth + requireOwner)`, () => {
    assert.ok(routes.has(key), `route ${key} not found`);
    const names = routes.get(key);
    assert.ok(names.has('requireAuth'), `${key} missing requireAuth`);
    assert.ok(names.has('requireOwner'), `${key} missing requireOwner`);
  });
}

// These must stay reachable without auth (non-sensitive / uptime).
const MUST_STAY_PUBLIC = ['GET /health', 'GET /rules'];
for (const key of MUST_STAY_PUBLIC) {
  test(`${key} stays public (no auth regression)`, () => {
    assert.ok(routes.has(key), `route ${key} not found`);
    const names = routes.get(key);
    assert.ok(!names.has('requireAuth'), `${key} should not require auth`);
    assert.ok(!names.has('requireOwner'), `${key} should not require owner`);
  });
}

// The pre-existing owner-gated endpoints must remain gated.
for (const key of ['GET /reflections/pending', 'GET /metrics']) {
  test(`${key} remains owner-gated`, () => {
    assert.ok(routes.has(key), `route ${key} not found`);
    assert.ok(routes.get(key).has('requireOwner'), `${key} lost requireOwner`);
  });
}
