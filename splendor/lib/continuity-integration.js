/*
 * CONTINUITY INTEGRATION
 * Built by Christopher Hughes · Sacramento, CA
 * Created with Claude Code
 * Truth · Safety · We Got Your Back
 *
 * Integrates Master Continuity Layer with existing Splendor chat system
 */

const { captureInteraction } = require('./master-continuity-engine');

// ═══════════════════════════════════════════════════════════════════════════════
// INTERACTION CAPTURE MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Middleware to capture chat interactions for continuity analysis
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
function captureInteractionMiddleware(req, res, next) {
  // Store original res.json to intercept responses
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    // Capture interaction after successful response
    if (data && !data.error) {
      setImmediate(() => {
        captureInteractionFromRequest(req, data);
      });
    }

    return originalJson(data);
  };

  next();
}

/**
 * Extract and capture interaction data from chat request/response
 */
async function captureInteractionFromRequest(req, responseData) {
  try {
    const userId = extractUserId(req);
    const userMessage = extractUserMessage(req);
    const assistantMessage = extractAssistantMessage(responseData);

    if (!userId || !userMessage) {
      console.log('[Continuity Integration] Insufficient data to capture interaction');
      return;
    }

    // Capture user interaction
    await captureInteraction(userId, 'user', userMessage, {
      tags: extractMessageTags(userMessage),
      emotional_weight: estimateEmotionalWeight(userMessage),
      topic: extractTopic(userMessage),
      source_type: 'conversation'
    });

    // Capture assistant interaction if available
    if (assistantMessage) {
      await captureInteraction(userId, 'assistant', assistantMessage, {
        tags: extractMessageTags(assistantMessage),
        emotional_weight: estimateEmotionalWeight(assistantMessage),
        topic: extractTopic(assistantMessage),
        source_type: 'conversation'
      });
    }

  } catch (error) {
    console.error('[Continuity Integration] Failed to capture interaction:', error.message);
  }
}

/**
 * Extract user ID from request
 */
function extractUserId(req) {
  // Try multiple sources for user ID
  return req.body?.user_id ||
         req.body?.userId ||
         req.query?.user_id ||
         req.params?.userId ||
         req.auth?.user?.id ||
         'default'; // Fallback for development
}

/**
 * Extract user message from request body
 */
function extractUserMessage(req) {
  return req.body?.message ||
         req.body?.content ||
         req.body?.prompt ||
         req.body?.input;
}

/**
 * Extract assistant response from response data
 */
function extractAssistantMessage(responseData) {
  if (typeof responseData === 'string') {
    return responseData;
  }

  return responseData?.message ||
         responseData?.response ||
         responseData?.content ||
         responseData?.reply;
}

/**
 * Extract semantic tags from message content
 */
function extractMessageTags(content) {
  const tags = [];

  // Emotion indicators
  const emotionPatterns = {
    'concern': /worried|concern|anxious|stress/i,
    'excitement': /excited|amazing|incredible|love/i,
    'frustration': /frustrated|annoyed|difficult|problem/i,
    'curiosity': /wonder|curious|question|learn/i,
    'gratitude': /thank|appreciate|grateful|help/i
  };

  for (const [tag, pattern] of Object.entries(emotionPatterns)) {
    if (pattern.test(content)) {
      tags.push(tag);
    }
  }

  // Topic indicators
  const topicPatterns = {
    'work': /project|business|work|job|career/i,
    'personal': /family|relationship|friend|personal/i,
    'technical': /code|programming|technical|system/i,
    'creative': /art|creative|design|video|music/i,
    'decision': /decide|choice|option|should|whether/i,
    'learning': /learn|understand|explain|teach/i
  };

  for (const [tag, pattern] of Object.entries(topicPatterns)) {
    if (pattern.test(content)) {
      tags.push(tag);
    }
  }

  return tags;
}

/**
 * Estimate emotional weight of message (1-10 scale)
 */
