/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// MEMORY ASSEMBLER
// Builds the layered context block that prefixes every system prompt:
//   Layer 0 — Reality context (time, date, gap)
//   Layer 3 — Semantic facts (Pinecone, top N relevant)
//   Layer 4 — Long-term compressed summaries
//   Layer 2 — Recent episodes (verbatim short summaries)
//
// Each layer is best-effort: if a layer fails, it is silently omitted
// rather than crashing the conversation. The assembler returns one big
// string ready to concatenate with the persona block.
//
// Layer 1 (working memory / live conversation) and Layer 5 (proactive
// opener) are NOT part of the assembled system prompt — they are handled
// by the chat handler.

const { buildRealityContext } = require('./reality-context');
const {
  loadRecentEpisodes,
  loadCompressedSummaries
} = require('./episodes');
const {
  retrieveMemories,
  isPineconeConfigured
} = require('../pinecone');

function fmtSemantic(memories) {
  if (!memories || memories.length === 0) return '';
  const lines = memories.map((m) => {
    const content = m.content || '';
    const type = m.semantic_type || m.type || m.memory_type || 'fact';
    return `- (${type}) ${content}`;
  });
  return [
    '=== WHO THIS USER IS ===',
    ...lines,
    '========================'
  ].join('\n');
}

function fmtCompressed(summaries) {
  if (!summaries || summaries.length === 0) return '';
  const lines = summaries.map((s) => {
    const window =
      s.covers_period_start && s.covers_period_end
        ? `[${new Date(s.covers_period_start).toLocaleDateString()}–${new Date(s.covers_period_end).toLocaleDateString()}] `
        : '';
    return `- ${window}${s.summary}`;
  });
  return [
    '=== LONG-TERM MEMORY ===',
    ...lines,
    '========================'
  ].join('\n');
}

function fmtEpisodes(episodes) {
  if (!episodes || episodes.length === 0) return '';
  const lines = episodes.map((e) => {
    const when = new Date(e.created_at).toLocaleDateString();
    const tone = e.emotional_tone ? ` [tone: ${e.emotional_tone}]` : '';
    return `- [${when}]${tone} ${e.summary}`;
  });
  return [
    '=== RECENT CONVERSATIONS ===',
    ...lines,
    '============================'
  ].join('\n');
}

// Build a single string with all four assembled layers.
// `currentMessage` is used as the semantic-search query so we surface
// the most relevant facts for what the user just asked.
async function assembleMemoryContext(userId, currentMessage = '', opts = {}) {
  const {
    semanticTopK = 10,
    episodeLimit = 5,
    summaryLimit = 2
  } = opts;

  const tasks = await Promise.allSettled([
    buildRealityContext(userId),
    isPineconeConfigured()
      ? retrieveMemories(currentMessage || 'recent context', userId, semanticTopK)
      : Promise.resolve([]),
    loadCompressedSummaries(userId, summaryLimit),
    loadRecentEpisodes(userId, episodeLimit)
  ]);

  const reality = tasks[0].status === 'fulfilled' ? tasks[0].value : '';
  const semantic =
    tasks[1].status === 'fulfilled' ? fmtSemantic(tasks[1].value) : '';
  const compressed =
    tasks[2].status === 'fulfilled' ? fmtCompressed(tasks[2].value) : '';
  const episodes =
    tasks[3].status === 'fulfilled' ? fmtEpisodes(tasks[3].value) : '';

  return [reality, semantic, compressed, episodes]
    .filter((block) => block && block.length > 0)
    .join('\n\n');
}

module.exports = {
  assembleMemoryContext
};
