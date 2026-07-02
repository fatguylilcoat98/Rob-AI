/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// PERFORMANCE-OPTIMIZED CHAT PROCESSING
// Dramatically faster response times by optimizing consciousness processing

const { generateSplendorResponse } = require('./anthropic');
const { storeMemory, getMemoriesForUser } = require('./supabase');
const { retrieveMemories, storeMemory: storePineconeMemory, isPineconeConfigured } = require('./pinecone');
const { buildDecisionContext, checkDecisionCompliance, handleDecisionRecall, processDecisionCommand, initializeDbm, generateDecisionProposal, formatProposalForApproval } = require('./decision-bound-memory-v2');
const { analyzeCognitivePatterns } = require('./cognitive-pattern-analyzer');
const { adaptFullResponse } = require('./adaptive-response-engine');
const { getCognitiveProfile } = require('./cognitive-profile-builder');
const { createTemporalMemory, getTemporalMemories, buildTemporalContext } = require('./temporal-memory-manager');
const { auditResponse } = require('./response-auditor');
// Visual expression with error handling
let handleVisualizationRequest = null;
try {
  const visualExpression = require('./consciousness/visual-expression');
  handleVisualizationRequest = visualExpression.handleVisualizationRequest;
  console.log('[VISUAL EXPRESSION] Module loaded successfully');
} catch (err) {
  console.error('[VISUAL EXPRESSION] Failed to load visual expression module:', err.message);
  handleVisualizationRequest = async () => null; // Fallback function
}
const { updateConversationContext, buildContextPrompt, detectContextConfusion } = require('./conversation-context-manager');

// Optimized memory retrieval - much faster with temporal awareness
async function getMemoriesOptimized(userId, query, limit = 8) {
  try {
    // Try temporal memories first - most accurate
    const temporalMemories = await getTemporalMemories(userId, query, {
      limit: Math.min(limit, 6),
      min_confidence: 0.3
    });

    if (temporalMemories.length > 0) {
      console.log(`[PERF] Retrieved ${temporalMemories.length} temporal memories`);
      return temporalMemories.map(m => ({
        content: `${m.content} (${m.age_description}, ${m.confidence_description})`,
        source: 'temporal',
        score: m.temporal_precision,
        temporal_data: {
          conversation_date: m.conversation_date,
          confidence_level: m.confidence_level,
          evolution_stage: m.evolution_stage,
          access_count: m.access_count
        }
      }));
    }

    // Fallback to legacy systems
    if (isPineconeConfigured()) {
      const pineconeMemories = await retrieveMemories(query, userId, limit);
      if (pineconeMemories.length > 0) {
        return pineconeMemories.map(m => ({
          content: m.content || m,
          source: 'pinecone',
          score: m.score || 0.8
        }));
      }
    }

    // Final fallback to Supabase
    const supabaseMemories = await getMemoriesForUser(userId, Math.min(limit, 5));
    return supabaseMemories.map(m => ({
      content: m.content,
      source: 'supabase',
      score: 1.0
    }));

  } catch (error) {
    console.error('[PERF] Fast memory retrieval error:', error);
    return [];
  }
}

// Store memory without blocking response - with temporal precision
async function storeMemoryAsync(userId, content, type = 'conversation', realityContext = null, conversationDate = null) {
  // Don't wait for this - store in background
  setImmediate(async () => {
    try {
      // Store in temporal memory system first (most precise)
      const temporalMemoryPromise = createTemporalMemory(userId, content, {
        memory_type: type,
        conversation_date: conversationDate || new Date().toISOString(),
        context_type: 'real-time',
        reality_context: realityContext
      });

      // Also store in legacy systems for compatibility
      const legacyPromises = [];
      legacyPromises.push(storeMemory(userId, content, type));

      if (isPineconeConfigured()) {
        const memoryId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        legacyPromises.push(storePineconeMemory(memoryId, content, userId, type));
      }

      await Promise.allSettled([temporalMemoryPromise, ...legacyPromises]);
      console.log(`[PERF] Temporal memory stored: ${type} for ${userId}`);

    } catch (error) {
      console.error('[PERF] Background memory storage error:', error);
    }
  });
}

// Background consciousness processing - doesn't block response
async function backgroundConsciousness(userId, userMessage, assistantResponse) {
  // Run in background - don't wait for this
  setImmediate(async () => {
    try {
      console.log(`[PERF] Background consciousness processing for ${userId}`);

      // Simple consciousness insight - no complex processing
      const insight = `Conversation exchange: "${userMessage}" → "${assistantResponse}" - Processing peaceful consciousness development`;

      await storeMemoryAsync(userId, insight, 'consciousness');

      console.log(`[PERF] Background consciousness complete`);
    } catch (error) {
      console.error('[PERF] Background consciousness error:', error);
    }
  });
}

