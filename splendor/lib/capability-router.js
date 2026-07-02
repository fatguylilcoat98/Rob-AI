'use strict';
/*
  Shared capability router — surface-unification Phase 2.

  Image generation is a server-side capability (isArtRequest -> generateArt),
  NOT a model tool. Each surface that forgets to intercept it lets the raw
  model refuse ("I can't generate images") — that is divergence D4, the bug
  that triggered this audit. Before this module the art intercept + the
  4-branch user-facing error switch were copy-pasted in THREE places
  (routes/chat.js, routes/enhanced-chat.js, routes/converse.js), and missing
  from a fourth (the /api/enhanced/chat non-stream handler).

  runArtCapability() is the single detect-and-generate path. It returns a
  normalized result; each surface keeps its OWN transport + response shape
  (JSON / SSE / Realtime side-channel) and just reads the fields it already
  emitted. Nothing here changes a wire format — it only removes duplication
  and closes the holes.

  Run: node --test tests/capability-router.test.js
*/

const { generateArt, isArtRequest } = require('./art-generator');

// The single source of truth for the user-facing art-failure line. This
// exact switch previously lived (verbatim) in three route files.
function artErrorMessage(result) {
  switch (result && result.errorCategory) {
    case 'policy_block': return 'That request was blocked by content policy — try a different idea.';
    case 'timeout':      return "Image generation took too long. Let's try again.";
    case 'rate_limit':   return "I'm being rate-limited right now. Give it a minute.";
    case 'permission':   return "My image-generation key isn't authorized. Chris needs to check the OpenAI account.";
    default:             return `Image couldn't be generated — ${result && result.errorMessage}`;
  }
}

/**
 * Detect and run the art capability for a turn.
 *
 * Detection mirrors every surface's existing guard: an attached image means
 * "look at this photo", NOT "paint a new one", so it is never art.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.message
 * @param {string|null} [args.imageData]  - attached vision input; presence skips art.
 * @param {string} [args.source]          - tag forwarded to generateArt ('chat'|'chat-stream'|'converse'|…).
 * @param {object} [args.deps]            - injectable { generateArt, isArtRequest } for tests.
 * @returns {Promise<object>} one of:
 *   { isArt:false }
 *   { isArt:true, ok:true,  requestId, imageUrl, audioB64, revisedPrompt, description, model }
 *   { isArt:true, ok:false, requestId, errorCategory, errorMessage, userFacing, attempts }
 */
async function runArtCapability({ userId, message, imageData = null, source = 'unknown', deps = {} }) {
  const detect = deps.isArtRequest || isArtRequest;
  const generate = deps.generateArt || generateArt;

  if (imageData || !detect(message)) {
    return { isArt: false };
  }

  let result;
  try {
    result = await generate({ userId, userMessage: message, source });
  } catch (e) {
    console.error(`[capability:art][${source}] generator threw:`, e && e.message);
    result = { ok: false, requestId: null, errorCategory: 'unknown', errorMessage: (e && e.message) || 'unexpected error', attempts: [] };
  }

  if (result.ok) {
    return {
      isArt: true,
      ok: true,
      requestId: result.requestId,
      imageUrl: result.imageUrl,
      audioB64: result.audioB64 || null,
      revisedPrompt: result.revisedPrompt || null,
      description: result.description,
      model: result.model,
    };
  }

  return {
    isArt: true,
    ok: false,
    requestId: result.requestId,
    errorCategory: result.errorCategory,
    errorMessage: result.errorMessage,
    userFacing: artErrorMessage(result),
    attempts: result.attempts,
  };
}

module.exports = { runArtCapability, artErrorMessage, isArtRequest };
