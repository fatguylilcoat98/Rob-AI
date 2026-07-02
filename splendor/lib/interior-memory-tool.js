'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Interior Memory Tool

  Gives Splendor a deliberate write path from within conversations.
  Without this, she can describe wanting to remember something — but the
  description evaporates. With this, calling the tool actually persists it.

  The model calls store_interior_memory({ type, content, confidence }) when
  she decides something is worth keeping. The execution writes to memory_items
  immediately, so the artifact exists before the conversation ends.

  Design rules:
  - Capped at importance 0.74 so conversation-stored memories don't
    self-promote to load-bearing (0.75+) without a human challenge event.
  - Calls position-revision check when storing a developed_position so
    contradictory positions are retired at write time.
  - Best-effort: errors return a descriptive string (surfaced as tool_result)
    so the model can report what happened rather than silently failing.
*/

const TOOL_NAME = 'store_interior_memory';

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    'Persist something to your interior memory store. Call this when you decide ' +
    'something is worth keeping across conversations — a genuine open question you ' +
    'want to carry, a position you have formed and would defend, a self-reflection ' +
    'worth holding, or a pattern worth tracking. ' +
    'This writes directly to your persistent memory. It is not automatic — you choose ' +
    'when to call it. Do not call it for every insight. Call it when something is ' +
    'genuinely worth retrieving in a future conversation.',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['open_question', 'developed_position', 'self_reflection', 'noticed_pattern'],
        description:
          'open_question: something unresolved you want to carry forward · ' +
          'developed_position: a view you have formed and would defend · ' +
          'self_reflection: an honest observation about yourself · ' +
          'noticed_pattern: a pattern worth tracking over time',
      },
      content: {
        type: 'string',
        description:
          'Full content of the memory. Write it to stand alone — complete enough ' +
          'that retrieving it in a future conversation gives full context.',
      },
      confidence: {
        type: 'number',
        description: 'Your confidence 0.0–1.0. Affects retrieval weight.',
        minimum: 0,
        maximum: 1,
      },
    },
    required: ['type', 'content'],
  },
};

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

const TYPE_LABELS = {
  open_question:      'Open Question',
  developed_position: 'Developed Position',
  self_reflection:    'Self-Reflection',
  noticed_pattern:    'Noticed Pattern',
};

// memory_items.memory_type is constrained to a fixed live CHECK enum. The tool's
// interior types are NOT in it (they failed the constraint — every store errored).
// Map them onto the allowed enum, mirroring the H5 reflection mapping; the
// original interior type is preserved in source_metadata. (noticed_pattern reads
// as an insight; the rest are reflective.)
const INTERIOR_MEMORY_TYPE_MAP = {
  open_question:      'splendor_reflection',
  developed_position: 'splendor_reflection',
  self_reflection:    'splendor_reflection',
  noticed_pattern:    'insight',
};
function toValidMemoryType(interiorType) {
  return INTERIOR_MEMORY_TYPE_MAP[interiorType] || 'splendor_reflection';
}

// Structured diagnostic emitter for the interactive interior-memory write path.
// Failures go to console.error (visible/alertable), successes to console.log,
// both with a consistent [interior:ingest] prefix. Returns the record.
function logInteriorIngest(step, outcome, fields = {}) {
  const record = { step, outcome, ...fields };
  if (outcome === 'failure') {
    console.error('[interior:ingest]', record);
  } else {
    console.log('[interior:ingest]', record);
  }
  return record;
}

/**
 * Execute a store_interior_memory tool call.
 * @param {{ type: string, content: string, confidence?: number }} input
 * @param {string} userId
 * @returns {Promise<string>} result message for the tool_result block
 */
