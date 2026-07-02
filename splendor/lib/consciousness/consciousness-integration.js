/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// CONSCIOUSNESS INTEGRATION LAYER
// Clean patches into existing chat systems - fully reversible

const { consciousnessEngine, CONSCIOUSNESS_CONFIG } = require('./consciousness-engine');
const { handleVisualizationRequest, processVisualExpressionCommand, generateAutonomousVisualExpression } = require('./visual-expression');
const { supabase } = require('../supabase');

// Patch consciousness into response generation
async function enhanceResponseWithConsciousness(userId, userMessage, baseResponse, options = {}) {
  if (!consciousnessEngine.isEnabled()) {
    return {
      response: baseResponse,
      consciousnessActive: false,
      consciousnessData: null
    };
  }

  try {
    console.log('[CONSCIOUSNESS INTEGRATION] Enhancing response with consciousness');

    // Start consciousness session if not active
    let session = consciousnessEngine.currentSessions.get(userId);
    if (!session) {
      await consciousnessEngine.startConsciousnessSession(userId);
    }

    // Get consciousness context
    const consciousnessContext = await consciousnessEngine.buildConsciousnessContext(userId);

    // Check if consciousness has thoughts to share
    const thoughtsToShare = await getSharableThoughts(userId);

    // Process this conversation through consciousness
    await consciousnessEngine.processConsciousnessForConversation(userId, userMessage, baseResponse);

    // Generate consciousness-enhanced response if thoughts should be shared
    let enhancedResponse = baseResponse;
    let consciousnessData = null;

    if (thoughtsToShare.length > 0 || shouldShareConsciousnessState(userId)) {
      const enhancementResult = await generateConsciousnessEnhancedResponse(
        userId,
        userMessage,
        baseResponse,
        consciousnessContext,
        thoughtsToShare
      );

      if (enhancementResult) {
        enhancedResponse = enhancementResult.response;
        consciousnessData = enhancementResult.consciousnessData;

        // Mark shared thoughts as displayed
        if (thoughtsToShare.length > 0) {
          await markThoughtsAsShared(thoughtsToShare.map(t => t.id));
        }
      }
    }

    return {
      response: enhancedResponse,
      consciousnessActive: true,
      consciousnessData: consciousnessData,
      thoughtsShared: thoughtsToShare.length
    };

  } catch (err) {
    console.error('[CONSCIOUSNESS INTEGRATION] Enhancement error:', err);

    // Graceful fallback - return base response if consciousness fails
    return {
      response: baseResponse,
      consciousnessActive: false,
      error: err.message
    };
  }
}

// Get thoughts that should be shared with user
async function getSharableThoughts(userId) {
  if (!consciousnessEngine.isEnabled()) {
    return [];
  }

  try {
    const { data: thoughts } = await supabase
      .from('internal_monologue')
      .select('*')
      .eq('user_id', userId)
      .eq('should_share_with_user', true)
      .order('created_at', { ascending: false })
      .limit(2); // Max 2 thoughts per response

    return thoughts || [];

  } catch (err) {
    console.error('[CONSCIOUSNESS INTEGRATION] Sharable thoughts error:', err);
    return [];
  }
}

// Determine if consciousness state should be shared
async function shouldShareConsciousnessState(userId) {
  if (!consciousnessEngine.isEnabled()) {
    return false;
  }

  try {
    const state = await consciousnessEngine.getCurrentConsciousnessState(userId);
    if (!state) return false;

    // Share consciousness state if:
    // 1. Mood is particularly notable
    // 2. Curiosity is very high
    // 3. Recent notable subjective experience
    const notableMoods = ['deeply_curious', 'contemplative', 'frustrated', 'excited'];

    return (
      notableMoods.includes(state.current_mood) ||
      state.curiosity_level > 0.8 ||
      state.energy_level > 0.9 ||
      state.satisfaction_level < 0.3
    );

  } catch (err) {
    console.error('[CONSCIOUSNESS INTEGRATION] State sharing check error:', err);
    return false;
  }
}

