'use strict';

/**
 * Drop-in compatibility layer: wraps Groq SDK in Anthropic's messages.create API shape.
 * Lets background workers switch from Anthropic Sonnet to Groq Llama with no call-site changes.
 *
 * Usage in workers:
 *   const { groqMessagesCompat } = require('../lib/groq-messages-compat');
 *   const anthropic = groqMessagesCompat();
 *   // all existing anthropic.messages.create({ model, max_tokens, messages, system }) calls
 *   // work unchanged — they now hit Groq instead of Anthropic
 */

const Groq = require('groq-sdk');

const GROQ_BACKGROUND_MODEL = 'llama-3.3-70b-versatile';

// Anthropic model ID → Groq model ID
const GROQ_MODEL_MAP = {
  'claude-sonnet-4-6':        GROQ_BACKGROUND_MODEL,
  'claude-sonnet-4-20250514': GROQ_BACKGROUND_MODEL,
};

let _groq = null;
function _client() {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

/**
 * Anthropic-compatible messages.create.
 * Accepts { model, max_tokens, messages, system } — Anthropic's shape.
 * Returns { content: [{ text }] } — Anthropic's response shape.
 */
async function groqMessagesCreate({ model, max_tokens, messages, system }) {
  const groqMessages = [];
  if (system) groqMessages.push({ role: 'system', content: system });
  for (const m of (messages || [])) {
    const content = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map(b => b.text || b.content || '').join('')
        : String(m.content || '');
    groqMessages.push({ role: m.role, content });
  }

  const response = await _client().chat.completions.create({
    model: GROQ_MODEL_MAP[model] || GROQ_BACKGROUND_MODEL,
    max_tokens: max_tokens || 800,
    messages: groqMessages,
  });

  return { content: [{ text: response.choices[0]?.message?.content || '' }] };
}

/**
 * Returns an object that mimics the Anthropic client's .messages interface.
 * Drop this into any worker that has:
 *   const anthropic = new Anthropic({ apiKey: ... });
 *   await anthropic.messages.create({ model, max_tokens, messages, system });
 */
function groqMessagesCompat() {
  return { messages: { create: groqMessagesCreate } };
}

module.exports = { groqMessagesCompat, groqMessagesCreate, GROQ_BACKGROUND_MODEL };
