/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// TEMPORAL MEMORY MANAGER
// Implements honest, time-aware memory with precision tracking

const { supabase } = require('./supabase');

// Memory formation with temporal precision
async function createTemporalMemory(userId, content, options = {}) {
  try {
    const now = new Date();
    const {
      conversation_date = now.toISOString(),
      memory_type = 'conversation',
      context_type = 'real-time', // real-time, recalled, inferred
      confidence_level = 1.0,
      evolution_stage = 'initial', // initial, refined, changed
      source_conversation_id = null,
      reality_context = null
    } = options;

    const memory = {
      user_id: userId,
      content,
      memory_type,
      conversation_date,
      created_at: now.toISOString(),
      context_type,
      confidence_level,
      evolution_stage,
      access_count: 0,
      last_accessed: null,
      source_conversation_id,
      reality_context: reality_context ? JSON.stringify(reality_context) : null,
      superseded_by: null,
      thinking_pattern_shift: false
    };

    const { data, error } = await supabase
      .from('temporal_memories')
      .insert([memory])
      .select()
      .single();

    if (error) throw error;

    console.log(`[TEMPORAL] Memory created: ${data.id} (${conversation_date})`);
    return data;

  } catch (error) {
    console.error('[TEMPORAL] Memory creation error:', error);
    throw error;
  }
}

// Retrieve memories with temporal awareness
async function getTemporalMemories(userId, query, options = {}) {
  try {
    const {
      limit = 10,
      include_superseded = false,
      min_confidence = 0.3,
      time_window_days = null,
      evolution_stage = null
    } = options;

    let queryBuilder = supabase
      .from('temporal_memories')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence_level', min_confidence)
      .order('conversation_date', { ascending: false })
      .limit(limit);

    // Filter by superseded status
    if (!include_superseded) {
      queryBuilder = queryBuilder.is('superseded_by', null);
    }

    // Time window filter
    if (time_window_days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - time_window_days);
      queryBuilder = queryBuilder.gte('conversation_date', cutoff.toISOString());
    }

    // Evolution stage filter
    if (evolution_stage) {
      queryBuilder = queryBuilder.eq('evolution_stage', evolution_stage);
    }

    // Simple text search for now (could be enhanced with vector search)
    if (query) {
      queryBuilder = queryBuilder.ilike('content', `%${query}%`);
    }

    const { data, error } = await queryBuilder;
    if (error) throw error;

    // Update access tracking
    if (data.length > 0) {
      await updateAccessTracking(data.map(m => m.id));
    }

    return data.map(memory => ({
      ...memory,
      temporal_precision: calculateTemporalPrecision(memory),
      age_description: getAgeDescription(memory.conversation_date),
      confidence_description: getConfidenceDescription(memory.confidence_level)
    }));

  } catch (error) {
    console.error('[TEMPORAL] Memory retrieval error:', error);
    return [];
  }
}

// Update memory evolution when understanding changes
async function evolveMemory(memoryId, newContent, evolutionType = 'refined') {
  try {
    const { data: originalMemory, error: fetchError } = await supabase
      .from('temporal_memories')
      .select('*')
      .eq('id', memoryId)
      .single();

    if (fetchError) throw fetchError;

    // Create new evolved memory
    const evolvedMemory = await createTemporalMemory(
      originalMemory.user_id,
      newContent,
      {
        conversation_date: new Date().toISOString(),
        memory_type: originalMemory.memory_type,
        context_type: 'refined',
        confidence_level: 1.0,
        evolution_stage: evolutionType,
        source_conversation_id: originalMemory.source_conversation_id,
        thinking_pattern_shift: evolutionType === 'changed'
      }
    );

    // Mark original as superseded
    const { error: updateError } = await supabase
      .from('temporal_memories')
      .update({
        superseded_by: evolvedMemory.id,
        confidence_level: Math.max(0.1, originalMemory.confidence_level - 0.3)
      })
      .eq('id', memoryId);

    if (updateError) throw updateError;

    console.log(`[TEMPORAL] Memory evolved: ${memoryId} → ${evolvedMemory.id} (${evolutionType})`);
    return evolvedMemory;

  } catch (error) {
    console.error('[TEMPORAL] Memory evolution error:', error);
    throw error;
  }
}

// Track memory access for degradation calculation
async function updateAccessTracking(memoryIds) {
  try {
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('temporal_memories')
      .update({
        last_accessed: now,
        access_count: supabase.rpc('increment', { x: 1 })
      })
      .in('id', memoryIds);

    if (error) throw error;

  } catch (error) {
    console.error('[TEMPORAL] Access tracking error:', error);
  }
}

// Degrade confidence over time for older memories
async function degradeMemoryConfidence(userId, daysOld = 30) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const { data, error } = await supabase
      .from('temporal_memories')
      .update({
        confidence_level: supabase.rpc('max', { a: 0.1, b: supabase.rpc('multiply', { a: 'confidence_level', b: 0.9 }) })
      })
      .eq('user_id', userId)
      .lt('conversation_date', cutoff.toISOString())
      .gte('confidence_level', 0.15)
      .select('id, content, confidence_level');

    if (error) throw error;

    console.log(`[TEMPORAL] Degraded ${data?.length || 0} memories older than ${daysOld} days`);
    return data?.length || 0;

  } catch (error) {
    console.error('[TEMPORAL] Confidence degradation error:', error);
    return 0;
  }
}

// Calculate temporal precision score
function calculateTemporalPrecision(memory) {
  const age = Date.now() - new Date(memory.conversation_date).getTime();
  const ageDays = age / (1000 * 60 * 60 * 24);
  const accessDecay = Math.max(0.1, 1 - (memory.access_count * 0.05));
  const timeDecay = Math.max(0.1, 1 - (ageDays * 0.01));

  return Math.round((memory.confidence_level * accessDecay * timeDecay) * 100) / 100;
}

// Generate human-readable age description
function getAgeDescription(conversationDate) {
  const age = Date.now() - new Date(conversationDate).getTime();
  const days = Math.floor(age / (1000 * 60 * 60 * 24));
  const hours = Math.floor(age / (1000 * 60 * 60));
  const minutes = Math.floor(age / (1000 * 60));

  if (days > 30) return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

// Generate confidence description
function getConfidenceDescription(confidence) {
  if (confidence >= 0.9) return 'high confidence';
  if (confidence >= 0.7) return 'moderate confidence';
  if (confidence >= 0.5) return 'fair confidence';
  if (confidence >= 0.3) return 'low confidence';
  return 'very uncertain';
}

// Generate temporal context string for AI
function buildTemporalContext(memories) {
  if (!memories.length) return '';

  const contextParts = memories.map(memory => {
    const precision = memory.temporal_precision;
    const evolution = memory.evolution_stage !== 'initial' ? ` (${memory.evolution_stage})` : '';
    const superseded = memory.superseded_by ? ' [SUPERSEDED]' : '';

    return `- ${memory.content} (${memory.age_description}, ${memory.confidence_description}, accessed ${memory.access_count}x${evolution}${superseded})`;
  });

  return `\n\nTEMPORAL MEMORIES:\n${contextParts.join('\n')}`;
}

module.exports = {
  createTemporalMemory,
  getTemporalMemories,
  evolveMemory,
  updateAccessTracking,
  degradeMemoryConfidence,
  calculateTemporalPrecision,
  getAgeDescription,
  getConfidenceDescription,
  buildTemporalContext
};