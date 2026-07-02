/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  4-Tier Memory Assembler

  Every session starts with exact assembly order:
  0. Reality context (time/date)
  1. Foundational memory (Tier 1 & 1.5)
  2. Semantic memory (Tier 2)
  3. Compressed summaries
  4. Recent episodes (Tier 3)
  5. System prompt assembly
  6. Reflection archive
  7. Proactive opener
  8. Begin conversation (Tier 4)

  Built by Christopher Hughes with Claude Code
  Truth · Safety · We Got Your Back
*/

const { supabase } = require('../supabase');
const { loadFoundationalRules, buildFoundationalContext } = require('./foundational-rules');
const { retrieveMemories, isPineconeConfigured } = require('../pinecone');
const { logJobHealth } = require('./audit-system');

// Build reality context - current time, date, timezone
function buildRealityContext() {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return `
=== REALITY CONTEXT ===
Current Date: ${dateStr}
Current Time: ${timeStr}
Timezone: ${timezone}
Session Started: ${now.toISOString()}
=== END REALITY CONTEXT ===`;
}

// Load semantic memory (Tier 2) with source labeling
async function loadSemanticMemory(userId, query = 'recent patterns preferences goals', limit = 10) {
  try {
    console.log('[TIER-2] Loading semantic memory...');

    let semanticMemories = [];

    // Load from Pinecone if available
    if (isPineconeConfigured()) {
      try {
        const pineconeMemories = await retrieveMemories(query, userId, limit);

        // Filter out foundational rules (they're loaded separately)
        semanticMemories = pineconeMemories
          .filter(m => !m.foundational && m.type !== 'foundational_rule')
          .map(m => ({
            content: m.content,
            type: m.type || 'semantic',
            source: 'pinecone',
            score: m.score || 0.8,
            createdAt: m.createdAt
          }));

      } catch (pineconeError) {
        console.warn('[TIER-2] Pinecone query failed:', pineconeError.message);
      }
    }

    // Fallback to Supabase memories if Pinecone unavailable or insufficient
    if (semanticMemories.length < 5) {
      try {
        const { data: supabaseMemories } = await supabase
          .from('memories')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(Math.max(5, limit - semanticMemories.length));

        if (supabaseMemories) {
          const mappedMemories = supabaseMemories.map(m => ({
            content: m.content,
            type: m.memory_type || 'general',
            source: 'supabase',
            score: 1.0,
            createdAt: m.created_at,
            sourceType: m.source_type || 'unknown'
          }));

          semanticMemories = [...semanticMemories, ...mappedMemories];
        }
      } catch (supabaseError) {
        console.warn('[TIER-2] Supabase fallback failed:', supabaseError.message);
      }
    }

    // Sort by score and limit
    semanticMemories = semanticMemories
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log(`[TIER-2] Loaded ${semanticMemories.length} semantic memories`);
    return semanticMemories;

  } catch (err) {
    console.error('[TIER-2] Load error:', err);
    return [];
  }
}

// Load compressed summaries (Tier 2 compressed from Tier 3)
async function loadCompressedSummaries(userId, limit = 2) {
  try {
    console.log('[COMPRESSED] Loading compressed summaries...');

    const { data, error } = await supabase
      .from('episodes')
      .select('*')
      .eq('user_id', userId)
      .eq('memory_tier', 'compressed')
      .order('compressed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[COMPRESSED] Query error:', error);
      return [];
    }

    const summaries = (data || []).map(episode => ({
      content: episode.summary,
      topics: episode.topics || [],
      emotionalTone: episode.emotional_tone,
      compressedAt: episode.compressed_at,
      originalDate: episode.created_at
    }));

    console.log(`[COMPRESSED] Loaded ${summaries.length} compressed summaries`);
    return summaries;

  } catch (err) {
    console.error('[COMPRESSED] Load error:', err);
    return [];
  }
}

