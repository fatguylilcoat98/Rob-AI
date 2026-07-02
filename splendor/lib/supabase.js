/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { activityBus } = require('./activity-bus');

// Graceful degradation: a missing env var should not hard-crash the
// entire server before the health check can respond. Fall back to a
// stub client whose calls return harmless errors that the route-level
// try/catch already handles.
let supabase;
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('[supabase] Missing SUPABASE_URL / SUPABASE_ANON_KEY — using stub client (DB calls will return errors).');
  const stubError = { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' };
  const stubBuilder = {
    select: () => stubBuilder, insert: () => stubBuilder, update: () => stubBuilder,
    delete: () => stubBuilder, upsert: () => stubBuilder, eq: () => stubBuilder,
    in: () => stubBuilder, order: () => stubBuilder, limit: () => stubBuilder,
    gte: () => stubBuilder, lte: () => stubBuilder, lt: () => stubBuilder,
    gt: () => stubBuilder, single: async () => ({ data: null, error: stubError }),
    maybeSingle: async () => ({ data: null, error: stubError }),
    then: (resolve) => resolve({ data: null, error: stubError })
  };
  supabase = {
    from: () => stubBuilder,
    auth: { getUser: async () => ({ data: { user: null }, error: stubError }) }
  };
} else {
  // Use service key for memory operations to bypass RLS
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  supabase = createClient(process.env.SUPABASE_URL, serviceKey);
}

// Convert string user ID to UUID format for database
// NOTE: stringToUUID gracefully handles null/undefined so it never throws
// synchronously during a route call (the audit found this was a 500 vector).
function stringToUUID(str) {
  if (str === null || str === undefined) str = 'anonymous';
  if (typeof str !== 'string') str = String(str);
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32)
  ].join('-');
}

// Idempotent UUID coercion. A real UUID passes through unchanged so an
// already-valid auth UUID is never md5-hashed into a phantom UUID. Legacy
// non-UUID handles ("default-user", etc.) still get hashed for back-compat.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ensureUUID(id) {
  if (typeof id === 'string' && UUID_RE.test(id)) return id;
  return stringToUUID(id);
}

// Memory management functions
//
// Privacy boundary: memories are filtered by user_id and active status
// Each user only sees their own memories through the enhanced memory system
const ALLOWED_CATEGORIES = ['user.general', 'user.preferences', 'system.events'];

// Allowlist of memory_type values that surface to the LLM. Mirrors the
// FACT_TYPES set in lib/enhanced-memory-integration.js getSimpleMemoryContext
// so Splendor's recall surface is identical between text chat and Converse
// session-start. Update both call sites when this changes.
const RETRIEVABLE_MEMORY_TYPES = [
  'user_fact',
  'interpretation',
  'shared_history',
  'user_preference',
  // Splendor's interior — her own accumulated mind
  'self_reflection',
  'developed_position',
  'open_question',
  'noticed_pattern',
];

const getMemoriesForUser = async (userId, limit = 10) => {
  try {
    const uuid = ensureUUID(userId);
    const { data, error } = await supabase
      .from('memory_items')
      .select('content, memory_type, created_at, category, importance, confidence')
      .eq('user_id', uuid)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .in('memory_type', RETRIEVABLE_MEMORY_TYPES)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    try { activityBus.emit('memory:read', { count: (data || []).length }); } catch (_) {}
    return data || [];
  } catch (error) {
    console.error('Error fetching memories:', error);
    return [];
  }
};

const storeMemory = async (userId, content, memoryType = 'user_fact', category = 'user.general', sourceContext = {}) => {
  try {
    const uuid = ensureUUID(userId);
    const validCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'user.general';

    const timestamp = new Date().toISOString();
    const memoryId = require('crypto').randomUUID();

    /* Determine provenance value based on source type */
    let provenance = 'splendor_conversation';
    if (sourceContext.provenance) {
      provenance = sourceContext.provenance;
    } else {
      const sourceType = sourceContext.source_type || 'conversation';
      if (sourceType === 'user_direct_statement') {
        provenance = 'USER_STATED';
      } else if (sourceType === 'external_search' || sourceType === 'web_search') {
        provenance = 'VERIFIED_FACT';
      } else if (sourceType === 'system_event' || sourceType === 'system') {
        provenance = 'SYSTEM_EVENT';
      } else if (sourceType === 'generated' || sourceType === 'ai_generated') {
        provenance = 'GENERATED';
      } else {
        provenance = 'splendor_conversation';
      }
    }

    // Build traceable memory object
    const memoryData = {
      id: memoryId,
      user_id: uuid,
      owner: 'splendor',
      content: content.trim(),
      memory_type: memoryType,
      category: validCategory,
      source_type: sourceContext.source_type || 'conversation',
      source_id: sourceContext.source_id || memoryId,
      source_metadata: {
        timestamp: timestamp,
        session_id: sourceContext.session_id,
        conversation_turn: sourceContext.conversation_turn,
        user_message_id: sourceContext.user_message_id,
        assistant_response_id: sourceContext.assistant_response_id,
        extraction_method: sourceContext.extraction_method || 'automatic',
        confidence_source: sourceContext.confidence_source || 'inference'
      },
      provenance: provenance,
      confidence: sourceContext.confidence || 0.8,
      importance: sourceContext.importance || 0.5,
      active: true,
      // Reflection Quarantine: a self-generated reflection is stored as a
      // candidate, NOT as approved truth. Every retrieval path filters
      // approval_status === 'approved', so a quarantined row is
      // inherently non-retrievable until it is explicitly reviewed and
      // approved. This is what stops mythology from becoming memory.
      approval_status: sourceContext.quarantine ? 'pending_review' : 'approved',
      created_at: timestamp,
      expires_at: sourceContext.expires_at || null, // For time-sensitive memories
      lineage: {
        created_by: 'splendor',
        creation_reason: sourceContext.creation_reason || 'user_interaction',
        validation_status: sourceContext.quarantine ? 'quarantined_reflection_candidate' : 'pending_claspion'
      }
    };

    const { data, error } = await supabase
      .from('memory_items')
      .insert([memoryData])
      .select();

    if (error) throw error;

    // Log memory creation for audit trail
    console.log(`[MEMORY] Stored traceable memory ${memoryId} for user ${userId} - source: ${memoryData.source_type}`);

    try {
      activityBus.emit('memory:write', {
        memory_type: memoryType,
        category: validCategory,
        source_type: memoryData.source_type,
        provenance,
      });
    } catch (_) {}

    return data?.[0];
  } catch (error) {
    console.error('Error storing memory:', error);
    return null;
  }
};

const logConversation = async (userId, role, content) => {
  try {
    const uuid = ensureUUID(userId);
    const { data, error } = await supabase
      .from('conversations')
      .insert([{
        user_id: uuid,
        role,
        content: content.trim()
      }]);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error logging conversation:', error);
    return null;
  }
};

// User verification
const verifyUser = async (token) => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    return user;
  } catch (error) {
    console.error('Error verifying user:', error);
    return null;
  }
};

module.exports = {
  supabase,
  getMemoriesForUser,
  storeMemory,
  logConversation,
  verifyUser,
  stringToUUID,
  ensureUUID,
  ALLOWED_CATEGORIES
};