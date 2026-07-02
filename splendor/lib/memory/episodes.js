/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// LAYER 2 — Episodic Memory
// Time-stamped summaries of past conversations. Specific, decayable.
// Save runs at session end (or 30-min inactivity). Load runs at session start.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase, stringToUUID } = require('../supabase');

let _anthropic = null;
function anthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const SUMMARY_MODEL = 'claude-sonnet-4-6';

const SUMMARY_PROMPT = `You are summarizing a single conversation for long-term memory.
Return ONLY valid JSON, no preamble, no trailing prose:

{
  "summary": "2-4 sentence factual summary of what was discussed.",
  "topics": ["3-6 short topic keywords"],
  "emotional_tone": "single word or short phrase (e.g. focused, frustrated, excited, curious, tired, neutral)"
}

No flattery. No invented feelings. If the conversation is trivial,
keep the summary short. Never speculate beyond what was actually said.`;

// Convert an array of {role, content} turns into a flat transcript.
function flatten(history) {
  return history
    .map((turn) => {
      const who = turn.role === 'user' ? 'User' : 'Splendor';
      const content =
        typeof turn.content === 'string'
          ? turn.content
          : Array.isArray(turn.content)
            ? turn.content.map((c) => c.text || `[${c.type}]`).join(' ')
            : JSON.stringify(turn.content);
      return `${who}: ${content}`;
    })
    .join('\n');
}

async function summarizeConversation(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  try {
    const transcript = flatten(history);
    const response = await anthropic().messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 400,
      system: SUMMARY_PROMPT,
      messages: [{ role: 'user', content: transcript }]
    });
    const raw = response.content[0].text.trim();
    // Best-effort JSON extraction (model sometimes wraps in fences).
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.summary) return null;
    return {
      summary: String(parsed.summary).trim(),
      topics: Array.isArray(parsed.topics)
        ? parsed.topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
        : [],
      emotional_tone: parsed.emotional_tone
        ? String(parsed.emotional_tone).trim()
        : null
    };
  } catch (err) {
    console.error('summarizeConversation error:', err.message);
    return null;
  }
}

// Save an episode for the user. Returns the saved row, or null on failure.
// `history` is the in-memory conversation array; pass the same one used for
// the API calls.
async function saveEpisode(userId, history) {
  try {
    const summary = await summarizeConversation(history);
    if (!summary) {
      console.log('saveEpisode: no summary produced, skipping insert');
      return null;
    }
    const uuid = stringToUUID(userId);
    const { data, error } = await supabase
      .from('episodes')
      .insert({
        user_id: uuid,
        summary: summary.summary,
        topics: summary.topics,
        emotional_tone: summary.emotional_tone,
        memory_tier: 'episodic',
        decay_score: 1.0
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('saveEpisode error:', err.message);
    return null;
  }
}

// Load recent episodes for prompt injection. Compressed/archived rows
// are excluded — only fresh episodic rows are surfaced verbatim.
async function loadRecentEpisodes(userId, limit = 5) {
  try {
    const uuid = stringToUUID(userId);
    const { data, error } = await supabase
      .from('episodes')
      .select('id, created_at, summary, topics, emotional_tone, decay_score')
      .eq('user_id', uuid)
      .eq('memory_tier', 'episodic')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('loadRecentEpisodes error:', err.message);
    return [];
  }
}

// Load the N most recent compressed long-term summaries (Layer 4).
async function loadCompressedSummaries(userId, limit = 2) {
  try {
    const uuid = stringToUUID(userId);
    const { data, error } = await supabase
      .from('memory_summaries')
      .select('id, created_at, summary, covers_period_start, covers_period_end')
      .eq('user_id', uuid)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('loadCompressedSummaries error:', err.message);
    return [];
  }
}

module.exports = {
  saveEpisode,
  loadRecentEpisodes,
  loadCompressedSummaries,
  summarizeConversation
};