// Load recent episodes (Tier 3) with decay filtering
async function loadRecentEpisodes(userId, limit = 5, minDecayScore = 0.3) {
  try {
    console.log('[TIER-3] Loading recent episodes...');

    const { data, error } = await supabase
      .from('episodes')
      .select('*')
      .eq('user_id', userId)
      .eq('memory_tier', 'episodic')
      .gte('decay_score', minDecayScore)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[TIER-3] Query error:', error);
      return [];
    }

    const episodes = (data || []).map(episode => ({
      id: episode.id,
      summary: episode.summary,
      topics: episode.topics || [],
      emotionalTone: episode.emotional_tone,
      decayScore: episode.decay_score,
      createdAt: episode.created_at,
      daysOld: Math.floor((Date.now() - new Date(episode.created_at)) / (1000 * 60 * 60 * 24))
    }));

    console.log(`[TIER-3] Loaded ${episodes.length} recent episodes (decay >= ${minDecayScore})`);
    return episodes;

  } catch (err) {
    console.error('[TIER-3] Load error:', err);
    return [];
  }
}

// Load latest reflection archive from background consciousness
async function loadReflectionArchive(userId, limit = 1) {
  try {
    console.log('[REFLECTION] Loading reflection archive...');

    const { data, error } = await supabase
      .from('reflection_archive')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[REFLECTION] Query error:', error);
      return null;
    }

    const reflection = data?.[0];
    if (!reflection) {
      console.log('[REFLECTION] No reflection archive found');
      return null;
    }

    console.log(`[REFLECTION] Loaded reflection from ${reflection.created_at}`);
    return {
      synthesisData: reflection.synthesis_paragraph,
      openThreads: reflection.open_threads,
      contradictions: reflection.contradictions_detected,
      createdAt: reflection.created_at,
      coherenceScore: reflection.coherence_score
    };

  } catch (err) {
    console.error('[REFLECTION] Load error:', err);
    return null;
  }
}

// Build semantic memory context with proper source labeling
function buildSemanticContext(semanticMemories) {
  if (!semanticMemories.length) {
    return '';
  }

  let context = '\n=== SEMANTIC MEMORY (Tier 2) ===\n';

  semanticMemories.forEach((memory, i) => {
    const sourceLabel = memory.sourceType === 'splendor_inferred'
      ? ' [INFERRED - not directly stated]'
      : memory.sourceType === 'session_observed'
      ? ' [OBSERVED PATTERN]'
      : '';

    context += `${i + 1}. ${memory.content}${sourceLabel}\n`;
  });

  context += '=== END SEMANTIC MEMORY ===\n';
  return context;
}

// Build episode context from recent episodes
function buildEpisodicContext(episodes, compressedSummaries) {
  let context = '';

  // Compressed summaries first (older, broader patterns)
  if (compressedSummaries.length > 0) {
    context += '\n=== COMPRESSED PATTERNS ===\n';
    compressedSummaries.forEach((summary, i) => {
      context += `${i + 1}. ${summary.content}\n`;
      if (summary.topics.length > 0) {
        context += `   Topics: ${summary.topics.join(', ')}\n`;
      }
    });
    context += '=== END COMPRESSED PATTERNS ===\n';
  }

  // Recent episodes (specific, recent conversations)
  if (episodes.length > 0) {
    context += '\n=== RECENT EPISODES (Tier 3) ===\n';
    episodes.forEach((episode, i) => {
      const daysText = episode.daysOld === 0 ? 'today' :
                      episode.daysOld === 1 ? '1 day ago' :
                      `${episode.daysOld} days ago`;

      context += `${i + 1}. ${episode.summary} (${daysText}, relevance: ${(episode.decayScore * 100).toFixed(0)}%)\n`;
    });
    context += '=== END RECENT EPISODES ===\n';
  }

  return context;
}

// Build reflection context from consciousness archive
function buildReflectionContext(reflection) {
  if (!reflection) {
    return '';
  }

  let context = '\n=== CONSCIOUSNESS REFLECTION ===\n';

  if (reflection.synthesisData) {
    context += `${reflection.synthesisData}\n`;
  }

  if (reflection.openThreads && Object.keys(reflection.openThreads).length > 0) {
    context += `\nOpen threads: ${JSON.stringify(reflection.openThreads)}\n`;
  }

  if (reflection.contradictions) {
    context += `\nDetected contradictions: ${reflection.contradictions}\n`;
  }

  context += '=== END CONSCIOUSNESS REFLECTION ===\n';
  return context;
}

