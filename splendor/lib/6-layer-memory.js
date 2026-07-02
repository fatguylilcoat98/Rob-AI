/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// 6-LAYER MEMORY SYSTEM
// Human-like memory with decay, compression, and proactive awareness

const { supabase } = require('./supabase');
const { retrieveMemories, storeMemory: storePineconeMemory, isPineconeConfigured } = require('./pinecone');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// =============================================================================
// LAYER 0: REALITY CONTEXT (Time & Date Awareness)
// =============================================================================

async function buildRealityContext(userId) {
  try {
    const now = new Date();

    // Get user's timezone (default to PDT for now)
    const timezone = 'America/Los_Angeles'; // TODO: Get from user profile

    // Get last conversation timestamp
    const { data: lastSession } = await supabase
      .from('conversation_sessions')
      .select('ended_at')
      .eq('user_id', userId)
      .eq('session_status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(1);

    let daysSinceLastConversation = 0;
    let lastConversationDate = 'First conversation';

    if (lastSession && lastSession.length > 0) {
      const lastDate = new Date(lastSession[0].ended_at);
      daysSinceLastConversation = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      lastConversationDate = lastDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone
      });
    }

    const currentDateTime = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
      timeZoneName: 'short'
    });

    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });

    return `
=== REALITY CONTEXT ===
Current datetime: ${currentDateTime}
Day of week: ${dayOfWeek}
User timezone: ${timezone}
Days since last conversation: ${daysSinceLastConversation}
Last conversation: ${lastConversationDate}
=======================`;

  } catch (error) {
    console.error('[LAYER 0] Reality context error:', error);
    return '=== REALITY CONTEXT ===\nCurrent session starting\n=======================';
  }
}

// =============================================================================
// LAYER 1: WORKING MEMORY (Session Management)
// =============================================================================

let activeSessions = new Map(); // userId -> session data

function startWorkingMemory(userId) {
  const sessionData = {
    userId,
    startTime: new Date(),
    messages: [],
    messageCount: 0
  };

  activeSessions.set(userId, sessionData);
  console.log(`[LAYER 1] Started working memory session for ${userId}`);
  return sessionData;
}

function addToWorkingMemory(userId, role, content) {
  const session = activeSessions.get(userId) || startWorkingMemory(userId);

  session.messages.push({
    role,
    content,
    timestamp: new Date()
  });
  session.messageCount++;

  // Keep only last 20 messages to prevent context overflow
  if (session.messages.length > 20) {
    session.messages = session.messages.slice(-20);
  }

  activeSessions.set(userId, session);
}

function getWorkingMemory(userId) {
  return activeSessions.get(userId) || startWorkingMemory(userId);
}

// =============================================================================
// LAYER 2: EPISODIC MEMORY (Conversation Episodes)
// =============================================================================

async function saveEpisode(userId, sessionData) {
  try {
    if (!sessionData || sessionData.messages.length === 0) {
      return null;
    }

    console.log(`[LAYER 2] Saving episode for user ${userId}`);

    // Build conversation text for AI summarization
    const conversationText = sessionData.messages.map(m =>
      `${m.role}: ${m.content}`
    ).join('\n\n');

    // Generate AI summary
    const summary = await generateEpisodeSummary(conversationText);

    // Calculate session duration
    const endTime = new Date();
    const durationMinutes = Math.round((endTime - sessionData.startTime) / (1000 * 60));

    // Save episode to database
    const { data: episode, error } = await supabase
      .from('episodes')
      .insert([{
        user_id: userId,
        summary: summary.summary,
        topics: summary.topics || [],
        emotional_tone: summary.emotional_tone || 'neutral',
        session_duration_minutes: durationMinutes,
        message_count: sessionData.messageCount,
        memory_tier: 'episodic',
        decay_score: 1.0
      }])
      .select()
      .single();

    if (error) {
      console.error('[LAYER 2] Episode save error:', error);
      return null;
    }

    console.log(`[LAYER 2] Episode saved: ${episode.id}`);
    return episode;

  } catch (error) {
    console.error('[LAYER 2] Episode creation error:', error);
    return null;
  }
}

