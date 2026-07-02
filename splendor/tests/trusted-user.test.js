'use strict';

/*
  Trusted User — Unit Tests

  Tests the requireOwnerOrTrusted middleware logic using inline stubs.
  No network, no database, no Supabase required.
  Run with: node --test tests/trusted-user.test.js
*/

const { test } = require('node:test');
const assert   = require('node:assert/strict');

// ── Inline the core requireOwnerOrTrusted logic ───────────────────────────────
// Mirrors middleware/auth.js exactly so tests run without node_modules.

function makeTrustedSet(raw) {
  return new Set((raw || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
}

function buildMiddleware({ ownerEmail, guestEmail, trustedEmails }) {
  return function requireOwnerOrTrusted(req, _res, next) {
    const OWNER_EMAIL = ownerEmail;
    if (!OWNER_EMAIL) throw new Error('Owner email not configured');

    const userEmail = req.user && req.user.email;
    const isOwner = userEmail === OWNER_EMAIL;
    const isGuest = !!(guestEmail && userEmail === guestEmail);
    const trusted = makeTrustedSet(trustedEmails);
    const isTrustedUser = !isOwner && !isGuest && !!(userEmail && trusted.has(userEmail.toLowerCase()));

    if (!isOwner && !isGuest && !isTrustedUser) {
      const err = new Error('Access denied');
      err.status = 403;
      throw err;
    }

    req.isOwner = isOwner;
    req.isGuest = isGuest;
    req.isTrustedUser = isTrustedUser;
    next();
  };
}

function run(middleware, userEmail) {
  const req = { user: { email: userEmail } };
  const flags = {};
  let nextCalled = false;
  let blocked = false;
  try {
    middleware(req, {}, () => { nextCalled = true; Object.assign(flags, { isOwner: req.isOwner, isGuest: req.isGuest, isTrustedUser: req.isTrustedUser }); });
  } catch (e) {
    if (e.status === 403) blocked = true;
    else throw e;
  }
  return { nextCalled, blocked, ...flags };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: owner email always passes
// ─────────────────────────────────────────────────────────────────────────────
test('owner email passes requireOwnerOrTrusted', () => {
  const mw = buildMiddleware({ ownerEmail: 'chris@example.com', trustedEmails: '' });
  const result = run(mw, 'chris@example.com');
  assert.ok(result.nextCalled, 'next() should be called');
  assert.equal(result.isOwner, true);
  assert.equal(result.isGuest, false);
  assert.equal(result.isTrustedUser, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: guest email passes
// ─────────────────────────────────────────────────────────────────────────────
test('guest email passes requireOwnerOrTrusted', () => {
  const mw = buildMiddleware({ ownerEmail: 'chris@example.com', guestEmail: 'guest@example.com', trustedEmails: '' });
  const result = run(mw, 'guest@example.com');
  assert.ok(result.nextCalled);
  assert.equal(result.isOwner, false);
  assert.equal(result.isGuest, true);
  assert.equal(result.isTrustedUser, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: trusted email passes and sets isTrustedUser
// ─────────────────────────────────────────────────────────────────────────────
test('trusted email passes and isTrustedUser is set', () => {
  const mw = buildMiddleware({ ownerEmail: 'chris@example.com', trustedEmails: 'nicholas@example.com,sarah@example.com' });
  const result = run(mw, 'nicholas@example.com');
  assert.ok(result.nextCalled);
  assert.equal(result.isOwner, false);
  assert.equal(result.isGuest, false);
  assert.equal(result.isTrustedUser, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: second trusted email in list passes
// ─────────────────────────────────────────────────────────────────────────────
test('second trusted email in comma list passes', () => {
  const mw = buildMiddleware({ ownerEmail: 'chris@example.com', trustedEmails: 'nicholas@example.com,sarah@example.com' });
  const result = run(mw, 'sarah@example.com');
  assert.ok(result.nextCalled);
  assert.equal(result.isTrustedUser, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: unknown email is blocked
// ─────────────────────────────────────────────────────────────────────────────
test('unknown email is blocked (403)', () => {
  const mw = buildMiddleware({ ownerEmail: 'chris@example.com', trustedEmails: 'nicholas@example.com' });
  const result = run(mw, 'attacker@example.com');
  assert.ok(result.blocked, 'unknown email must be blocked');
  assert.ok(!result.nextCalled);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: empty TRUSTED_EMAILS blocks non-owner/non-guest
// ─────────────────────────────────────────────────────────────────────────────
test('empty TRUSTED_EMAILS blocks non-owner, non-guest', () => {
  const mw = buildMiddleware({ ownerEmail: 'chris@example.com', trustedEmails: '' });
  const result = run(mw, 'anyone@example.com');
  assert.ok(result.blocked);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: trusted email matching is case-insensitive
// ─────────────────────────────────────────────────────────────────────────────
test('trusted email match is case-insensitive', () => {
  const mw = buildMiddleware({ ownerEmail: 'chris@example.com', trustedEmails: 'Nicholas@Example.com' });
  const result = run(mw, 'nicholas@example.com');
  assert.ok(result.nextCalled, 'case-insensitive match should pass');
  assert.equal(result.isTrustedUser, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: trusted user is NOT flagged as isOwner or isGuest
// ─────────────────────────────────────────────────────────────────────────────
test('trusted user flags: isOwner=false, isGuest=false, isTrustedUser=true', () => {
  const mw = buildMiddleware({ ownerEmail: 'chris@example.com', guestEmail: 'guest@example.com', trustedEmails: 'nicholas@example.com' });
  const result = run(mw, 'nicholas@example.com');
  assert.equal(result.isOwner, false, 'trusted user must not be owner');
  assert.equal(result.isGuest, false, 'trusted user must not be guest');
  assert.equal(result.isTrustedUser, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: TRUSTED_EMAILS list with extra whitespace is parsed correctly
// ─────────────────────────────────────────────────────────────────────────────
test('TRUSTED_EMAILS with whitespace around commas is parsed correctly', () => {
  const mw = buildMiddleware({ ownerEmail: 'chris@example.com', trustedEmails: ' nicholas@example.com , sarah@example.com ' });
  const r1 = run(mw, 'nicholas@example.com');
  const r2 = run(mw, 'sarah@example.com');
  assert.ok(r1.nextCalled, 'nicholas should pass after whitespace trim');
  assert.ok(r2.nextCalled, 'sarah should pass after whitespace trim');
});
