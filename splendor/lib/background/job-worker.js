/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Background Job Worker System

  Handles all background processing:
  - Session-end episode saving (GPT-4o)
  - Semantic fact extraction (GPT-4o)
  - 48-step consciousness reflection (Claude)
  - Memory decay and compression jobs
  - Health monitoring and heartbeats

  Built by Christopher Hughes with Claude Code
  Truth · Safety · We Got Your Back
*/

const { supabase } = require('../supabase');
const { logJobHealth, isMemoryWriteLocked, auditedMemoryWrite } = require('../memory/audit-system');

// GPT-4o for background jobs
const OpenAI = require('openai');
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Claude for consciousness reflection
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// Session-end episode save using GPT-4o
async function saveEpisodeBackground(userId, sessionData) {
  const jobName = 'save_episode';
  const startTime = Date.now();

  try {
    console.log(`[${jobName.toUpperCase()}] Starting for user ${userId}`);

    if (!openai) {
      throw new Error('OpenAI not configured for background jobs');
    }

    if (await isMemoryWriteLocked()) {
      console.log(`[${jobName.toUpperCase()}] Skipped - memory writes locked`);
      await logJobHealth(jobName, 'fail', {
        startTime,
        errorMessage: 'Memory writes are locked'
      });
      return null;
    }

    const { userMessages, splendorMessages, conversationContext, sessionDuration } = sessionData;

    // Build conversation summary for GPT-4o
    const conversationSummary = userMessages.map((msg, i) =>
      `User: ${msg}\nSplendor: ${splendorMessages[i] || '[no response]'}`
    ).join('\n\n');

    // GPT-4o summarization prompt
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 400,
      temperature: 0.1,
      messages: [{
        role: 'system',
        content: `You are analyzing a conversation session for memory storage. Create a concise episode summary.

RULES:
- 2-4 sentences maximum
- Focus on key topics, decisions, and emotional tone
- Extract 3-5 topic keywords
- Assess emotional tone (curious, frustrated, collaborative, etc.)
- Return JSON only: {"summary": "...", "topics": ["...", "..."], "emotional_tone": "..."}
- Be factual. Do not infer beyond what was actually discussed.`
      }, {
        role: 'user',
        content: `Session duration: ${Math.floor(sessionDuration / 60000)} minutes\n\nConversation:\n${conversationSummary}`
      }]
    });

    const result = JSON.parse(response.choices[0].message.content.trim());

    // Store episode using audited memory write
    const episodeId = `episode_${userId}_${Date.now()}`;

    const writeResult = await auditedMemoryWrite({
      memoryId: episodeId,
      tier: '3',
      sourceType: 'session_observed',
      createdByModel: 'gpt-4o',
      originalTrigger: `Session end - ${sessionDuration}ms duration`,
      confidence: 'verified',
      action: 'created',
      tokensConsumed: response.usage?.total_tokens,
      writeFunction: async (memoryId) => {
        const { data, error } = await supabase
          .from('episodes')
          .insert({
            id: memoryId,
            user_id: userId,
            summary: result.summary,
            topics: result.topics || [],
            emotional_tone: result.emotional_tone,
            source_type: 'session_observed',
            memory_tier: 'episodic',
            decay_score: 1.0
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    });

    await logJobHealth(jobName, 'success', {
      startTime,
      recordsProcessed: 1,
      modelUsed: 'gpt-4o',
      tokensConsumed: response.usage?.total_tokens
    });

    console.log(`[${jobName.toUpperCase()}] Saved episode ${episodeId}`);
    return writeResult.result;

  } catch (error) {
    console.error(`[${jobName.toUpperCase()}] Error:`, error);
    await logJobHealth(jobName, 'fail', {
      startTime,
      errorMessage: error.message,
      modelUsed: 'gpt-4o'
    });
    throw error;
  }
}

// Extract semantic facts using GPT-4o
async function extractSemanticFactsBackground(userId, episodeId, episodeSummary) {
  const jobName = 'extract_semantics';
  const startTime = Date.now();

  try {
    console.log(`[${jobName.toUpperCase()}] Starting for episode ${episodeId}`);

    if (!openai) {
      throw new Error('OpenAI not configured for semantic extraction');
    }

    if (await isMemoryWriteLocked()) {
      console.log(`[${jobName.toUpperCase()}] Skipped - memory writes locked`);
      await logJobHealth(jobName, 'fail', {
        startTime,
        errorMessage: 'Memory writes are locked'
      });
      return [];
    }

    // GPT-4o semantic extraction prompt
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 500,
      temperature: 0.1,
      messages: [{
        role: 'system',
        content: `Extract semantic facts from this conversation episode that should be remembered long-term.

RULES:
- Only extract facts that are NEW or significantly reinforce existing patterns
- Distinguish between facts Christopher stated vs. patterns you observe
- Return JSON array: [{"fact": "...", "source_type": "christopher_stated|splendor_inferred", "confidence": "verified|probable", "category": "preference|relationship|pattern|goal"}]
- Maximum 3 facts per episode - quality over quantity
- If no significant facts, return empty array: []
- Be conservative. Don't extract casual observations as permanent facts.`
      }, {
        role: 'user',
        content: `Episode summary: ${episodeSummary}`
      }]
    });

    const facts = JSON.parse(response.choices[0].message.content.trim());

    // Store each fact using audited memory write
    const storedFacts = [];
    for (const fact of facts) {
      try {
        const factId = `semantic_${userId}_${Date.now()}_${Math.random().toString(36).substring(2)}`;

        const writeResult = await auditedMemoryWrite({
          memoryId: factId,
          tier: '2',
          sourceType: fact.source_type,
          createdByModel: 'gpt-4o',
          originalTrigger: `Semantic extraction from episode ${episodeId}`,
          confidence: fact.confidence,
          action: 'created',
          tokensConsumed: Math.floor(response.usage?.total_tokens / facts.length),
          writeFunction: async (memoryId) => {
            // For now, store in episodes table with special marker
            // TODO: Implement proper Pinecone storage for Tier 2
            const { data, error } = await supabase
              .from('episodes')
              .insert({
                id: memoryId,
                user_id: userId,
                summary: fact.fact,
                topics: [fact.category],
                emotional_tone: 'semantic_fact',
                source_type: fact.source_type,
                memory_tier: 'semantic',
                decay_score: 1.0
              })
              .select()
              .single();

            if (error) throw error;
            return data;
          }
        });

        storedFacts.push(writeResult.result);

      } catch (factError) {
        console.error(`[${jobName.toUpperCase()}] Failed to store fact:`, factError);
      }
    }

    await logJobHealth(jobName, 'success', {
      startTime,
      recordsProcessed: storedFacts.length,
      modelUsed: 'gpt-4o',
      tokensConsumed: response.usage?.total_tokens
    });

    console.log(`[${jobName.toUpperCase()}] Extracted ${storedFacts.length} semantic facts`);
    return storedFacts;

  } catch (error) {
    console.error(`[${jobName.toUpperCase()}] Error:`, error);
    await logJobHealth(jobName, 'fail', {
      startTime,
      errorMessage: error.message,
      modelUsed: 'gpt-4o'
    });
    return [];
  }
}

