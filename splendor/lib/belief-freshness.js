'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Belief Freshness Tracker

  Identifies active beliefs about Chris that were formed more than STALE_DAYS
  ago and have not been contradicted or superseded. Surfaces them as a quiet
  stale-flag block in the system prompt so Splendor knows to hedge when using
  old information rather than presenting it as current fact.

  This addresses the gap Splendor named directly:
  "If something's been updated but the belief store hasn't caught up, I'd be
  operating on a stale map."

  Design rules:
  - Best-effort: any failure returns '' and never blocks the chat turn.
  - Read-only: no writes, no side effects.
  - Bounded: MAX_STALE prevents the block from dominating the prompt.
  - Honest: the block doesn't delete the beliefs — it labels them as
    'last known' so Splendor can use them with appropriate hedging.
*/

const STALE_DAYS = 60;
const MAX_STALE  = 6;

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

/**
 * Returns a formatted stale-belief warning block for injection into the
 * system prompt, or '' if no stale beliefs exist for this user.
 *
 * @param {string} userId  - owner UUID
 * Never throws.
 */
async function loadStaleBeliefContext(userId) {
  if (!userId) return '';

  try {
    const supa = safeRequireSupabase();
    const db = supa && supa.supabase;
    if (!db) return '';

    const staleThreshold = new Date(
      Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: stale, error } = await db
      .from('interpretations')
      .select('belief, confidence, formed_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .lt('formed_at', staleThreshold)
      .order('formed_at', { ascending: true })
      .limit(MAX_STALE);

    if (error || !stale || stale.length === 0) return '';

    const lines = stale.map(s => {
      const daysAgo = Math.round(
        (Date.now() - new Date(s.formed_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const conf = typeof s.confidence === 'number'
        ? ` (${(s.confidence * 100).toFixed(0)}% confidence)`
        : '';
      return `- "${s.belief}"${conf} — formed ${daysAgo} days ago`;
    });

    return '\n\n[BELIEF MAP — POTENTIALLY STALE]\n' +
      `The following active beliefs about Chris were formed more than ${STALE_DAYS} days ago. ` +
      'They have not been contradicted or superseded, but may no longer reflect his current state. ' +
      'Treat as "last known" rather than current fact. If the topic arises, verify before assuming:\n' +
      lines.join('\n') +
      '\n[END STALE BELIEFS]';

  } catch (_) {
    return '';
  }
}

module.exports = { loadStaleBeliefContext, STALE_DAYS };
