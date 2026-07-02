/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// LAYER 5 — Proactive Opener
// Generates a 1-2 sentence opener Splendor speaks first when the user
// returns. Uses the assembled memory context (Layers 0/2/3/4).
//
// Rules:
//   - If last conversation < 1 hour ago → null (continuation, no opener)
//   - If last conversation > 30 days ago → softer re-introduction tone
//   - Otherwise → context-aware specific opener
// Always best-effort: failures return null, never throw.

const Anthropic = require('@anthropic-ai/sdk');
const { assembleMemoryContext } = require('./assembler');
const { describeGap } = require('./reality-context');
const { supabase, stringToUUID } = require('../supabase');

let _anthropic = null;
function anthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const MODEL = 'claude-sonnet-4-6';

function buildPrompt(daysSince, tone) {
  return `You are Splendor.

Generate ONE warm, specific opening message for the user, 1-2 sentences max.
Use the memory context below to choose what to lead with.

Constraints:
- DO NOT say "Welcome back", "How can I help you today", or any generic greeting.
- DO NOT flatter. DO NOT invent feelings. Be specific or be brief.
- It has been ${daysSince === null ? 'a while' : daysSince + ' day(s)'} since you last spoke.
- Tone: ${tone}.
- 1-2 sentences total. No preamble.`;
}

async function lastConversationAt(userId) {
  try {
    const uuid = stringToUUID(userId);
    const { data } = await supabase
      .from('user_profiles')
      .select('last_conversation_at')
      .eq('user_id', uuid)
      .maybeSingle();
    if (data?.last_conversation_at) return data.last_conversation_at;

    const { data: ep } = await supabase
      .from('episodes')
      .select('created_at')
      .eq('user_id', uuid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return ep?.created_at || null;
  } catch (err) {
    return null;
  }
}

async function buildProactiveOpener(userId) {
  try {
    const lastIso = await lastConversationAt(userId);
    const gap = describeGap(new Date(), lastIso);

    // Continuation: don't speak first.
    if (gap.minutes !== undefined && gap.minutes < 60 && lastIso) {
      return null;
    }

    let tone = 'present and specific';
    if (gap.days !== null && gap.days > 30) {
      tone = 'softer re-introduction; acknowledge the gap, do not over-explain';
    }

    const memoryContext = await assembleMemoryContext(userId, 'session start opener');

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 120,
      system: buildPrompt(gap.days, tone),
      messages: [{
        role: 'user',
        content: memoryContext && memoryContext.length > 0
          ? `Memory context:\n\n${memoryContext}\n\nWrite the opener now.`
          : 'You have no prior context for this user. Open with one short, present-moment line.'
      }]
    });

    const text = response.content[0].text.trim();
    if (!text || text.toLowerCase().startsWith('welcome back')) return null;
    return text;
  } catch (err) {
    console.error('buildProactiveOpener error:', err.message);
    return null;
  }
}

module.exports = { buildProactiveOpener };
