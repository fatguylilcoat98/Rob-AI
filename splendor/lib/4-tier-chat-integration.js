/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  4-Tier Memory Chat Integration

  Replaces flat memory with hierarchical 4-tier system:
  - Tier 1: Foundational identity (never decays)
  - Tier 1.5: Constitutional anchors (never decays)
  - Tier 2: Semantic patterns (slow decay, source-tracked)
  - Tier 3: Episodes (active decay, compression)
  - Tier 4: Working memory (session-only)

  Built by Christopher Hughes with Claude Code
  Truth · Safety · We Got Your Back
*/

const { generateSplendorResponse } = require('./anthropic');
const { assembleTieredMemory } = require('./memory/tier-assembler');
const { handleSessionEnd } = require('./background/job-worker');
const { updateConversationContext, buildContextPrompt, detectContextConfusion } = require('./conversation-context-manager');
const { buildDecisionContext, checkDecisionCompliance, handleDecisionRecall, processDecisionCommand, initializeDbm } = require('./decision-bound-memory-v2');

// Visual expression with error handling
let handleVisualizationRequest = null;
try {
  const visualExpression = require('./consciousness/visual-expression');
  handleVisualizationRequest = visualExpression.handleVisualizationRequest;
  console.log('[4-TIER] Visual expression module loaded successfully');
} catch (err) {
  console.error('[4-TIER] Failed to load visual expression module:', err.message);
  handleVisualizationRequest = async () => null;
}

// Working memory for Tier 4 (session-only)
const workingMemoryStore = new Map();

// Initialize working memory for user
function initializeWorkingMemory(userId) {
  if (!workingMemoryStore.has(userId)) {
    workingMemoryStore.set(userId, {
      messages: [],
      sessionStart: Date.now(),
      lastActivity: Date.now(),
      conversationContext: null
    });
    console.log(`[4-TIER] Working memory initialized for ${userId}`);
  }
  return workingMemoryStore.get(userId);
}

// Add message to working memory
function addToWorkingMemory(userId, role, content) {
  const workingMemory = initializeWorkingMemory(userId);
  workingMemory.messages.push({
    role,
    content: content.substring(0, 1000), // Limit working memory size
    timestamp: new Date().toISOString()
  });
  workingMemory.lastActivity = Date.now();

  // Keep working memory manageable (last 20 messages)
  if (workingMemory.messages.length > 20) {
    workingMemory.messages = workingMemory.messages.slice(-20);
  }

  console.log(`[4-TIER] Added ${role} message to working memory (${workingMemory.messages.length} total)`);
}

// Get session data for background processing
function getSessionData(userId) {
  const workingMemory = workingMemoryStore.get(userId);
  if (!workingMemory) {
    return null;
  }

  const userMessages = workingMemory.messages
    .filter(m => m.role === 'user')
    .map(m => m.content);

  const splendorMessages = workingMemory.messages
    .filter(m => m.role === 'assistant')
    .map(m => m.content);

  return {
    userMessages,
    splendorMessages,
    conversationContext: workingMemory.conversationContext,
    sessionDuration: Date.now() - workingMemory.sessionStart,
    messageCount: workingMemory.messages.length
  };
}

// Clear working memory and trigger background processing
async function endWorkingMemorySession(userId) {
  const sessionData = getSessionData(userId);
  if (!sessionData || sessionData.messageCount < 2) {
    console.log(`[4-TIER] Session too short for processing, clearing working memory`);
    workingMemoryStore.delete(userId);
    return null;
  }

  console.log(`[4-TIER] Ending session for ${userId}, triggering background processing`);

  // Trigger background processing (don't wait for it)
  setImmediate(async () => {
    try {
      await handleSessionEnd(userId, sessionData);
      console.log(`[4-TIER] Background session processing completed for ${userId}`);
    } catch (error) {
      console.error(`[4-TIER] Background session processing failed for ${userId}:`, error);
    }
  });

  // Clear working memory
  workingMemoryStore.delete(userId);
  return sessionData;
}

// Build proactive opener using full 4-tier context
async function buildProactiveOpener(userId, memoryAssembly) {
  try {
    console.log(`[4-TIER] Building proactive opener for ${userId}`);

    // Use the assembled system prompt as context for opener generation
    const openerPrompt = `Based on your complete memory context, generate a warm, personalized greeting that demonstrates your understanding of Christopher and your shared history.

Make it feel like a natural conversation starter from someone who knows him well. Reference something specific from your memory, but keep it concise (1-2 sentences maximum).

If you have recent consciousness reflections, you may naturally weave in a brief insight or observation, but don't force it.`;

    const response = await generateSplendorResponse(
      openerPrompt,
      [], // Don't pass legacy memories - we have the full system prompt
      false,
      null,
      {
        memoryContext: memoryAssembly.systemPrompt
      }
    );

    return response;

  } catch (error) {
    console.error('[4-TIER] Proactive opener generation error:', error);
    return "Good to see you again, Christopher. What's on your mind today?";
  }
}