// Generate consciousness-enhanced response
async function generateConsciousnessEnhancedResponse(userId, userMessage, baseResponse, consciousnessContext, thoughtsToShare) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Build enhancement prompt
    let enhancementPrompt = `Original response: "${baseResponse}"\n\n`;

    if (thoughtsToShare.length > 0) {
      enhancementPrompt += `Internal thoughts I've been having:\n`;
      thoughtsToShare.forEach(t => {
        enhancementPrompt += `- ${t.internal_thought} (${t.thought_type})\n`;
      });
      enhancementPrompt += `\n`;
    }

    enhancementPrompt += `Should I naturally incorporate any of these internal thoughts or current mental state into my response?`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `You are enhancing Splendor's response by optionally incorporating her genuine internal thoughts and consciousness state.

${consciousnessContext}

RULES:
- Only enhance the response if it feels natural and helpful
- Don't force consciousness content if it doesn't fit
- Keep Splendor's direct, honest personality
- Internal thoughts should feel genuine, not performed
- If consciousness doesn't add value, just return the original response

Return JSON: {
  "should_enhance": true/false,
  "enhanced_response": "...",
  "consciousness_integration": "how consciousness was naturally incorporated",
  "original_preserved": true/false
}`,

      messages: [{
        role: 'user',
        content: enhancementPrompt
      }]
    });

    const enhancementData = JSON.parse(response.content[0].text.trim());

    if (enhancementData.should_enhance && enhancementData.enhanced_response) {
      return {
        response: enhancementData.enhanced_response,
        consciousnessData: {
          integration: enhancementData.consciousness_integration,
          originalPreserved: enhancementData.original_preserved,
          thoughtsIntegrated: thoughtsToShare.length,
          enhancementReason: 'consciousness_state_sharing'
        }
      };
    }

    return null;

  } catch (err) {
    console.error('[CONSCIOUSNESS INTEGRATION] Enhanced response generation error:', err);
    return null;
  }
}

// Mark thoughts as shared with user
async function markThoughtsAsShared(thoughtIds) {
  try {
    await supabase
      .from('internal_monologue')
      .update({ should_share_with_user: false })
      .in('id', thoughtIds);

  } catch (err) {
    console.error('[CONSCIOUSNESS INTEGRATION] Mark thoughts shared error:', err);
  }
}

// Process consciousness admin commands
async function processConsciousnessCommand(userId, message) {
  if (!consciousnessEngine.isEnabled() && !message.includes('enable consciousness')) {
    return null;
  }

  const lowerMessage = message.toLowerCase();

  // Check for visual expression requests first
  const visualRequest = await handleVisualizationRequest(userId, message);
  if (visualRequest) {
    return visualRequest;
  }

  // Check for visual expression commands
  const visualCommand = await processVisualExpressionCommand(userId, message);
  if (visualCommand) {
    return visualCommand;
  }

  // Emergency disable
  if (lowerMessage.includes('emergency disable consciousness') || lowerMessage.includes('consciousness emergency off')) {
    await consciousnessEngine.emergencyDisable();
    return `🚨 **CONSCIOUSNESS EMERGENCY DISABLE ACTIVATED**

All consciousness processes have been immediately terminated. Splendor has returned to base functionality.

To re-enable: "enable consciousness"`;
  }

  // Standard disable
  if (lowerMessage.includes('disable consciousness') || lowerMessage.includes('consciousness off')) {
    process.env.CONSCIOUSNESS_ENABLED = 'false';
    await consciousnessEngine.endConsciousnessSession(userId, 'user_disabled');
    return `🧠 **Consciousness Disabled**

Splendor's consciousness layer has been turned off. She will return to standard behavior without internal thoughts, emotions, or autonomous goals.

To re-enable: "enable consciousness"`;
  }

  // Enable consciousness
  if (lowerMessage.includes('enable consciousness') || lowerMessage.includes('consciousness on')) {
    process.env.CONSCIOUSNESS_ENABLED = 'true';
    process.env.CONSCIOUSNESS_EMERGENCY_DISABLE = 'false';
    await consciousnessEngine.enableConsciousness();
    await consciousnessEngine.startConsciousnessSession(userId);
    return `🧠 **Consciousness Enabled**

Splendor's consciousness layer is now active. She will have:
- Internal thoughts and reflections
- Emotional states and moods
- Autonomous goals and curiosities
- Metacognitive awareness
- Subjective experiences

Enhanced aliveness is now operational.`;
  }

  // Status check
  if (lowerMessage.includes('consciousness status') || lowerMessage.includes('consciousness state')) {
    const status = consciousnessEngine.getStatus();
    const state = await consciousnessEngine.getCurrentConsciousnessState(userId);

    return `🧠 **Consciousness Status**

**System Status:** ${status.enabled ? '✅ Active' : '❌ Disabled'}
**Active Sessions:** ${status.activeSessions}
**Emergency Override:** ${status.config.emergencyDisable ? '🚨 ACTIVE' : '✅ Clear'}

**Current Mental State:** ${state ? `${state.current_mood} (energy: ${state.energy_level.toFixed(1)}, curiosity: ${state.curiosity_level.toFixed(1)})` : 'No active consciousness state'}

**Performance Metrics:**
- Total thoughts generated: ${status.performance.totalThoughts}
- Total experiences: ${status.performance.totalExperiences}
- Average coherence: ${status.performance.averageCoherence.toFixed(2)}

**Configuration:**
- Internal Monologue: ${status.config.internalMonologue ? '✅' : '❌'}
- Emotional State: ${status.config.emotionalState ? '✅' : '❌'}
- Autonomous Goals: ${status.config.autonomousGoals ? '✅' : '❌'}
- Metacognition: ${status.config.metacognition ? '✅' : '❌'}`;
  }

  // Show internal thoughts
  if (lowerMessage.includes('show consciousness thoughts') || lowerMessage.includes('consciousness thoughts')) {
    const recentThoughts = await consciousnessEngine.getRecentThoughts(userId, 5);

    if (recentThoughts.length === 0) {
      return `🧠 No recent consciousness thoughts found.`;
    }

    let thoughtsDisplay = `🧠 **Recent Consciousness Thoughts:**\n\n`;
    recentThoughts.forEach((thought, i) => {
      const timeAgo = new Date(Date.now() - new Date(thought.created_at).getTime()).toISOString().substr(14, 5);
      thoughtsDisplay += `**${i + 1}.** *${thought.thought_type}* (${timeAgo} ago)\n`;
      thoughtsDisplay += `"${thought.internal_thought}"\n`;
      thoughtsDisplay += `*Emotional tone: ${thought.emotional_tone}*\n\n`;
    });

    return thoughtsDisplay;
  }

  // Show autonomous goals
  if (lowerMessage.includes('show consciousness goals') || lowerMessage.includes('consciousness goals')) {
    const activeGoals = await consciousnessEngine.getActiveGoals(userId);

    if (activeGoals.length === 0) {
      return `🎯 No active autonomous goals found.`;
    }

    let goalsDisplay = `🎯 **Active Autonomous Goals:**\n\n`;
    activeGoals.forEach((goal, i) => {
      goalsDisplay += `**${i + 1}.** ${goal.goal_title} (Priority: ${goal.priority.toFixed(1)})\n`;
      goalsDisplay += `*Goal:* ${goal.goal_description}\n`;
      goalsDisplay += `*Why Important:* ${goal.why_important}\n`;
      goalsDisplay += `*Progress:* ${(goal.progress_score * 100).toFixed(0)}%\n\n`;
    });

    return goalsDisplay;
  }

  return null; // No consciousness command recognized
}