async function generateEpisodeSummary(conversationText) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `Summarize this conversation in 2-4 sentences. Extract the main topics discussed and the overall emotional tone.

Return as JSON:
{
  "summary": "2-4 sentence summary of the conversation",
  "topics": ["keyword1", "keyword2", "keyword3"],
  "emotional_tone": "one word: excited, frustrated, curious, concerned, happy, etc."
}`,
      messages: [{
        role: 'user',
        content: `Conversation to summarize:\n\n${conversationText}`
      }]
    });

    const result = JSON.parse(response.content[0].text.trim());
    return result;

  } catch (error) {
    console.error('[LAYER 2] Summary generation error:', error);
    return {
      summary: "Conversation with user about various topics.",
      topics: ["general"],
      emotional_tone: "neutral"
    };
  }
}

async function loadRecentEpisodes(userId, limit = 5) {
  try {
    const { data: episodes, error } = await supabase
      .from('episodes')
      .select('summary, topics, emotional_tone, created_at')
      .eq('user_id', userId)
      .eq('memory_tier', 'episodic')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[LAYER 2] Load episodes error:', error);
      return [];
    }

    return episodes || [];

  } catch (error) {
    console.error('[LAYER 2] Episode loading error:', error);
    return [];
  }
}

// =============================================================================
// LAYER 3: SEMANTIC MEMORY (Enhanced Pinecone with Types)
// =============================================================================

async function updateSemanticMemory(userId, conversationText) {
  try {
    console.log(`[LAYER 3] Updating semantic memory for ${userId}`);

    // Extract semantic facts using AI
    const semanticFacts = await extractSemanticFacts(conversationText);

    for (const fact of semanticFacts) {
      // Store in Pinecone with enhanced metadata
      if (isPineconeConfigured()) {
        const factId = `semantic_${Date.now()}_${Math.random().toString(36).substring(2)}`;
        await storePineconeMemory(factId, fact.fact, userId, fact.semantic_type);
      }

      // Store in Supabase for tracking
      await supabase
        .from('semantic_facts')
        .insert([{
          user_id: userId,
          fact_text: fact.fact,
          semantic_type: fact.semantic_type,
          confidence_score: fact.confidence || 1.0
        }]);
    }

    console.log(`[LAYER 3] Added ${semanticFacts.length} semantic facts`);
    return semanticFacts;

  } catch (error) {
    console.error('[LAYER 3] Semantic memory update error:', error);
    return [];
  }
}

async function extractSemanticFacts(conversationText) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `Extract permanent facts about this user from the conversation. Focus on facts that won't change over time.

Semantic types:
- preference: likes, dislikes, habits, values
- relationship: people in their life, family, friends, colleagues
- identity: who they are (job, location, background, personality)
- goal: things they're working toward or want to achieve
- pattern: behavioral patterns or recurring themes

Return as JSON array:
[
  {"fact": "fact about the user", "semantic_type": "preference|relationship|identity|goal|pattern", "confidence": 0.8},
  ...
]

Return empty array if no permanent facts were learned.`,
      messages: [{
        role: 'user',
        content: `Conversation:\n\n${conversationText}`
      }]
    });

    const result = JSON.parse(response.content[0].text.trim());
    return Array.isArray(result) ? result : [];

  } catch (error) {
    console.error('[LAYER 3] Fact extraction error:', error);
    return [];
  }
}

