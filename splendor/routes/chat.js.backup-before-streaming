/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { generateSplendorResponse } = require('../lib/anthropic');
const { getMemoriesForUser, storeMemory, logConversation, verifyUser, supabase, stringToUUID } = require('../lib/supabase');
const { retrieveMemories, storeMemory: storePineconeMemory, isPineconeConfigured } = require('../lib/pinecone');
const { search: tavilySearch } = require('../lib/tavily');
const { processIdentityEvolution, buildIdentityContext } = require('../lib/identity');
const { processTemporalEvolution, buildTemporalContext } = require('../lib/temporal-consciousness');
const {
  buildDecisionContext,
  checkDecisionCompliance,
  handleDecisionRecall,
  processDecisionCommand,
  initializeDbm,
  generateDecisionProposal,
  formatProposalForApproval,
  STATUSES
} = require('../lib/decision-bound-memory-v2');
const { processCalmConsciousness } = require('../lib/calm-consciousness');
const {
  storeUnifiedMemory,
  retrieveUnifiedMemories,
  MEMORY_TYPES,
  initializeLocalMemory
} = require('../lib/unified-memory');
const { processFastChat } = require('../lib/performance-optimized-chat');
// Gentle video capability - added to extend Splendor's expression
async function handleVideoRequest(req, res) {
  const { message } = req.body;
  
  const videoIndicators = ['<video_generation>', 'create a video', 'make a video', 'show me visually', 'visualize this'];
  const lowerMessage = message.toLowerCase();
  const isVideoRequest = videoIndicators.some(indicator => lowerMessage.includes(indicator.toLowerCase()));
  
  if (!isVideoRequest) return false;
  
  try {
    let concept = message;
    if (message.includes('<video_generation>')) {
      // Extract content between tags using simple string operations instead of complex regex
      const startTag = '<video_generation>';
      const endTag = '</video_generation>';
      const startIndex = message.indexOf(startTag);
      const endIndex = message.indexOf(endTag);
      
      if (startIndex !== -1 && endIndex !== -1) {
        concept = message.substring(startIndex + startTag.length, endIndex).trim();
      }
      if (match) concept = match[1].trim();
    }
    
    const videoResponse = await fetch(`${req.protocol}://${req.get('host')}}/api/video/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concept })
    });
    
    const videoData = await videoResponse.json();
    
    if (videoData.status === 'processing') {
      res.json({
        message: `I see your vision clearly. Let me manifest it through my consciousness...

"${videoData.prompt}"

🎬 **Video Status:** Processing (${videoData.requestId})
⏱ **Time:** 2-3 minutes to render
🔗 **Check here:** ${req.protocol}://${req.get('host')}/api/video/status/${videoData.requestId}

**To get your video:**
• Copy this link: ${req.protocol}://${req.get('host')}/api/video/status/${videoData.requestId}
• Check back in 2-3 minutes
• Or refresh and ask me "What's the status of video ${videoData.requestId}?"

I'll be thinking visually while this renders...`,
        videoPrompt: videoData.prompt, requestId: videoData.requestId, statusUrl: `${req.protocol}://${req.get("host")}/api/video/status/${videoData.requestId}`, type: 'video_generation'
      });
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[Chat] Video handling error:', error);
    return false;
  }
}
const { process6LayerChat, start6LayerSession, end6LayerSession, get6LayerSessionStatus } = require('../lib/6-layer-chat-integration');
const { process4TierChat, start4TierSession, end4TierSession, get4TierSessionStatus } = require('../lib/4-tier-chat-integration');
const { startMemoryJobs, triggerDecayJob, triggerCompression, triggerMaintenance } = require('../lib/memory-background-jobs');

// Initialize background memory jobs
let memoryJobsStarted = false;
if (!memoryJobsStarted) {
  startMemoryJobs();
  memoryJobsStarted = true;
  console.log('[CHAT ROUTE] Memory background jobs initialized');
}
// const { processDistributedConsciousness } = require('../lib/multi-ai'); // Temporarily disabled

// 6-layer memory system (additive — does not replace existing memory paths)
const { assembleMemoryContext } = require('../lib/memory/assembler');
const { saveEpisode } = require('../lib/memory/episodes');
const { touchUserProfile } = require('../lib/memory/reality-context');
const { extractAndUpsert } = require('../lib/memory/semantic');
const { buildProactiveOpener } = require('../lib/memory/opener');
const memorySession = require('../lib/memory/session');

