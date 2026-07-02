'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Cognitive Archaeology Engine

  Append-only event log per belief. Tracks how Splendor's reasoning evolves:
  creation → challenge → survival/supersession → confidence revision → archive.

  Not memory retrieval — archaeology. The question isn't "what does she know?"
  but "how did she come to know it, and what did she have to abandon along the way?"

  All writes are fire-and-forget — never block the calling path.
  All reads are best-effort — errors return empty results.

  Event types:
    created          — belief first formed (conversation, reflection, or tool)
    challenged       — another belief/user input tested this one
    survived         — withstood a challenge without being superseded
    superseded       — retired because a stronger position replaced it
    confidence_revised — confidence updated up or down
    archived         — administratively retired (housekeeping, age-out)
*/

const { createClient } = require('@supabase/supabase-js');

let _db = null;
function db() {
  if (!_db && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _db;
}

/**
 * Append one event to belief_events. Fire-and-forget safe — swallows all errors.
 *
 * @param {string} beliefId   — UUID of the memory_item this event concerns
 * @param {string} userId     — UUID of the owning user
 * @param {'created'|'challenged'|'survived'|'superseded'|'confidence_revised'|'archived'} eventType
 * @param {object} [opts]
 * @param {number} [opts.priorConfidence]
 * @param {number} [opts.newConfidence]
 * @param {object} [opts.data]  — stored in event_data
 */
// Returns a structured status { ok, error, code } so callers can SURFACE a real
// belief-write failure (the insert error was previously unchecked, so a DB-level
// failure resolved as if it succeeded). Still best-effort: never throws.
async function logBeliefEvent(beliefId, userId, eventType, opts = {}) {
  if (!beliefId || !userId || !eventType) return { ok: false, error: 'missing args' };
  const client = db();
  if (!client) return { ok: false, error: 'no db client' };

  try {
    const { priorConfidence, newConfidence, data: extra = {} } = opts;
    const { error } = await client.from('belief_events').insert({
      belief_id:        beliefId,
      user_id:          userId,
      event_type:       eventType,
      prior_confidence: typeof priorConfidence === 'number' ? priorConfidence : null,
      new_confidence:   typeof newConfidence   === 'number' ? newConfidence   : null,
      event_data:       extra,
    });
    if (error) {
      console.warn('[belief-archaeology] logBeliefEvent insert error (non-fatal):', error.message);
      return { ok: false, error: error.message, code: error.code || null };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[belief-archaeology] logBeliefEvent failed (non-fatal):', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * All events for a single belief, chronological.
 */
async function getBeliefTimeline(beliefId) {
  const client = db();
  if (!client || !beliefId) return [];
  try {
    const { data, error } = await client
      .from('belief_events')
      .select('*')
      .eq('belief_id', beliefId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[belief-archaeology] getBeliefTimeline failed:', err.message);
    return [];
  }
}

/**
 * Beliefs that have survived at least one challenge (most survived first).
 * Excludes beliefs that were eventually superseded.
 */
async function getSurvivorBeliefs(userId, limit = 10) {
  const client = db();
  if (!client || !userId) return [];
  try {
    const { data, error } = await client
      .from('belief_events')
      .select('belief_id, event_type, created_at')
      .eq('user_id', userId)
      .in('event_type', ['survived', 'challenged', 'created', 'superseded'])
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;

    const counts = {};
    for (const row of (data || [])) {
      if (!counts[row.belief_id]) {
        counts[row.belief_id] = { survived: 0, challenged: 0, superseded: 0, created_at: null };
      }
      if (row.event_type === 'survived')   counts[row.belief_id].survived++;
      if (row.event_type === 'challenged') counts[row.belief_id].challenged++;
      if (row.event_type === 'superseded') counts[row.belief_id].superseded++;
      if (row.event_type === 'created' && !counts[row.belief_id].created_at) {
        counts[row.belief_id].created_at = row.created_at;
      }
    }

    const survivors = Object.entries(counts)
      .filter(([, c]) => c.survived > 0 && c.superseded === 0)
      .sort(([, a], [, b]) => b.survived - a.survived)
      .slice(0, limit);

    if (!survivors.length) return [];

    const ids = survivors.map(([id]) => id);
    const { data: items } = await client
      .from('memory_items')
      .select('id, content, memory_type, confidence, created_at, active')
      .in('id', ids);

    const itemMap = {};
    for (const item of (items || [])) itemMap[item.id] = item;

    return survivors
      .map(([id, c]) => ({
        belief_id:       id,
        survived_count:  c.survived,
        challenged_count: c.challenged,
        event_created_at: c.created_at,
        ...(itemMap[id] || {}),
      }))
      .filter(r => r.content);
  } catch (err) {
    console.warn('[belief-archaeology] getSurvivorBeliefs failed:', err.message);
    return [];
  }
}

/**
 * Beliefs that were superseded or archived, most recent first.
 */
async function getAbandonedBeliefs(userId, limit = 10) {
  const client = db();
  if (!client || !userId) return [];
  try {
    const { data, error } = await client
      .from('belief_events')
      .select('belief_id, event_type, prior_confidence, new_confidence, event_data, created_at')
      .eq('user_id', userId)
      .in('event_type', ['superseded', 'archived'])
      .order('created_at', { ascending: false })
      .limit(limit * 2);
    if (error) throw error;

    if (!data || !data.length) return [];

    const seen = new Set();
    const unique = [];
    for (const row of data) {
      if (!seen.has(row.belief_id)) {
        seen.add(row.belief_id);
        unique.push(row);
      }
    }

    const ids = unique.slice(0, limit).map(r => r.belief_id);
    const { data: items } = await client
      .from('memory_items')
      .select('id, content, memory_type, confidence, created_at')
      .in('id', ids);

    const itemMap = {};
    for (const item of (items || [])) itemMap[item.id] = item;

    return unique.slice(0, limit)
      .map(ev => ({
        ...ev,
        ...(itemMap[ev.belief_id] || {}),
        belief_id:    ev.belief_id,
        abandoned_at: ev.created_at,
        abandon_type: ev.event_type,
      }))
      .filter(r => r.content);
  } catch (err) {
    console.warn('[belief-archaeology] getAbandonedBeliefs failed:', err.message);
    return [];
  }
}

/**
 * Active beliefs that have never been challenged — oldest first.
 * These are Splendor's untested assumptions.
 */
async function getOldestUntested(userId, limit = 10) {
  const client = db();
  if (!client || !userId) return [];
  try {
    const { data: challenged } = await client
      .from('belief_events')
      .select('belief_id')
      .eq('user_id', userId)
      .eq('event_type', 'challenged');

    const challengedIds = new Set((challenged || []).map(r => r.belief_id));

    const { data: created, error } = await client
      .from('belief_events')
      .select('belief_id, created_at')
      .eq('user_id', userId)
      .eq('event_type', 'created')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;

    const untestedIds = (created || [])
      .filter(r => !challengedIds.has(r.belief_id))
      .map(r => r.belief_id)
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, limit * 2);

    if (!untestedIds.length) return [];

    const { data: items } = await client
      .from('memory_items')
      .select('id, content, memory_type, confidence, created_at, active')
      .in('id', untestedIds)
      .eq('active', true);

    return (items || []).slice(0, limit);
  } catch (err) {
    console.warn('[belief-archaeology] getOldestUntested failed:', err.message);
    return [];
  }
}

/**
 * High-level event counts for the archaeology dashboard.
 */
async function getArchaeologySummary(userId) {
  const client = db();
  if (!client || !userId) return null;
  try {
    const { data, error } = await client
      .from('belief_events')
      .select('event_type')
      .eq('user_id', userId);
    if (error) throw error;

    const counts = {
      created: 0, challenged: 0, survived: 0,
      superseded: 0, confidence_revised: 0, archived: 0,
    };
    for (const row of (data || [])) {
      if (row.event_type in counts) counts[row.event_type]++;
    }
    counts.total_events = (data || []).length;
    counts.survival_rate = (counts.survived + counts.superseded) > 0
      ? Math.round((counts.survived / (counts.survived + counts.superseded)) * 100)
      : null;

    return counts;
  } catch (err) {
    console.warn('[belief-archaeology] getArchaeologySummary failed:', err.message);
    return null;
  }
}

module.exports = {
  logBeliefEvent,
  getBeliefTimeline,
  getSurvivorBeliefs,
  getAbandonedBeliefs,
  getOldestUntested,
  getArchaeologySummary,
};
