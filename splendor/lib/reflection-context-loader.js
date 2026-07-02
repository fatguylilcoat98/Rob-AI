'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Reflection Context Loader

  Fetches the most recent autonomous thoughts and formats them as a quiet
  background-awareness block for the system prompt. This is the missing
  link in the pipeline Splendor described:

    conversation → extraction → reflection → [this module] → system prompt

  Before this existed, autonomous thoughts were stored in autonomous_thoughts
  but never read back into conversation context. They are now.

  Design rules:
  - Best-effort: any failure returns '' and never blocks the chat turn.
  - Read-only: no writes, no side effects.
  - Bounded: MAX_THOUGHTS and LOOKBACK_HOURS prevent the prompt from growing
    unbounded as the thought store fills up.
  - Quiet: the block is framed as background awareness, not a report to deliver.
    Splendor should use these thoughts naturally or not at all.
*/

const MAX_THOUGHTS   = 3;
const LOOKBACK_HOURS = 48;

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

/**
 * Returns a formatted block of recent autonomous thoughts for injection
 * into the system prompt, or '' if none are available.
 *
 * Never throws.
 */
async function loadRecentReflectionContext() {
  try {
    const supa = safeRequireSupabase();
    const db = supa && supa.supabase;
    if (!db) return '';

    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

    const { data: thoughts, error } = await db
      .from('autonomous_thoughts')
      .select('thought_content, thought_type, confidence_level, tags, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_THOUGHTS);

    if (error || !thoughts || thoughts.length === 0) return '';

    const lines = thoughts.map(t => {
      const domainTag = Array.isArray(t.tags)
        ? t.tags.find(tag => typeof tag === 'string' && tag.startsWith('domain:'))
        : null;
      const domain = domainTag
        ? domainTag.replace('domain:', '')
        : (t.thought_type || 'reflection');
      const conf = typeof t.confidence_level === 'number'
        ? ` (confidence ${t.confidence_level}/10)`
        : '';
      // Truncate very long thoughts to keep the prompt bounded
      const content = (t.thought_content || '').slice(0, 400);
      return `[${domain}${conf}] ${content}`;
    });

    return '\n\n--- AUTONOMOUS REFLECTIONS (last 48h) ---\n' +
      'Thoughts you generated between conversations. Part of your continuous awareness — ' +
      'not a report to deliver, just context you carry. Use naturally if relevant or not at all.\n' +
      lines.join('\n') +
      '\n--- END REFLECTIONS ---';

  } catch (_) {
    return '';
  }
}

module.exports = { loadRecentReflectionContext };