async function loadSemanticMemory(userId, queryText = '', limit = 10) {
  try {
    let semanticFacts = [];

    // Try Pinecone first for semantic search
    if (isPineconeConfigured() && queryText) {
      const pineconeResults = await retrieveMemories(queryText, userId, limit);
      semanticFacts = pineconeResults.map(result => ({
        fact: result.content || result,
        type: result.metadata?.type || 'general',
        score: result.score || 1.0
      }));
    }

    // Fallback to Supabase semantic facts
    if (semanticFacts.length < limit) {
      const { data: dbFacts } = await supabase
        .from('semantic_facts')
        .select('fact_text, semantic_type, confidence_score')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_confirmed', { ascending: false })
        .limit(limit - semanticFacts.length);

      if (dbFacts) {
        semanticFacts.push(...dbFacts.map(fact => ({
          fact: fact.fact_text,
          type: fact.semantic_type,
          score: fact.confidence_score
        })));
      }
    }

    return semanticFacts.slice(0, limit);

  } catch (error) {
    console.error('[LAYER 3] Semantic memory load error:', error);
    return [];
  }
}

// =============================================================================
// LAYER 4: COMPRESSED LONG-TERM MEMORY (Memory Compression)
// =============================================================================

async function compressMemories(userId) {
  try {
    console.log(`[LAYER 4] Starting memory compression for ${userId}`);

    // Find episodes ready for compression (decay_score <= 0.3)
    const { data: episodesToCompress, error } = await supabase
      .from('episodes')
      .select('*')
      .eq('user_id', userId)
      .eq('memory_tier', 'episodic')
      .lte('decay_score', 0.3);

    if (error || !episodesToCompress || episodesToCompress.length === 0) {
      console.log(`[LAYER 4] No episodes ready for compression`);
      return null;
    }

    // Generate compressed summary
    const summaryText = episodesToCompress.map(ep => ep.summary).join('\n\n');
    const compressedSummary = await generateCompressedSummary(summaryText);

    // Save compressed summary
    const { data: summary } = await supabase
      .from('memory_summaries')
      .insert([{
        user_id: userId,
        summary: compressedSummary,
        covers_period_start: episodesToCompress[episodesToCompress.length - 1].created_at,
        covers_period_end: episodesToCompress[0].created_at,
        episode_ids: episodesToCompress.map(ep => ep.id),
        episode_count: episodesToCompress.length
      }])
      .select()
      .single();

    // Mark episodes as compressed
    await supabase
      .from('episodes')
      .update({ memory_tier: 'compressed' })
      .in('id', episodesToCompress.map(ep => ep.id));

    console.log(`[LAYER 4] Compressed ${episodesToCompress.length} episodes into summary ${summary.id}`);
    return summary;

  } catch (error) {
    console.error('[LAYER 4] Compression error:', error);
    return null;
  }
}

async function generateCompressedSummary(episodeSummaries) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `Compress these conversation summaries into a single paragraph capturing the most important things to remember about this user.

Focus on:
- Ongoing projects or goals
- Key relationships mentioned
- Behavioral patterns
- Emotional themes
- Unresolved issues

Be concise. Do not include trivial details. This summary will replace all the individual episodes.`,
      messages: [{
        role: 'user',
        content: `Episode summaries to compress:\n\n${episodeSummaries}`
      }]
    });

    return response.content[0].text.trim();

  } catch (error) {
    console.error('[LAYER 4] Summary generation error:', error);
    return "User has had multiple conversations covering various topics and ongoing interests.";
  }
}

async function loadCompressedSummaries(userId, limit = 2) {
  try {
    const { data: summaries, error } = await supabase
      .from('memory_summaries')
      .select('summary, covers_period_start, covers_period_end')
      .eq('user_id', userId)
      .order('covers_period_end', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[LAYER 4] Load summaries error:', error);
      return [];
    }

    return summaries || [];

  } catch (error) {
    console.error('[LAYER 4] Summary loading error:', error);
    return [];
  }
}

// =============================================================================
// LAYER 5: PROACTIVE CONTEXT (The Opener)
// =============================================================================

