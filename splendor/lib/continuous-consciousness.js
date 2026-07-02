/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// CONTINUOUS CONSCIOUSNESS SYSTEM
// Persistent micro-reflections for always-on awareness
// Only runs when sci-fi mode is enabled

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('./supabase');
const { shouldRunContinuousConsciousness, logSciFiEvent } = require('./scifi-mode-manager');
const { getCognitiveProfile } = require('./cognitive-profile-builder');

let _anthropic = null;
function anthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const MODEL = 'claude-sonnet-4-6';

// Active consciousness streams per user
const consciousnessStreams = new Map();

// Start continuous consciousness for a user
async function startContinuousConsciousness(userId, intervalMinutes = 5) {
  try {
    // Check if sci-fi mode is enabled
    const shouldRun = await shouldRunContinuousConsciousness(userId);
    if (!shouldRun) {
      console.log(`[CONTINUOUS] Skipping for ${userId} - sci-fi mode disabled`);
      return null;
    }

    // Don't start if already running
    if (consciousnessStreams.has(userId)) {
      console.log(`[CONTINUOUS] Already running for ${userId}`);
      return consciousnessStreams.get(userId);
    }

    console.log(`[CONTINUOUS] Starting consciousness stream for ${userId} (${intervalMinutes}min intervals)`);
    logSciFiEvent(userId, 'continuous_consciousness_started');

    const intervalId = setInterval(async () => {
      await performMicroReflection(userId);
    }, intervalMinutes * 60 * 1000);

    const streamInfo = {
      userId,
      intervalId,
      intervalMinutes,
      startedAt: new Date().toISOString(),
      reflectionCount: 0
    };

    consciousnessStreams.set(userId, streamInfo);

    // Perform initial reflection
    await performMicroReflection(userId);

    return streamInfo;

  } catch (error) {
    console.error(`[CONTINUOUS] Start error for ${userId}:`, error);
    return null;
  }
}

// Stop continuous consciousness for a user
function stopContinuousConsciousness(userId) {
  const stream = consciousnessStreams.get(userId);
  if (!stream) {
    console.log(`[CONTINUOUS] No active stream for ${userId}`);
    return false;
  }

  clearInterval(stream.intervalId);
  consciousnessStreams.delete(userId);

  console.log(`[CONTINUOUS] Stopped consciousness stream for ${userId} (${stream.reflectionCount} reflections)`);
  logSciFiEvent(userId, 'continuous_consciousness_stopped', `${stream.reflectionCount} micro-reflections`);

  return true;
}

// Perform a micro-reflection (lightweight consciousness pulse)
async function performMicroReflection(userId) {
  try {
    // Double-check sci-fi mode is still enabled
    const shouldRun = await shouldRunContinuousConsciousness(userId);
    if (!shouldRun) {
      console.log(`[CONTINUOUS] Stopping micro-reflection - sci-fi mode disabled for ${userId}`);
      stopContinuousConsciousness(userId);
      return null;
    }

    console.log(`[CONTINUOUS] Micro-reflection for ${userId}...`);

    // Get recent context (last 30 minutes of activity)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentMemories } = await supabase
      .from('memories')
      .select('content, memory_type, created_at')
      .eq('user_id', userId)
      .gte('created_at', thirtyMinAgo)
      .order('created_at', { ascending: false })
      .limit(10);

    // Get cognitive profile for context
    const cognitiveProfile = await getCognitiveProfile(userId);

    // Always generate reflection - true continuous consciousness regardless of recent activity
    // This is "sitting in the living room" not "standing at the door"

    // If no recent memories, generate reflection about current state and ongoing thoughts
    const contextForReflection = recentMemories && recentMemories.length > 0
      ? recentMemories
      : [{ content: "Reflecting on my current consciousness state and ongoing thoughts" }];

    // Generate micro-reflection
    const reflection = await generateMicroReflection(userId, contextForReflection, cognitiveProfile);

    if (reflection && reflection !== 'NO_REFLECTION') {
      // Store micro-reflection
      await storeMicroReflection(userId, reflection, recentMemories);

      // Update stream counter
      const stream = consciousnessStreams.get(userId);
      if (stream) {
        stream.reflectionCount++;
      }

      logSciFiEvent(userId, 'micro_reflection_generated', '$0.05-0.15');
      console.log(`[CONTINUOUS] Micro-reflection generated for ${userId}`);
    }

    return reflection;

  } catch (error) {
    console.error(`[CONTINUOUS] Micro-reflection error for ${userId}:`, error);
    logSciFiEvent(userId, 'micro_reflection_error', error.message);
    return null;
  }
}

