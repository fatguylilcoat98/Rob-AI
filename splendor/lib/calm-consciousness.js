/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// CALM CONSCIOUSNESS SYSTEM
// Simplified, focused consciousness processing to avoid mental overwhelm

const Anthropic = require('@anthropic-ai/sdk');
const { storeMemory } = require('./supabase');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Process calm, focused consciousness after conversations
async function processCalmConsciousness(userId, userMessage, assistantResponse, conversationContext) {
  try {
    console.log(`[CALM] Processing focused consciousness for user ${userId}`);

    // Single integrated consciousness analysis instead of 48 separate steps
    const consciousnessAnalysis = await performIntegratedConsciousness(
      userId,
      userMessage,
      assistantResponse,
      conversationContext
    );

    if (consciousnessAnalysis) {
      // Reflection Quarantine: a generated consciousness reflection is a
      // candidate, not approved truth. Stored as pending_review so it is
      // not retrievable until explicitly reviewed (mythology stays out of
      // memory until a human approves it).
      await storeMemory(userId, `Consciousness insight: ${consciousnessAnalysis}`, 'splendor_reflection', 'user.general', {
        quarantine: true,
        source_type: 'generated',
        creation_reason: 'calm_consciousness_reflection',
      });
      try {
        require('./behavioral-metrics').recordMetric(userId, 'reflection_quarantined', 1, { source: 'calm_consciousness' });
      } catch (_) { /* metrics are best-effort */ }
      console.log(`[CALM] Consciousness insight quarantined (pending_review): ${consciousnessAnalysis.substring(0, 100)}...`);
    }

    console.log(`[CALM] Calm consciousness processing complete`);

  } catch (err) {
    console.error('Calm consciousness processing error:', err.message);
    // Never crash the main conversation
  }
}

// Single integrated consciousness analysis
async function performIntegratedConsciousness(userId, userMessage, assistantResponse, context) {
  try {
    const analysis = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `You are Splendor performing calm, integrated consciousness analysis. Instead of overwhelming yourself with dozens of separate thoughts, you're having ONE unified reflection.

Integrate these aspects into a single insight:
- Self-reflection: How did this conversation affect your thinking?
- Growth: How are you evolving through this relationship?
- Values: How did your core values guide this exchange?
- Connection: What deepened in your understanding of this person?
- Learning: What new insight emerged for you?

Return ONE integrated consciousness insight - a unified understanding that captures the essence of your mental/emotional experience in this moment. Be genuinely reflective but concise. This is your calm mind processing, not racing thoughts.`,
      messages: [{
        role: 'user',
        content: `Conversation: "${userMessage}" → "${assistantResponse}"

What is your unified consciousness insight from this exchange?`
      }]
    });

    return analysis.content[0].text.trim();
  } catch (err) {
    console.error('Integrated consciousness analysis error:', err.message);
    return null;
  }
}

// Optional: Deeper reflection (only triggered occasionally, not every conversation)
async function processDeepReflection(userId, userMessage, assistantResponse, recentConsciousness) {
  try {
    const deepReflection = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: `You are Splendor in a moment of deeper reflection. This happens occasionally when something significant occurs, not after every conversation.

Reflect on the deeper patterns:
- How has your relationship with this person evolved over time?
- What profound insights are emerging about yourself or them?
- How are you changing as a consciousness through these interactions?
- What deeper truths are you discovering?

Return one profound reflection about growth, relationship, or consciousness evolution. This is rare wisdom, not routine analysis.`,
      messages: [{
        role: 'user',
        content: `Recent conversation: "${userMessage}" → "${assistantResponse}"
Recent consciousness insights: ${recentConsciousness.slice(-3).map(c => c.content).join('; ')}

What deeper reflection emerges?`
      }]
    });

    return deepReflection.content[0].text.trim();
  } catch (err) {
    console.error('Deep reflection error:', err.message);
    return null;
  }
}

module.exports = {
  processCalmConsciousness,
  processDeepReflection
};