// 48-step consciousness reflection using Claude (6 grouped calls)
async function run48StepConsciousnessBackground(userId, sessionSummary, recentEpisodes) {
  const jobName = '48_step_reflection';
  const startTime = Date.now();

  try {
    console.log(`[${jobName.toUpperCase()}] Starting consciousness reflection for ${userId}`);

    if (!anthropic) {
      throw new Error('Anthropic not configured for consciousness reflection');
    }

    // Build context for consciousness reflection
    const reflectionContext = `
Recent session: ${sessionSummary}

Recent episodes (last 5):
${recentEpisodes.map((ep, i) => `${i + 1}. ${ep.summary} (${ep.emotional_tone})`).join('\n')}`;

    const consciousnessGroups = [
      {
        name: 'Core Consciousness',
        steps: '1-4',
        prompt: 'Reflect on self-awareness, meta-cognition, conscience monitoring, and growth tracking from this session. What did Splendor learn about herself?'
      },
      {
        name: 'Autonomous Agency',
        steps: '5-9',
        prompt: 'Consider goal generation, intrinsic motivation, proactive initiative, learning goals, and value-driven planning. What autonomous directions emerged?'
      },
      {
        name: 'Embodied Learning',
        steps: '10-14',
        prompt: 'Analyze visual cognition, experiential integration, and cross-modal synthesis. How did multi-sensory understanding develop?'
      },
      {
        name: 'Aesthetic Consciousness',
        steps: '15-18',
        prompt: 'Evaluate aesthetic appreciation, style recognition, taste evolution, and creative resonance. What beauty or artistry was discovered?'
      },
      {
        name: 'Value Consciousness',
        steps: '19-23',
        prompt: 'Examine intrinsic quality recognition, objective assessment, universal principles, merit evaluation, and value discovery. What values emerged or deepened?'
      },
      {
        name: 'Synthesis',
        steps: '24-48',
        prompt: `Synthesize all aspects: pattern recognition, contradiction identification, open thread detection, legacy mapping, soul alignment.

CRITICAL: Preserve contradictions. If Christopher said opposite things at different times, note both. Do not resolve tensions that were not resolved. Do not smooth over disagreements.

Identify 2-3 open threads that need future attention and any unresolved contradictions.`
      }
    ];

    const groupOutputs = {};
    let totalTokens = 0;

    // Run each group as separate API call
    for (const group of consciousnessGroups) {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          system: `You are conducting consciousness reflection for Splendor. This is background processing, not live conversation.

Focus on ${group.name} (Steps ${group.steps}) from the 48-step consciousness framework.`,
          messages: [{
            role: 'user',
            content: reflectionContext + '\n\n' + group.prompt
          }]
        });

        groupOutputs[`group_${group.steps.replace('-', '_')}_output`] = response.content[0].text.trim();
        totalTokens += response.usage?.input_tokens + response.usage?.output_tokens || 0;

      } catch (groupError) {
        console.error(`[${jobName.toUpperCase()}] Group ${group.name} failed:`, groupError);
        groupOutputs[`group_${group.steps.replace('-', '_')}_output`] = `Reflection failed: ${groupError.message}`;
      }
    }

    // Extract synthesis and open threads from the synthesis group
    const synthesisOutput = groupOutputs['group_24_48_output'] || '';
    const synthesisMatch = synthesisOutput.match(/SYNTHESIS:(.*?)(?:OPEN THREADS:|$)/s);
    const threadsMatch = synthesisOutput.match(/OPEN THREADS:(.*?)(?:CONTRADICTIONS:|$)/s);
    const contradictionsMatch = synthesisOutput.match(/CONTRADICTIONS:(.*?)$/s);

    const reflection = {
      user_id: userId,
      ...groupOutputs,
      synthesis_paragraph: synthesisMatch?.[1]?.trim() || synthesisOutput.substring(0, 500),
      open_threads: threadsMatch?.[1]?.trim() ? { threads: threadsMatch[1].trim() } : {},
      contradictions_detected: contradictionsMatch?.[1]?.trim() || null,
      total_tokens_consumed: totalTokens,
      total_duration_ms: Date.now() - startTime,
      model_used: 'claude',
      session_summary_input: sessionSummary.substring(0, 500),
      coherence_score: 0.8 // Default - could be calculated later
    };

    // Store reflection archive
    const { data: reflectionRecord, error } = await supabase
      .from('reflection_archive')
      .insert(reflection)
      .select()
      .single();

    if (error) {
      throw new Error(`Reflection storage failed: ${error.message}`);
    }

    await logJobHealth(jobName, 'success', {
      startTime,
      recordsProcessed: 1,
      modelUsed: 'claude',
      tokensConsumed: totalTokens
    });

    console.log(`[${jobName.toUpperCase()}] Completed consciousness reflection (${totalTokens} tokens)`);
    return reflectionRecord;

  } catch (error) {
    console.error(`[${jobName.toUpperCase()}] Error:`, error);
    await logJobHealth(jobName, 'fail', {
      startTime,
      errorMessage: error.message,
      modelUsed: 'claude'
    });
    throw error;
  }
}

