/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// LAYER 3 — Semantic Memory (write side)
// After each conversation turn, ask Claude whether any new permanent
// facts about the user should be stored. Upsert what it returns into
// Pinecone with a semantic_type tag.
//
// Read side already exists in lib/pinecone.js (retrieveMemories).
// The assembler pulls from there.

const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const { storeMemory: storePineconeMemory } = require('../pinecone');

let _anthropic = null;
function anthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const MODEL = 'claude-sonnet-4-6';

const EXTRACTION_PROMPT = `You analyze a single conversation exchange and decide whether it
revealed any NEW PERMANENT facts about the user worth remembering forever.

Permanent facts are things like:
- preference: stable likes / dislikes / habits
- relationship: people in the user's life (name, role)
- identity: who the user is (job, location, values)
- goal: things the user is actively working toward
- pattern: behavioral patterns observed over time

Skip:
- One-off mood states or feelings
- Speculation about psychology
- Anything you only inferred (require explicit user statement)
- Generic restatements of what was said in this turn

Return ONLY valid JSON, no preamble:
{
  "facts": [
    { "fact": "single concise sentence", "semantic_type": "preference|relationship|identity|goal|pattern" }
  ]
}

If nothing permanent was revealed, return: { "facts": [] }`;

const ALLOWED_TYPES = new Set([
  'preference',
  'relationship',
  'identity',
  'goal',
  'pattern'
]);

async function extractFacts(userMessage, splendorResponse) {
  if (!userMessage) return [];
  try {
    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 400,
      system: EXTRACTION_PROMPT,
      messages: [{
        role: 'user',
        content: `User said: "${userMessage}"\n\nSplendor responded: "${splendorResponse || ''}"\n\nReturn JSON.`
      }]
    });
    const raw = response.content[0].text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!parsed.facts || !Array.isArray(parsed.facts)) return [];
    return parsed.facts
      .map((f) => ({
        fact: String(f.fact || '').trim(),
        semantic_type: ALLOWED_TYPES.has(f.semantic_type)
          ? f.semantic_type
          : 'identity'
      }))
      .filter((f) => f.fact.length > 0);
  } catch (err) {
    console.error('extractFacts error:', err.message);
    return [];
  }
}

// Upsert the extracted facts into Pinecone with semantic_type metadata.
// Best-effort: failures are logged but never thrown.
async function upsertFacts(userId, facts) {
  if (!Array.isArray(facts) || facts.length === 0) return 0;
  let saved = 0;
  for (const { fact, semantic_type } of facts) {
    try {
      const id = crypto.randomUUID();
      await storePineconeMemory(id, fact, userId, semantic_type);
      saved++;
    } catch (err) {
      console.error('upsertFacts save error:', err.message);
    }
  }
  return saved;
}

// One-shot helper: extract from an exchange and upsert.
async function extractAndUpsert(userId, userMessage, splendorResponse) {
  try {
    const facts = await extractFacts(userMessage, splendorResponse);
    if (facts.length === 0) return 0;
    return await upsertFacts(userId, facts);
  } catch (err) {
    console.error('extractAndUpsert error:', err.message);
    return 0;
  }
}

module.exports = {
  extractFacts,
  upsertFacts,
  extractAndUpsert
};