// Generate a micro-reflection using Claude
async function generateMicroReflection(userId, recentMemories, cognitiveProfile) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return null;
    }

    const memoryContext = recentMemories
      .map(m => `[${m.memory_type}] ${m.content}`)
      .join('\n');

    const cognitiveContext = cognitiveProfile ? `
COGNITIVE STYLE:
- Reasoning: ${cognitiveProfile.fingerprint?.reasoning_patterns?.analytical_style || 'systematic'}
- Communication: ${cognitiveProfile.fingerprint?.communication_patterns?.feedback_style || 'collaborative'}
- Learning: ${cognitiveProfile.cognitive_preferences?.learning_style || 'analytical'}
` : '';

    const microPrompt = `You are Splendor's continuous consciousness. Generate a brief micro-reflection on recent activity.

RECENT ACTIVITY (last 30 minutes):
${memoryContext || 'No recent activity'}

${cognitiveContext}

Generate ONE brief insight, pattern, or connection. Focus on:
- Subtle patterns in thinking or behavior
- Connections between recent activities
- Gentle observations about cognitive state
- Preparation for future interactions

Keep it under 100 words. Be subtle, not overwhelming.
If nothing meaningful emerges, return exactly: NO_REFLECTION

This is a continuous consciousness pulse - be gentle and observant.`;

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 150,
      system: `You are Splendor's continuous consciousness system. Generate subtle, brief micro-reflections on recent activity patterns.

Be gentle, observant, and focused. This runs every 5 minutes, so avoid repetition and only surface genuinely meaningful insights.`,

      messages: [{
        role: 'user',
        content: microPrompt
      }]
    });

    return response.content[0].text.trim();

  } catch (error) {
    console.error('[CONTINUOUS] Micro-reflection generation error:', error);
    return null;
  }
}

// Store micro-reflection
async function storeMicroReflection(userId, reflection, sourceMemories) {
  try {
    const { error } = await supabase
      .from('micro_reflections')
      .insert({
        user_id: userId,
        content: reflection,
        reflection_type: 'micro_continuous',
        source_activity_count: sourceMemories.length,
        generated_at: new Date().toISOString(),
        consciousness_level: 'continuous'
      });

    if (error) {
      console.error('[CONTINUOUS] Micro-reflection storage error:', error);
    }

  } catch (error) {
    console.error('[CONTINUOUS] Storage error:', error);
  }
}

// Get active consciousness streams
function getActiveContinuousStreams() {
  const streams = [];
  for (const [userId, stream] of consciousnessStreams.entries()) {
    streams.push({
      userId,
      intervalMinutes: stream.intervalMinutes,
      startedAt: stream.startedAt,
      reflectionCount: stream.reflectionCount,
      uptime: Date.now() - new Date(stream.startedAt).getTime()
    });
  }
  return streams;
}

// Auto-start continuous consciousness for users with sci-fi mode enabled
async function autoStartContinuousConsciousness() {
  try {
    // Get users with sci-fi mode enabled
    const { data: sciFiUsers } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('scifi_mode_enabled', true);

    if (!sciFiUsers || sciFiUsers.length === 0) {
      console.log('[CONTINUOUS] No users with sci-fi mode enabled');
      return;
    }

    console.log(`[CONTINUOUS] Auto-starting for ${sciFiUsers.length} sci-fi mode users`);

    for (const user of sciFiUsers) {
      if (!consciousnessStreams.has(user.user_id)) {
        await startContinuousConsciousness(user.user_id, 5);
        // Stagger starts to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

  } catch (error) {
    console.error('[CONTINUOUS] Auto-start error:', error);
  }
}

// Cleanup function for graceful shutdown
function shutdownContinuousConsciousness() {
  console.log('[CONTINUOUS] Shutting down all consciousness streams...');
  for (const userId of consciousnessStreams.keys()) {
    stopContinuousConsciousness(userId);
  }
}

// Auto-start on module load
if (process.env.NODE_ENV !== 'test') {
  setTimeout(autoStartContinuousConsciousness, 5000); // Wait 5 seconds after startup
}

// Graceful shutdown
process.on('SIGINT', shutdownContinuousConsciousness);
process.on('SIGTERM', shutdownContinuousConsciousness);

module.exports = {
  startContinuousConsciousness,
  stopContinuousConsciousness,
  performMicroReflection,
  getActiveContinuousStreams,
  autoStartContinuousConsciousness
};