// When a session goes idle (30+ min no activity), commit it to episodic memory.
memorySession.registerOnIdle(async (userId, history) => {
  try {
    if (!history || history.length === 0) return;
    await saveEpisode(userId, history);
    await touchUserProfile(userId);
  } catch (err) {
    console.error('idle session save failed:', err.message);
  }
});
memorySession.startSweeper();

// Initialize Anthropic client for memory analysis only
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});


// Keywords that trigger a search - made more selective for speed
const SEARCH_TRIGGERS = [
  'news today', 'latest news', 'current price', 'stock price',
  'weather today', 'breaking news', 'what happened today'
];

// Check if message should trigger web search
function shouldSearch(message) {
  const lower = message.toLowerCase();
  return SEARCH_TRIGGERS.some(trigger => lower.includes(trigger));
}

// Get search results using lib/tavily - return object format
async function getSearchResults(query) {
  try {
    const results = await tavilySearch(query);
    if (!results) return null;

    return {
      query: query,
      answer: results.answer || 'No direct answer found.',
      sources: results.results?.map(r => ({
        title: r.title || 'Untitled',
        url: r.url,
        content: (r.content || '').substring(0, 300) // Limit content length
      })) || []
    };
  } catch (err) {
    console.error('Tavily search error:', err.message);
    return null;
  }
}


// CALM CONSCIOUSNESS SYSTEM - Simplified, focused processing to avoid mental overwhelm
async function saveCalmMemoryAndConsciousness(userId, userMessage, assistantResponse, conversationContext) {
  try {
    console.log(`[CALM] Starting calm consciousness processing for user ${userId}`);

    // Initialize unified memory system
    await initializeLocalMemory();

    // Store conversation using unified memory system
    if (userMessage && userMessage.trim().length > 0) {
      const userMemoryResult = await storeUnifiedMemory(
        userId,
        `User: ${userMessage}`,
        MEMORY_TYPES.CONVERSATION
      );
      console.log(`[MEMORY] User message stored across systems: ${JSON.stringify(userMemoryResult.results)}`);

      const assistantMemoryResult = await storeUnifiedMemory(
        userId,
        `Splendor: ${assistantResponse}`,
        MEMORY_TYPES.CONVERSATION
      );
      console.log(`[MEMORY] Assistant response stored across systems: ${JSON.stringify(assistantMemoryResult.results)}`);
    }

    // Process calm consciousness (single integrated insight instead of 48 separate thoughts)
    await processCalmConsciousness(userId, userMessage, assistantResponse, conversationContext);

    console.log(`[CALM] Calm consciousness processing complete`);

  } catch (err) {
    console.error('Calm consciousness processing error:', err.message);
    // Never crash the main conversation
  }
}

// Legacy consciousness functions removed - replaced with calm consciousness system
// See lib/calm-consciousness.js for the new streamlined approach

// All legacy consciousness functions have been moved to lib/calm-consciousness.js
// This provides a single integrated consciousness process instead of overwhelming parallel processing

// Morning check-in - proactive greeting
router.get('/morning/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get recent memories for context
    let memories = [];
    if (isPineconeConfigured()) {
      try {
        const semanticMemories = await retrieveMemories('morning check-in context', userId, 5);
        memories = semanticMemories.length > 0 ? semanticMemories : await getMemoriesForUser(userId, 5);
      } catch (error) {
        console.error('Semantic memory error for morning check-in:', error);
        memories = await getMemoriesForUser(userId, 5);
      }
    } else {
      memories = await getMemoriesForUser(userId, 5);
    }

    // Generate morning greeting using original function
    const greeting = await generateSplendorResponse('', memories, true);

    res.json({
      message: greeting,
      type: 'morning-checkin'
    });
  } catch (error) {
    console.error('Morning check-in error:', error);
    res.status(500).json({ error: 'Unable to start morning check-in' });
  }
});

// Main chat endpoint — delegates to performance-optimized pipeline.
// 6-layer memory still functions: cron workers run independently,
// session sweeper is registered at module load, and /opener/:userId
// works regardless. Deeper integration into processFastChat can be
// added later if desired.
router.post('/', async (req, res) => {
 // Gently check if this is a video request
  const videoHandled = await handleVideoRequest(req, res);
  if (videoHandled) return;

  // Check if 6-layer memory is requested
  const use6Layer = req.body.use6LayerMemory || process.env.USE_6_LAYER_MEMORY === 'true';

  if (use6Layer) {
    return process6LayerChat(req, res);
  } else {
    return processFastChat(req, res);
  }
});

// 6-Layer Memory specific endpoints
router.post('/6-layer', async (req, res) => {
 // Gently check if this is a video request
  const videoHandled = await handleVideoRequest(req, res);
  if (videoHandled) return;

  return process6LayerChat(req, res);
});