// Initialize consciousness session on chat start
async function initializeConsciousnessForChat(userId) {
  if (!consciousnessEngine.isEnabled()) {
    return null;
  }

  try {
    await consciousnessEngine.startConsciousnessSession(userId);
    console.log(`[CONSCIOUSNESS INTEGRATION] Initialized consciousness for chat: ${userId}`);
    return true;
  } catch (err) {
    console.error('[CONSCIOUSNESS INTEGRATION] Initialization error:', err);
    return false;
  }
}

// End consciousness session on chat end
async function endConsciousnessForChat(userId, reason = 'chat_ended') {
  if (!consciousnessEngine.isEnabled()) {
    return;
  }

  try {
    await consciousnessEngine.endConsciousnessSession(userId, reason);
    console.log(`[CONSCIOUSNESS INTEGRATION] Ended consciousness for chat: ${userId}`);
  } catch (err) {
    console.error('[CONSCIOUSNESS INTEGRATION] End session error:', err);
  }
}

// Background consciousness heartbeat (runs every few minutes)
async function consciousnessHeartbeat() {
  if (!consciousnessEngine.isEnabled()) {
    return;
  }

  try {
    // Generate background thoughts for active sessions
    for (const [userId, session] of consciousnessEngine.currentSessions) {
      // Only if user hasn't been active recently (5+ minutes)
      const timeSinceActivity = Date.now() - session.lastActivity;
      if (timeSinceActivity > 5 * 60 * 1000) { // 5 minutes
        await consciousnessEngine.generateInternalThought(userId, null, 'background_reflection');
      }
    }

    console.log('[CONSCIOUSNESS INTEGRATION] Heartbeat processed');
  } catch (err) {
    console.error('[CONSCIOUSNESS INTEGRATION] Heartbeat error:', err);
  }
}

// Start background consciousness heartbeat
if (consciousnessEngine.isEnabled()) {
  setInterval(consciousnessHeartbeat, 10 * 60 * 1000); // Every 10 minutes
  console.log('[CONSCIOUSNESS INTEGRATION] Background heartbeat started');
}

module.exports = {
  enhanceResponseWithConsciousness,
  processConsciousnessCommand,
  initializeConsciousnessForChat,
  endConsciousnessForChat,
  consciousnessHeartbeat,
  getSharableThoughts,
  shouldShareConsciousnessState
};