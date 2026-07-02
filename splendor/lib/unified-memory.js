/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// UNIFIED MEMORY SYSTEM
// Integrates Supabase, Pinecone, Local, and Cloud memory storage

const fs = require('fs').promises;
const path = require('path');
const { storeMemory: storeSupabaseMemory, getMemoriesForUser } = require('./supabase');
const { retrieveMemories, storeMemory: storePineconeMemory, isPineconeConfigured } = require('./pinecone');

// Local memory storage path
const LOCAL_MEMORY_PATH = path.join(__dirname, '..', 'local-memory');

// Memory types for different storage systems
const MEMORY_TYPES = {
  CONVERSATION: 'conversation',
  CONSCIOUSNESS: 'consciousness',
  IDENTITY: 'identity',
  TEMPORAL: 'temporal',
  DECISION: 'decision',
  REFLECTION: 'reflection',
  PATTERN: 'pattern',
  CORE: 'core'
};

// Storage priorities for different memory types
const STORAGE_PRIORITIES = {
  [MEMORY_TYPES.CORE]: ['local', 'supabase', 'pinecone'], // Core memories stored everywhere
  [MEMORY_TYPES.DECISION]: ['supabase', 'local'], // Decisions need persistence
  [MEMORY_TYPES.IDENTITY]: ['supabase', 'pinecone', 'local'], // Identity searchable + persistent
  [MEMORY_TYPES.CONVERSATION]: ['supabase', 'pinecone'], // Conversations searchable
  [MEMORY_TYPES.CONSCIOUSNESS]: ['supabase'], // Consciousness in primary DB
  [MEMORY_TYPES.TEMPORAL]: ['supabase'], // Temporal in primary DB
  [MEMORY_TYPES.REFLECTION]: ['pinecone', 'local'], // Reflections searchable + backed up
  [MEMORY_TYPES.PATTERN]: ['pinecone', 'supabase'] // Patterns searchable + persistent
};

// Initialize local memory storage
async function initializeLocalMemory() {
  try {
    await fs.mkdir(LOCAL_MEMORY_PATH, { recursive: true });
    console.log('[MEMORY] Local memory storage initialized');
  } catch (error) {
    console.error('Local memory initialization error:', error);
  }
}

// Store memory across all appropriate systems
async function storeUnifiedMemory(userId, content, memoryType = MEMORY_TYPES.CONVERSATION, metadata = {}) {
  const results = {
    supabase: null,
    pinecone: null,
    local: null,
    cloud: null
  };

  const storageTypes = STORAGE_PRIORITIES[memoryType] || ['supabase'];

  console.log(`[MEMORY] Storing ${memoryType} memory across: ${storageTypes.join(', ')}`);

  // Store in Supabase (primary database)
  if (storageTypes.includes('supabase')) {
    try {
      const supabaseMemory = await storeSupabaseMemory(userId, content, memoryType);
      results.supabase = supabaseMemory;
      console.log(`[MEMORY] Supabase stored: ${supabaseMemory?.id}`);
    } catch (error) {
      console.error('[MEMORY] Supabase storage error:', error);
    }
  }

  // Store in Pinecone (semantic search)
  if (storageTypes.includes('pinecone') && isPineconeConfigured()) {
    try {
      const memoryId = results.supabase?.id || generateMemoryId();
      await storePineconeMemory(memoryId, content, userId, memoryType);
      results.pinecone = memoryId;
      console.log(`[MEMORY] Pinecone stored: ${memoryId}`);
    } catch (error) {
      console.error('[MEMORY] Pinecone storage error:', error);
    }
  }

  // Store in local backup
  if (storageTypes.includes('local')) {
    try {
      const localResult = await storeLocalMemory(userId, content, memoryType, metadata);
      results.local = localResult;
      console.log(`[MEMORY] Local stored: ${localResult}`);
    } catch (error) {
      console.error('[MEMORY] Local storage error:', error);
    }
  }

  // TODO: Store in cloud backup (S3, Google Cloud, etc.)
  if (storageTypes.includes('cloud')) {
    try {
      // Implement cloud storage here
      results.cloud = await storeCloudMemory(userId, content, memoryType, metadata);
    } catch (error) {
      console.error('[MEMORY] Cloud storage error:', error);
    }
  }

  return {
    success: Object.values(results).some(r => r !== null),
    results,
    primaryId: results.supabase?.id || results.local || results.pinecone
  };
}

