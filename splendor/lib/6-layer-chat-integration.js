/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// 6-LAYER MEMORY CHAT INTEGRATION
// Integrates the human-like memory system with existing chat processing

const { generateSplendorResponse } = require('./anthropic');
const { buildDecisionContext, checkDecisionCompliance, handleDecisionRecall, processDecisionCommand, initializeDbm, generateDecisionProposal, formatProposalForApproval } = require('./decision-bound-memory-v2');
const { analyzeCognitivePatterns } = require('./cognitive-pattern-analyzer');
const { adaptFullResponse } = require('./adaptive-response-engine');
const { getCognitiveProfile } = require('./cognitive-profile-builder');
// Visual expression with error handling
let handleVisualizationRequest = null;
try {
  const visualExpression = require('./consciousness/visual-expression');
  handleVisualizationRequest = visualExpression.handleVisualizationRequest;
  console.log('[6-LAYER] Visual expression module loaded successfully');
} catch (err) {
  console.error('[6-LAYER] Failed to load visual expression module:', err.message);
  handleVisualizationRequest = async () => null; // Fallback function
}
const { updateConversationContext, buildContextPrompt, detectContextConfusion } = require('./conversation-context-manager');
const {
  assembleMemoryLayers,
  buildProactiveOpener,
  addToWorkingMemory,
  getWorkingMemory,
  startWorkingMemory
} = require('./6-layer-memory');
const { endSession, incrementConversationCount } = require('./memory-background-jobs');

// Process chat with full 6-layer memory system
async function process6LayerChat(req, res) {
  const startTime = Date.now();
  const { message, userId, authToken, imageData = null, conversationHistory = [] } = req.body;

  try {
    console.log(`[6-LAYER CHAT] Starting processing for user ${userId}`);

    // STEP 1: Initialize working memory session
    startWorkingMemory(userId);

    // STEP 2: Initialize DBM (if needed)
    await initializeDbm(userId);

    // STEP 3: Check for decision queries first (fastest path)
    if (message) {
      const decisionResponse = await handleDecisionRecall(userId, message) ||
                              await processDecisionCommand(userId, message);

      if (decisionResponse) {
        // Add to working memory and update context
        addToWorkingMemory(userId, 'user', message);
        addToWorkingMemory(userId, 'assistant', decisionResponse);
        updateConversationContext(userId, 'christopher', message, decisionResponse);

        console.log(`[6-LAYER] Decision query handled in ${Date.now() - startTime}ms`);
        return res.json({
          message: decisionResponse,
          timestamp: new Date().toISOString(),
          decision_response: true,
          responseTime: Date.now() - startTime,
          proactive_opener: null
        });
      }

      // STEP 3.5: Check for visual expression requests
      const visualResponse = await handleVisualizationRequest(userId, message);
      if (visualResponse) {
        // Add to working memory
        addToWorkingMemory(userId, 'user', message);
        addToWorkingMemory(userId, 'assistant', visualResponse);
        updateConversationContext(userId, 'christopher', message, visualResponse);

        console.log(`[6-LAYER] Visual expression handled in ${Date.now() - startTime}ms`);
        return res.json({
          message: visualResponse,
          timestamp: new Date().toISOString(),
          visual_expression: true,
          responseTime: Date.now() - startTime,
          proactive_opener: null
        });
      }
    }

    // STEP 4: Check if this is a session start (for proactive opener)
    const workingMemory = getWorkingMemory(userId);
    const isSessionStart = workingMemory.messages.length === 0 && (!message || message.trim() === '');

    // STEP 5: Assemble complete 6-layer memory context
    const queryForRetrieval = message || 'general conversation context';
    const memoryAssembly = await assembleMemoryLayers(userId, queryForRetrieval);
    console.log(`[6-LAYER] Memory assembled in ${Date.now() - startTime}ms`);

    // STEP 6: Generate proactive opener if this is session start
    let proactiveOpener = null;
    if (isSessionStart) {
      try {
        proactiveOpener = await buildProactiveOpener(userId, memoryAssembly.systemPrompt);
        if (proactiveOpener) {
          console.log(`[6-LAYER] Generated proactive opener`);

          // Add opener to working memory
          addToWorkingMemory(userId, 'assistant', proactiveOpener);
          updateConversationContext(userId, 'christopher', '', proactiveOpener);

          return res.json({
            message: proactiveOpener,
            timestamp: new Date().toISOString(),
            proactive_opener: true,
            responseTime: Date.now() - startTime,
            memory_layers: Object.keys(memoryAssembly.layers)
          });
        }
      } catch (openerError) {
        console.error('[6-LAYER] Opener generation error:', openerError);
        // Continue with normal processing
      }
    }

    // STEP 7: If no message provided and no opener, request input
    if (!message || message.trim() === '') {
      return res.json({
        message: "What's on your mind?",
        timestamp: new Date().toISOString(),
        waiting_for_input: true,
        responseTime: Date.now() - startTime
      });
    }

    // STEP 8: Add user message to working memory
    addToWorkingMemory(userId, 'user', message);

    // STEP 8.5: Analyze cognitive patterns for profile building
    let cognitivePatterns = null;
    try {
      cognitivePatterns = await analyzeCognitivePatterns(conversationHistory, message);
      if (cognitivePatterns) {
        console.log(`[6-LAYER] Cognitive patterns analyzed`);
      }
    } catch (error) {
      console.error('[6-LAYER] Cognitive analysis error:', error);
    }

    // STEP 9: Build additional contexts
    const decisionContext = await buildDecisionContext(userId);
    const conversationContext = buildContextPrompt(userId);

    // STEP 10: Generate response with full memory context
    console.log(`[6-LAYER] Generating response at ${Date.now() - startTime}ms`);
    const draftResponse = await generateSplendorResponse(
      message,
      [], // Don't pass old memories - we have the full 6-layer context
      false,
      null, // Skip web search for speed
      {
        imageData,
        conversationHistory,
        decisionContext,
        conversationContext,
        memoryContext: memoryAssembly.systemPrompt // Full 6-layer memory
      }
    );

    // STEP 11: Check decision compliance
    const complianceResult = await checkDecisionCompliance(userId, message, draftResponse);
    let finalResponse = complianceResult.response;

    // STEP 11.5: Adaptive response enhancement (if cognitive profile exists)
    try {
      const userProfile = await getCognitiveProfile(userId);
      if (userProfile) {
        const adaptedResult = await adaptFullResponse(finalResponse, userProfile, {
          conversationHistory,
          userMessage: message,
          topic: 'general'
        });
        finalResponse = adaptedResult.adapted_response;
        console.log(`[6-LAYER] Response adapted using cognitive profile`);
      }
    } catch (error) {
      console.error('[6-LAYER] Adaptive response error (using original):', error);
      // Continue with original response if adaptation fails
    }

    // STEP 12: Check for context confusion and correct if needed
    if (detectContextConfusion(finalResponse, 'christopher')) {
      console.log(`[6-LAYER] Context confusion detected, adding clarification`);
      finalResponse = `Christopher, I notice I might be mixing up conversation threads. Let me refocus:\n\n${finalResponse}`;
    }

    // STEP 13: Add response to working memory
    addToWorkingMemory(userId, 'assistant', finalResponse);

    // STEP 14: Update conversation context for future coherence
    updateConversationContext(userId, 'christopher', message, finalResponse);

    // STEP 15: Increment conversation count (triggers compression every 20)
    await incrementConversationCount(userId);

    const totalTime = Date.now() - startTime;
    console.log(`[6-LAYER] Response completed in ${totalTime}ms`);

    res.json({
      message: finalResponse,
      timestamp: new Date().toISOString(),
      responseTime: totalTime,
      proactive_opener: null,
      memory_layers: Object.keys(memoryAssembly.layers),
      performance: {
        memoryAssemblyTime: totalTime,
        layersLoaded: Object.keys(memoryAssembly.layers).length,
        workingMemorySize: workingMemory.messages.length
      }
    });

  } catch (error) {
    console.error('[6-LAYER CHAT] Processing error:', error);

    // Try to end session gracefully on error
    try {
      await endSession(userId);
    } catch (sessionError) {
      console.error('[6-LAYER CHAT] Session end error:', sessionError);
    }

    res.status(500).json({
      error: 'Something went wrong. Please try again.',
      responseTime: Date.now() - startTime
    });
  }
}

