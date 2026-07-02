/**
 * ENHANCED CHAT ROUTE WITH COMPLETE MEMORY + TAVILY INTEGRATION
 * Replaces existing chat route with full memory system
 */

const express = require('express');
const { EnhancedMemorySystem } = require('../lib/enhanced-memory-integration.js');
const { requireAuth, requireOwner } = require('../middleware/auth.js');
const emailModule = require('./email');
const { getMemoriesForUser } = require('../lib/supabase');
const { runArtCapability, isArtRequest } = require('../lib/capability-router');
const { buildTurnContext } = require('../lib/turn-context');
const { buildMindContext } = require('../lib/mind-turn');
const { recordFinalGovernanceOutcome } = require('../lib/final-governance-outcome-recorder');
const router = express.Router();

// Streams the placeholder token, runs the unified art generator, then
// emits `event: art` on success or `event: art_failed` on failure so the
// frontend can surface a real reason. Returns true if the request was
// handled (caller must NOT continue to normal chat).
async function handleArtStreamIntercept(send, userId, message) {
  send('token', { text: 'Painting…' });

  // Shared capability router (Phase 2): one detect-and-generate path with one
  // user-facing error switch. SSE framing below is unchanged.
  const art = await runArtCapability({ userId, message, source: 'chat' });
  if (!art.isArt) return false; // caller already guarded; defensive only.

  if (!art.ok) {
    send('art_failed', {
      request_id: art.requestId,
      error_category: art.errorCategory,
      error_message: art.errorMessage,
      reply: art.userFacing,
    });
    send('done', { full: art.userFacing, art: true, ok: false });
    return true;
  }

  send('token', { text: art.description });
  send('art', {
    request_id: art.requestId,
    image_url: art.imageUrl,
    audio_b64: art.audioB64,
    revised_prompt: art.revisedPrompt,
    description: art.description,
    model: art.model,
  });
  send('done', { full: art.description, art: true, ok: true });
  return true;
}

// Build a normalized trace object from what actually happened in this turn.
// Consumed by the constellation UI to light up the correct nodes.
function buildTurnTrace(req, result) {
  const claspion = req.claspionValidation || {};
  const stats  = (result && result.memoryStats) || {};
  const ctx    = (result && result.context)     || {};
  const events = [];

  events.push({ stage: 'message_received', status: 'complete' });
  events.push({ stage: 'intent_classified', status: 'complete' });

  // Memory — only include layers that were actually consulted
  const layers = ['working'];
  if ((stats.factsUsed || 0) > 0 || (ctx.facts && ctx.facts.length > 0))
    layers.push('core_mem');
  if ((stats.interpretationsUsed || 0) > 0 || (ctx.interpretations && ctx.interpretations.length > 0))
    layers.push('episodic');
  if ((stats.bindingRulesActive || 0) > 0 || (ctx.governingRules && ctx.governingRules.length > 0))
    layers.push('semantic');
  if (stats.webSearchPerformed)
    layers.push('provenance');
  events.push({ stage: 'memory_lookup', status: 'complete', layers });

  // Governance — CLASPION middleware runs on every chat POST
  const dec = claspion.decision || {};
  const decisionType = dec.decision_type || (claspion.allow === false ? 'BLOCK' : 'ALLOW');
  const mode = dec.conscience_name || claspion.conscience_name || 'dormant';
  events.push({ stage: 'governance_checked', status: 'complete', decision: decisionType, mode });

  const failedAxes = claspion.failed_axes || dec.failed_axes || [];
  if (failedAxes.length > 0 || decisionType === 'BLOCK')
    events.push({ stage: 'rules_applied', status: 'complete', rules: failedAxes });

  events.push({ stage: 'response_generated', status: 'complete' });
  events.push({ stage: 'audit_logged', status: 'complete' });
  return { events };
}

