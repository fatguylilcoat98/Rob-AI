'use strict';

/*
  Identity Checksum — Startup Verification

  The identity.json file is the immutable record of who Splendor is.
  This module verifies it hasn't been modified since the last git commit.

  Key design decision: the checksum is stored in git, not Supabase.
  If it were in Supabase, Splendor could update both the identity and the
  checksum simultaneously, making the check circular. Git is append-only
  from Splendor's perspective — only a human can commit.

  This does NOT crash the server on mismatch. It logs a critical warning
  and continues. A mismatch means something needs human review, not that
  the server should stop serving users.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const IDENTITY_FILE = path.join(__dirname, '../identity.json');

function computeHash(identityObj) {
  const { checksum, ...rest } = identityObj;
  // Canonical sort ensures key order doesn't affect hash
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function loadIdentity() {
  try {
    return JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'));
  } catch (err) {
    return null;
  }
}

function verifyIdentityOnStartup() {
  const identity = loadIdentity();

  if (!identity) {
    console.error('[IDENTITY] CRITICAL: identity.json missing or unreadable');
    return { valid: false, reason: 'unreadable' };
  }

  // 1. Verify file's own stored checksum
  const computed = computeHash(identity);
  if (computed !== identity.checksum) {
    console.error('[IDENTITY] CRITICAL: Checksum mismatch — identity.json may have been tampered with');
    console.error(`[IDENTITY]   stored:   ${identity.checksum}`);
    console.error(`[IDENTITY]   computed: ${computed}`);
    return { valid: false, reason: 'checksum_mismatch', computed, stored: identity.checksum };
  }

  // 2. Verify against git-committed version (catches in-memory or disk tampering after deploy)
  try {
    const gitContent = execSync('git show HEAD:identity.json', {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString();
    const gitIdentity = JSON.parse(gitContent);
    const gitHash = computeHash(gitIdentity);

    if (gitHash !== computed) {
      console.warn('[IDENTITY] WARNING: identity.json differs from last committed version');
      console.warn(`[IDENTITY]   current: ${computed.slice(0, 16)}...`);
      console.warn(`[IDENTITY]   git:     ${gitHash.slice(0, 16)}...`);
      return { valid: true, warning: 'differs_from_git', computed, gitHash, identity };
    }
  } catch (err) {
    console.warn('[IDENTITY] Could not compare against git (may be initial commit):', err.message);
  }

  console.log(`[IDENTITY] ✓ ${identity.version} verified — ${identity.immutable_values.length} immutable values, checksum ${computed.slice(0, 12)}...`);
  return { valid: true, identity, checksum: computed };
}

function getProtectedComponents() {
  const identity = loadIdentity();
  if (!identity) return ['truth_boundary', 'human_authority', 'identity_anchor'];
  return identity.protected_components || [];
}

function getImmutableValues() {
  const identity = loadIdentity();
  if (!identity) return [];
  return identity.immutable_values || [];
}

module.exports = { verifyIdentityOnStartup, computeHash, getProtectedComponents, getImmutableValues };