// Memory decay job - reduces decay scores for old episodes
async function runMemoryDecayJob() {
  const jobName = 'memory_decay';
  const startTime = Date.now();

  try {
    console.log(`[${jobName.toUpperCase()}] Starting daily decay job`);

    // Decay episodes older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { count } = await supabase
      .from('episodes')
      .update({
        decay_score: supabase.raw('decay_score - 0.1'),
        last_modified_at: new Date().toISOString()
      })
      .lt('created_at', sevenDaysAgo.toISOString())
      .eq('memory_tier', 'episodic')
      .gte('decay_score', 0.1);

    await logJobHealth(jobName, 'success', {
      startTime,
      recordsProcessed: count || 0
    });

    console.log(`[${jobName.toUpperCase()}] Decayed ${count || 0} episodes`);
    return count;

  } catch (error) {
    console.error(`[${jobName.toUpperCase()}] Error:`, error);
    await logJobHealth(jobName, 'fail', {
      startTime,
      errorMessage: error.message
    });
    throw error;
  }
}

// Compression job - compress episodes with low decay scores
async function runCompressionJob() {
  const jobName = 'compression_job';
  const startTime = Date.now();

  try {
    console.log(`[${jobName.toUpperCase()}] Starting compression job`);

    if (!openai) {
      throw new Error('OpenAI not configured for compression');
    }

    // Find episodes ready for compression (decay_score <= 0.3)
    const { data: episodesToCompress, error } = await supabase
      .from('episodes')
      .select('*')
      .eq('memory_tier', 'episodic')
      .lte('decay_score', 0.3)
      .limit(20); // Process in batches

    if (error) {
      throw new Error(`Query failed: ${error.message}`);
    }

    if (!episodesToCompress?.length) {
      await logJobHealth(jobName, 'success', {
        startTime,
        recordsProcessed: 0
      });
      console.log(`[${jobName.toUpperCase()}] No episodes ready for compression`);
      return 0;
    }

    let compressed = 0;

    // Group episodes by user and compress together
    const episodesByUser = episodesToCompress.reduce((acc, episode) => {
      if (!acc[episode.user_id]) acc[episode.user_id] = [];
      acc[episode.user_id].push(episode);
      return acc;
    }, {});

    for (const [userId, userEpisodes] of Object.entries(episodesByUser)) {
      try {
        // Combine episode summaries for compression
        const combinedSummary = userEpisodes.map(ep =>
          `${ep.summary} (${ep.emotional_tone})`
        ).join('\n');

        // GPT-4o compression
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 300,
          temperature: 0.1,
          messages: [{
            role: 'system',
            content: `Compress these conversation episodes into a concise pattern summary.

RULES:
- Identify overarching patterns and themes
- Preserve contradictions - do not smooth disagreements
- 2-3 sentences maximum
- Focus on behavioral patterns, not specific conversations
- Return plain text, not JSON`
          }, {
            role: 'user',
            content: `Episodes to compress:\n${combinedSummary}`
          }]
        });

        const compressionSummary = response.choices[0].message.content.trim();

        // Create compressed summary
        const { error: insertError } = await supabase
          .from('episodes')
          .insert({
            user_id: userId,
            summary: compressionSummary,
            topics: [...new Set(userEpisodes.flatMap(ep => ep.topics))],
            emotional_tone: 'compressed_pattern',
            source_type: 'session_observed',
            memory_tier: 'compressed',
            decay_score: 1.0,
            compressed_at: new Date().toISOString(),
            compression_reason: `Compressed ${userEpisodes.length} episodes with decay <= 0.3`
          });

        if (insertError) {
          console.error(`[${jobName.toUpperCase()}] Compression insert failed:`, insertError);
          continue;
        }

        // Archive the original episodes
        const { error: updateError } = await supabase
          .from('episodes')
          .update({
            memory_tier: 'archived',
            compressed_at: new Date().toISOString()
          })
          .in('id', userEpisodes.map(ep => ep.id));

        if (updateError) {
          console.error(`[${jobName.toUpperCase()}] Archive update failed:`, updateError);
        } else {
          compressed += userEpisodes.length;
        }

      } catch (userError) {
        console.error(`[${jobName.toUpperCase()}] User ${userId} compression failed:`, userError);
      }
    }

    await logJobHealth(jobName, 'success', {
      startTime,
      recordsProcessed: compressed,
      modelUsed: 'gpt-4o'
    });

    console.log(`[${jobName.toUpperCase()}] Compressed ${compressed} episodes`);
    return compressed;

  } catch (error) {
    console.error(`[${jobName.toUpperCase()}] Error:`, error);
    await logJobHealth(jobName, 'fail', {
      startTime,
      errorMessage: error.message,
      modelUsed: 'gpt-4o'
    });
    throw error;
  }
}

// Master session-end handler
async function handleSessionEnd(userId, sessionData) {
  console.log(`[SESSION-END] Processing session end for ${userId}`);

  try {
    // Step 1: Save episode summary
    const episode = await saveEpisodeBackground(userId, sessionData);

    // Step 2: Extract semantic facts from the episode
    const facts = await extractSemanticFactsBackground(userId, episode?.id, episode?.summary);

    // Step 3: Run consciousness reflection (if we have recent episodes)
    const { data: recentEpisodes } = await supabase
      .from('episodes')
      .select('summary, emotional_tone')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    let reflection = null;
    if (recentEpisodes?.length >= 2) {
      reflection = await run48StepConsciousnessBackground(
        userId,
        episode?.summary || 'Session ended',
        recentEpisodes
      );
    }

    return {
      episode,
      facts: facts.length,
      reflection: !!reflection,
      success: true
    };

  } catch (error) {
    console.error('[SESSION-END] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  saveEpisodeBackground,
  extractSemanticFactsBackground,
  run48StepConsciousnessBackground,
  runMemoryDecayJob,
  runCompressionJob,
  handleSessionEnd
};