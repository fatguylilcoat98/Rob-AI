'use strict';
/*
  Owner auth (requireOwner) — regression guard.

  Owner-gated routes compare the authenticated Supabase user's email to
  SPLENDOR_OWNER_EMAIL. The audit found SPLENDOR_OWNER_EMAIL was the env the
  code reads, but only SPLENDOR_OWNER_USER_ID was declared in render.yaml —
  so on a deploy without the email set, every owner-gated route fails closed
  with HTTP 500 (owner lockout). The fix declares SPLENDOR_OWNER_EMAIL on the
  web service; these tests pin the middleware's contract: it authorizes the
  owner when the documented env is present, and fails CLOSED (never open)
  when it is missing or the caller is not the owner.

  requireOwner performs no I/O (no Supabase call), so this is a pure unit test.

  Run: node --test tests/owner-auth.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

// middleware/auth.js builds a Supabase client at load; dummy env keeps the
// require chain happy. requireOwner itself never touches it.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const { requireOwner } = require('../middleware/auth');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

// Invoke requireOwner with a controlled SPLENDOR_OWNER_EMAIL, restoring the
// previous value afterward so tests do not leak env state into each other.
function invoke(req, ownerEmail) {
  const prev = process.env.SPLENDOR_OWNER_EMAIL;
  if (ownerEmail === undefined) delete process.env.SPLENDOR_OWNER_EMAIL;
  else process.env.SPLENDOR_OWNER_EMAIL = ownerEmail;

  const res = mockRes();
  let nexted = false;
  try {
    requireOwner(req, res, () => { nexted = true; });
  } finally {
    if (prev === undefined) delete process.env.SPLENDOR_OWNER_EMAIL;
    else process.env.SPLENDOR_OWNER_EMAIL = prev;
  }
  return { res, nexted };
}

const OWNER = 'owner@example.com';

test('owner email matches the documented env -> next(), no error status', () => {
  const { res, nexted } = invoke({ user: { email: OWNER } }, OWNER);
  assert.strictEqual(nexted, true, 'owner must be allowed through');
  assert.strictEqual(res.statusCode, null, 'no error status set for the owner');
});

test('non-owner email -> 403, request blocked', () => {
  const { res, nexted } = invoke({ user: { email: 'intruder@example.com' } }, OWNER);
  assert.strictEqual(nexted, false, 'non-owner must not pass');
  assert.strictEqual(res.statusCode, 403);
});

test('no authenticated user on the request -> 403', () => {
  const { res, nexted } = invoke({}, OWNER);
  assert.strictEqual(nexted, false);
  assert.strictEqual(res.statusCode, 403);
});

test('SPLENDOR_OWNER_EMAIL missing -> 500 fail-closed (never open)', () => {
  const { res, nexted } = invoke({ user: { email: OWNER } }, undefined);
  assert.strictEqual(nexted, false, 'must NOT allow through when owner env is unconfigured');
  assert.strictEqual(res.statusCode, 500);
});
