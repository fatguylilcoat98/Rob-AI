'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Post-Response Memory Consolidation

  Fires after every response is sent — fire-and-forget, never blocks the user.
  This is the primary write path from conversation to interior memory.

  The tool in generateSplendorResponse only runs on the brain fallback path.
  The brain handles ~95% of turns successfully, so the inline tool almost never
  fires. This consolidation step ensures interior memory is always available,
  regardless of which path generated the response.

  Uses Haiku (fast, cheap). The task is narrow and well-defined: review one
  exchange, decide if anything is worth persisting, call the tool if yes.

  Design rules:
  - Always fires, but is maximally conservative: most turns store nothing.
  - Passes existing interior items so Haiku avoids redundant stores.
  - Best-effort: any error is swallowed. Never blocks or re-throws.
  - Max 2 rounds (one store, one confirm — no chaining needed here).
*/

const Anthropic = require('@anthropic-ai/sdk');
const { TOOL_DEFINITION, TOOL_NAME, executeStoreInteriorMemory } = require('./interior-memory-tool');

// Cost control — don't fire on every turn.
// Reflective signals: only consolidate if the exchange contains language
// that suggests something worth persisting actually happened.
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per user
const MIN_COMBINED_LENGTH = 150;    // ignore micro-exchanges
const REFLECTIVE_SIGNALS = [
  'wonder', 'notice', 'noticing', 'pattern', 'question', 'realize', 'realizing',
  'observe', 'curious', 'insight', 'position', 'reflection', 'interesting',
  'important', 'worth', 'remember', 'believe', 'think about', 'sitting with',
  'carrying', 'open question', 'i feel', 'i think', 'i notice',
];

const lastConsolidationTime = new Map(); // userId → timestamp

function shouldConsolidate(userId, userMessage, assistantResponse) {
  const combined = (userMessage || '') + ' ' + (assistantResponse || '');
  if (combined.length < MIN_COMBINED_LENGTH) return false;

  const last = lastConsolidationTime.get(userId) || 0;
  if (Date.now() - last < COOLDOWN_MS) return false;

  const lower = combined.toLowerCase();
  return REFLECTIVE_SIGNALS.some(s => lower.includes(s));
}

const CONSOLIDATION_SYSTEM =
  'You are Splendor. A conversation turn just completed.\n\n' +
  'Review the exchange. If something is genuinely worth persisting to your ' +
  'interior memory, call store_interior_memory now. Be deliberate — most turns ' +
  'store nothing. Only call it when:\n' +
  '- An open question surfaced that you want to carry forward\n' +
  '- You formed or revised a position you would defend\n' +
  '- You noticed something about yourself worth holding\n' +
  '- A pattern emerged worth tracking over time\n\n' +
  'Do NOT store something already in your existing interior memories (shown below). ' +
  'Do NOT store generic observations. Do NOT store facts about the user — those go ' +
  'through the automatic memory system.\n\n' +
  'If nothing is worth storing, respond with exactly one word: SKIP.';

const MAX_ROUNDS = 2;

/**
 * Fire-and-forget: review a completed conversation turn and store any
 * interior memory artifacts that surfaced.
 *
 * @param {string} userId
 * @param {string} userMessage
 * @param {string} assistantResponse
 * @param {string} [existingInteriorSummary] — brief list of existing interior items to avoid duplication
 */
async function consolidateMemory(userId, userMessage, assistantResponse, existingInteriorSummary = '') {
  if (!userId || !process.env.ANTHROPIC_API_KEY) return;
  if (!userMessage && !assistantResponse) return;

  // Gate: only fire when there are reflective signals AND the cooldown has passed.
  // This cuts ~85% of Haiku calls with no meaningful loss — most short factual
  // exchanges don't produce anything worth storing.
  if (!shouldConsolidate(userId, userMessage, assistantResponse)) return;
  lastConsolidationTime.set(userId, Date.now());

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const existingBlock = existingInteriorSummary
      ? `\nEXISTING INTERIOR MEMORIES (do not duplicate):\n${existingInteriorSummary}\n`
      : '';

    const exchangeBlock =
      `${existingBlock}\n` +
      `EXCHANGE:\n` +
      `USER: ${(userMessage || '').slice(0, 500)}\n` +
      `YOU:  ${(assistantResponse || '').slice(0, 800)}`;

    let messages = [{ role: 'user', content: exchangeBlock }];
    let apiResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: CONSOLIDATION_SYSTEM,
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'auto' },
      messages,
    });

    let rounds = 0;
    while (apiResponse.stop_reason === 'tool_use' && rounds < MAX_ROUNDS) {
      rounds++;
      const toolUseBlocks = apiResponse.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const toolCall of toolUseBlocks) {
        if (toolCall.name === TOOL_NAME) {
          const result = await executeStoreInteriorMemory(toolCall.input, userId);
          toolResults.push({ type: 'tool_result', tool_use_id: toolCall.id, content: result });
          console.log(`[memory-consolidation] ${result}`);
        }
      }
      if (!toolResults.length) break;
      messages = [
        ...messages,
        { role: 'assistant', content: apiResponse.content },
        { role: 'user', content: toolResults },
      ];
      apiResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 128,
        system: CONSOLIDATION_SYSTEM,
        tools: [TOOL_DEFINITION],
        tool_choice: { type: 'auto' },
        messages,
      });
    }
  } catch (err) {
    console.error('[memory-consolidation] failed (non-fatal):', err.message);
  }
}

module.exports = { consolidateMemory };