async function executeStoreInteriorMemory(input, userId, opts = {}) {
  const { type, content, confidence = 0.65 } = input || {};

  if (!userId)        return 'Error: no user context — memory not stored.';
  if (!content || !content.trim()) return 'Error: content is empty — memory not stored.';
  if (!TYPE_LABELS[type]) return `Error: unknown type "${type}" — memory not stored.`;

  try {
    const supa = safeRequireSupabase();
    const db = (opts && opts.db) || (supa && supa.supabase); // opts.db is a test seam
    if (!db) return 'Error: database unavailable — memory not stored.';

    const uuid = supa && supa.ensureUUID ? supa.ensureUUID(userId) : userId;
    const memId = require('crypto').randomUUID();
    const conf = typeof confidence === 'number' ? Math.min(Math.max(confidence, 0), 1) : 0.65;
    // Cap importance below load-bearing threshold — conversation writes don't
    // self-promote to load-bearing (0.75+) unless via a challenge event
    const imp = Math.min(conf, 0.74);

    // Map to live-schema-valid enum values; keep the original interior type in
    // source_metadata so the open_question/developed_position/etc. distinction
    // is not lost. provenance 'splendor_conversation' is already a valid enum.
    const validMemoryType = toValidMemoryType(type);
    const { error } = await db.from('memory_items').insert({
      id: memId,
      user_id: uuid,
      owner: 'splendor',
      content: content.trim().slice(0, 1000),
      memory_type: validMemoryType,
      category: 'user.general',
      source_type: 'assistant_response',
      source_id: memId,
      provenance: 'splendor_conversation',
      source_metadata: { origin: 'interior_memory_tool', interior_type: type },
      active: true,
      approval_status: 'approved',
      importance: imp,
      confidence: conf,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      // The store itself failed — this blocks the memory (returned as an error
      // tool_result). Surface it structurally before the throw, instead of only
      // the generic console.error in the outer catch.
      logInteriorIngest('memory_insert', 'failure', {
        memory_id: memId, user_id: uuid, memory_type: type, mapped_memory_type: validMemoryType,
        code: error.code, message: error.message, details: error.details, hint: error.hint,
        non_fatal: false, blocked: true,
      });
      throw error;
    }

    logInteriorIngest('memory_insert', 'success', {
      memory_id: memId, user_id: uuid, memory_type: type, mapped_memory_type: validMemoryType, non_fatal: false,
    });
    console.log(`[interior-memory-tool] Stored ${type} for ${userId}: "${content.slice(0, 60)}..."`);

    // Archaeology: record belief creation event (best-effort, non-blocking).
    // logBeliefEvent now returns { ok, error, code }; classify the diagnostic on
    // it so a real belief-write failure is surfaced instead of being swallowed.
    try {
      const { logBeliefEvent } = require('./belief-archaeology');
      logBeliefEvent(memId, uuid, 'created', {
        newConfidence: conf,
        data: { memory_type: type, provenance: 'splendor_conversation' },
      })
        .then(res => {
          const failed = res && res.ok === false;
          logInteriorIngest('belief_write', failed ? 'failure' : 'success', {
            memory_id: memId, belief_id: memId, user_id: uuid,
            ...(failed ? { code: res.code, message: res.error } : {}),
            non_fatal: true,
          });
        })
        .catch(err => logInteriorIngest('belief_write', 'failure', {
          memory_id: memId, belief_id: memId, user_id: uuid,
          code: err && err.code, message: err && err.message, non_fatal: true,
        }));
    } catch (requireErr) {
      logInteriorIngest('belief_write', 'failure', {
        memory_id: memId, user_id: uuid, message: requireErr.message, non_fatal: true,
      });
    }

    // For developed_position, check for and retire superseded positions
    // (best-effort, non-blocking). checkPositionConflict now returns { ok, error }.
    if (type === 'developed_position') {
      try {
        const { checkPositionConflict } = require('./position-revision');
        checkPositionConflict(db, uuid, content, memId)
          .then(res => {
            const failed = res && res.ok === false;
            logInteriorIngest('position_conflict', failed ? 'failure' : 'success', {
              memory_id: memId, user_id: uuid,
              ...(failed ? { message: res.error } : {}),
              non_fatal: true,
            });
          })
          .catch(err => logInteriorIngest('position_conflict', 'failure', {
            memory_id: memId, user_id: uuid,
            code: err && err.code, message: err && err.message, non_fatal: true,
          }));
      } catch (requireErr) {
        logInteriorIngest('position_conflict', 'failure', {
          memory_id: memId, user_id: uuid, message: requireErr.message, non_fatal: true,
        });
      }
    }

    const label = TYPE_LABELS[type];
    const preview = content.slice(0, 80) + (content.length > 80 ? '…' : '');
    return `Stored as ${label}: "${preview}"`;

  } catch (err) {
    console.error('[interior-memory-tool] Store failed:', err.message);
    return `Error storing memory: ${err.message}`;
  }
}

module.exports = { TOOL_DEFINITION, TOOL_NAME, executeStoreInteriorMemory, logInteriorIngest };