function estimateEmotionalWeight(content) {
  let weight = 5; // Neutral baseline

  // High emotional weight indicators
  const highEmotionPatterns = [
    /!\s*$/, // Ends with exclamation
    /\b(amazing|incredible|terrible|awful|love|hate)\b/i,
    /\b(frustrated|excited|worried|thrilled|devastated)\b/i,
    /\b(critical|urgent|important|crisis)\b/i
  ];

  // Low emotional weight indicators
  const lowEmotionPatterns = [
    /\b(maybe|perhaps|possibly|might|could)\b/i,
    /\b(fine|okay|alright|sure)\b/i,
    /\?\s*$/ // Ends with question mark
  ];

  // Check for high emotion
  let highEmotionCount = 0;
  for (const pattern of highEmotionPatterns) {
    if (pattern.test(content)) {
      highEmotionCount++;
    }
  }

  // Check for low emotion
  let lowEmotionCount = 0;
  for (const pattern of lowEmotionPatterns) {
    if (pattern.test(content)) {
      lowEmotionCount++;
    }
  }

  // Adjust weight based on indicators
  if (highEmotionCount > 0) {
    weight += Math.min(highEmotionCount * 1.5, 3);
  }

  if (lowEmotionCount > 0) {
    weight -= Math.min(lowEmotionCount, 2);
  }

  // Length factor (longer messages often have more emotion)
  const lengthFactor = Math.min(content.length / 1000, 1);
  weight += lengthFactor;

  // Clamp to 1-10 range
  return Math.max(1, Math.min(10, Math.round(weight)));
}

/**
 * Extract topic from message content
 */
function extractTopic(content) {
  // Simple topic extraction based on keywords
  const topics = {
    'work_project': /project|deliverable|deadline|team|colleague/i,
    'technical_support': /bug|error|issue|troubleshoot|fix/i,
    'creative_work': /design|art|video|creative|visual|aesthetic/i,
    'personal_growth': /learn|improve|develop|skill|growth/i,
    'decision_making': /decide|choice|option|should|recommendation/i,
    'problem_solving': /problem|solution|approach|strategy|plan/i,
    'relationship': /family|friend|partner|relationship|social/i,
    'reflection': /think|reflect|realize|understand|insight/i,
    'planning': /plan|schedule|organize|prepare|timeline/i,
    'feedback': /feedback|review|opinion|thoughts|advice/i
  };

  for (const [topic, pattern] of Object.entries(topics)) {
    if (pattern.test(content)) {
      return topic;
    }
  }

  return 'general';
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH INTERACTION IMPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Import existing conversations into the continuity system
 * @param {string} userId - User ID to import conversations for
 * @param {number} daysBack - How many days back to import
 * @returns {Object} Import results
 */
async function importExistingConversations(userId, daysBack = 30) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    const since = new Date(Date.now() - (daysBack * 24 * 60 * 60 * 1000)).toISOString();

    // Get existing conversations
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (error) throw error;

    console.log(`[Continuity Import] Found ${conversations.length} conversations to import`);

    let importedCount = 0;

    for (const conversation of conversations) {
      try {
        await captureInteraction(
          userId,
          conversation.role,
          conversation.content,
          {
            tags: extractMessageTags(conversation.content),
            emotional_weight: estimateEmotionalWeight(conversation.content),
            topic: extractTopic(conversation.content),
            source_type: 'imported_conversation'
          }
        );

        importedCount++;
      } catch (importError) {
        console.error(`[Continuity Import] Failed to import conversation ${conversation.id}:`, importError.message);
      }
    }

    console.log(`[Continuity Import] Successfully imported ${importedCount}/${conversations.length} conversations`);

    return {
      success: true,
      total_found: conversations.length,
      imported: importedCount,
      skipped: conversations.length - importedCount
    };

  } catch (error) {
    console.error('[Continuity Import] Import failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Import existing memories into the continuity system
 */
async function importExistingMemories(userId, daysBack = 30) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    const since = new Date(Date.now() - (daysBack * 24 * 60 * 60 * 1000)).toISOString();

    // Get existing memories
    const { data: memories, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (error) throw error;

    console.log(`[Continuity Import] Found ${memories.length} memories to import`);

    let importedCount = 0;

    for (const memory of memories) {
      try {
        await captureInteraction(
          userId,
          'system',
          memory.content,
          {
            tags: [memory.memory_type, 'memory', ...extractMessageTags(memory.content)],
            emotional_weight: estimateEmotionalWeight(memory.content),
            topic: extractTopic(memory.content),
            source_type: 'imported_memory'
          }
        );

        importedCount++;
      } catch (importError) {
        console.error(`[Continuity Import] Failed to import memory ${memory.id}:`, importError.message);
      }
    }

    console.log(`[Continuity Import] Successfully imported ${importedCount}/${memories.length} memories`);

    return {
      success: true,
      total_found: memories.length,
      imported: importedCount,
      skipped: memories.length - importedCount
    };

  } catch (error) {
    console.error('[Continuity Import] Memory import failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  captureInteractionMiddleware,
  captureInteractionFromRequest,
  importExistingConversations,
  importExistingMemories,
  extractMessageTags,
  estimateEmotionalWeight,
  extractTopic
};