// Email-intent intercept used by both /chat and /chat/stream. If the
// user's message reads like "email me X", we fire the email through the
// shared sendEmailForIntent helper and short-circuit the LLM with a
// canned acknowledgment. Returns null if no intent or fallthrough wanted.
async function handleEmailIntentForChat(userId, message) {
  if (!emailModule.detectEmailIntent || !emailModule.sendEmailForIntent) return null;
  const intent = emailModule.detectEmailIntent(message);
  if (!intent.matched) return null;

  // If no explicit topic, summarize recent shared_history for context.
  let conversationContext = '';
  if (!intent.topic) {
    try {
      const recent = await getMemoriesForUser(userId, 8);
      conversationContext = (recent || [])
        .slice()
        .reverse()
        .map(m => (m && m.content) || '')
        .filter(Boolean)
        .join('\n');
    } catch (_) {}
  }

  const result = await emailModule.sendEmailForIntent(userId, intent, {
    source: 'chat',
    conversation_context: conversationContext,
  });

  if (result.rate_limited) {
    return { reply: "I just sent one — give it a moment." };
  }
  if (!result.sent) {
    // Failure to send — fall through to normal chat so the user still
    // gets a reply, and so they can ask again.
    console.warn('[email-intent] chat send failed, falling through:', result.error);
    return null;
  }
  const reply = intent.topic
    ? `Sent. Email about "${intent.topic}" is in your inbox.`
    : `Sent. A recap of our conversation is in your inbox.`;
  return { reply };
}

