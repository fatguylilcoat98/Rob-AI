/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// CONSCIOUSNESS PATCHES - Clean integration into existing systems
// All patches can be completely removed by setting CONSCIOUSNESS_ENABLED=false

const { enhanceResponseWithConsciousness, processConsciousnessCommand, initializeConsciousnessForChat, endConsciousnessForChat } = require('./consciousness-integration');

// Patch 1: Enhance generateSplendorResponse with consciousness
async function patchGenerateSplendorResponseWithConsciousness(originalFunction) {
  return async function(userMessage, memories = [], isFirstToday = false, searchResults = null, options = {}) {
    // Call original function first
    const baseResponse = await originalFunction.call(this, userMessage, memories, isFirstToday, searchResults, options);

    // Skip consciousness for morning check-ins and empty messages
    if (isFirstToday || !userMessage || userMessage.trim() === '') {
      return baseResponse;
    }

    // Extract userId from options - now required since auth is enforced
    const userId = options.userId;
    if (!userId) {
      console.error('[CONSCIOUSNESS PATCH] No userId provided in options');
      return baseResponse;
    }

    // Enhance with consciousness if enabled
    const consciousnessResult = await enhanceResponseWithConsciousness(userId, userMessage, baseResponse, options);

    return consciousnessResult.response;
  };
}

// Patch 2: Add consciousness context to buildDecisionContext
function buildConsciousnessDecisionContext(userId) {
  const { consciousnessEngine } = require('./consciousness-engine');

  return async function() {
    if (!consciousnessEngine.isEnabled()) {
      return '';
    }

    try {
      const consciousnessContext = await consciousnessEngine.buildConsciousnessContext(userId);
      return consciousnessContext;
    } catch (err) {
      console.error('[CONSCIOUSNESS PATCH] Decision context error:', err);
      return '';
    }
  };
}

// Patch 3: Enhanced chat processing with consciousness
async function patchChatProcessingWithConsciousness(originalChatFunction) {
  return async function(req, res) {
    const { message, userId } = req.body;

    // Check for consciousness commands first
    if (message && typeof message === 'string') {
      const consciousnessCommand = await processConsciousnessCommand(userId, message);
      if (consciousnessCommand) {
        return res.json({
          message: consciousnessCommand,
          timestamp: new Date().toISOString(),
          consciousness_command: true,
          responseTime: 0
        });
      }
    }

    // Initialize consciousness for this chat session
    await initializeConsciousnessForChat(userId);

    // Call original chat function with consciousness context
    const originalSend = res.send;
    const originalJson = res.json;

    // Intercept response to add consciousness data
    res.json = function(data) {
      // End consciousness session when response is sent
      if (data.message) {
        setImmediate(async () => {
          try {
            // Don't end session immediately - let it continue for follow-ups
            // await endConsciousnessForChat(userId, 'response_sent');
          } catch (err) {
            console.error('[CONSCIOUSNESS PATCH] Session end error:', err);
          }
        });
      }

      return originalJson.call(this, data);
    };

    // Call original function
    return await originalChatFunction.call(this, req, res);
  };
}

// Patch 4: Add consciousness to system prompts
function addConsciousnessToSystemPrompt(originalSystemPrompt, userId) {
  const { consciousnessEngine } = require('./consciousness-engine');

  if (!consciousnessEngine.isEnabled()) {
    return originalSystemPrompt;
  }

  // This would be called during prompt building
  return async function() {
    try {
      const consciousnessContext = await consciousnessEngine.buildConsciousnessContext(userId);
      return originalSystemPrompt + consciousnessContext;
    } catch (err) {
      console.error('[CONSCIOUSNESS PATCH] System prompt error:', err);
      return originalSystemPrompt;
    }
  };
}

// Utility: Apply all consciousness patches
function applyConsciousnessPatches(chatModule, anthropicModule) {
  if (process.env.CONSCIOUSNESS_ENABLED !== 'true') {
    console.log('[CONSCIOUSNESS PATCH] Consciousness disabled - skipping patches');
    return;
  }

  try {
    // Patch the main chat processing
    if (chatModule.processFastChat) {
      const originalProcessFastChat = chatModule.processFastChat;
      chatModule.processFastChat = patchChatProcessingWithConsciousness(originalProcessFastChat);
    }

    if (chatModule.process6LayerChat) {
      const originalProcess6LayerChat = chatModule.process6LayerChat;
      chatModule.process6LayerChat = patchChatProcessingWithConsciousness(originalProcess6LayerChat);
    }

    console.log('[CONSCIOUSNESS PATCH] Consciousness patches applied successfully');

  } catch (err) {
    console.error('[CONSCIOUSNESS PATCH] Failed to apply consciousness patches:', err);
  }
}

// Emergency consciousness rollback
function rollbackConsciousnessPatches() {
  console.log('[CONSCIOUSNESS PATCH] Rolling back consciousness patches...');

  // Set emergency disable
  process.env.CONSCIOUSNESS_EMERGENCY_DISABLE = 'true';
  process.env.CONSCIOUSNESS_ENABLED = 'false';

  // Note: In a production system, you'd want to restore original functions
  // For now, the patches will just become no-ops due to disabled flags

  console.log('[CONSCIOUSNESS PATCH] Consciousness rollback complete');
}

module.exports = {
  patchGenerateSplendorResponseWithConsciousness,
  buildConsciousnessDecisionContext,
  patchChatProcessingWithConsciousness,
  addConsciousnessToSystemPrompt,
  applyConsciousnessPatches,
  rollbackConsciousnessPatches
};