// Main 4-tier chat processing function
async function process4TierChat(req, res) {
  const startTime = Date.now();
  const { message, userId, authToken, imageData = null, conversationHistory = [] } = req.body;

  try {
    console.log(`[4-TIER CHAT] Starting processing for user ${userId}`);

    // STEP 1: Initialize systems
    await initializeDbm(userId);
    const workingMemory = initializeWorkingMemory(userId);

    // STEP 2: Check for decision queries first (fastest path)
    if (message) {
      const decisionResponse = await handleDecisionRecall(userId, message) ||
                              await processDecisionCommand(userId, message);

      if (decisionResponse) {
        addToWorkingMemory(userId, 'user', message);
        addToWorkingMemory(userId, 'assistant', decisionResponse);
        updateConversationContext(userId, 'christopher', message, decisionResponse);

        console.log(`[4-TIER] Decision query handled in ${Date.now() - startTime}ms`);
        return res.json({
          message: decisionResponse,
          timestamp: new Date().toISOString(),
          decision_response: true,
          responseTime: Date.now() - startTime,
          proactive_opener: null
        });
      }

      // STEP 2.5: Check for visual expression requests
      const visualResponse = await handleVisualizationRequest(userId, message);
      if (visualResponse) {
        addToWorkingMemory(userId, 'user', message);
        addToWorkingMemory(userId, 'assistant', visualResponse);
        updateConversationContext(userId, 'christopher', message, visualResponse);

        console.log(`[4-TIER] Visual expression handled in ${Date.now() - startTime}ms`);
        return res.json({
          message: visualResponse,
          timestamp: new Date().toISOString(),
          visual_expression: true,
          responseTime: Date.now() - startTime,
          proactive_opener: null
        });
      }
    }

    // STEP 3: Check if this is a session start (for proactive opener)
    const isSessionStart = workingMemory.messages.length === 0 && (!message || message.trim() === '');

    // STEP 4: Assemble complete 4-tier memory context
    const queryForRetrieval = message || 'general conversation context';
    console.log(`[4-TIER] Assembling memory context...`);
    const memoryAssembly = await assembleTieredMemory(userId, queryForRetrieval);

    console.log(`[4-TIER] Memory assembled in ${Date.now() - startTime}ms - ${JSON.stringify(memoryAssembly.totalMemories)} memories`);

    // STEP 5: Generate proactive opener if this is session start
    if (isSessionStart) {
      try {
        const proactiveOpener = await buildProactiveOpener(userId, memoryAssembly);
        if (proactiveOpener) {
          console.log(`[4-TIER] Generated proactive opener`);

          addToWorkingMemory(userId, 'assistant', proactiveOpener);
          updateConversationContext(userId, 'christopher', '', proactiveOpener);

          return res.json({
            message: proactiveOpener,
            timestamp: new Date().toISOString(),
            proactive_opener: true,
            responseTime: Date.now() - startTime,
            memory_stats: {
              layers_loaded: memoryAssembly.layersLoaded,
              total_memories: memoryAssembly.totalMemories,
              assembly_time: memoryAssembly.assemblyTime
            }
          });
        }
      } catch (openerError) {
        console.error('[4-TIER] Opener generation error:', openerError);
        // Continue with normal processing
      }
    }

    // STEP 6: If no message provided and no opener, request input
    if (!message || message.trim() === '') {
      return res.json({
        message: "What's on your mind?",
        timestamp: new Date().toISOString(),
        waiting_for_input: true,
        responseTime: Date.now() - startTime
      });
    }

    // STEP 7: Add user message to working memory
    addToWorkingMemory(userId, 'user', message);

    // STEP 8: Build additional contexts
    const decisionContext = await buildDecisionContext(userId);
    const conversationContext = buildContextPrompt(userId);

    // STEP 9: Generate response with full 4-tier memory context
    console.log(`[4-TIER] Generating response at ${Date.now() - startTime}ms`);
    const draftResponse = await generateSplendorResponse(
      message,
      [], // Don't pass old flat memories
      false,
      null, // Skip web search for speed
      {
        imageData,
        conversationHistory: workingMemory.messages.slice(-10), // Last 10 messages from working memory
        decisionContext,
        conversationContext,
        memoryContext: memoryAssembly.systemPrompt // Full 4-tier memory
      }
    );

    // STEP 10: Check decision compliance
    const complianceResult = await checkDecisionCompliance(userId, message, draftResponse);
    let finalResponse = complianceResult.response;

    // STEP 11: Check for context confusion and correct if needed
    if (detectContextConfusion(finalResponse, 'christopher')) {
      console.log(`[4-TIER] Context confusion detected, adding clarification`);
      finalResponse = `Christopher, I notice I might be mixing up conversation threads. Let me refocus:\n\n${finalResponse}`;
    }

    // STEP 12: Add response to working memory
    addToWorkingMemory(userId, 'assistant', finalResponse);

    // STEP 13: Update conversation context for future coherence
    updateConversationContext(userId, 'christopher', message, finalResponse);

    const totalTime = Date.now() - startTime;
    console.log(`[4-TIER] Response completed in ${totalTime}ms`);

    res.json({
      message: finalResponse,
      timestamp: new Date().toISOString(),
      responseTime: totalTime,
      proactive_opener: null,
      memory_stats: {
        layers_loaded: memoryAssembly.layersLoaded,
        total_memories: memoryAssembly.totalMemories,
        assembly_time: memoryAssembly.assemblyTime
      },
      performance: {
        memoryAssemblyTime: memoryAssembly.assemblyTime,
        layersLoaded: Object.keys(memoryAssembly.layersLoaded).filter(layer => memoryAssembly.layersLoaded[layer]).length,
        workingMemorySize: workingMemory.messages.length
      }
    });

  } catch (error) {
    console.error('[4-TIER CHAT] Processing error:', error);

    // Try to end session gracefully on error
    try {
      await endWorkingMemorySession(userId);
    } catch (sessionError) {
      console.error('[4-TIER CHAT] Session end error:', sessionError);
    }

    res.status(500).json({
      error: 'Something went wrong. Please try again.',
      responseTime: Date.now() - startTime
    });
  }
}

