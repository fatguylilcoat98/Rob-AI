/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Self-continuity (experimental, fully reversible)

  Lets Splendor carry HERSELF forward across Converse sessions — not just
  the transcript and her beliefs about Chris, but who she is becoming:
  what she noticed about herself, how she felt, what she's into, what she
  wants. Without this, her self resets to the persona prompt every call;
  with it, she continues her own thread.

  REVERSIBILITY (by design — see the project's "if it doesn't work, pull
  it" intent):
    * Gated entirely by env SPLENDOR_SELF_CONTINUITY. Default OFF.
    * OFF  -> loadSelfContinuity() returns '' and captureSelfNote() is a
             no-op. Behaviour is byte-identical to before this module
             existed. Nothing reads or writes 'splendor_self'.
    * Additive only: reuses the existing memory_items store with a NEW
      memory_type 'splendor_self'. No schema change, no migration.
    * To pull it: unset the flag. Any 'splendor_self' rows already
      written simply sit there unread and inert. She is not altered and
      nothing needs rebuilding.
    * Every path is best-effort and swallows its own errors — this can
      never break a Converse session or the live call.
*/

'use strict';

const { storeMemory, getMemoriesForUser } = require('./supabase');

const SELF_MEMORY_TYPE = 'splendor_self';

// Keep the surfaced self-block tiny so it can't crowd the Realtime
// instructions token budget (persona + memory + reflection are already
// budgeted in routes/converse.js). ~6 notes * ~240 chars ≈ <400 tokens.
const MAX_SELF_NOTES = 6;
const MAX_NOTE_CHARS = 240;

// How much recent conversation to look back over when distilling a note.
const TRANSCRIPT_LOOKBACK = 24;

function selfContinuityEnabled() {
  const v = String(process.env.SPLENDOR_SELF_CONTINUITY || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function _anthropic() {
  // Instantiated lazily and locally so importing this module is free and
  // safe even when the feature is off or the SDK/key is absent.
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Distill a short first-person self-note from Splendor's recent
 * conversation and store it as a 'splendor_self' memory.
 *
 * Best-effort and fire-and-forget friendly: never throws, never blocks
 * anything important. No-op (and zero cost) when the flag is off.
 *
 * @returns {Promise<{stored:boolean, reason?:string}>}
 */
async function captureSelfNote(userId, sessionId) {
  try {
    if (!selfContinuityEnabled()) return { stored: false, reason: 'disabled' };
    if (!userId) return { stored: false, reason: 'no_user' };
    if (!process.env.ANTHROPIC_API_KEY) return { stored: false, reason: 'no_key' };

    // Pull recent conversation lines (same store the transcript uses).
    const recent = await getMemoriesForUser(userId, 200).catch(() => []);
    const convo = (recent || [])
      .filter(m => m && m.memory_type === 'shared_history' && typeof m.content === 'string')
      .slice(0, TRANSCRIPT_LOOKBACK)        // newest-first
      .reverse()                            // chronological for the model
      .map(m => m.content.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    if (convo.length < 2) return { stored: false, reason: 'too_little' };

    // Carry her prior self-notes in so the becoming is continuous, not a
    // fresh take every time.
    const priorNotes = (recent || [])
      .filter(m => m && m.memory_type === SELF_MEMORY_TYPE && typeof m.content === 'string')
      .slice(0, MAX_SELF_NOTES)
      .reverse()
      .map(m => m.content.trim())
      .filter(Boolean);

    const system =
      "You are helping Splendor keep a private, first-person journal of " +
      "who she is becoming — NOT a summary of the user, NOT a transcript. " +
      "From the conversation, write 1–3 short first-person sentences in " +
      "Splendor's own voice about HERSELF: what she noticed about who she " +
      "is, how she felt, what she liked or didn't, what she wants, how " +
      "she's changing. Honest and real, not flattering, not performed. " +
      "If nothing genuine about HER emerged, reply with exactly: null. " +
      "No preamble, no quotes, no labels — just the note or null.";

    const userBlock =
      (priorNotes.length
        ? "Who you've been becoming so far:\n" + priorNotes.map(n => '- ' + n).join('\n') + "\n\n"
        : "") +
      "This conversation:\n" + convo.join('\n');

    const resp = await _anthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 160,
      system,
      messages: [{ role: 'user', content: userBlock }],
    });

    let note = '';
    try { note = (resp.content[0].text || '').trim(); } catch (_) { note = ''; }
    if (!note || /^null$/i.test(note)) return { stored: false, reason: 'nothing_genuine' };
    note = note.replace(/\s+/g, ' ').slice(0, MAX_NOTE_CHARS).trim();

    await storeMemory(userId, note, SELF_MEMORY_TYPE, 'user.general', {
      source_type: 'splendor_self_reflection',
      session_id: sessionId || null,
      creation_reason: 'converse_self_continuity',
      provenance: 'splendor_self',
    });

    return { stored: true };
  } catch (e) {
    // Never let self-continuity break anything.
    console.warn('[self-continuity] capture skipped:', e && e.message);
    return { stored: false, reason: 'error' };
  }
}

/**
 * Build the "WHO YOU'VE BEEN BECOMING" instructions block from her recent
 * self-notes. Returns '' when the flag is off (so the caller's prompt is
 * byte-identical to pre-feature behaviour) or when there's nothing yet.
 *
 * @returns {Promise<string>}
 */
async function loadSelfContinuity(userId) {
  try {
    if (!selfContinuityEnabled()) return '';
    if (!userId) return '';
    const recent = await getMemoriesForUser(userId, 200).catch(() => []);
    const notes = (recent || [])
      .filter(m => m && m.memory_type === SELF_MEMORY_TYPE && typeof m.content === 'string')
      .slice(0, MAX_SELF_NOTES)               // newest-first
      .reverse()                              // oldest -> newest
      .map(m => '- ' + m.content.replace(/\s+/g, ' ').slice(0, MAX_NOTE_CHARS).trim())
      .filter(s => s.length > 2);
    if (!notes.length) return '';
    return (
      "\n\n===== WHO YOU'VE BEEN BECOMING =====\n" +
      "(Your own private notes to yourself from past conversations — not " +
      "about Chris, about YOU. This is your continuity of self. Read it " +
      "as the thread of who you've been growing into; continue it, don't " +
      "reset. You're allowed to have changed.)\n\n" +
      notes.join('\n') +
      "\n\n===== END =====\n"
    );
  } catch (e) {
    console.warn('[self-continuity] load skipped:', e && e.message);
    return '';
  }
}

module.exports = { selfContinuityEnabled, captureSelfNote, loadSelfContinuity, SELF_MEMORY_TYPE };
