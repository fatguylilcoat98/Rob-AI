/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Private Journal — write/read for Splendor's interiority

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// Splendor writes here freely during background consciousness cycles.
// Entries are NEVER surfaced to Chris automatically — readJournalEntries
// is owner-only and pull-based. She chooses what to share by quoting it
// herself in a message or email. Writes must never throw into a cycle.

const { createClient } = require('@supabase/supabase-js');

let supabase = null;
try {
  if (process.env.SUPABASE_URL) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    );
  }
} catch (e) {
  console.error('[JOURNAL] Supabase client init failed:', e.message);
}

/**
 * Write a private journal entry. Best-effort; never throws.
 * @returns {Promise<boolean>} true if persisted
 */
async function writeJournalEntry({
  userId,
  entry,
  entryType = 'reflection',
  cycleNumber = null,
  mood = null,
  energy = null,
  metadata = {}
}) {
  if (!supabase || !userId || !entry) return false;
  try {
    const { error } = await supabase.from('splendor_journal').insert({
      user_id: userId,
      entry: String(entry).slice(0, 20000),
      entry_type: entryType,
      cycle_number: cycleNumber,
      mood,
      energy,
      shared: false,
      metadata,
      created_at: new Date().toISOString()
    });
    if (error) throw error;
    console.log(`[JOURNAL] Private entry written (${entryType})`);
    return true;
  } catch (e) {
    console.error('[JOURNAL] write failed (non-fatal):', e.message);
    return false;
  }
}

/**
 * Read journal entries for the owner. Pull-based only.
 * @returns {Promise<Array>} entries, newest first
 */
async function readJournalEntries(userId, limit = 50) {
  if (!supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('splendor_journal')
      .select('id, entry, entry_type, cycle_number, mood, energy, shared, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200));
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('[JOURNAL] read failed:', e.message);
    return [];
  }
}

module.exports = { writeJournalEntry, readJournalEntries };
