'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Challenge Event Injector

  Lets the owner push back on Splendor: submit a correction, a "that call
  didn't land", or a "you got this wrong." The challenge is:
    1. Persisted in challenge_events for an audit trail.
    2. Injected into memory_items as a high-importance 'challenge' memory so
       Splendor sees it in her next reflection cycle without any delay.

  The memory injection is synchronous within this call — the challenge is
  visible to the next cycle immediately after this function returns.
*/

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

/**
 * Submit a challenge event and inject it into Splendor's memory window.
 *
 * @param {object} opts
 * @param {string}  opts.challengeText         - The correction or pushback
 * @param {number}  [opts.referencedThoughtId] - autonomous_thoughts.id being challenged (bigint)
 * @param {string}  [opts.referencedMemoryId]  - memory_items.id being challenged (UUID)
 * @param {string}  [opts.userId]              - owner UUID
 * @returns {{ ok: boolean, challengeId?: string, memoryItemId?: string, error?: string }}
 */
async function submitChallenge({ challengeText, referencedThoughtId, referencedMemoryId, userId }) {
  if (!challengeText || !challengeText.trim()) {
    return { ok: false, error: 'challenge_text is required' };
  }

  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return { ok: false, error: 'db_unavailable' };

  // 1. Inject into memory_items so the next scan cycle sees it immediately
  const memoryContent = `CHALLENGE RECEIVED: ${challengeText.trim()}`;

  const { data: memItem, error: memErr } = await db
    .from('memory_items')
    .insert([{
      user_id:             userId || null,
      memory_type:         'challenge',
      source_type:         'owner_feedback',
      content:             memoryContent,
      summary:             challengeText.trim().slice(0, 200),
      confidence:          1.0,
      importance:          0.92,
      approval_status:     'approved',
      trust_level:         'high',
      retrieval_allowed:   true,
      may_influence_behavior: true,
      may_be_quoted:       false,
      active:              true,
      provenance:          'challenge_event',
    }])
    .select('id')
    .single();

  if (memErr) {
    console.error('[CHALLENGE-INJECTOR] memory_items insert failed:', memErr.message);
    return { ok: false, error: memErr.message };
  }

  const memoryItemId = memItem?.id || null;

  // 2. Persist the challenge event record
  const { data: challengeRow, error: chalErr } = await db
    .from('challenge_events')
    .insert([{
      user_id:               userId || null,
      submitted_by:          'owner',
      challenge_text:        challengeText.trim(),
      referenced_thought_id: referencedThoughtId || null,
      referenced_memory_id:  referencedMemoryId  || null,
      memory_item_id:        memoryItemId,
    }])
    .select('id')
    .single();

  if (chalErr) {
    console.warn('[CHALLENGE-INJECTOR] challenge_events insert failed (memory already injected):', chalErr.message);
    return { ok: true, memoryItemId, challengeId: null };
  }

  console.log(`[CHALLENGE-INJECTOR] Challenge injected → memory ${memoryItemId}, event ${challengeRow?.id}`);
  return { ok: true, challengeId: challengeRow?.id, memoryItemId };
}

/**
 * Get recent challenge events (for the owner dashboard or API).
 */
async function getRecentChallenges({ userId, limit = 30 } = {}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return [];

  let q = db
    .from('challenge_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (userId) q = q.eq('user_id', userId);

  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

module.exports = { submitChallenge, getRecentChallenges };