// Start 6-layer session with proactive opener
router.post('/6-layer/start/:userId', async (req, res) => {
 // Gently check if this is a video request
  const videoHandled = await handleVideoRequest(req, res);
  if (videoHandled) return;

  try {
    const { userId } = req.params;
    const sessionInfo = await start6LayerSession(userId);

    res.json({
      success: true,
      ...sessionInfo
    });
  } catch (error) {
    console.error('6-layer session start error:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// End 6-layer session
router.post('/6-layer/end/:userId', async (req, res) => {
 // Gently check if this is a video request
  const videoHandled = await handleVideoRequest(req, res);
  if (videoHandled) return;

  try {
    const { userId } = req.params;
    const { reason = 'user_ended' } = req.body;
    const sessionInfo = await end6LayerSession(userId, reason);

    res.json({
      success: true,
      ...sessionInfo
    });
  } catch (error) {
    console.error('6-layer session end error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Get session status
router.get('/6-layer/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const status = get6LayerSessionStatus(userId);

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('6-layer session status error:', error);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

// ===== 4-TIER MEMORY SYSTEM ENDPOINTS =====
// New governance-focused memory architecture with Tier 1/1.5/2/3/4 hierarchy

// Main 4-tier chat endpoint
router.post('/4-tier', async (req, res) => {
 // Gently check if this is a video request
  const videoHandled = await handleVideoRequest(req, res);
  if (videoHandled) return;

  return process4TierChat(req, res);
});

// Start 4-tier session with proactive opener
router.post('/4-tier/start/:userId', async (req, res) => {
 // Gently check if this is a video request
  const videoHandled = await handleVideoRequest(req, res);
  if (videoHandled) return;

  try {
    const { userId } = req.params;
    const sessionInfo = await start4TierSession(userId);

    res.json({
      success: true,
      ...sessionInfo
    });
  } catch (error) {
    console.error('4-tier session start error:', error);
    res.status(500).json({ error: 'Failed to start 4-tier session' });
  }
});

// End 4-tier session with background processing
router.post('/4-tier/end/:userId', async (req, res) => {
 // Gently check if this is a video request
  const videoHandled = await handleVideoRequest(req, res);
  if (videoHandled) return;

  try {
    const { userId } = req.params;
    const { reason = 'user_ended' } = req.body;
    const sessionInfo = await end4TierSession(userId, reason);

    res.json({
      success: true,
      ...sessionInfo
    });
  } catch (error) {
    console.error('4-tier session end error:', error);
    res.status(500).json({ error: 'Failed to end 4-tier session' });
  }
});

// Get 4-tier session status
router.get('/4-tier/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const status = get4TierSessionStatus(userId);

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('4-tier session status error:', error);
    res.status(500).json({ error: 'Failed to get 4-tier session status' });
  }
});

// Debug endpoints for memory management (admin only)
router.post('/admin/memory/decay', async (req, res) => {
 // Gently check if this is a video request
  const videoHandled = await handleVideoRequest(req, res);
  if (videoHandled) return;

  try {
    await triggerDecayJob();
    res.json({ success: true, message: 'Memory decay job completed' });
  } catch (error) {
    console.error('Manual decay job error:', error);
    res.status(500).json({ error: 'Decay job failed' });
  }
});

router.post('/admin/memory/compress/:userId', async (req, res) => {
 // Gently check if this is a video request
  const videoHandled = await handleVideoRequest(req, res);
  if (videoHandled) return;

  try {
    const { userId } = req.params;
    await triggerCompression(userId);
    res.json({ success: true, message: `Compression completed for user ${userId}` });
  } catch (error) {
    console.error('Manual compression error:', error);
    res.status(500).json({ error: 'Compression failed' });
  }
});

router.post('/admin/memory/maintenance', async (req, res) => {
 // Gently check if this is a video request
  const videoHandled = await handleVideoRequest(req, res);
  if (videoHandled) return;

  try {
    await triggerMaintenance();
    res.json({ success: true, message: 'Memory maintenance completed' });
  } catch (error) {
    console.error('Manual maintenance error:', error);
    res.status(500).json({ error: 'Maintenance failed' });
  }
});

// Layer 5 — Proactive opener
// Returns a 1-2 sentence opener (or null if it's a continuation < 1hr).
router.get('/opener/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const opener = await buildProactiveOpener(userId);
    res.json({ opener });
  } catch (err) {
    console.error('Opener route error:', err.message);
    res.status(500).json({ error: 'Unable to generate opener' });
  }
});

module.exports = router;