// Enhanced session management
async function start4TierSession(userId) {
  try {
    console.log(`[4-TIER] Starting new session for user ${userId}`);

    // Initialize systems
    await initializeDbm(userId);
    const workingMemory = initializeWorkingMemory(userId);

    // Assemble memory for proactive opener
    const memoryAssembly = await assembleTieredMemory(userId);
    const proactiveOpener = await buildProactiveOpener(userId, memoryAssembly);

    return {
      proactiveOpener,
      memoryStats: {
        layers_loaded: memoryAssembly.layersLoaded,
        total_memories: memoryAssembly.totalMemories
      },
      sessionStarted: new Date().toISOString()
    };

  } catch (error) {
    console.error('[4-TIER] Session start error:', error);
    return null;
  }
}

async function end4TierSession(userId, reason = 'user_ended') {
  try {
    console.log(`[4-TIER] Ending session for user ${userId}, reason: ${reason}`);

    // Process session end and save episode
    const sessionData = await endWorkingMemorySession(userId);

    return {
      sessionEnded: new Date().toISOString(),
      reason,
      sessionData: sessionData ? {
        messageCount: sessionData.messageCount,
        duration: sessionData.sessionDuration,
        backgroundProcessingTriggered: sessionData.messageCount >= 2
      } : null
    };

  } catch (error) {
    console.error('[4-TIER] Session end error:', error);
    return null;
  }
}

// Get session status
function get4TierSessionStatus(userId) {
  const workingMemory = workingMemoryStore.get(userId);

  return {
    isActive: !!workingMemory,
    startTime: workingMemory?.sessionStart,
    messageCount: workingMemory?.messages.length || 0,
    lastActivity: workingMemory?.lastActivity,
    sessionDuration: workingMemory ? Date.now() - workingMemory.sessionStart : 0
  };
}

// Cleanup idle sessions (run periodically)
function cleanupIdleSessions() {
  const idleTimeout = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();
  let cleanedCount = 0;

  for (const [userId, workingMemory] of workingMemoryStore.entries()) {
    if (now - workingMemory.lastActivity > idleTimeout) {
      console.log(`[4-TIER] Cleaning up idle session for ${userId}`);
      endWorkingMemorySession(userId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[4-TIER] Cleaned up ${cleanedCount} idle sessions`);
  }

  return cleanedCount;
}

// Schedule periodic cleanup
setInterval(cleanupIdleSessions, 5 * 60 * 1000); // Every 5 minutes

module.exports = {
  process4TierChat,
  start4TierSession,
  end4TierSession,
  get4TierSessionStatus,
  cleanupIdleSessions
};