// Enhanced session management
async function start6LayerSession(userId) {
  try {
    console.log(`[6-LAYER] Starting new session for user ${userId}`);

    // Initialize systems
    await initializeDbm(userId);
    startWorkingMemory(userId);

    // Assemble memory for proactive opener
    const memoryAssembly = await assembleMemoryLayers(userId);
    const proactiveOpener = await buildProactiveOpener(userId, memoryAssembly.systemPrompt);

    return {
      proactiveOpener,
      memoryLayers: Object.keys(memoryAssembly.layers),
      sessionStarted: new Date().toISOString()
    };

  } catch (error) {
    console.error('[6-LAYER] Session start error:', error);
    return null;
  }
}

async function end6LayerSession(userId, reason = 'user_ended') {
  try {
    console.log(`[6-LAYER] Ending session for user ${userId}, reason: ${reason}`);

    // Process session end and save episode
    await endSession(userId);

    return {
      sessionEnded: new Date().toISOString(),
      reason
    };

  } catch (error) {
    console.error('[6-LAYER] Session end error:', error);
    return null;
  }
}

// Get session status
function get6LayerSessionStatus(userId) {
  const workingMemory = getWorkingMemory(userId);

  return {
    isActive: !!workingMemory,
    startTime: workingMemory?.startTime,
    messageCount: workingMemory?.messageCount || 0,
    lastActivity: workingMemory?.messages.length > 0
      ? workingMemory.messages[workingMemory.messages.length - 1].timestamp
      : null
  };
}

module.exports = {
  process6LayerChat,
  start6LayerSession,
  end6LayerSession,
  get6LayerSessionStatus
};