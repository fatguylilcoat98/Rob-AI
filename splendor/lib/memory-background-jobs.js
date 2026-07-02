/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// MEMORY BACKGROUND JOBS
// Handles decay, compression, and maintenance of the 6-layer memory system

const { supabase } = require('./supabase');
const { compressMemories, saveEpisode, updateSemanticMemory, activeSessions } = require('./6-layer-memory');

// =============================================================================
// MEMORY DECAY JOB (Runs daily)
// =============================================================================

async function runMemoryDecayJob() {
  try {
    console.log('[DECAY JOB] Starting memory decay processing');

    // Get all episodes older than 7 days that haven't been compressed
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { data: episodes, error } = await supabase
      .from('episodes')
      .select('id, decay_score, created_at')
      .eq('memory_tier', 'episodic')
      .lt('created_at', sevenDaysAgo.toISOString());

    if (error) {
      console.error('[DECAY JOB] Error fetching episodes:', error);
      return;
    }

    if (!episodes || episodes.length === 0) {
      console.log('[DECAY JOB] No episodes to decay');
      return;
    }

    // Reduce decay score by 0.1 for each episode
    for (const episode of episodes) {
      const newDecayScore = Math.max(0, episode.decay_score - 0.1);

      await supabase
        .from('episodes')
        .update({ decay_score: newDecayScore })
        .eq('id', episode.id);
    }

    console.log(`[DECAY JOB] Decayed ${episodes.length} episodes`);

    // Check if any episodes need compression (decay_score <= 0.3)
    const { data: readyForCompression } = await supabase
      .from('episodes')
      .select('user_id')
      .eq('memory_tier', 'episodic')
      .lte('decay_score', 0.3);

    if (readyForCompression && readyForCompression.length > 0) {
      // Get unique user IDs
      const userIds = [...new Set(readyForCompression.map(ep => ep.user_id))];

      for (const userId of userIds) {
        await compressMemories(userId);
      }
    }

  } catch (error) {
    console.error('[DECAY JOB] Memory decay error:', error);
  }
}

// =============================================================================
// SESSION END JOB (Triggered on session end)
// =============================================================================

async function endSession(userId) {
  try {
    console.log(`[SESSION END] Processing session end for user ${userId}`);

    // Get the active session
    const sessionData = activeSessions.get(userId);
    if (!sessionData) {
      console.log(`[SESSION END] No active session found for user ${userId}`);
      return;
    }

    // Save episode if session had meaningful content
    if (sessionData.messages.length >= 2) { // At least one exchange
      const episode = await saveEpisode(userId, sessionData);

      if (episode) {
        // Update semantic memory with new facts
        const conversationText = sessionData.messages.map(m =>
          `${m.role}: ${m.content}`
        ).join('\n\n');

        await updateSemanticMemory(userId, conversationText);

        // Record session completion
        const endTime = new Date();
        const durationMinutes = Math.round((endTime - sessionData.startTime) / (1000 * 60));

        await supabase
          .from('conversation_sessions')
          .insert([{
            user_id: userId,
            started_at: sessionData.startTime.toISOString(),
            ended_at: endTime.toISOString(),
            message_count: sessionData.messageCount,
            total_duration_minutes: durationMinutes,
            episode_id: episode.id,
            session_status: 'completed'
          }]);

        console.log(`[SESSION END] Session completed and episode saved: ${episode.id}`);
      }
    }

    // Clear active session
    activeSessions.delete(userId);

  } catch (error) {
    console.error('[SESSION END] Session end processing error:', error);
  }
}

// =============================================================================
// CONVERSATION COUNTER (Triggers compression every 20 conversations)
// =============================================================================

let conversationCounts = new Map();

async function incrementConversationCount(userId) {
  try {
    const currentCount = conversationCounts.get(userId) || 0;
    const newCount = currentCount + 1;
    conversationCounts.set(userId, newCount);

    // Trigger compression every 20 conversations
    if (newCount % 20 === 0) {
      console.log(`[COMPRESSION TRIGGER] User ${userId} reached ${newCount} conversations, triggering compression`);
      await compressMemories(userId);
    }

  } catch (error) {
    console.error('[COMPRESSION TRIGGER] Conversation count error:', error);
  }
}

// =============================================================================
// INACTIVITY DETECTION (Handles session timeout)
// =============================================================================

function startInactivityMonitoring() {
  setInterval(() => {
    const now = Date.now();
    const inactivityThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [userId, sessionData] of activeSessions) {
      const lastActivity = sessionData.messages.length > 0
        ? sessionData.messages[sessionData.messages.length - 1].timestamp
        : sessionData.startTime;

      if (now - lastActivity > inactivityThreshold) {
        console.log(`[INACTIVITY] User ${userId} inactive for 30+ minutes, ending session`);
        endSession(userId);
      }
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
}

// =============================================================================
// MEMORY MAINTENANCE (Runs weekly)
// =============================================================================

async function runMemoryMaintenance() {
  try {
    console.log('[MAINTENANCE] Starting memory maintenance');

    // Archive very old compressed summaries (older than 6 months)
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

    // Archive old episodes that have been compressed
    const { data: archivedCount } = await supabase
      .from('episodes')
      .update({ memory_tier: 'archived' })
      .eq('memory_tier', 'compressed')
      .lt('created_at', sixMonthsAgo.toISOString())
      .select('id');

    // Clean up very old proactive openers (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await supabase
      .from('proactive_openers')
      .delete()
      .lt('created_at', thirtyDaysAgo.toISOString());

    // Clean up old conversation sessions
    await supabase
      .from('conversation_sessions')
      .delete()
      .eq('session_status', 'abandoned')
      .lt('created_at', thirtyDaysAgo.toISOString());

    console.log(`[MAINTENANCE] Maintenance complete. Archived ${archivedCount?.length || 0} old episodes`);

  } catch (error) {
    console.error('[MAINTENANCE] Memory maintenance error:', error);
  }
}

// =============================================================================
// SCHEDULED JOB RUNNERS
// =============================================================================

function startMemoryJobs() {
  console.log('[MEMORY JOBS] Starting background memory jobs');

  // Daily decay job (runs at 3 AM)
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() === 0) {
      runMemoryDecayJob();
    }
  }, 60 * 1000); // Check every minute

  // Weekly maintenance (runs Sundays at 4 AM)
  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 0 && now.getHours() === 4 && now.getMinutes() === 0) {
      runMemoryMaintenance();
    }
  }, 60 * 1000); // Check every minute

  // Start inactivity monitoring
  startInactivityMonitoring();

  console.log('[MEMORY JOBS] Background jobs started');
}

// =============================================================================
// MANUAL TRIGGERS (For testing/debugging)
// =============================================================================

async function triggerDecayJob() {
  console.log('[MANUAL] Manually triggering decay job');
  await runMemoryDecayJob();
}

async function triggerCompression(userId) {
  console.log(`[MANUAL] Manually triggering compression for user ${userId}`);
  await compressMemories(userId);
}

async function triggerMaintenance() {
  console.log('[MANUAL] Manually triggering maintenance');
  await runMemoryMaintenance();
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Background jobs
  runMemoryDecayJob,
  endSession,
  incrementConversationCount,
  runMemoryMaintenance,

  // Job management
  startMemoryJobs,

  // Manual triggers
  triggerDecayJob,
  triggerCompression,
  triggerMaintenance
};