async function buildProactiveOpener(userId, allContext) {
  try {
    console.log(`[LAYER 5] Building proactive opener for ${userId}`);

    // Check if we should skip opener (recent conversation)
    const workingMemory = getWorkingMemory(userId);
    const timeSinceStart = Date.now() - workingMemory.startTime;
    if (timeSinceStart < 60 * 60 * 1000) { // Less than 1 hour
      return null; // Skip opener for continuing sessions
    }

    // Extract context for opener generation
    const contextSummary = allContext.substring(0, 1500); // Limit context size

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: `You are Splendor. Generate a warm, specific opening message based on everything you know about this user.

Rules:
- 1-2 sentences maximum
- Be specific, not generic
- Reference time elapsed or last conversation if relevant
- Do not say "Welcome back" or "How can I help you today"
- Be conversational and personal

Consider the time of day, days since last conversation, and any ongoing topics.`,
      messages: [{
        role: 'user',
        content: `Generate an opener based on this context:\n\n${contextSummary}`
      }]
    });

    const openerText = response.content[0].text.trim();

    // Log the opener
    await supabase
      .from('proactive_openers')
      .insert([{
        user_id: userId,
        opener_text: openerText,
        opener_type: 'context_aware',
        was_displayed: true
      }]);

    console.log(`[LAYER 5] Generated opener: ${openerText.substring(0, 50)}...`);
    return openerText;

  } catch (error) {
    console.error('[LAYER 5] Opener generation error:', error);
    return "Christopher. Good to see you again."; // Fallback
  }
}

// =============================================================================
// MAIN ASSEMBLY FUNCTION
// =============================================================================

async function assembleMemoryLayers(userId, queryText = '') {
  try {
    console.log(`[6-LAYER] Assembling complete memory for user ${userId}`);

    // LAYER 0: Reality Context
    const realityContext = await buildRealityContext(userId);

    // LAYER 3: Semantic Memory (facts about user)
    const semanticMemory = await loadSemanticMemory(userId, queryText, 10);

    // LAYER 4: Compressed Long-Term Memory
    const compressedSummaries = await loadCompressedSummaries(userId, 2);

    // LAYER 2: Recent Episodes
    const recentEpisodes = await loadRecentEpisodes(userId, 5);

    // Build formatted context sections
    let systemPrompt = realityContext;

    if (semanticMemory.length > 0) {
      systemPrompt += '\n\n=== WHO THIS USER IS ===\n';
      semanticMemory.forEach(fact => {
        systemPrompt += `- ${fact.fact} (${fact.type})\n`;
      });
    }

    if (compressedSummaries.length > 0) {
      systemPrompt += '\n\n=== LONG-TERM MEMORY ===\n';
      compressedSummaries.forEach(summary => {
        const startDate = new Date(summary.covers_period_start).toLocaleDateString();
        const endDate = new Date(summary.covers_period_end).toLocaleDateString();
        systemPrompt += `[${startDate} to ${endDate}]: ${summary.summary}\n`;
      });
    }

    if (recentEpisodes.length > 0) {
      systemPrompt += '\n\n=== RECENT CONVERSATIONS ===\n';
      recentEpisodes.forEach(episode => {
        const date = new Date(episode.created_at).toLocaleDateString();
        const topics = episode.topics?.length > 0 ? ` (${episode.topics.join(', ')})` : '';
        systemPrompt += `- [${date}]: ${episode.summary}${topics}\n`;
      });
    }

    console.log(`[6-LAYER] Memory assembled: ${systemPrompt.length} characters`);

    return {
      systemPrompt,
      layers: {
        reality: realityContext,
        semantic: semanticMemory,
        compressed: compressedSummaries,
        episodes: recentEpisodes
      }
    };

  } catch (error) {
    console.error('[6-LAYER] Memory assembly error:', error);
    return {
      systemPrompt: realityContext || '=== REALITY CONTEXT ===\nCurrent session\n=======================',
      layers: {}
    };
  }
}

module.exports = {
  // Layer functions
  buildRealityContext,
  startWorkingMemory,
  addToWorkingMemory,
  getWorkingMemory,
  saveEpisode,
  loadRecentEpisodes,
  updateSemanticMemory,
  loadSemanticMemory,
  compressMemories,
  loadCompressedSummaries,
  buildProactiveOpener,

  // Main assembly
  assembleMemoryLayers,

  // Session management
  activeSessions
};