'use strict';

/*
  Expression Event Log — Storage and Retrieval

  logExpressionEvent   — append-only write to expression_events table
  getExpressionEvents  — filtered list
  getExpressionEventById — single record
  getExpressionEventSummary — pattern summary (counts, top tags, trends)

  Governance: no delete function exposed. Append-only by design.
  Edits must preserve original data and add corrections as annotations.
*/

let _db = null;
function getDb() {
  if (!_db && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _db;
}

// Storage path convention (Supabase Storage bucket: expression-events)
function buildStoragePath(conversationId, eventId) {
  const folder = conversationId || 'unknown-conversation';
  return `expression-events/${folder}/${eventId}/`;
}

/**
 * Append a new expression event record.
 * @param {object} event
 * @returns {Promise<object|null>} stored record or null on error
 */
async function logExpressionEvent(event) {
  const db = getDb();
  if (!db) return null;

  const record = {
    user_id:             event.user_id || null,
    conversation_id:     event.conversation_id || null,
    message_id:          event.message_id || null,
    user_prompt:         (event.user_prompt || '').slice(0, 2000),
    assistant_response:  (event.assistant_response || '').slice(0, 4000),
    event_type:          event.event_type || 'other',
    trigger_category:    event.trigger_category || 'unknown',
    image_url:           event.image_url || null,
    image_storage_path:  event.image_storage_path || (
      event.conversation_id ? buildStoragePath(event.conversation_id, 'pending') : null
    ),
    image_prompt:        (event.image_prompt || '').slice(0, 1000) || null,
    image_caption:       (event.image_caption || '').slice(0, 2000) || null,
    spoken_narration:    (event.spoken_narration || '').slice(0, 2000) || null,
    confidence:          typeof event.confidence === 'number' ? event.confidence : 0.5,
    detected_reason:     event.detected_reason || null,
    tags:                Array.isArray(event.tags) ? event.tags : [],
    metadata:            (event.metadata && typeof event.metadata === 'object') ? event.metadata : {},
    audit_id:            event.audit_id || null,
  };

  try {
    const { data, error } = await db
      .from('expression_events')
      .insert(record)
      .select('id, created_at, event_type, trigger_category')
      .single();
    if (error) throw error;

    // Update storage path with actual event ID
    if (data && data.id && record.conversation_id) {
      const storagePath = buildStoragePath(record.conversation_id, data.id);
      await db
        .from('expression_events')
        .update({ image_storage_path: storagePath })
        .eq('id', data.id);
      data.image_storage_path = storagePath;
    }

    console.log(`[expression-events] logged ${data.id} type=${record.event_type} trigger=${record.trigger_category}`);
    return data;
  } catch (err) {
    console.error('[expression-events] log error:', err.message);
    return null;
  }
}

/**
 * Retrieve expression events with optional filters.
 * @param {{ userId, eventType, triggerCategory, artOnly, limit, since }} filters
 */
async function getExpressionEvents(filters = {}) {
  const db = getDb();
  if (!db) return [];

  try {
    const limit = Math.min(parseInt(filters.limit || '50', 10), 200);
    const since = filters.since || null;

    let query = db
      .from('expression_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters.userId)          query = query.eq('user_id', filters.userId);
    if (filters.eventType)       query = query.eq('event_type', filters.eventType);
    if (filters.triggerCategory) query = query.eq('trigger_category', filters.triggerCategory);
    if (filters.artOnly)         query = query.eq('event_type', 'art');
    if (since)                   query = query.gte('created_at', since);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[expression-events] getExpressionEvents error:', err.message);
    return [];
  }
}

/**
 * Retrieve a single expression event by ID.
 */
async function getExpressionEventById(id) {
  const db = getDb();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from('expression_events')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[expression-events] getById error:', err.message);
    return null;
  }
}

/**
 * Build a lightweight pattern summary from an array of expression events.
 * Pure — no I/O.
 */
function buildSummaryFromRecords(records) {
  if (!records || records.length === 0) {
    return {
      total_events:          0,
      art_events:            0,
      most_common_trigger:   null,
      most_common_event_type: null,
      top_tags:              [],
      recent_trend:          'No events recorded.',
      last_5_events:         [],
    };
  }

  const artEvents = records.filter(r => r.event_type === 'art').length;

  const triggerCounts = {};
  const typeCounts = {};
  const tagCounts = {};

  for (const r of records) {
    triggerCounts[r.trigger_category] = (triggerCounts[r.trigger_category] || 0) + 1;
    typeCounts[r.event_type]          = (typeCounts[r.event_type] || 0) + 1;
    (r.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  }

  const mostCommonTrigger   = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1])[0];
  const mostCommonEventType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  // Recent trend: describe pattern in plain language
  const triggerLabel = mostCommonTrigger ? mostCommonTrigger[0] : 'unknown';
  const typeLabel    = mostCommonEventType ? mostCommonEventType[0].replace(/_/g, ' ') : 'unknown';
  const recent_trend =
    `${records.length} expression event${records.length !== 1 ? 's' : ''} recorded. ` +
    `Most common trigger: ${triggerLabel}. ` +
    `Most common event type: ${typeLabel}. ` +
    (artEvents > 0
      ? `Artwork appears during questions about ${triggerLabel}.`
      : 'No art events in this period.');

  const last_5_events = records.slice(0, 5).map(r => ({
    id:              r.id,
    created_at:      r.created_at,
    event_type:      r.event_type,
    trigger_category: r.trigger_category,
    has_image:       !!r.image_url,
    confidence:      r.confidence,
  }));

  return {
    total_events:           records.length,
    art_events:             artEvents,
    most_common_trigger:    mostCommonTrigger ? mostCommonTrigger[0] : null,
    most_common_event_type: mostCommonEventType ? mostCommonEventType[0] : null,
    top_tags:               topTags,
    recent_trend,
    last_5_events,
  };
}

/**
 * Fetch and summarize expression events for a user.
 */
async function getExpressionEventSummary(userId, dayWindow = 30) {
  const since = new Date(Date.now() - dayWindow * 86400 * 1000).toISOString();
  const records = await getExpressionEvents({ userId, since, limit: 200 });
  return buildSummaryFromRecords(records);
}

module.exports = {
  logExpressionEvent,
  getExpressionEvents,
  getExpressionEventById,
  getExpressionEventSummary,
  buildSummaryFromRecords,
};