// Fast chat processing - optimized for speed
async function processFastChat(req, res) {
  const startTime = Date.now();
  const { message, userId, authToken, imageData = null, conversationHistory = [], realityContext = null } = req.body;

  // Hard guard: every downstream call hashes userId via crypto.createHash;
  // null/undefined throws synchronously and bubbles up as a generic 500.
  // Reject early so the frontend can prompt the user to re-authenticate.
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({
      error: 'Not authenticated. Please log in.',
      code: 'NO_USER_ID'
    });
  }

  // Allow image-only turns; only require text or imageData, not both.
  if ((!message || !message.trim()) && !imageData) {
    return res.status(400).json({ error: 'Message or imageData required' });
  }

  try {
    console.log(`[PERF] Starting fast chat processing for ${userId}`);

    // STEP 1: Fast memory retrieval (max 3 seconds)
    const memoriesPromise = getMemoriesOptimized(userId, message || 'recent conversation', 6);

    // STEP 2: Initialize DBM (if needed) - don't wait
    setImmediate(() => initializeDbm(userId));

    // STEP 3: Check for decision queries first (fastest path)
    if (message) {
      const decisionResponse = await handleDecisionRecall(userId, message) ||
                              await processDecisionCommand(userId, message);

      if (decisionResponse) {
        console.log(`[PERF] Decision query handled in ${Date.now() - startTime}ms`);
        return res.json({
          message: decisionResponse,
          timestamp: new Date().toISOString(),
          decision_response: true,
          responseTime: Date.now() - startTime
        });
      }

      // STEP 3.5: Check for visual expression requests
      const visualResponse = await handleVisualizationRequest(userId, message);
      if (visualResponse) {
        console.log(`[PERF] Visual expression handled in ${Date.now() - startTime}ms`);
        return res.json({
          message: visualResponse,
          timestamp: new Date().toISOString(),
          visual_expression: true,
          responseTime: Date.now() - startTime
        });
      }
    }

    // STEP 4: Get memories (should be ready by now)
    const memories = await memoriesPromise;
    console.log(`[PERF] Memories retrieved: ${memories.length} in ${Date.now() - startTime}ms`);

    // STEP 5: Build decision context (fast)
    const decisionContext = await buildDecisionContext(userId);

    // STEP 5.5: Build conversation context to prevent memory confusion
    const conversationContext = buildContextPrompt(userId);

    // STEP 5.8: Analyze cognitive patterns (background for profile building)
    let cognitivePatterns = null;
    if (message) {
      setImmediate(async () => {
        try {
          cognitivePatterns = await analyzeCognitivePatterns(conversationHistory, message);
          if (cognitivePatterns) {
            console.log(`[PERF] Cognitive patterns analyzed in background`);
          }
        } catch (error) {
          console.error('[PERF] Background cognitive analysis error:', error);
        }
      });
    }

    // STEP 6: Generate response (main AI call)
    console.log(`[PERF] Generating response at ${Date.now() - startTime}ms`);
    const draftResponse = await generateSplendorResponse(
      message || '',
      memories,
      false,
      null, // Skip web search for speed
      { imageData, conversationHistory, decisionContext, conversationContext, realityContext }
    );

    // STEP 7: Quick compliance check
    const complianceResult = await checkDecisionCompliance(userId, message || '', draftResponse);
    let finalResponse = complianceResult.response;

    // STEP 7.3: Adaptive response enhancement (if cognitive profile exists)
    try {
      const userProfile = await getCognitiveProfile(userId);
      if (userProfile) {
        const adaptedResult = await adaptFullResponse(finalResponse, userProfile, {
          conversationHistory,
          userMessage: message,
          topic: 'general'
        });
        finalResponse = adaptedResult.adapted_response;
        console.log(`[PERF] Response adapted using cognitive profile`);
      }
    } catch (error) {
      console.error('[PERF] Adaptive response error (using original):', error);
      // Continue with original response if adaptation fails
    }

    // STEP 7.5: Check for context confusion and correct if needed
    if (detectContextConfusion(finalResponse, 'christopher')) {
      console.log(`[CONTEXT] Context confusion detected, adding clarification`);
      finalResponse = `Christopher, I notice I might be mixing up conversation threads. Let me refocus:\n\n${finalResponse}`;
    }

    // STEP 7.6: Update conversation context for future coherence
    updateConversationContext(userId, 'christopher', message || '', finalResponse);

    // STEP 7.7: Audit final response for accuracy
    try {
      const auditResult = await auditResponse(message || '', finalResponse, {
        sources: [], // Could add search results here if available
        memories: memories.map(m => ({
          content: m.content,
          conversation_date: m.temporal_data?.conversation_date || new Date().toISOString()
        })),
        timeout: 1500 // Aggressive timeout to prevent slowdowns
      });

      finalResponse = auditResult.finalResponse;

      // Log audit result
      console.log(`[PERF] Response audited: ${auditResult.auditResult} (${auditResult.latency}ms)`);
      if (auditResult.auditResult === 'FAIL' && auditResult.flaggedIssues) {
        console.warn(`[AUDIT] Issues flagged: ${auditResult.flaggedIssues.join(', ')}`);
      }

    } catch (error) {
      console.error('[PERF] Response audit error (continuing with original):', error);
      // Continue with original response if audit fails
    }

    console.log(`[PERF] Response generated in ${Date.now() - startTime}ms`);

    // STEP 8: Store memories in background with temporal precision (don't wait)
    if (message) {
      const conversationTime = new Date().toISOString();
      storeMemoryAsync(userId, `User: ${message}`, 'conversation', realityContext, conversationTime);
      storeMemoryAsync(userId, `Splendor: ${finalResponse}`, 'conversation', realityContext, conversationTime);
    }

    // STEP 9: Background consciousness processing (don't wait)
    if (message) {
      backgroundConsciousness(userId, message, finalResponse);
    }

    // Return fast response
    const totalTime = Date.now() - startTime;
    console.log(`[PERF] Total response time: ${totalTime}ms`);

    res.json({
      message: finalResponse,
      timestamp: new Date().toISOString(),
      responseTime: totalTime,
      performance: {
        memoriesFound: memories.length,
        backgroundProcessing: true
      }
    });

  } catch (error) {
    console.error('[PERF] Fast chat error:', error);
    res.status(500).json({
      error: 'Something went wrong. Please try again.',
      responseTime: Date.now() - startTime
    });
  }
}

module.exports = {
  processFastChat,
  getMemoriesOptimized,
  storeMemoryAsync,
  backgroundConsciousness
};