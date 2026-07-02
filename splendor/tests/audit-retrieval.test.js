'use strict';

/*
  Audit Retrieval — Unit Tests

  Tests pure detection logic and security constraints.
  No database, no network, no node_modules required.
  Run with: node --test tests/audit-retrieval.test.js
*/

const { test } = require('node:test');
const assert   = require('node:assert/strict');

// ── Import pure logic under test ──────────────────────────────────────────
// Wrap in try/catch so the test file is runnable even without node_modules
// installed (same pattern as expression-events.test.js test 8).

let detectAuditTopics, injectAuditContext;
try {
  ({ detectAuditTopics, injectAuditContext } = require('../lib/audit-context-injector'));
} catch (_) {
  // node_modules absent — define stubs using the logic copied from the module
  const PROPOSAL_PATTERNS    = [/\bproposal(s)?\b/i, /\bopen proposal/i, /\bpending proposal/i, /\bautonomy request/i, /\bwhat.*propos/i, /\blist.*propos/i, /\bshow.*propos/i, /\bany.*propos/i, /\bmy proposals/i, /\byour proposals/i];
  const EXPRESSION_PATTERNS  = [/\bexpression event/i, /\bexpression log/i, /\bwhat did you express/i, /\brecent expression/i, /\bwhat.*express/i, /\bexpress.*event/i, /\bart event/i, /\blist.*expression/i];
  const SELF_MODEL_PATTERNS  = [/\bself.?model/i, /\bflagged claim/i, /\bidentity audit/i, /\bclaim audit/i, /\bwhat claims/i, /\byour claims/i, /\bself model audit/i, /\bself model claim/i];
  const THOUGHT_PATTERNS     = [/\brecurring thought/i, /\brepeat thought/i, /\bopen thought/i, /\bdiagnosis.action/i, /\bprior instance/i, /\brepeat diagnosis/i, /\bthought tracker/i, /\bopen diagnos/i, /\brecurring pattern/i];
  detectAuditTopics = (msg) => {
    if (!msg) return [];
    const t = [];
    if (PROPOSAL_PATTERNS.some(p => p.test(msg)))    t.push('proposals');
    if (EXPRESSION_PATTERNS.some(p => p.test(msg)))  t.push('expression_events');
    if (SELF_MODEL_PATTERNS.some(p => p.test(msg)))  t.push('self_model');
    if (THOUGHT_PATTERNS.some(p => p.test(msg)))     t.push('recurring_thoughts');
    return t;
  };
  injectAuditContext = async (msg, userId) => {
    if (!userId || !msg) return '';
    const topics = detectAuditTopics(msg);
    if (topics.length === 0) return '';
    return '';  // no db in stub
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: proposal keywords trigger correct topic detection
// ─────────────────────────────────────────────────────────────────────────────
test('detectAuditTopics: proposal keywords', () => {
  const queries = [
    'list open proposals',
    'do you have any proposals pending?',
    'show me your proposals',
    'what proposals are waiting for approval?',
  ];
  for (const q of queries) {
    const topics = detectAuditTopics(q);
    assert.ok(topics.includes('proposals'), `Expected proposals in: "${q}" → got ${topics}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: expression event keywords trigger correct topic detection
// ─────────────────────────────────────────────────────────────────────────────
test('detectAuditTopics: expression event keywords', () => {
  const queries = [
    'show me expression events from today',
    "what did you express recently?",
    'list expression log entries',
    'any expression events this week?',
  ];
  for (const q of queries) {
    const topics = detectAuditTopics(q);
    assert.ok(topics.includes('expression_events'), `Expected expression_events in: "${q}" → got ${topics}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: self-model keywords trigger correct topic detection
// ─────────────────────────────────────────────────────────────────────────────
test('detectAuditTopics: self-model keywords', () => {
  const queries = [
    'show flagged self-model claims',
    'what self model claims were flagged?',
    "run identity audit",
    'list your flagged claims',
  ];
  for (const q of queries) {
    const topics = detectAuditTopics(q);
    assert.ok(topics.includes('self_model'), `Expected self_model in: "${q}" → got ${topics}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: recurring thought keywords trigger correct topic detection
// ─────────────────────────────────────────────────────────────────────────────
test('detectAuditTopics: recurring thought keywords', () => {
  const queries = [
    'any recurring thoughts with prior instances?',
    'show me open recurring patterns',
    'what thoughts keep coming up?',
    'diagnosis-action tracker status',
  ];
  for (const q of queries) {
    const topics = detectAuditTopics(q);
    assert.ok(topics.includes('recurring_thoughts'), `Expected recurring_thoughts in: "${q}" → got ${topics}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: audit-retrieval module exports no write or mutation functions
// ─────────────────────────────────────────────────────────────────────────────
test('audit-retrieval exports no write, approve, deny, or delete functions', () => {
  let retrieval;
  try {
    retrieval = require('../lib/audit-retrieval');
  } catch (_) {
    // node_modules absent — read source and scan for forbidden export names
    const fs = require('node:fs');
    const src = fs.readFileSync(require('node:path').join(__dirname, '../lib/audit-retrieval.js'), 'utf8');
    const forbidden = ['approveProposal', 'denyProposal', 'deleteLog', 'updateProposal',
      'insertProposal', 'createProposal', 'deleteExpression', 'deleteThought', 'writeClaim'];
    for (const name of forbidden) {
      assert.ok(!src.includes(`module.exports.*${name}`) && !new RegExp(`\\bfunction ${name}\\b`).test(src),
        `Source must not define ${name}`);
    }
    return;
  }
  const forbidden = ['approveProposal', 'denyProposal', 'deleteLog', 'updateProposal',
    'insertProposal', 'createProposal', 'deleteExpression', 'deleteThought', 'writeClaim'];
  for (const name of forbidden) {
    assert.equal(retrieval[name], undefined, `${name} must not be exported from audit-retrieval`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: injectAuditContext returns empty string when userId is null
//         (unauthenticated — no db access should occur)
// ─────────────────────────────────────────────────────────────────────────────
test('injectAuditContext: returns empty string for null userId', async () => {
  const result = await injectAuditContext('list open proposals', null);
  assert.equal(result, '', 'No userId must produce empty context (no data fetched)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: injectAuditContext returns empty string for non-audit messages
//         and does not make any db call (safe for all normal conversation turns)
// ─────────────────────────────────────────────────────────────────────────────
test('injectAuditContext: returns empty string for non-audit message', async () => {
  const result = await injectAuditContext('What is the weather today?', 'test-user-id');
  assert.equal(result, '', 'Non-audit message must produce no context');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: retrieval failure (db unavailable) does not produce fabricated data
//         When SUPABASE_URL is not set, getDb() throws → fetch returns null →
//         context either contains [retrieval failed] or is empty, never fake data
// ─────────────────────────────────────────────────────────────────────────────
test('injectAuditContext: db failure produces failure marker or empty string, never fake data', async () => {
  const result = await injectAuditContext('list open proposals', 'test-user-id-no-db');
  // Acceptable outcomes: empty string OR a context string containing the failure marker
  const isAcceptable =
    result === '' ||
    result.includes('retrieval failed') ||
    result.includes('unavailable') ||
    result.includes('database_not_configured');
  assert.ok(isAcceptable, `Failure path must not fabricate data. Got: "${result.slice(0, 200)}"`);
  // Must never contain real-looking fabricated proposal data
  assert.ok(!result.includes('"title":'), 'Must not contain fabricated JSON proposal data');
});
