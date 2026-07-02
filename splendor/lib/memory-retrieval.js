'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Dynamic Per-Turn Memory Retrieval

  Replaces the pre-load-everything approach (100 memories dumped at turn
  start) with targeted retrieval that mirrors how a brain works:

  1. LOAD-BEARING (always-on): high-importance items that are always present
     regardless of topic — challenge corrections, critical audit flags,
     foundational facts. Small set, maybe 10 items max.

  2. RELEVANT (per-turn): memories that match what is actually being talked
     about this turn. Extracted from the user's message via keyword matching.
     The rest stays quiet.

  3. INTERIOR (always-on): Splendor's own mind — her self-reflections,
     positions she has developed, open questions she is sitting with.
     These are hers, not about Chris. Always surfaced so she has access
     to her own interior before she responds.

  Everything else in the store stays quiet. Silence is not absence.
  It is waiting to be relevant.

  Design rules:
  - Three parallel DB queries, never sequential.
  - Best-effort: any query failure returns [] and never blocks the turn.
  - Deduplication: a load-bearing item that also matches the turn topic
    appears once (in load-bearing), not twice.
  - Bounded: total retrieval is capped so prompt growth is predictable.
*/

const LOAD_BEARING_THRESHOLD = 0.75;
const MAX_LOAD_BEARING = 10;
const MAX_RELEVANT     = 15;
const MAX_INTERIOR     = 6;

const INTERIOR_TYPES = [
  'self_reflection',
  'developed_position',
  'open_question',
  'noticed_pattern',
];

const CONTEXT_TYPES = [
  'user_fact',
  'interpretation',
  'shared_history',
  'user_preference',
];

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','have','has','had','do',
  'does','did','will','would','could','should','may','might','can','i',
  'you','he','she','it','we','they','me','him','her','us','them','my',
  'your','his','its','our','their','this','that','these','those','what',
  'how','when','where','why','who','which','just','like','up','about',
  'out','so','if','not','no','as','into','than','then','am','get','s',
  'im','its','also','just','really','very','even','still','already',
]);

function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !STOP_WORDS.has(w))
    )
  ].slice(0, 8);
}

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

function safeEnsureUUID(supa, userId) {
  try { return supa && supa.ensureUUID ? supa.ensureUUID(userId) : userId; } catch (_) { return userId; }
}

async function fetchLoadBearing(db, userId) {
  try {
    const { data, error } = await db
      .from('memory_items')
      .select('id, content, memory_type, importance, confidence, created_at, provenance, memory_layer, decay_status, verification_status')
      .eq('user_id', userId)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .neq('verification_status', 'CONTRADICTED')
      .gte('importance', LOAD_BEARING_THRESHOLD)
      .order('importance', { ascending: false })
      .limit(MAX_LOAD_BEARING);
    if (error) { console.warn('[memory-retrieval] fetchLoadBearing error:', error.message); return []; }
    return data || [];
  } catch (e) { console.warn('[memory-retrieval] fetchLoadBearing threw:', e.message); return []; }
}

async function fetchRelevant(db, userId, keywords) {
  if (!keywords.length) return [];
  try {
    const filters = keywords.map(kw => `content.ilike.%${kw}%`).join(',');
    const { data, error } = await db
      .from('memory_items')
      .select('id, content, memory_type, importance, confidence, created_at, provenance, memory_layer, decay_status, verification_status')
      .eq('user_id', userId)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .neq('verification_status', 'CONTRADICTED')
      .in('memory_type', CONTEXT_TYPES)
      .or(filters)
      .order('importance', { ascending: false })
      .limit(MAX_RELEVANT);
    if (error) { console.warn('[memory-retrieval] fetchRelevant error:', error.message); return []; }
    return data || [];
  } catch (e) { console.warn('[memory-retrieval] fetchRelevant threw:', e.message); return []; }
}

async function fetchInterior(db, userId) {
  try {
    const { data, error } = await db
      .from('memory_items')
      .select('id, content, memory_type, importance, confidence, created_at, provenance, memory_layer, decay_status, verification_status')
      .eq('user_id', userId)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .neq('verification_status', 'CONTRADICTED')
      .in('memory_type', INTERIOR_TYPES)
      .order('created_at', { ascending: false })
      .limit(MAX_INTERIOR);
    if (error) { console.warn('[memory-retrieval] fetchInterior error:', error.message); return []; }
    return data || [];
  } catch (e) { console.warn('[memory-retrieval] fetchInterior threw:', e.message); return []; }
}

/**
 * Retrieve the three focused memory sets for one conversation turn.
 *
 * Returns { loadBearing, relevant, interior } — each an array of memory rows.
 * Never throws.
 *
 * @param {string} userId
 * @param {string} userMessage
 */
async function retrieveTurnMemories(userId, userMessage) {
  if (!userId) return { loadBearing: [], relevant: [], interior: [] };

  try {
    const supa = safeRequireSupabase();
    const db = supa && supa.supabase;
    if (!db) return { loadBearing: [], relevant: [], interior: [] };

    // Normalise to the UUID form used when writing — real Supabase UUIDs pass
    // through unchanged; legacy string handles get hashed to the same UUID they
    // were written with. Mismatched forms are the silent killer of interior: 0.
    const uuid = safeEnsureUUID(supa, userId);

    const keywords = extractKeywords(userMessage || '');

    const [loadBearing, relevant, interior] = await Promise.all([
      fetchLoadBearing(db, uuid),
      fetchRelevant(db, uuid, keywords),
      fetchInterior(db, uuid),
    ]);

    // Deduplicate: load-bearing items should not repeat in relevant
    const loadBearingIds = new Set(loadBearing.map(m => m.id));
    const dedupedRelevant = relevant.filter(m => !loadBearingIds.has(m.id));

    return { loadBearing, relevant: dedupedRelevant, interior };
  } catch (_) {
    return { loadBearing: [], relevant: [], interior: [] };
  }
}

module.exports = { retrieveTurnMemories, extractKeywords };
