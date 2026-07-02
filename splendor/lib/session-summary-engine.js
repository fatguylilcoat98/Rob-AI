/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back

  SESSION SUMMARY ENGINE — automated conversation summary → approval gate.

  Every consciousness deep-reflection cycle (~6h), summarize the conversation
  that happened since the last summary, extract a few candidate facts, and
  STAGE them in session_summaries for human review. Nothing reaches
  semantic_facts until Chris approves a staged row. This is the same
  staging-then-approve discipline the Master Continuity engine uses for
  reflections — self-generated understanding never becomes memory unattended.
*/

const Anthropic = require('@anthropic-ai/sdk');
const { supabase, ensureUUID } = require('./supabase');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Guardrails (per spec).
const MIN_MESSAGES = 2;       // skip trivial sessions (need > MIN_MESSAGES)
const MAX_KEY_FACTS = 5;      // never explode semantic_facts from one summary
const MAX_CONFIDENCE = 0.85;  // auto-summaries are weakly grounded at best
const MAX_WINDOW_MESSAGES = 200; // hard cap on how many turns we feed Claude

// Semantic types accepted by the existing semantic_facts vocabulary.
const VALID_SEMANTIC_TYPES = ['preference', 'relationship', 'identity', 'goal', 'pattern'];

// ── 1. Summarize a window of messages ────────────────────────────────────────
// messages: [{ role, content, created_at }] in chronological order.
// Returns { summary_text, key_facts:[{fact, confidence, semantic_type}] }.
async function summarizeSessionWindow(messages) {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY not configured');
  if (!Array.isArray(messages) || messages.length === 0) {
    return { summary_text: '', key_facts: [] };
  }

  const transcript = messages
    .slice(-MAX_WINDOW_MESSAGES)
    .map((m) => `${m.role === 'assistant' ? 'Splendor' : 'Chris'}: ${m.content}`)
    .join('\n\n');

  const system =
    `Summarize this conversation between Chris (the user) and Splendor in 2-3 sentences. ` +
    `Then extract 3-5 key facts worth remembering long-term — facts about the user, ` +
    `decisions made, topics discussed, or patterns noticed. Be conservative: only include ` +
    `facts genuinely supported by the conversation, never speculation.\n\n` +
    `For each fact pick a semantic_type from exactly this set: ` +
    `preference | relationship | identity | goal | pattern.\n\n` +
    `Return ONLY valid JSON, no prose:\n` +
    `{"summary": "2-3 sentence summary", "key_facts": [` +
    `{"fact": "fact about Chris", "semantic_type": "identity", "confidence": 0.8}]}\n` +
    `Return an empty key_facts array if nothing permanent was learned.`;

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 700,
    system,
    messages: [{ role: 'user', content: `Conversation:\n\n${transcript}` }],
  });

  let parsed;
  try {
    const raw = (resp.content[0] && resp.content[0].text ? resp.content[0].text : '').trim();
    // Tolerate accidental code fences.
    const json = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    parsed = JSON.parse(json);
  } catch (e) {
    console.error('[SESSION-SUMMARY] Failed to parse model output:', e.message);
    return { summary_text: '', key_facts: [] };
  }

  const summary_text = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  const key_facts = (Array.isArray(parsed.key_facts) ? parsed.key_facts : [])
    .filter((f) => f && typeof f.fact === 'string' && f.fact.trim())
    .slice(0, MAX_KEY_FACTS)
    .map((f) => ({
      fact: f.fact.trim(),
      semantic_type: VALID_SEMANTIC_TYPES.includes(f.semantic_type) ? f.semantic_type : 'pattern',
      confidence: Math.min(typeof f.confidence === 'number' ? f.confidence : 0.6, MAX_CONFIDENCE),
    }));

  return { summary_text, key_facts };
}

