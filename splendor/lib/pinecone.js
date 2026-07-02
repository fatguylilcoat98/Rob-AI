/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { Pinecone } = require('@pinecone-database/pinecone');
const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.PINECONE_API_KEY) {
  console.warn('PINECONE_API_KEY not found - semantic memory will be disabled');
}

const pc = process.env.PINECONE_API_KEY ? new Pinecone({ apiKey: process.env.PINECONE_API_KEY }) : null;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INDEX_NAME = process.env.PINECONE_INDEX || 'splendor-memory';

async function getIndex() {
  if (!pc) {
    throw new Error('Pinecone not configured');
  }
  return pc.index(INDEX_NAME);
}

// Generate embedding using Anthropic's embedding endpoint
async function embed(text) {
  try {
    // Note: Using a more basic approach since Anthropic doesn't have a direct embedding endpoint
    // We'll use a simple text processing approach for now
    // In production, you might want to use OpenAI's embedding API or another provider

    // For now, let's create a simple hash-based approach for development
    // This can be replaced with actual embeddings in production
    const hash = await createSimpleEmbedding(text);
    return hash;
  } catch (error) {
    console.error('Embedding error:', error);
    throw error;
  }
}

// Simple embedding simulation for development
// Replace this with actual embedding service in production
async function createSimpleEmbedding(text) {
  // Create a consistent 1024-dimensional vector from text
  const words = text.toLowerCase().split(/\s+/);
  const vector = new Array(1024).fill(0);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash + word.charCodeAt(j)) & 0xffffffff;
    }
    const index = Math.abs(hash) % 1024;
    vector[index] += 1 / Math.sqrt(words.length);
  }

  // Normalize vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
}

// Hash userId the same way Supabase does so cross-store memory is
// actually consistent. Without this, Pinecone vectors get tagged with
// raw user_xxx strings while Supabase rows get the UUID hash, and the
// retrieval filter never matches.
const { stringToUUID } = require('./supabase');

// Store a memory in Pinecone
async function storeMemory(memoryId, content, userId, memoryType) {
  try {
    if (!pc) {
      console.log('Pinecone not configured, skipping semantic storage');
      return;
    }

    const index = await getIndex();
    const vector = await embed(content);
    const uuid = stringToUUID(userId);

    await index.upsert([{
      id: memoryId,
      values: vector,
      metadata: {
        userId: uuid,
        content: content.substring(0, 500), // Limit metadata size
        memoryType,
        createdAt: new Date().toISOString()
      }
    }]);

    console.log(`Memory stored in Pinecone: ${memoryId}`);
  } catch (error) {
    console.error('Pinecone storage error:', error);
    // Don't throw - this shouldn't break the app if Pinecone fails
  }
}

// Store foundational rule - highest priority, never decays
async function storeFoundationalRule(ruleId, content, establishedDate) {
  try {
    if (!pc) {
      console.log('Pinecone not configured, skipping foundational rule storage');
      return;
    }

    const index = await getIndex();
    const vector = await embed(content);

    await index.upsert([{
      id: ruleId,
      values: vector,
      metadata: {
        userId: 'global', // Global rule for all users
        content: content, // Don't limit foundational rules
        memoryType: 'foundational_rule',
        semanticType: 'foundational_rule',
        priority: 1000, // Highest priority
        neverDecays: true,
        establishedDate,
        createdAt: new Date().toISOString()
      }
    }]);

    console.log(`Foundational rule stored in Pinecone: ${ruleId}`);
  } catch (error) {
    console.error('Pinecone foundational rule storage error:', error);
  }
}

// Retrieve semantically relevant memories for a user
async function retrieveMemories(query, userId, topK = 5) {
  try {
    if (!pc) {
      console.log('Pinecone not configured, semantic search disabled');
      return [];
    }

    const index = await getIndex();
    const vector = await embed(query);

    // First, get foundational rules (highest priority, always loaded)
    const foundationalResults = await index.query({
      vector,
      topK: 50, // Get more to find all foundational rules
      filter: { semanticType: 'foundational_rule' },
      includeMetadata: true
    });

    const foundationalRules = foundationalResults.matches
      .filter(m => m.metadata.neverDecays === true)
      .sort((a, b) => (b.metadata.priority || 0) - (a.metadata.priority || 0))
      .map(m => ({
        content: m.metadata.content,
        type: m.metadata.memoryType,
        score: 1.0, // Always highest relevance
        createdAt: m.metadata.createdAt,
        priority: m.metadata.priority || 0,
        foundational: true
      }));

    // Then get user-specific memories (use UUID-hashed userId to match
    // what storeMemory wrote, and what Supabase uses).
    const uuid = stringToUUID(userId);
    const userResults = await index.query({
      vector,
      topK,
      filter: { userId: uuid },
      includeMetadata: true
    });

    const userMemories = userResults.matches
      .filter(m => m.score > 0.1 && m.metadata.semanticType !== 'foundational_rule')
      .map(m => ({
        content: m.metadata.content,
        type: m.metadata.memoryType,
        score: m.score,
        createdAt: m.metadata.createdAt,
        foundational: false
      }));

    // Return foundational rules first, then user memories
    return [...foundationalRules, ...userMemories];
  } catch (error) {
    console.error('Pinecone retrieval error:', error);
    return [];
  }
}

// Delete a memory from Pinecone
async function deleteMemory(memoryId) {
  try {
    if (!pc) return;

    const index = await getIndex();
    await index.deleteOne(memoryId);

    console.log(`Memory deleted from Pinecone: ${memoryId}`);
  } catch (error) {
    console.error('Pinecone deletion error:', error);
    // Don't throw - this shouldn't break the app if Pinecone fails
  }
}

module.exports = {
  storeMemory,
  storeFoundationalRule,
  retrieveMemories,
  deleteMemory,
  isPineconeConfigured: () => !!pc
};