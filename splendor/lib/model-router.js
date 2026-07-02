/*
 * MODEL ROUTER
 * Built by Christopher Hughes · Sacramento, CA
 * Created with Claude Code
 * Truth · Safety · We Got Your Back
 *
 * Routes short conversational turns to Groq Mixtral for 10x speed improvement
 * Keeps Claude for substantive turns requiring deep reasoning
 */

/**
 * Select appropriate model based on user message characteristics
 * @param {Object} options - { userMessage, recentMemoryCount, hasAttachment }
 * @returns {string} 'claude-sonnet' | 'groq-mixtral'
 */
function selectModel({ userMessage, recentMemoryCount = 0, hasAttachment = false }) {
  // Default to Claude for safety
  if (!userMessage || typeof userMessage !== 'string') {
    return 'claude-sonnet';
  }

  const message = userMessage.trim().toLowerCase();
  const messageLength = userMessage.length;

  // Route to GROQ-MIXTRAL only if ALL conditions are true:
  
  // 1. Message length < 80 characters
  if (messageLength >= 80) {
    return 'claude-sonnet';
  }

  // 2. No attachments
  if (hasAttachment) {
    return 'claude-sonnet';
  }

  // 3. No depth-requiring question words
  const depthQuestions = ['why', 'how come', 'explain', 'what do you think about', 'analyze'];
  if (depthQuestions.some(q => message.includes(q))) {
    return 'claude-sonnet';
  }

  // 4. No code (triple backticks or obvious code patterns)
  if (message.includes('```') || message.includes('function') || message.includes('const ') || message.includes('import ')) {
    return 'claude-sonnet';
  }

  // 5. No explicit analysis requests
  const analysisRequests = ['analyze this', 'compare', 'deep dive', 'think through', 'break down'];
  if (analysisRequests.some(req => message.includes(req))) {
    return 'claude-sonnet';
  }

  // 6. Avoid Groq for first-time or memory-heavy conversations
  if (recentMemoryCount > 10) {
    return 'claude-sonnet';
  }

  // If we get here, it's likely a simple conversational turn
  // Examples: "yeah", "got it", "tell me more", "lol", "thanks", "okay"
  return 'groq-mixtral';
}

module.exports = {
  selectModel
};
