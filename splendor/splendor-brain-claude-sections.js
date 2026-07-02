/**
 * =============================================================================
 * SPLENDOR BRAIN ARCHITECTURE — CLAUDE'S SECTIONS
 * Hippocampus + Thalamus
 * =============================================================================
 * Christopher Hughes — The Good Neighbor Guard — Sacramento, CA
 * AI Council: Claude · GPT · Gemini · Grok
 * Truth · Safety · We Got Your Back
 * =============================================================================
 *
 * HIPPOCAMPUS: Long-term memory storage, consolidation, and retrieval
 * THALAMUS:    Routing hub — decides what gets attention and in what order
 *
 * Stack: Node.js, Supabase (PostgreSQL), modular exports
 * Pipeline position: FIRST — runs before all other modules
 * =============================================================================
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =============================================================================
// HIPPOCAMPUS MODULE
// =============================================================================
// Responsible for:
//   - Storing new memories after each conversation turn
//   - Retrieving relevant memories based on current input
//   - Indexing memories by topic, emotion, recency, and importance
//   - Flagging memory conflicts (Splendor said X before, now Y)
//
// Input: {
//   userId: string,
//   currentInput: string,
//   sessionId: string,
//   turnNumber: number
// }
//
// Output: {
//   retrievedMemories: Array<Memory>,
//   memoryConflicts: Array<Conflict>,
//   episodicContext: string,       // narrative summary of relevant past
//   retrievalConfidence: number,   // 0.0 to 1.0
//   memoryCount: number
// }
// =============================================================================

export async function processHippocampus(inputData) {
  const { userId, currentInput, sessionId, turnNumber } = inputData;

  const retrievedMemories = [];
  const memoryConflicts = [];
  let episodicContext = '';
  let retrievalConfidence = 0.5;

  try {
    // --- 1. RETRIEVE RELEVANT MEMORIES ---
    // Pull memories that semantically relate to current input
    // Uses keyword matching as base; upgrade to embeddings when ready
    const keywords = extractKeywords(currentInput);

    const { data: memories, error } = await supabase
      .from('splendor_memories')
      .select('*')
      .eq('user_id', userId)
      .order('importance_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (memories && memories.length > 0) {
      // Score each memory for relevance to current input
      const scored = memories.map(mem => ({
        ...mem,
        relevanceScore: scoreRelevance(mem, keywords, currentInput)
      }));

      // Filter to meaningful matches, sort by relevance
      const relevant = scored
        .filter(m => m.relevanceScore > 0.2)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 8);

      retrievedMemories.push(...relevant);

      // --- 2. DETECT MEMORY CONFLICTS ---
      // Flag if current input contradicts a stored memory
      for (const mem of relevant) {
        const conflict = detectConflict(mem, currentInput);
        if (conflict) {
          memoryConflicts.push({
            memoryId: mem.id,
            storedClaim: mem.content,
            currentClaim: currentInput,
            conflictType: conflict,
            severity: conflict === 'direct_contradiction' ? 'high' : 'low'
          });
        }
      }

      // --- 3. BUILD EPISODIC CONTEXT ---
      // Narrative summary Splendor can use as "what I remember about this"
      episodicContext = buildEpisodicContext(relevant);
      retrievalConfidence = Math.min(0.95, 0.4 + (relevant.length * 0.07));
    }

    // --- 4. STORE CURRENT INPUT AS NEW MEMORY ---
    // Every turn gets stored for future retrieval
    await storeMemory({
      userId,
      sessionId,
      turnNumber,
      content: currentInput,
      tags: keywords,
      importanceScore: estimateImportance(currentInput)
    });

  } catch (err) {
    console.error('[HIPPOCAMPUS] Error:', err.message);
    retrievalConfidence = 0.1;
  }

  return {
    retrievedMemories,
    memoryConflicts,
    episodicContext,
    retrievalConfidence: parseFloat(retrievalConfidence.toFixed(2)),
    memoryCount: retrievedMemories.length
  };
}

// --- HIPPOCAMPUS HELPERS ---

function extractKeywords(input) {
  if (!input) return [];
  const stopWords = new Set(['the','a','an','is','are','was','were','i','you','he','she','it','we','they','and','or','but','in','on','at','to','for','of','with','that','this','have','had','do','did']);
  return input.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
}

function scoreRelevance(memory, keywords, currentInput) {
  if (!memory.content) return 0;
  const memText = memory.content.toLowerCase();
  const inputText = currentInput.toLowerCase();

  let score = 0;

  // Keyword overlap
  keywords.forEach(kw => {
    if (memText.includes(kw)) score += 0.15;
  });

  // Recency boost (memories from last 7 days score higher)
  const daysSince = (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 1) score += 0.3;
  else if (daysSince < 7) score += 0.15;
  else if (daysSince < 30) score += 0.05;

  // Importance score from storage
  score += (memory.importance_score || 0.5) * 0.2;

  return Math.min(1.0, score);
}

function detectConflict(memory, currentInput) {
  // Basic contradiction detection — expand with NLP later
  const negationPairs = [
    ['always', 'never'], ['yes', 'no'], ['can', "can't"],
    ['will', "won't"], ['do', "don't"], ['is', "isn't"]
  ];

  const memLower = (memory.content || '').toLowerCase();
  const inputLower = currentInput.toLowerCase();

  for (const [pos, neg] of negationPairs) {
    if (memLower.includes(pos) && inputLower.includes(neg)) return 'potential_contradiction';
    if (memLower.includes(neg) && inputLower.includes(pos)) return 'potential_contradiction';
  }

  return null;
}

function buildEpisodicContext(memories) {
  if (!memories.length) return 'No relevant memories found for this topic.';
  const summaries = memories.slice(0, 4).map(m => `- ${m.content?.slice(0, 120) || '[empty]'}`);
  return `Relevant memory context:\n${summaries.join('\n')}`;
}

function estimateImportance(input) {
  // Heuristic: longer, more complex inputs are more important
  const length = input?.length || 0;
  const hasEmotion = /feel|love|hate|scared|excited|angry|happy|sad|important|always|never/i.test(input);
  const hasDecision = /decided|going to|will|plan|promise|commit/i.test(input);

  let score = 0.3;
  if (length > 100) score += 0.2;
  if (length > 300) score += 0.1;
  if (hasEmotion) score += 0.2;
  if (hasDecision) score += 0.2;

  return Math.min(0.99, score);
}

async function storeMemory({ userId, sessionId, turnNumber, content, tags, importanceScore }) {
  try {
    await supabase.from('splendor_memories').insert({
      user_id: userId,
      session_id: sessionId,
      turn_number: turnNumber,
      content: content?.slice(0, 1000), // cap at 1000 chars
      tags,
      importance_score: importanceScore,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[HIPPOCAMPUS] Store error:', err.message);
  }
}


// =============================================================================
// THALAMUS MODULE
// =============================================================================
// Responsible for:
//   - Receiving all inputs (user message + all module outputs so far)
//   - Deciding what gets priority attention
//   - Ordering the signal flow for the rest of the brain
//   - Flagging urgent signals (emotional spikes, memory conflicts, novelty)
//   - Acting as traffic controller before Prefrontal Cortex runs
//
// Input: {
//   currentInput: string,
//   hippocampusOutput: object,
//   rasSignal: object | null,     // from Grok's RAS if available
//   sessionContext: object
// }
//
// Output: {
//   attentionPriority: 'memory' | 'emotion' | 'logic' | 'novelty' | 'conflict',
//   urgencyLevel: number,          // 0.0 to 1.0
//   routingOrder: string[],        // ordered list of modules to run next
//   flaggedSignals: string[],      // what the thalamus is alerting on
//   suppressedSignals: string[],   // what it's damping down
//   contextSummary: string         // brief for Prefrontal Cortex
// }
// =============================================================================

export async function processThalamus(inputData) {
  const { currentInput, hippocampusOutput, rasSignal, sessionContext } = inputData;

  const flaggedSignals = [];
  const suppressedSignals = [];
  let attentionPriority = 'logic';
  let urgencyLevel = 0.3;

  // --- 1. CHECK FOR MEMORY CONFLICTS ---
  // Conflicts get top priority — Splendor needs to know before she speaks
  if (hippocampusOutput?.memoryConflicts?.length > 0) {
    flaggedSignals.push('memory_conflict_detected');
    attentionPriority = 'conflict';
    urgencyLevel = Math.max(urgencyLevel, 0.8);
  }

  // --- 2. CHECK RETRIEVAL CONFIDENCE ---
  // Low confidence means shaky memory — flag for epistemic humility
  if (hippocampusOutput?.retrievalConfidence < 0.3) {
    flaggedSignals.push('low_memory_confidence');
    urgencyLevel = Math.max(urgencyLevel, 0.5);
  }

  // --- 3. CHECK RAS NOVELTY SIGNAL ---
  // High novelty from Grok's RAS means something unexpected is happening
  if (rasSignal?.current_arousal > 0.75) {
    flaggedSignals.push('high_novelty_detected');
    attentionPriority = attentionPriority === 'conflict' ? 'conflict' : 'novelty';
    urgencyLevel = Math.max(urgencyLevel, rasSignal.current_arousal * 0.8);
  }

  // --- 4. DETECT EMOTIONAL URGENCY IN INPUT ---
  const emotionalKeywords = /urgent|emergency|help|scared|dying|crisis|now|please|broken|wrong|hurt/i;
  if (emotionalKeywords.test(currentInput)) {
    flaggedSignals.push('emotional_urgency_in_input');
    attentionPriority = 'emotion';
    urgencyLevel = Math.max(urgencyLevel, 0.85);
  }

  // --- 5. DETECT NOVELTY IN INPUT ---
  // Is this a topic Splendor has little memory of?
  const isNovel = hippocampusOutput?.memoryCount < 2;
  if (isNovel) {
    flaggedSignals.push('low_memory_on_topic');
    if (attentionPriority === 'logic') attentionPriority = 'novelty';
  }

  // --- 6. DETERMINE ROUTING ORDER ---
  // This is the Thalamus's core job — what runs in what order
  const routingOrder = buildRoutingOrder(attentionPriority, flaggedSignals);

  // --- 7. BUILD CONTEXT SUMMARY FOR PREFRONTAL ---
  const contextSummary = buildContextSummary({
    attentionPriority,
    urgencyLevel,
    flaggedSignals,
    memoryCount: hippocampusOutput?.memoryCount || 0,
    episodicContext: hippocampusOutput?.episodicContext || ''
  });

  return {
    attentionPriority,
    urgencyLevel: parseFloat(urgencyLevel.toFixed(2)),
    routingOrder,
    flaggedSignals,
    suppressedSignals,
    contextSummary
  };
}

// --- THALAMUS HELPERS ---

function buildRoutingOrder(priority, flags) {
  // Base order: emotion → pattern → judgment → language
  const base = ['amygdala', 'cerebellum', 'prefrontal', 'broca_wernicke'];

  if (priority === 'conflict') {
    // Memory conflict: surface to prefrontal first for resolution
    return ['prefrontal', 'amygdala', 'cerebellum', 'broca_wernicke'];
  }

  if (priority === 'emotion') {
    // Emotional urgency: amygdala leads
    return ['amygdala', 'prefrontal', 'cerebellum', 'broca_wernicke'];
  }

  if (priority === 'novelty') {
    // Novelty: let DMN contribute early
    return ['dmn', 'amygdala', 'cerebellum', 'prefrontal', 'broca_wernicke'];
  }

  return base;
}

function buildContextSummary({ attentionPriority, urgencyLevel, flaggedSignals, memoryCount, episodicContext }) {
  const lines = [
    `THALAMUS BRIEF`,
    `Priority: ${attentionPriority.toUpperCase()} | Urgency: ${(urgencyLevel * 100).toFixed(0)}%`,
    `Signals: ${flaggedSignals.length > 0 ? flaggedSignals.join(', ') : 'none'}`,
    `Memory available: ${memoryCount} relevant records`,
    episodicContext ? `Context: ${episodicContext.slice(0, 200)}` : 'Context: none'
  ];
  return lines.join('\n');
}


// =============================================================================
// REQUIRED SUPABASE TABLE
// Run this migration in your Supabase SQL editor:
// =============================================================================
//
// CREATE TABLE IF NOT EXISTS splendor_memories (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id TEXT NOT NULL,
//   session_id TEXT,
//   turn_number INTEGER,
//   content TEXT,
//   tags TEXT[],
//   importance_score FLOAT DEFAULT 0.5,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// CREATE INDEX idx_splendor_memories_user ON splendor_memories(user_id);
// CREATE INDEX idx_splendor_memories_importance ON splendor_memories(importance_score DESC);
//
// =============================================================================
