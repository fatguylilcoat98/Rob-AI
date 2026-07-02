/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back

  Backfill interactions table from memory_items.

  Usage:
    DAYS=30 node scripts/backfill-interactions.js
    (defaults to 30 days if DAYS is unset)

  Reads memory_items rows (approved, active) written in the look-back window
  and inserts them into interactions so continuity-shadow has historical data
  to reflect on. Rows already in interactions are skipped (the table has no
  unique constraint on content, so we skip by checking the date window already
  processed — this script is idempotent if run once per day-range).
*/

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY)) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY (or ANON_KEY) required.');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const DAYS = parseInt(process.env.DAYS || '30', 10);
const BATCH_SIZE = 100;

// memory_items uses memory_owner to distinguish 'chris' (user) vs 'splendor'
// (assistant). Map to the interactions speaker field.
function toSpeaker(owner) {
  if (!owner) return 'user';
  const o = String(owner).toLowerCase();
  if (o === 'splendor' || o === 'assistant') return 'assistant';
  return 'user';
}

async function run() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  console.log(`Backfilling interactions from memory_items since ${since} (${DAYS} days)`);

  // Find unique user_ids with memory_items in the window.
  const { data: userRows, error: userErr } = await supabase
    .from('memory_items')
    .select('user_id')
    .eq('active', true)
    .eq('approval_status', 'approved')
    .gte('created_at', since);

  if (userErr) {
    console.error('Failed to fetch user list:', userErr.message);
    process.exit(1);
  }

  const userIds = [...new Set((userRows || []).map(r => r.user_id))];
  console.log(`Found ${userIds.length} user(s) with memories in window`);

  let total = 0;
  let skipped = 0;

  for (const userId of userIds) {
    console.log(`\nProcessing user: ${userId}`);

    // What's already in interactions for this user in the window?
    const { data: existing } = await supabase
      .from('interactions')
      .select('content')
      .eq('user_id', userId)
      .gte('timestamp', since);

    const existingSet = new Set((existing || []).map(r => r.content));

    let offset = 0;
    while (true) {
      const { data: memories, error: memErr } = await supabase
        .from('memory_items')
        .select('user_id, content, memory_owner, created_at')
        .eq('user_id', userId)
        .eq('active', true)
        .eq('approval_status', 'approved')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (memErr) {
        console.error(`  Fetch error at offset ${offset}:`, memErr.message);
        break;
      }
      if (!memories || memories.length === 0) break;

      const toInsert = memories
        .filter(m => m.content && !existingSet.has(m.content))
        .map(m => ({
          user_id: m.user_id,
          speaker: toSpeaker(m.memory_owner),
          content: m.content,
          timestamp: m.created_at,
          source_type: 'memory',
          processed_for_reflection: false
        }));

      skipped += (memories.length - toInsert.length);

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase
          .from('interactions')
          .insert(toInsert);
        if (insErr) {
          console.error(`  Insert error at offset ${offset}:`, insErr.message);
        } else {
          total += toInsert.length;
          console.log(`  Inserted ${toInsert.length} rows (offset ${offset})`);
        }
      }

      if (memories.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }
  }

  console.log(`\nDone. Inserted ${total} rows, skipped ${skipped} duplicates.`);
}

run().catch(e => {
  console.error('Backfill failed:', e.message);
  process.exit(1);
});