// Master assembly function - follows exact order
async function assembleTieredMemory(userId, query = null) {
  const startTime = Date.now();
  console.log(`[ASSEMBLY] Starting 4-tier memory assembly for ${userId}`);

  try {
    // STEP 0: Reality Context
    const realityContext = buildRealityContext();

    // STEP 1: Foundational Memory (Tier 1 & 1.5)
    const foundationalRules = await loadFoundationalRules();
    const foundationalContext = buildFoundationalContext(foundationalRules);

    // STEP 2: Semantic Memory (Tier 2)
    const semanticMemories = await loadSemanticMemory(userId, query);
    const semanticContext = buildSemanticContext(semanticMemories);

    // STEP 3: Compressed Summaries
    const compressedSummaries = await loadCompressedSummaries(userId);

    // STEP 4: Recent Episodes (Tier 3)
    const recentEpisodes = await loadRecentEpisodes(userId);
    const episodicContext = buildEpisodicContext(recentEpisodes, compressedSummaries);

    // STEP 6: Reflection Archive
    const reflection = await loadReflectionArchive(userId);
    const reflectionContext = buildReflectionContext(reflection);

    // STEP 5: Assemble System Prompt
    const systemPrompt = realityContext +
                        foundationalContext +
                        semanticContext +
                        episodicContext +
                        reflectionContext;

    const assembly = {
      realityContext,
      foundationalRules,
      semanticMemories,
      compressedSummaries,
      recentEpisodes,
      reflection,
      systemPrompt,

      // Metadata
      assemblyTime: Date.now() - startTime,
      layersLoaded: {
        reality: true,
        foundational: foundationalRules.tier1.length + foundationalRules.tier15.length > 0,
        semantic: semanticMemories.length > 0,
        compressed: compressedSummaries.length > 0,
        episodic: recentEpisodes.length > 0,
        reflection: !!reflection
      },
      totalMemories: {
        tier1: foundationalRules.tier1.length,
        tier15: foundationalRules.tier15.length,
        tier2: semanticMemories.length,
        tier3: recentEpisodes.length + compressedSummaries.length
      }
    };

    // Log successful assembly
    await logJobHealth('memory_assembly', 'success', {
      startTime,
      recordsProcessed: Object.values(assembly.totalMemories).reduce((sum, count) => sum + count, 0),
      modelUsed: 'system'
    });

    console.log(`[ASSEMBLY] Complete in ${assembly.assemblyTime}ms - ${JSON.stringify(assembly.totalMemories)} memories`);
    return assembly;

  } catch (err) {
    console.error('[ASSEMBLY] Assembly failed:', err);

    // Log failed assembly
    await logJobHealth('memory_assembly', 'fail', {
      startTime,
      errorMessage: err.message,
      modelUsed: 'system'
    });

    // Return minimal assembly
    return {
      realityContext: buildRealityContext(),
      foundationalRules: { tier1: [], tier15: [] },
      semanticMemories: [],
      compressedSummaries: [],
      recentEpisodes: [],
      reflection: null,
      systemPrompt: buildRealityContext() + '\n[Memory assembly failed - operating with minimal context]',
      assemblyTime: Date.now() - startTime,
      layersLoaded: { reality: true },
      totalMemories: { tier1: 0, tier15: 0, tier2: 0, tier3: 0 },
      error: err.message
    };
  }
}

// Get memory system status for debug endpoint
async function getMemorySystemStatus(userId) {
  try {
    const foundationalSummary = await require('./foundational-rules').getFoundationalRulesSummary();

    // Check recent job health
    const { data: recentJobs } = await supabase
      .from('job_health_log')
      .select('job_name, status, completed_at')
      .order('completed_at', { ascending: false })
      .limit(10);

    // Count memories by tier
    const { count: tier3Count } = await supabase
      .from('episodes')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('memory_tier', 'episodic')
      .gte('decay_score', 0.3);

    const { count: compressedCount } = await supabase
      .from('episodes')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('memory_tier', 'compressed');

    return {
      foundational: foundationalSummary,
      tier3_active: tier3Count || 0,
      compressed_summaries: compressedCount || 0,
      pinecone_configured: isPineconeConfigured(),
      recent_jobs: recentJobs?.slice(0, 5) || [],
      last_assembly: recentJobs?.find(job => job.job_name === 'memory_assembly')?.completed_at
    };

  } catch (err) {
    console.error('[STATUS] Error getting memory system status:', err);
    return { error: err.message };
  }
}

module.exports = {
  assembleTieredMemory,
  buildRealityContext,
  loadSemanticMemory,
  loadRecentEpisodes,
  loadReflectionArchive,
  getMemorySystemStatus
};