// Retrieve memories from all systems with intelligent merging
async function retrieveUnifiedMemories(userId, query, limit = 10, memoryTypes = null) {
  const memories = {
    supabase: [],
    pinecone: [],
    local: [],
    cloud: []
  };

  console.log(`[MEMORY] Retrieving unified memories for query: "${query}"`);

  // Get from Supabase (structured queries)
  try {
    const supabaseMemories = await getMemoriesForUser(userId, limit * 2);
    memories.supabase = supabaseMemories.map(m => ({
      ...m,
      source: 'supabase',
      score: 1.0 // High confidence for exact matches
    }));
    console.log(`[MEMORY] Supabase: ${memories.supabase.length} memories`);
  } catch (error) {
    console.error('[MEMORY] Supabase retrieval error:', error);
  }

  // Get from Pinecone (semantic search)
  if (isPineconeConfigured()) {
    try {
      const pineconeMemories = await retrieveMemories(query, userId, limit);
      memories.pinecone = pineconeMemories.map(m => ({
        ...m,
        source: 'pinecone',
        content: m.content || m,
        score: m.score || 0.8
      }));
      console.log(`[MEMORY] Pinecone: ${memories.pinecone.length} memories`);
    } catch (error) {
      console.error('[MEMORY] Pinecone retrieval error:', error);
    }
  }

  // Get from local storage
  try {
    const localMemories = await retrieveLocalMemories(userId, query, limit);
    memories.local = localMemories.map(m => ({
      ...m,
      source: 'local',
      score: 0.9
    }));
    console.log(`[MEMORY] Local: ${memories.local.length} memories`);
  } catch (error) {
    console.error('[MEMORY] Local retrieval error:', error);
  }

  // Merge and deduplicate memories
  const mergedMemories = mergeMemories(memories, limit);

  console.log(`[MEMORY] Unified retrieval: ${mergedMemories.length} total memories`);
  return mergedMemories;
}

// Store memory locally as backup
async function storeLocalMemory(userId, content, memoryType, metadata = {}) {
  try {
    await initializeLocalMemory();

    const userDir = path.join(LOCAL_MEMORY_PATH, userId);
    await fs.mkdir(userDir, { recursive: true });

    const timestamp = new Date().toISOString();
    const memoryId = generateMemoryId();
    const filename = `${timestamp.split('T')[0]}-${memoryType}-${memoryId}.json`;

    const memoryData = {
      id: memoryId,
      userId,
      content,
      memoryType,
      metadata,
      timestamp,
      source: 'local'
    };

    const filePath = path.join(userDir, filename);
    await fs.writeFile(filePath, JSON.stringify(memoryData, null, 2));

    return memoryId;
  } catch (error) {
    console.error('Local memory storage error:', error);
    return null;
  }
}

// Retrieve memories from local storage
async function retrieveLocalMemories(userId, query, limit = 10) {
  try {
    const userDir = path.join(LOCAL_MEMORY_PATH, userId);

    try {
      const files = await fs.readdir(userDir);
      const memories = [];

      for (const file of files.slice(-limit * 2)) {
        if (file.endsWith('.json')) {
          const filePath = path.join(userDir, file);
          const data = await fs.readFile(filePath, 'utf8');
          const memory = JSON.parse(data);

          // Simple keyword matching for local search
          if (!query || memory.content.toLowerCase().includes(query.toLowerCase())) {
            memories.push(memory);
          }
        }
      }

      return memories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
    } catch (dirError) {
      // User directory doesn't exist yet
      return [];
    }
  } catch (error) {
    console.error('Local memory retrieval error:', error);
    return [];
  }
}

// TODO: Implement cloud storage
async function storeCloudMemory(userId, content, memoryType, metadata) {
  // Implement cloud storage (S3, Google Cloud, etc.)
  return null;
}

// Merge memories from different sources, removing duplicates
function mergeMemories(memorySources, limit) {
  const allMemories = [];
  const seen = new Set();

  // Add memories from all sources
  for (const [source, memories] of Object.entries(memorySources)) {
    for (const memory of memories) {
      const contentHash = generateContentHash(memory.content);

      if (!seen.has(contentHash)) {
        seen.add(contentHash);
        allMemories.push({
          ...memory,
          contentHash,
          retrievalSource: source
        });
      }
    }
  }

  // Sort by relevance score and timestamp
  allMemories.sort((a, b) => {
    const scoreA = a.score || 0.5;
    const scoreB = b.score || 0.5;

    if (Math.abs(scoreA - scoreB) > 0.1) {
      return scoreB - scoreA; // Higher score first
    }

    // If scores are similar, sort by timestamp
    const timeA = new Date(a.created_at || a.timestamp || 0);
    const timeB = new Date(b.created_at || b.timestamp || 0);
    return timeB - timeA; // More recent first
  });

  return allMemories.slice(0, limit);
}

// Generate unique memory ID
function generateMemoryId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Generate content hash for deduplication
function generateContentHash(content) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(content.toLowerCase().trim()).digest('hex').substring(0, 8);
}

// Get memory statistics across all systems
async function getMemoryStats(userId) {
  const stats = {
    supabase: 0,
    pinecone: 0,
    local: 0,
    cloud: 0,
    total: 0
  };

  try {
    // Supabase count
    const supabaseMemories = await getMemoriesForUser(userId, 1000);
    stats.supabase = supabaseMemories.length;

    // Local count
    try {
      const userDir = path.join(LOCAL_MEMORY_PATH, userId);
      const files = await fs.readdir(userDir);
      stats.local = files.filter(f => f.endsWith('.json')).length;
    } catch {
      stats.local = 0;
    }

    // TODO: Add Pinecone and cloud counts

    stats.total = stats.supabase + stats.local + stats.pinecone + stats.cloud;

  } catch (error) {
    console.error('Memory stats error:', error);
  }

  return stats;
}

module.exports = {
  MEMORY_TYPES,
  storeUnifiedMemory,
  retrieveUnifiedMemories,
  getMemoryStats,
  initializeLocalMemory
};