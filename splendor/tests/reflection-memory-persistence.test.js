'use strict';
/*
  H5 regression — autonomous reflection → memory_items persistence.

  The worker inserted source_type:'ai_generated', provenance:'splendor_reflection',
  memory_type:<domain taxonomy>, and source_id:String(thought.id) (a bigint) into
  a uuid column. All four violated live memory_items constraints, and the insert
  was wrapped in a console.warn-only catch — so every reflection-to-memory persist
  failed silently. This pins the corrected values against the LIVE schema.

  Live memory_items CHECK enums captured by read-only introspection of project
  ksbyzduayettfwsmsqwy on 2026-06-22.

  Run: node --test tests/reflection-memory-persistence.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const { toValidMemoryItemType, ALLOWED_MEMORY_ITEM_TYPES } = require('../workers/autonomous-reflection-worker');

// ── Live memory_items CHECK constraints (source of truth: production DB) ──────
const LIVE_MEMORY_TYPE = new Set([
  'user_fact', 'user_preference', 'user_goal', 'project_context', 'shared_history',
  'splendor_identity', 'splendor_reflection', 'binding_rule', 'relationship_context',
  'technical_context', 'task_context', 'correction', 'insight',
]);
const LIVE_SOURCE_TYPE = new Set([
  'conversation', 'user_direct_statement', 'assistant_response', 'reflection',
  'decision', 'system_event', 'email', 'manual_admin', 'imported_memory',
]);
const LIVE_PROVENANCE = new Set([
  'USER_STATED', 'VERIFIED_FACT', 'INFERRED', 'GENERATED', 'SYSTEM_EVENT',
  'ADMIN_APPROVED', 'splendor_conversation',
]);

// The reflection scanning-domains taxonomy (lib/scanning-domains.js).
const DOMAIN_TYPES = [
  'developed_position', 'foundational_rule', 'noticed_pattern', 'open_question',
  'self_reflection', 'shared_history', 'user_fact', 'user_preference',
];

test('every reflection domain type maps to a live-valid memory_items.memory_type', () => {
  for (const t of DOMAIN_TYPES) {
    const mapped = toValidMemoryItemType(t);
    assert.ok(LIVE_MEMORY_TYPE.has(mapped), `${t} -> ${mapped} is not a live-valid memory_type`);
  }
});

test('specific domain → memory_type mappings', () => {
  assert.equal(toValidMemoryItemType('self_reflection'), 'splendor_reflection');
  assert.equal(toValidMemoryItemType('noticed_pattern'), 'insight');
  assert.equal(toValidMemoryItemType('open_question'), 'splendor_reflection');
  assert.equal(toValidMemoryItemType('developed_position'), 'splendor_reflection');
  assert.equal(toValidMemoryItemType('foundational_rule'), 'splendor_reflection');
  // already-valid types pass through unchanged
  assert.equal(toValidMemoryItemType('user_fact'), 'user_fact');
  assert.equal(toValidMemoryItemType('shared_history'), 'shared_history');
  // unknown / future types fall back to a valid reflective type
  assert.equal(toValidMemoryItemType('some_unknown_type'), 'splendor_reflection');
});

test('exported ALLOWED set exactly matches the live memory_type enum', () => {
  assert.deepEqual(
    [...ALLOWED_MEMORY_ITEM_TYPES].sort(),
    [...LIVE_MEMORY_TYPE].sort(),
    'ALLOWED_MEMORY_ITEM_TYPES drifted from the live memory_items.memory_type CHECK'
  );
});

test('the reflection insert uses live-valid source_type/provenance and a null uuid source_id', () => {
  const src = fs.readFileSync(path.join(__dirname, '../workers/autonomous-reflection-worker.js'), 'utf8');
  // The old invalid literals must be gone.
  assert.ok(!/source_type:\s*'ai_generated'/.test(src), "must not insert source_type 'ai_generated'");
  assert.ok(!/provenance:\s*'splendor_reflection'/.test(src), "must not insert provenance 'splendor_reflection'");
  assert.ok(!/source_id:\s*String\(thought\.id\)/.test(src), 'must not put the bigint thought.id into the uuid source_id');
  // The corrected, live-valid literals must be present.
  assert.ok(/source_type:\s*'reflection'/.test(src), "insert should use source_type 'reflection'");
  assert.ok(/provenance:\s*'GENERATED'/.test(src), "insert should use provenance 'GENERATED'");
  assert.ok(/source_id:\s*null/.test(src), 'source_id should be null (uuid column)');
  // And those literals are members of the live enums.
  assert.ok(LIVE_SOURCE_TYPE.has('reflection'));
  assert.ok(LIVE_PROVENANCE.has('GENERATED'));
});
