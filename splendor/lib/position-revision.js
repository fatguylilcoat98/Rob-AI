'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Position Revision — Q2

  When a new developed_position memory is saved, checks whether it
  conflicts with existing positions and retires any that it supersedes.

  Without this, contradictory positions accumulate. Splendor could hold
  "I think X" and "I think not-X" simultaneously with no reconciliation.

  Two-stage approach:
  1. Keyword overlap — cheap, no LLM. Finds candidates worth checking.
  2. LLM determination (Claude Haiku) — only for overlapping candidates.
     Asks: do these conflict, and does the new supersede the old?

  Best-effort. Any error is swallowed. Never blocks memory storage.
*/

const Anthropic = require('@anthropic-ai/sdk');

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','is','are','was','were','have','has','had','do','does','did','i',
  'you','he','she','it','we','they','my','your','his','its','our','their',
  'this','that','what','how','when','where','why','who','which','think',
  'feel','believe','not','no','just','very','really','also','would','could',
]);

function extractWords(text) {
  if (!text) return [];
  return [
    ...new Set(
      text.toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 4 && !STOP_WORDS.has(w))
    )
  ];
}

function keywordOverlap(a, b) {
  const wordsA = new Set(extractWords(a));
  const wordsB = extractWords(b);
  return wordsB.filter(w => wordsA.has(w)).length;
}

/**
 * Check a newly saved developed_position against existing ones.
 * Retires any that the new position supersedes.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} userId
 * @param {string} newContent  — content of the new position
 * @param {string} newId       — UUID of the new memory_item (excluded from check)
 */
async function checkPositionConflict(db, userId, newContent, newId) {
  if (!db || !userId || !newContent) return;

  try {
    // 1. Fetch existing developed_positions for this user
    const { data: existing, error } = await db
      .from('memory_items')
      .select('id, content, confidence')
      .eq('user_id', userId)
      .eq('memory_type', 'developed_position')
      .eq('active', true)
      .neq('id', newId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !existing || existing.length === 0) return;

    // 2. Keyword overlap filter — only check candidates with 2+ shared words
    const candidates = existing.filter(p =>
      keywordOverlap(newContent, p.content) >= 2
    );

    if (candidates.length === 0) return;

    // 3. LLM check for each candidate (Haiku — fast, cheap)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let archaeology;
    try { archaeology = require('./belief-archaeology'); } catch (_) {}

    for (const candidate of candidates.slice(0, 3)) {
      try {
        // Archaeology: this candidate is being tested against a new position
        if (archaeology) {
          archaeology.logBeliefEvent(candidate.id, userId, 'challenged', {
            priorConfidence: candidate.confidence,
            data: { challenger_id: newId },
          }).catch(() => {});
        }

        const res = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 80,
          messages: [{
            role: 'user',
            content:
              `Two positions an AI holds:\n` +
              `OLD: "${candidate.content.slice(0, 300)}"\n` +
              `NEW: "${newContent.slice(0, 300)}"\n` +
              `Do these conflict on the same topic, and does NEW supersede OLD?\n` +
              `JSON only, no other text: {"conflict":boolean,"supersedes":boolean}`,
          }],
        });

        const text = (res.content[0].text || '').trim();
        // Extract JSON even if there's surrounding whitespace or markdown
        const match = text.match(/\{[^}]+\}/);
        if (!match) continue;
        const result = JSON.parse(match[0]);

        if (result.conflict && result.supersedes) {
          // Encode supersession in provenance — auditable contradiction graph
          // without a schema change: "superseded_by:<newId>:<ISO>"
          await db
            .from('memory_items')
            .update({
              active: false,
              updated_at: new Date().toISOString(),
              provenance: `superseded_by:${newId}:${new Date().toISOString()}`,
            })
            .eq('id', candidate.id);
          console.log(
            `[position-revision] Retired superseded position ${candidate.id} ` +
            `(superseded_by ${newId}): "${candidate.content.slice(0, 60)}..."`
          );
          // Archaeology: old belief was superseded
          if (archaeology) {
            archaeology.logBeliefEvent(candidate.id, userId, 'superseded', {
              priorConfidence: candidate.confidence,
              data: { superseded_by: newId },
            }).catch(() => {});
          }
        } else {
          // The old position held — it survived this challenge
          if (archaeology) {
            archaeology.logBeliefEvent(candidate.id, userId, 'survived', {
              priorConfidence: candidate.confidence,
              data: { challenged_by: newId, conflict: result.conflict },
            }).catch(() => {});
          }
        }
      } catch (_) { /* best-effort per candidate */ }
    }
    return { ok: true };
  } catch (err) {
    // Return a failure status so the caller can surface it (was: warn-and-resolve).
    // Best-effort: never throws. Per-candidate internal write swallows remain
    // (separate audit batch).
    console.warn('[position-revision] Check failed (non-fatal):', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { checkPositionConflict };