// Initialize enhanced memory system (with error handling)
let memorySystem = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    memorySystem = new EnhancedMemorySystem({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_SERVICE_KEY,
      pineconeApiKey: process.env.PINECONE_API_KEY,
      pineconeEnvironment: process.env.PINECONE_ENVIRONMENT,
      pineconeIndexName: process.env.PINECONE_INDEX_NAME,
      tavilyApiKey: process.env.TAVILY_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY
    });
    console.log('✅ Enhanced memory system initialized');
  } else {
    console.log('⚠️ Enhanced memory system disabled - missing Supabase credentials');
  }
} catch (error) {
  console.log('❌ Enhanced memory system initialization failed:', error.message);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED CHAT ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/chat', requireAuth, requireOwner, async (req, res) => {
  try {
    const {
      message,
      sessionId = generateSessionId(),
      workspaceId,
      imageData                       // v15.18.3 — vision: base64 JPEG, no data: prefix
    } = req.body;

    const userId = req.userId;

    if (!message) {
      return res.status(400).json({
        error: 'Message is required'
      });
    }

    // Check if enhanced memory system is available
    if (!memorySystem) {
      return res.status(503).json({
        error: 'Enhanced memory system not available',
        message: 'Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY)',
        fallback: 'Use /api/chat for basic Splendor functionality'
      });
    }

    // Art-intent intercept (Phase 2) — this NON-stream handler previously had
    // NO art intercept (divergence D4), so a 503-fallback image request reached
    // the capability-blind model and got refused. Now it runs the SAME shared
    // router as the stream + council + voice paths. Skipped when an image is
    // attached (Chris wants Splendor to LOOK at it, not paint). The response
    // keeps this handler's existing { success, response, …stats } shape and
    // adds an `art` block mirroring /api/chat.
    if (!imageData) {
      const art = await runArtCapability({ userId, message, source: 'chat' });
      if (art.isArt) {
        const EMPTY_STATS = { factsUsed: 0, interpretationsUsed: 0, bindingRulesActive: 0, webSearchPerformed: false, webResultsCount: 0 };
        const EMPTY_SUMMARY = { facts_used: 0, interpretations_used: 0, binding_rules_active: 0, web_search_performed: false, uncertainty_warnings: 0 };
        if (art.ok) {
          return res.json({
            success: true,
            response: art.description,
            art: { generated: true, request_id: art.requestId, image_url: art.imageUrl, audio_b64: art.audioB64, revised_prompt: art.revisedPrompt, model: art.model },
            memory_stats: EMPTY_STATS, session_id: sessionId, workspace_id: workspaceId, context_summary: EMPTY_SUMMARY,
          });
        }
        return res.json({
          success: true,
          response: art.userFacing,
          art: { generated: false, request_id: art.requestId, error_category: art.errorCategory, error_message: art.errorMessage },
          memory_stats: EMPTY_STATS, session_id: sessionId, workspace_id: workspaceId, context_summary: EMPTY_SUMMARY,
        });
      }
    }

    // Email-intent intercept — short-circuits the LLM with an acknowledgment
    // when the user explicitly asks Splendor to email them. Skip when an
    // image is attached — that's a vision question, not an email request.
    if (!imageData) {
      const emailIntent = await handleEmailIntentForChat(userId, message);
      if (emailIntent) {
        return res.json({
          success: true,
          response: emailIntent.reply,
          memory_stats: { factsUsed: 0, interpretationsUsed: 0, bindingRulesActive: 0, webSearchPerformed: false, webResultsCount: 0 },
          session_id: sessionId,
          workspace_id: workspaceId,
          context_summary: { facts_used: 0, interpretations_used: 0, binding_rules_active: 0, web_search_performed: false, uncertainty_warnings: 0 },
          email_handled: true,
        });
      }
    }

    // Shared turn context (Phase 1) + Digital Mind v0.4 context — concurrent.
    const [turn, mind] = await Promise.all([
      buildTurnContext({ userId, message, logTag: 'ENHANCED' }),
      buildMindContext(userId),
    ]);

    // Process conversation with enhanced memory system
    const result = await memorySystem.processConversation(
      userId,
      message,
      sessionId,
      workspaceId,
      { imageData, identityContext: turn.identity.context, accountabilityContext: turn.accountability.context, mindContext: mind.context, isOwner: req.isOwner, guestSession: req.isGuest }
    );

    res.json({
      success: true,
      response: result.response,
      memory_stats: result.memoryStats,
      session_id: sessionId,
      workspace_id: workspaceId,
      context_summary: {
        facts_used: result.context.facts.length,
        interpretations_used: result.context.interpretations.length,
        binding_rules_active: result.context.governingRules.length,
        web_search_performed: result.memoryStats.webSearchPerformed,
        uncertainty_warnings: result.context.facts.filter(f =>
          f.retrievalConfidenceLabel !== 'grounded'
        ).length
      }
    });

    // Digital Mind v0.4 — update emotion state for this turn
    mind.postTurn(message, result.response).catch(() => {});

    // Record final user-visible governance outcome — fire-and-forget.
    recordFinalGovernanceOutcome({
      userMessage: message,
      assistantResponse: result.response,
      requestId: sessionId || null,
      userId,
      route: 'enhanced-chat',
    });

  } catch (error) {
    console.error('Enhanced chat error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING CHAT ENDPOINT — SSE
// ═══════════════════════════════════════════════════════════════════════════════
// Same memory + governance + activity-bus pipeline as POST /chat, but the
// LLM reply streams token-by-token so the bubble can update live instead
// of waiting for the full response.

router.post('/chat/stream', requireAuth, requireOwner, async (req, res) => {
  const {
    message,
    sessionId = generateSessionId(),
    workspaceId,
    imageData                         // v15.18.3 — vision: base64 JPEG, no data: prefix
  } = req.body;

  const userId = req.userId;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  if (!memorySystem) {
    return res.status(503).json({
      error: 'Enhanced memory system not available',
      message: 'Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY)',
      fallback: 'Use /api/chat for basic Splendor functionality'
    });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  };
  send('open', { session_id: sessionId, ts: Date.now() });

  // Keep the socket warm through proxies that timeout idle connections.
  const heartbeat = setInterval(() => {
    try { res.write(`: ping ${Date.now()}\n\n`); } catch (_) {}
  }, 15000);

  let aborted = false;
  req.on('close', () => { aborted = true; clearInterval(heartbeat); });

  // Art-intent intercept — happens BEFORE the email check. On a successful
  // generation, the helper emits its own token/art/done events and we end
  // the stream here. On failure, fall through to email then normal chat.
  // Skip when an image is attached — Chris wants Splendor to LOOK at the
  // photo, not generate a new one.
  if (!imageData && isArtRequest(message)) {
    try {
      const handled = await handleArtStreamIntercept(send, userId, message);
      if (handled) {
        if (!aborted) { /* events already sent */ }
        clearInterval(heartbeat);
        try { res.end(); } catch (_) {}
        return;
      }
    } catch (e) {
      console.warn('[art-intent] stream intercept failed, falling through:', e && e.message);
    }
  }

  // Email-intent intercept — same as the non-stream path but emits as
  // a single-token SSE flush so the client renders the canned reply
  // and stops in lockstep with regular streaming UX. Skipped when an
  // image is attached.
  if (!imageData) {
    try {
      const emailIntent = await handleEmailIntentForChat(userId, message);
      if (emailIntent) {
        if (!aborted) {
          send('token', { text: emailIntent.reply });
          send('done', {
            full: emailIntent.reply,
            memory_stats: { factsUsed: 0, interpretationsUsed: 0, bindingRulesActive: 0, webSearchPerformed: false, webResultsCount: 0 },
            session_id: sessionId,
            workspace_id: workspaceId,
            email_handled: true,
          });
        }
        clearInterval(heartbeat);
        try { res.end(); } catch (_) {}
        return;
      }
    } catch (e) {
      console.warn('[email-intent] stream intercept failed, falling through:', e && e.message);
    }
  }

  // Shared turn context (Phase 1) + Digital Mind v0.4 context — concurrent.
  const [turn, mind] = await Promise.all([
    buildTurnContext({ userId, message, logTag: 'ENHANCED-STREAM' }),
    buildMindContext(userId),
  ]);

  try {
    const result = await memorySystem.streamConversation(
      userId,
      message,
      sessionId,
      workspaceId,
      {
        imageData,                    // v15.18.3 — vision
        identityContext: turn.identity.context,
        accountabilityContext: turn.accountability.context,
        mindContext: mind.context,
        isOwner: req.isOwner,
        guestSession: req.isGuest,
        onToken: (text) => {
          if (!aborted && text) send('token', { text });
        },
        onError: (err) => {
          if (!aborted) send('error', { message: err && err.message || String(err) });
        },
      },
    );

    // Digital Mind v0.4 — update emotion state for this stream turn
    if (!aborted) mind.postTurn(message, result.response).catch(() => {});

    if (!aborted) {
      send('done', {
        full: result.response,
        memory_stats: result.memoryStats,
        session_id: sessionId,
        workspace_id: workspaceId,
        context_summary: {
          facts_used: result.context.facts.length,
          interpretations_used: result.context.interpretations.length,
          binding_rules_active: result.context.governingRules.length,
          web_search_performed: result.memoryStats.webSearchPerformed,
        },
        trace: buildTurnTrace(req, result),
      });
    }
  } catch (err) {
    console.error('Stream chat error:', err);
    if (!aborted) send('error', { message: err && err.message || String(err) });
  } finally {
    clearInterval(heartbeat);
    try { res.end(); } catch (_) {}
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Get memory context for debugging
router.get('/memory/context/:userId', requireAuth, async (req, res) => {
  try {
    if (!memorySystem) {
      return res.status(503).json({
        error: 'Enhanced memory system not available'
      });
    }

    const { userId } = req.params;
    const { query = '', workspace_id } = req.query;

    // Ensure users can only access their own memory context
    if (userId !== req.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own memory context'
      });
    }

    const context = await memorySystem.memoryServices.retrieval.retrieveMemoryContext({
      userId,
      requestText: query,
      workspaceId: workspace_id
    });

    res.json({
      success: true,
      context: {
        facts: context.facts.map(f => ({
          content: f.content,
          category: f.category,
          confidence_label: f.retrievalConfidenceLabel,
          citation: f.citationString,
          uncertainty_reason: f.uncertaintyReason
        })),
        interpretations: context.interpretations,
        governing_rules: context.governingRules,
        workspace_state: context.workspaceState
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get memory context',
      message: error.message
    });
  }
});

// Manual memory creation
router.post('/memory/create', requireAuth, async (req, res) => {
  try {
    const {
      content,
      category,
      memory_type,
      source_type = 'manual_admin',
      confidence = 0.8,
      importance = 0.5
    } = req.body;

    const userId = req.userId;

    const result = await memorySystem.memoryServices.write.writeMemory({
      type: 'write_user_fact',
      userId,
      content,
      category,
      memoryType: memory_type,
      sourceType: source_type,
      confidence,
      importance
    });

    res.json({
      success: result.success,
      memory_id: result.memoryId,
      needs_approval: result.needsApproval,
      errors: result.errors
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to create memory',
      message: error.message
    });
  }
});

// Manual web search
router.post('/search/web', requireAuth, async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.userId;

    if (!query) {
      return res.status(400).json({
        error: 'Query is required'
      });
    }

    // Use the web search functionality
    const results = await memorySystem.performWebSearch(userId, query);

    res.json({
      success: true,
      query,
      results: results.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content.substring(0, 300) + '...',
        score: r.score
      })),
      stored_as_memories: results.length
    });

  } catch (error) {
    res.status(500).json({
      error: 'Web search failed',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/workspace/create', requireAuth, async (req, res) => {
  try {
    const { title, objective } = req.body;
    const userId = req.userId;

    const workspaceId = await memorySystem.createWorkspace(
      userId,
      title,
      objective
    );

    res.json({
      success: true,
      workspace_id: workspaceId,
      message: 'Workspace created successfully'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to create workspace',
      message: error.message
    });
  }
});

router.put('/workspace/:workspaceId', requireAuth, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const updates = { ...(req.body || {}) };
    // Never let the request body reassign ownership or the row id.
    delete updates.user_id;
    delete updates.id;

    // IDOR guard: a user may only update a workspace they own. Confirm
    // ownership against the stored row before mutating.
    const { data: existing, error: lookupError } = await memorySystem.supabase
      .from('active_workspaces')
      .select('user_id')
      .eq('id', workspaceId)
      .single();

    if (lookupError || !existing) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    if (existing.user_id !== req.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update your own workspaces'
      });
    }

    await memorySystem.updateWorkspace(workspaceId, updates);

    res.json({
      success: true,
      message: 'Workspace updated successfully'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to update workspace',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEBUGGING AND STATS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/stats/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Ensure users can only access their own stats
    if (userId !== req.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own stats'
      });
    }

    const stats = await memorySystem.getMemoryStats(userId);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

// Test uncertainty flagging
router.get('/test/uncertainty', async (req, res) => {
  try {
    const testMemories = [
      {
        content: 'I prefer coffee',
        provenance: 'USER_STATED',
        confidence: 0.95,
        source_type: 'user_direct_statement',
        created_at: new Date().toISOString()
      },
      {
        content: 'User seems to prefer direct communication',
        provenance: 'INFERRED',
        confidence: 0.6,
        source_type: 'reflection',
        created_at: new Date().toISOString()
      },
      {
        content: 'Old preference from 2020',
        provenance: 'USER_STATED',
        confidence: 0.8,
        source_type: 'imported_memory',
        created_at: '2020-01-01T00:00:00Z'
      }
    ];

    const assessments = testMemories.map(memory => {
      const assessment = memorySystem.memoryServices.uncertainty.assessMemoryUncertainty(
        memory,
        { requestContext: 'test' }
      );

      return {
        content: memory.content,
        assessment
      };
    });

    res.json({
      success: true,
      test_results: assessments
    });

  } catch (error) {
    res.status(500).json({
      error: 'Uncertainty test failed',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = router;

/*
 * USAGE EXAMPLES:
 *
 * 1. Basic chat with memory:
 * POST /api/chat
 * { "message": "I prefer dark roast coffee", "userId": "user123" }
 *
 * 2. Chat with web search:
 * POST /api/chat
 * { "message": "What's the latest on AI regulation?", "userId": "user123" }
 *
 * 3. Create workspace:
 * POST /api/workspace/create
 * { "title": "Memory Project", "objective": "Build memory system", "userId": "user123" }
 *
 * 4. Manual web search:
 * POST /api/search/web
 * { "query": "latest AI news", "userId": "user123" }
 *
 * 5. Get memory context:
 * GET /api/memory/context/user123?query=coffee&workspace_id=ws123
 *
 * 6. Test uncertainty:
 * GET /api/test/uncertainty
 */