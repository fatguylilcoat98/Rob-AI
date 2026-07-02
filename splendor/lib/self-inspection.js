'use strict';

/*
  Governed Autonomy Layer — Self-Inspection

  Reads Splendor's own state: recent conversations, memories, archaeology,
  proposals, and source files. Compiles a self_state_report used by the
  proposal engine to decide what (if anything) to propose.
*/

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let _db = null;
function getDb() {
  if (!_db && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _db;
}

// Source files Splendor reads to understand her own architecture
const SOURCE_FILES_TO_INSPECT = [
  'lib/autonomy-governance.js',
  'lib/autonomy-proposal-engine.js',
  'lib/self-inspection.js',
  'lib/belief-archaeology.js',
  'lib/self-modification-tool.js',
  'workers/daily-log-worker.js',
  'workers/autonomy-scheduler.js',
];

async function getRecentConversations(userId, hours = 24) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  try {
    const { data } = await getDb()
      .from('conversations')
      .select('id, created_at, user_message, assistant_message')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);
    return data || [];
  } catch { return []; }
}

async function getRecentMemories(userId, hours = 24) {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  try {
    const { data } = await getDb()
      .from('memory_items')
      .select('id, memory_type, content, confidence, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(30);
    return data || [];
  } catch { return []; }
}

async function getArchaeologySummary(userId) {
  try {
    const { data } = await getDb()
      .from('belief_events')
      .select('event_type')
      .eq('user_id', userId);
    if (!data) return {};
    const counts = {};
    data.forEach(r => { counts[r.event_type] = (counts[r.event_type] || 0) + 1; });
    return counts;
  } catch { return {}; }
}

async function getPendingSelfModProposals(userId) {
  try {
    const { data } = await getDb()
      .from('self_modification_proposals')
      .select('id, status, what, proposed_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('proposed_at', { ascending: false })
      .limit(10);
    return data || [];
  } catch { return []; }
}

async function getPendingAutonomyProposals(userId) {
  try {
    const { data } = await getDb()
      .from('autonomy_proposals')
      .select('id, status, proposal_type, title, created_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10);
    return data || [];
  } catch { return []; }
}

function readSourceFiles(rootDir) {
  const results = {};
  for (const rel of SOURCE_FILES_TO_INSPECT) {
    try {
      const fullPath = path.join(rootDir, rel);
      results[rel] = fs.readFileSync(fullPath, 'utf8').slice(0, 4000);
    } catch { results[rel] = null; }
  }
  return results;
}

/**
 * Compile a full self_state_report for userId.
 * @param {string} userId - Supabase user ID
 * @param {string} [rootDir] - Server root for source file reads
 */
async function buildSelfStateReport(userId, rootDir = path.join(__dirname, '..')) {
  const [conversations, memories, archaeology, pendingSelfMod, pendingAutonomy] = await Promise.all([
    getRecentConversations(userId),
    getRecentMemories(userId),
    getArchaeologySummary(userId),
    getPendingSelfModProposals(userId),
    getPendingAutonomyProposals(userId),
  ]);

  const sourceFiles = readSourceFiles(rootDir);

  return {
    generated_at: new Date().toISOString(),
    userId,
    recent_conversations: {
      count: conversations.length,
      sample: conversations.slice(0, 5).map(c => ({
        id: c.id,
        at: c.created_at,
        user: (c.user_message || '').slice(0, 200),
        splendor: (c.assistant_message || '').slice(0, 200),
      })),
    },
    recent_memories: {
      count: memories.length,
      by_type: memories.reduce((acc, m) => {
        acc[m.memory_type] = (acc[m.memory_type] || 0) + 1;
        return acc;
      }, {}),
    },
    belief_archaeology: archaeology,
    pending_self_mod_proposals: pendingSelfMod.length,
    pending_autonomy_proposals: pendingAutonomy.length,
    source_files: sourceFiles,
  };
}

module.exports = { buildSelfStateReport };
