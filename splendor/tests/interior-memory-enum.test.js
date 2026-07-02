'use strict';
/*
  Batch 3.5 — interior memory insert must satisfy live memory_items CHECK enums.

  The store_interior_memory tool inserted source_type:'ai_generated' (invalid)
  and memory_type:<raw interior type> (open_question/developed_position/
  self_reflection/noticed_pattern — none valid), so every interior store failed
  the live constraint in prod (surfaced by the Batch 3 [interior:ingest]
  diagnostics). This pins the corrected, live-valid payload.

  Live memory_items enums captured by read-only introspection of project
  ksbyzduayettfwsmsqwy. Insert acceptance also verified live (insert+delete).

  Run: node --test tests/interior-memory-enum.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const { executeStoreInteriorMemory } = require('../lib/interior-memory-tool');

const LIVE_SOURCE_TYPE = new Set([
  'conversation', 'user_direct_statement', 'assistant_response', 'reflection',
  'decision', 'system_event', 'email', 'manual_admin', 'imported_memory',
]);
const LIVE_PROVENANCE = new Set([
  'USER_STATED', 'VERIFIED_FACT', 'INFERRED', 'GENERATED', 'SYSTEM_EVENT',
  'ADMIN_APPROVED', 'splendor_conversation',
]);
const LIVE_MEMORY_TYPE = new Set([
  'user_fact', 'user_preference', 'user_goal', 'project_context', 'shared_history',
  'splendor_identity', 'splendor_reflection', 'binding_rule', 'relationship_context',
  'technical_context', 'task_context', 'correction', 'insight',
]);
const INTERIOR_TYPES = ['open_question', 'developed_position', 'self_reflection', 'noticed_pattern'];

// Mock db that captures the memory_items insert payload.
function captureDb(onInsert) {
  return {
    from(table) {
      return {
        insert: (p) => { if (table === 'memory_items') onInsert(p); return Promise.resolve({ error: null }); },
        select() { const c = { eq: () => c, neq: () => c, order: () => c, limit: async () => ({ data: [], error: null }) }; return c; },
      };
    },
  };
}

test('every interior type produces a live-valid memory_items payload', async () => {
  for (const type of INTERIOR_TYPES) {
    let payload = null;
    const result = await executeStoreInteriorMemory(
      { type, content: 'a stored interior thought', confidence: 0.7 },
      'user-123',
      { db: captureDb(p => { payload = p; }) });

    assert.ok(payload, `${type}: insert attempted`);
    assert.ok(LIVE_SOURCE_TYPE.has(payload.source_type), `${type}: source_type "${payload.source_type}" is live-valid`);
    assert.ok(LIVE_PROVENANCE.has(payload.provenance), `${type}: provenance "${payload.provenance}" is live-valid`);
    assert.ok(LIVE_MEMORY_TYPE.has(payload.memory_type), `${type}: memory_type "${payload.memory_type}" is live-valid`);

    // The old invalid values must be gone.
    assert.notEqual(payload.source_type, 'ai_generated', `${type}: must not use invalid source_type`);
    assert.ok(!INTERIOR_TYPES.includes(payload.memory_type), `${type}: must not store the raw interior type as memory_type`);

    // The original interior type is preserved for retrieval/semantics.
    assert.equal(payload.source_metadata.interior_type, type);
    assert.equal(payload.source_metadata.origin, 'interior_memory_tool');

    // Behavior preserved.
    assert.match(result, /^Stored as /);
  }
});

test('specific memory_type mappings', async () => {
  const grab = async (type) => {
    let p = null;
    await executeStoreInteriorMemory({ type, content: 'c', confidence: 0.7 }, 'u', { db: captureDb(x => { p = x; }) });
    return p.memory_type;
  };
  assert.equal(await grab('noticed_pattern'), 'insight');
  assert.equal(await grab('self_reflection'), 'splendor_reflection');
  assert.equal(await grab('developed_position'), 'splendor_reflection');
  assert.equal(await grab('open_question'), 'splendor_reflection');
});