// ── 2. Find conversation turns since the last summary, summarize, and stage ──
async function summarizeAndStageSession(userId, options = {}) {
  if (!userId) {
    console.warn('[SESSION-SUMMARY] no userId — skipping (set SPLENDOR_OWNER_USER_ID)');
    return { staged: false, reason: 'no_user' };
  }
  const uuid = ensureUUID(userId);

  // Window start = the end of the most recent summary cycle for this user,
  // or a fallback lookback (default 24h) on first run.
  const lookbackHours = options.lookbackHours || 24;
  let windowStart;
  const { data: last } = await supabase
    .from('session_summaries')
    .select('message_window_end, cycle_timestamp')
    .eq('user_id', uuid)
    .order('cycle_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last && (last.message_window_end || last.cycle_timestamp)) {
    windowStart = last.message_window_end || last.cycle_timestamp;
  } else {
    windowStart = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
  }
  const windowEnd = new Date().toISOString();

  // Conversation turns live in memory_items as memory_type='shared_history',
  // content prefixed "User: " / "Splendor: " (see routes/chat.js).
  const { data: rows, error } = await supabase
    .from('memory_items')
    .select('content, created_at')
    .eq('user_id', uuid)
    .eq('memory_type', 'shared_history')
    .gt('created_at', windowStart)
    .lte('created_at', windowEnd)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SESSION-SUMMARY] message query failed:', error.message);
    return { staged: false, reason: 'query_error' };
  }

  const messages = (rows || []).map((r) => {
    const isAssistant = /^Splendor:\s?/i.test(r.content);
    return {
      role: isAssistant ? 'assistant' : 'user',
      content: r.content.replace(/^(User|Splendor):\s?/i, ''),
      created_at: r.created_at,
    };
  });

  if (messages.length <= MIN_MESSAGES) {
    console.log(`[SESSION-SUMMARY] only ${messages.length} turns since last cycle — skipping`);
    return { staged: false, reason: 'too_short', message_count: messages.length };
  }

  const { summary_text, key_facts } = await summarizeSessionWindow(messages);
  if (!summary_text) {
    return { staged: false, reason: 'empty_summary', message_count: messages.length };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('session_summaries')
    .insert([{
      user_id: uuid,
      cycle_timestamp: windowEnd,
      message_window_start: messages[0].created_at,
      message_window_end: messages[messages.length - 1].created_at,
      message_count: messages.length,
      summary_text,
      key_facts,
      status: 'staged',
    }])
    .select()
    .single();

  if (insErr) {
    console.error('[SESSION-SUMMARY] stage insert failed:', insErr.message);
    return { staged: false, reason: 'insert_error' };
  }

  console.log(`[SESSION-SUMMARY] staged summary ${inserted.id} (${messages.length} turns, ${key_facts.length} facts)`);
  return { staged: true, id: inserted.id, message_count: messages.length, fact_count: key_facts.length };
}

// ── 3. Approve a staged summary → promote its facts into semantic_facts ──────
async function approveSessionSummary(userId, summaryId, approvalNotes = null) {
  const uuid = ensureUUID(userId);

  const { data: summary, error: getErr } = await supabase
    .from('session_summaries')
    .select('*')
    .eq('id', summaryId)
    .eq('user_id', uuid)
    .single();
  if (getErr || !summary) throw new Error('summary not found');
  if (summary.status === 'approved') {
    return { already: true, facts_created_count: 0, approved_at: summary.approved_at };
  }

  const facts = Array.isArray(summary.key_facts) ? summary.key_facts : [];
  const now = new Date().toISOString();
  let created = 0;

  for (const f of facts) {
    const confidence = Math.min(typeof f.confidence === 'number' ? f.confidence : 0.6, MAX_CONFIDENCE);
    const { error: factErr } = await supabase
      .from('semantic_facts')
      .insert([{
        user_id: uuid,
        fact_text: f.fact,
        semantic_type: VALID_SEMANTIC_TYPES.includes(f.semantic_type) ? f.semantic_type : 'pattern',
        confidence_score: confidence,
        is_active: true,
        last_confirmed: now,
        // Provenance columns (added by session-summaries-schema.sql).
        provenance: 'SESSION_SUMMARY',
        source: 'session_summaries',
        source_id: summary.id,
        trust_level: confidence >= 0.8 ? 'verified' : 'weakly_grounded',
        created_at: now,
        updated_at: now,
      }]);
    if (factErr) {
      console.error('[SESSION-SUMMARY] fact insert failed:', factErr.message);
    } else {
      created++;
    }
  }

  const { error: updErr } = await supabase
    .from('session_summaries')
    .update({ status: 'approved', approved_at: now, approval_notes: approvalNotes || null })
    .eq('id', summaryId)
    .eq('user_id', uuid);
  if (updErr) throw updErr;

  console.log(`[SESSION-SUMMARY] approved ${summaryId} — ${created} fact(s) → semantic_facts`);
  return { facts_created_count: created, approved_at: now };
}

// ── 4. Reject a staged summary → discard, never touches semantic_facts ───────
async function rejectSessionSummary(userId, summaryId, notes = null) {
  const uuid = ensureUUID(userId);
  const { data, error } = await supabase
    .from('session_summaries')
    .update({ status: 'rejected', approval_notes: notes || null })
    .eq('id', summaryId)
    .eq('user_id', uuid)
    .select()
    .single();
  if (error) throw error;
  console.log(`[SESSION-SUMMARY] rejected ${summaryId}`);
  return { status: 'rejected', id: data && data.id };
}

// ── 5. List summaries by status (UI) ─────────────────────────────────────────
async function getSessionSummaries(userId, status = 'staged', limit = 50) {
  const uuid = ensureUUID(userId);
  const q = supabase
    .from('session_summaries')
    .select('id, cycle_timestamp, message_window_start, message_window_end, message_count, summary_text, key_facts, status, approval_notes, created_at, approved_at')
    .eq('user_id', uuid)
    .order('cycle_timestamp', { ascending: false })
    .limit(limit);
  if (status && status !== 'all') q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

module.exports = {
  summarizeSessionWindow,
  summarizeAndStageSession,
  approveSessionSummary,
  rejectSessionSummary,
  getSessionSummaries,
  MIN_MESSAGES,
  MAX_KEY_FACTS,
  MAX_CONFIDENCE,
};
