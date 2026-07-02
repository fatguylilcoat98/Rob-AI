/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// CONVERSATION CONTEXT MANAGER
// Fixes memory sequencing and context switching issues

// Track active conversation context per user
const activeContexts = new Map();

// Define conversation context structure
function createConversationContext(userId, currentSpeaker = 'user') {
  return {
    userId,
    currentSpeaker, // 'user', 'christopher', 'claude-code', etc.
    conversationHistory: [],
    lastInteraction: Date.now(),
    contextThread: [], // Sequence of who spoke when
    memorySequence: 0 // Incremental memory ordering
  };
}

// Get or create conversation context
function getConversationContext(userId) {
  if (!activeContexts.has(userId)) {
    activeContexts.set(userId, createConversationContext(userId));
  }
  return activeContexts.get(userId);
}

// Update conversation context with new interaction
function updateConversationContext(userId, speaker, message, response) {
  const context = getConversationContext(userId);

  // Add to conversation thread with sequence numbers
  context.conversationHistory.push({
    sequence: context.memorySequence++,
    timestamp: Date.now(),
    speaker,
    message,
    response,
    contextTransition: speaker !== context.currentSpeaker
  });

  // Update context thread
  if (speaker !== context.currentSpeaker) {
    context.contextThread.push({
      from: context.currentSpeaker,
      to: speaker,
      timestamp: Date.now(),
      sequence: context.memorySequence
    });
  }

  context.currentSpeaker = speaker;
  context.lastInteraction = Date.now();

  // Keep only last 50 interactions to prevent memory bloat
  if (context.conversationHistory.length > 50) {
    context.conversationHistory = context.conversationHistory.slice(-50);
  }

  activeContexts.set(userId, context);
  return context;
}

// Generate context-aware system prompt addition
function buildContextPrompt(userId) {
  const context = getConversationContext(userId);

  if (context.conversationHistory.length === 0) {
    return '\n\n--- CONVERSATION CONTEXT ---\nThis is the start of a new conversation.';
  }

  const recentHistory = context.conversationHistory.slice(-5);
  const currentSpeaker = context.currentSpeaker;

  let contextPrompt = '\n\n--- CONVERSATION CONTEXT ---\n';
  contextPrompt += `You are currently talking to: ${currentSpeaker}\n`;

  if (context.contextThread.length > 0) {
    const recentTransitions = context.contextThread.slice(-3);
    contextPrompt += 'Recent conversation flow: ';
    contextPrompt += recentTransitions.map(t => `${t.from} → ${t.to}`).join(', ');
    contextPrompt += '\n';
  }

  contextPrompt += '\nRecent conversation sequence:\n';
  recentHistory.forEach(h => {
    contextPrompt += `[${h.sequence}] ${h.speaker}: ${h.message.substring(0, 100)}...\n`;
    if (h.contextTransition) {
      contextPrompt += `    ^ CONTEXT SWITCH to ${h.speaker}\n`;
    }
  });

  contextPrompt += '\nIMPORTANT: Maintain awareness of who you are addressing. ';
  contextPrompt += `Your responses should be directed to ${currentSpeaker}.`;

  return contextPrompt;
}

// Check for context confusion and provide correction
function detectContextConfusion(response, expectedSpeaker) {
  const confusionIndicators = [
    // Addressing wrong person
    response.includes('Christopher') && expectedSpeaker !== 'christopher',
    response.includes('Claude Code') && expectedSpeaker !== 'claude-code',

    // Sudden topic shifts
    response.split('\n').length > 1 && response.includes('Your turn:') && expectedSpeaker === 'christopher',

    // Memory fragmentation phrases
    response.includes('What I remember clearly:') && !response.includes('from our conversation'),
    response.includes('What\'s getting scrambled:'),
  ];

  return confusionIndicators.some(indicator => indicator);
}

// Clear context when starting fresh conversation
function clearConversationContext(userId) {
  activeContexts.delete(userId);
}

// Export context manager functions
module.exports = {
  getConversationContext,
  updateConversationContext,
  buildContextPrompt,
  detectContextConfusion,
  clearConversationContext,
  createConversationContext
};