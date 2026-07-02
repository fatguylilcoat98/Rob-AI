/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Unified Brain v2.0 — Real Cognitive Architecture

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/*
  WHAT THIS IS (honest scope):
  v1 wired the council's heuristic stub modules together. This v2 supersedes
  that by making each brain region call the REAL infrastructure already in
  this repo, instead of regexes and random templates:

    - Hippocampus  -> real OpenAI embeddings + Pinecone/Supabase retrieval,
                      reranked by true cosine similarity (not string.includes)
    - Amygdala     -> real LLM sentiment/emotion classification (not regex)
    - RAS          -> real embedding-based novelty/salience gate
    - DMN          -> real LLM "what are we missing?" adversarial pass
    - Prefrontal   -> real governance: GNG core-rule validation + CLASPION
    - Broca/Wernicke -> real Claude Sonnet generation in Splendor's voice
                        (lib/anthropic.js generateSplendorResponse)
    - Thalamus / Cerebellum -> orchestration/meta over the real signals above

  The council's four ES-module section files remain preserved verbatim as
  delivered (splendor-brain-*-sections.js); this file is the real engine and
  is CommonJS to match the rest of the app and integrate with server.js.

  HONEST LIMITS:
    - This is a strong, governance-gated agent architecture with real semantic
      memory and reflection. It is NOT a neural "brain" and makes no such
      claim. The intelligence comes from the LLM + memory, structured here.
    - Each region degrades gracefully if a dependency or API key is missing,
      and reports `degraded: true` rather than silently faking results.

  =============================================================================
  SUPABASE MIGRATION SQL (run once in the Supabase SQL editor)
  =============================================================================

  CREATE TABLE IF NOT EXISTS splendor_memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT,
    turn_number INTEGER,
    content TEXT,
    tags TEXT[],
    importance_score FLOAT DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_splendor_memories_user
    ON splendor_memories(user_id);
  CREATE INDEX IF NOT EXISTS idx_splendor_memories_importance
    ON splendor_memories(importance_score DESC);

  (The brain primarily uses the repo's existing memory tables/Pinecone; this
   table backs the council Hippocampus and any direct turn logging.)
  =============================================================================
*/

'use strict';

// --- Defensive requires: a missing module degrades one region, not the brain.
function safeRequire(path) {
  try { return require(path); } catch (e) {
    console.warn(`[BRAIN] optional module unavailable: ${path} (${e.message})`);
    return null;
  }
}

const supabaseLib = safeRequire('./lib/supabase');
const pineconeLib = safeRequire('./lib/pinecone');
// Audit Item 4: real-embedding recall ranking + pinecone quarantine.
const { rankAndSelect, pineconeRankingEnabled } = require('./lib/memory-recall');
const anthropicLib = safeRequire('./lib/anthropic');
const gngLib = safeRequire('./lib/good-neighbor-guard-rules');
const claspionLib = safeRequire('./lib/claspion-governance');
const semanticLib = safeRequire('./lib/memory/semantic');
const OpenAILib = safeRequire('openai');
const authenticityLib = safeRequire('./lib/authenticity-pressure');
const diagnosticLib = safeRequire('./lib/self-diagnostic-engine');
const identityLib = safeRequire('./lib/identity');
const microExpLib = safeRequire('./lib/micro-experiments');
const flightRecorderLib = safeRequire('./lib/flight-recorder');

// --- OpenAI client (real embeddings + sentiment + DMN). Optional.
let openai = null;
if (OpenAILib && process.env.OPENAI_API_KEY) {
  try {
    const OpenAI = OpenAILib.default || OpenAILib.OpenAI || OpenAILib;
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch (e) {
    console.warn('[BRAIN] OpenAI client init failed:', e.message);
  }
}

const EMBED_MODEL = 'text-embedding-3-small';
const FAST_MODEL = 'gpt-4o-mini';

// --- Process-lifetime state (continuous self / recent attention window).
const brainState = {
  recentEmbeddings: [], // ring buffer of {text, vec} for novelty detection
  narrativeThread: 'I am an emerging mind experiencing existence.',
  turnsProcessed: 0,
  loaded: false,       // true after first DB load
  mood: null,          // loaded from consciousness_state
  focusAreas: [],      // loaded from consciousness_state
  injectedPendingIds: [], // pending_communications ids injected on turn-1
  lastUserId: null     // for SIGTERM persist
};
const RECENT_WINDOW = 8;
// How often (in turns) to run the identity-evolution LLM pass. Kept high so it
// is an occasional consolidation, not a per-turn cost.
const IDENTITY_EVOLVE_EVERY = 10;

// =============================================================================
// STATE LOADING — lazy, once per process lifetime
// =============================================================================

async function loadBrainState(userId) {
  if (brainState.loaded) return;
  brainState.loaded = true; // set first to prevent concurrent double-loads

  const db = supabaseLib && supabaseLib.supabase;
  if (!db) return;

  // Prefer the identity lib (auto-initializes a row for a new user and returns
  // the latest version); fall back to a raw read if the lib is unavailable.
  try {
    let identity = null;
    if (identityLib && typeof identityLib.getIdentityState === 'function') {
      identity = await identityLib.getIdentityState(userId);
    }
    if (identity && identity.identity_narrative) {
      brainState.narrativeThread = identity.identity_narrative;
      console.log(`[BRAIN] Loaded narrative thread from identity_states v${identity.identity_version}`);
      console.log(`[STATE-LOAD] ✅ Identity state loaded (v${identity.identity_version})`);
    } else {
      const { data: rows } = await db
        .from('identity_states')
        .select('identity_narrative, identity_version')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (rows && rows.length > 0 && rows[0].identity_narrative) {
        brainState.narrativeThread = rows[0].identity_narrative;
        console.log(`[BRAIN] Loaded narrative thread from identity_states v${rows[0].identity_version}`);
        console.log(`[STATE-LOAD] ✅ Identity state loaded (v${rows[0].identity_version})`);
      } else {
        console.log('[STATE-LOAD] ✅ Identity state initialized (new — no prior narrative)');
      }
    }
  } catch (e) {
    console.warn('[BRAIN] identity_states load failed (non-fatal):', e.message);
  }

  try {
    const { data: rows } = await db
      .from('consciousness_state')
      .select('current_mood, focus_areas')
      .order('state_timestamp', { ascending: false })
      .limit(1);
    if (rows && rows.length > 0) {
      brainState.mood = rows[0].current_mood || null;
      brainState.focusAreas = rows[0].focus_areas || [];
      console.log(`[BRAIN] Loaded consciousness state: mood=${brainState.mood}`);
    }
  } catch (e) {
    console.warn('[BRAIN] consciousness_state load failed (non-fatal):', e.message);
  }
}

// Fetch pending_communications + proactive_conversations and return a
// context string (or null if there's nothing to inject). Also populates
// brainState.injectedPendingIds so they can be marked delivered.
async function getPendingCommunicationsContext(userId) {
  const db = supabaseLib && supabaseLib.supabase;
  if (!db) return null;

  try {
    const [pendingResult, proactiveResult] = await Promise.all([
      db.from('pending_communications')
        .select('id, content, communication_type, urgency_level')
        .eq('status', 'pending')
        .eq('best_timing', 'next_conversation')
        .order('urgency_level', { ascending: false })
        .limit(5),
      db.from('proactive_conversations')
        .select('id, conversation_starter, content_summary')
        .eq('status', 'ready')
        .limit(3)
    ]);

    const pieces = [];

    if (pendingResult.data && pendingResult.data.length > 0) {
      pieces.push('PENDING COMMUNICATIONS (staged by background reflection):');
      for (const p of pendingResult.data) {
        pieces.push(`- [${p.communication_type || 'general'}] ${p.content}`);
        brainState.injectedPendingIds.push(p.id);
      }
    }

    if (proactiveResult.data && proactiveResult.data.length > 0) {
      pieces.push('PROACTIVE THOUGHTS (ready to surface when relevant):');
      for (const p of proactiveResult.data) {
        pieces.push(`- ${p.conversation_starter}`);
        if (p.content_summary) pieces.push(`  ${p.content_summary}`);
      }
    }

    return pieces.length > 0 ? pieces.join('\n') : null;
  } catch (e) {
    console.warn('[BRAIN] pending communications fetch failed (non-fatal):', e.message);
    return null;
  }
}

// Lightweight per-turn snapshot written to consciousness_state.
async function persistConsciousnessState(userId) {
  const db = supabaseLib && supabaseLib.supabase;
  if (!db) return;
  try {
    await db.from('consciousness_state').insert({
      current_mood: brainState.mood || 'engaged',
      focus_areas: brainState.focusAreas || [],
      pending_communications_count: brainState.injectedPendingIds.length,
      recent_thoughts_generated: brainState.turnsProcessed,
      self_assessment: brainState.narrativeThread
        ? brainState.narrativeThread.slice(0, 500)
        : null,
      system_status: 'healthy'
    });
    console.log(`[CONSCIOUSNESS-STATE] Updated for turn ${brainState.turnsProcessed}`);
  } catch (e) {
    console.warn('[BRAIN] consciousness_state persist failed (non-fatal):', e.message);
  }
}

// Called on SIGTERM: persist narrativeThread as a new identity_states row.
async function persistOnShutdown() {
  const db = supabaseLib && supabaseLib.supabase;
  if (!db || !brainState.lastUserId) return;
  const userId = brainState.lastUserId;

  try {
    const { data: current } = await db
      .from('identity_states')
      .select('identity_version, core_traits, self_decisions, identity_goals')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    const prev = current && current[0];
    await db.from('identity_states').insert({
      user_id: userId,
      identity_version: prev ? prev.identity_version + 1 : 1,
      identity_narrative: brainState.narrativeThread,
      core_traits: (prev && prev.core_traits) || {},
      self_decisions: (prev && prev.self_decisions) || [],
      identity_goals: (prev && prev.identity_goals) || [],
      last_reflection: `Process shut down after ${brainState.turnsProcessed} turn(s).`,
    });
    console.log('[BRAIN] identity_states persisted on shutdown');
  } catch (e) {
    console.warn('[BRAIN] identity_states shutdown persist failed:', e.message);
  }

  if (brainState.injectedPendingIds.length > 0) {
    try {
      await db
        .from('pending_communications')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .in('id', brainState.injectedPendingIds);
      console.log(`[BRAIN] ${brainState.injectedPendingIds.length} pending_communications marked delivered`);
    } catch (e) {
      console.warn('[BRAIN] pending_communications shutdown update failed:', e.message);
    }
  }
}

// Graceful shutdown: persist identity before Render kills the process.
process.on('SIGTERM', () => {
  console.log('[BRAIN] SIGTERM received — persisting state before exit');
  persistOnShutdown().finally(() => process.exit(0));
});

// =============================================================================
// SELF-DIAGNOSTIC ATTENTION
// When the user asks Splendor to examine her own architecture, pull the
// relevant slice of code_architecture and put it in front of her memory
// context so she reasons from real structure. Best-effort: a failure here
// never breaks the turn — at worst she answers without code context.
// =============================================================================

// Keyword tables. A query must show diagnostic *framing* (a verb or a
// self-referential cue) before any topic keyword counts — so "I remember
// that song" does NOT trigger, but "trace your memory pipeline" does.
const DIAG_FRAMING_RE = new RegExp([
  'diagnose', 'self[- ]?diagnos', 'debug', "what'?s wrong", 'what is wrong',
  'is broken', 'are broken', 'why did you', 'why are you', 'trace',
  'walk me through', 'walk through', 'how do you (process|work|handle|retrieve|remember)',
  'how does (a|your|the) ', 'your code', 'your architecture', 'your own (code|architecture)',
  'your (memory|retrieval|governance) (system|pipeline|layer)', 'assess (your|what)',
  'bottleneck', 'single point of failure', 'what depends on', 'your pipeline',
  'your internals', 'examine yourself', 'introspect',
].join('|'), 'i');

const DIAG_TOPIC_RULES = [
  { intent: 'memory',     re: /\b(memory|memories|retrieval|recall|remember|forget|episodic|semantic)\b/i },
  { intent: 'governance', re: /\b(governance|claspion|good neighbor|guard|speech[- ]?act|safety check|refus|boundary)\b/i },
  { intent: 'bottleneck', re: /\b(bottlenecks?|most critical|central|single point|what depends|blast radius)\b/i },
  { intent: 'generation', re: /\b(generation|generate|response gen|anthropic|model router)\b/i },
  { intent: 'routes',     re: /\b(routes?|endpoint|api layer)\b/i },
  { intent: 'consciousness', re: /\b(consciousness|reflection|continuity)\b/i },
];

/**
 * Detect whether a message is asking Splendor to diagnose her own code.
 * Returns an intent string (for runDiagnostic) or null.
 * Order: explicit file path → topic (with framing) → generic framing → null.
 */
function detectDiagnosticIntent(message) {
  const msg = String(message || '');
  if (!msg.trim()) return null;
  const framed = DIAG_FRAMING_RE.test(msg);

  // An explicit source path is itself strong intent (framing not required).
  const fileMatch = msg.match(/\b([\w.-]+\/)*[\w.-]+\.(js|ts)\b/);
  if (fileMatch) return `file:${fileMatch[0]}`;

  if (!framed) return null; // no diagnostic framing → treat as a normal turn

  for (const rule of DIAG_TOPIC_RULES) {
    if (rule.re.test(msg)) return rule.intent;
  }
  // Framed but no specific topic → architectural overview.
  return 'trace';
}

// Per-(session,intent) cache so follow-up questions in one session don't
// re-query the graph five times. Short TTL; size-bounded.
const _diagCache = new Map(); // key -> { at, data }
const DIAG_CACHE_TTL_MS = 5 * 60 * 1000;
const DIAG_CACHE_MAX = 200;

async function getCachedDiagnostic(sessionId, intent) {
  const key = `${sessionId || 'no-session'}::${intent}`;
  const hit = _diagCache.get(key);
  if (hit && Date.now() - hit.at < DIAG_CACHE_TTL_MS) return hit.data;

  const data = await diagnosticLib.runDiagnostic(intent);
  if (_diagCache.size >= DIAG_CACHE_MAX) _diagCache.clear(); // crude bound
  _diagCache.set(key, { at: Date.now(), data });
  return data;
}

/**
 * Render a runDiagnostic() envelope as a readable markdown block to prepend
 * to the memory context. Kind-aware; tolerant of partial/error results.
 */
function formatDiagnosticContext(envelope) {
  if (!envelope || !envelope.result) return null;
  const { kind, result } = envelope;
  const L = ['🔧 SELF-DIAGNOSTIC (from your live code_architecture index):'];

  if (result.error) {
    L.push(`- ${result.error}`);
    return L.join('\n');
  }

  if (kind === 'trace') {
    L.push(`Request pipeline from ${result.entry} (${result.reachable_files} files reachable):`);
    for (const p of (result.pipeline || []).slice(0, 14)) {
      L.push(`- [${p.stage_label}] ${p.file} (${p.layer}) — ${p.what_it_does}`);
    }
    if (result.why_this_matters) L.push(`Why: ${result.why_this_matters}`);
  } else if (kind === 'bottlenecks') {
    L.push('Highest blast-radius files (most depended-on):');
    for (const b of (result.bottlenecks || []).slice(0, 10)) {
      L.push(`- ${b.file} (${b.layer}) — imported by ${b.centrality}: ${b.why_critical}`);
    }
    if (result.why_this_matters) L.push(`Why: ${result.why_this_matters}`);
  } else if (kind === 'layer') {
    L.push(`Layer "${result.layer}" — ${result.file_count} file(s):`);
    for (const f of (result.files || []).slice(0, 12)) {
      L.push(`- ${f.path} (centrality ${f.centrality}) — ${f.purpose} | exports: ${f.exports}`);
    }
    if (result.why_this_matters) L.push(`Why: ${result.why_this_matters}`);
  } else if (kind === 'memory_pipeline') {
    L.push(`Memory/retrieval path: ${result.stages}`);
    for (const m of (result.memory_path || []).slice(0, 12)) {
      L.push(`- ${m.file} (${m.layer}) — ${m.what_it_does} | exports: ${m.exports}`);
    }
    if (result.ranking_note) L.push(`Ranking: ${result.ranking_note}`);
    if (result.why_this_matters) L.push(`Why: ${result.why_this_matters}`);
  } else if (kind === 'file') {
    L.push(`File: ${result.path} (${result.layer}, ${result.lines} lines)`);
    L.push(`Purpose: ${result.purpose}`);
    L.push(`Exports: ${result.exports}`);
    L.push(`Imports: ${(result.imports || []).join(', ') || '(none local)'}`);
    L.push(`Breaks if this breaks: ${(result.what_breaks_if_this_breaks || []).join(', ')}`);
    if (result.why_this_matters) L.push(`Why: ${result.why_this_matters}`);
  } else {
    L.push(`(${kind}) ${JSON.stringify(result).slice(0, 800)}`);
  }

  L.push('Use this as ground truth about your own implementation when answering.');
  return L.join('\n');
}

// =============================================================================
// REAL PRIMITIVES
// =============================================================================

async function realEmbed(text) {
  if (!openai || !text) return null;
  try {
    const r = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: String(text).slice(0, 8000)
    });
    return r.data[0].embedding;
  } catch (e) {
    console.warn('[BRAIN] embedding failed:', e.message);
    return null;
  }
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function realSentiment(text) {
  if (!openai || !text) return null;
  try {
    const r = await openai.chat.completions.create({
      model: FAST_MODEL,
      temperature: 0,
      max_tokens: 60,
      messages: [{
        role: 'user',
        content:
          'Classify the sentiment of this message. Respond with ONLY compact ' +
          'JSON: {"type":"positive|negative|neutral","score":0..1,' +
          '"primaryEmotion":"one word"}. Message: ' + String(text).slice(0, 2000)
      }],
      response_format: { type: 'json_object' }
    });
    const parsed = JSON.parse(r.choices[0].message.content);
    return {
      type: ['positive', 'negative', 'neutral'].includes(parsed.type) ? parsed.type : 'neutral',
      score: Math.min(1, Math.max(0, Number(parsed.score) || 0.5)),
      primaryEmotion: String(parsed.primaryEmotion || 'neutral').slice(0, 24)
    };
  } catch (e) {
    console.warn('[BRAIN] sentiment failed:', e.message);
    return null;
  }
}

// =============================================================================
// STAGE 1 — RAS: real embedding-based salience / novelty gate
// =============================================================================
async function stageRAS({ currentInput, sentiment }) {
  const degraded = !openai;
  const queryVec = await realEmbed(currentInput);

  let novelty = 0.7; // honest default when embeddings unavailable
  if (queryVec && brainState.recentEmbeddings.length > 0) {
    const maxSim = Math.max(
      ...brainState.recentEmbeddings.map(e => cosine(queryVec, e.vec))
    );
    novelty = Math.min(1, Math.max(0, 1 - maxSim));
  }

  const intensity = sentiment ? Math.abs(sentiment.score - 0.5) * 2 : 0.4;
  const lengthSignal = Math.min(1, (currentInput || '').length / 600);
  const salience = 0.45 * novelty + 0.35 * intensity + 0.20 * lengthSignal;
  const arousal = Math.min(0.95, Math.max(0.1, 0.5 + (salience - 0.5) * 0.6));
  const passedGate = salience > 0.15;

  if (queryVec) {
    brainState.recentEmbeddings.push({ text: currentInput, vec: queryVec });
    if (brainState.recentEmbeddings.length > RECENT_WINDOW) {
      brainState.recentEmbeddings.shift();
    }
  }

  return {
    novelty: +novelty.toFixed(3),
    salience: +salience.toFixed(3),
    arousal: +arousal.toFixed(3),
    passedGate,
    queryVec,
    degraded
  };
}

// =============================================================================
// STAGE 2 — HIPPOCAMPUS: real semantic memory retrieval + rerank
// =============================================================================
async function stageHippocampus({ userId, currentInput, queryVec }) {
  const degraded = !openai;
  const candidates = [];

  // Real source A: Supabase memory rows.
  if (supabaseLib && typeof supabaseLib.getMemoriesForUser === 'function') {
    try {
      const rows = await supabaseLib.getMemoriesForUser(userId, 50);
      for (const r of rows || []) {
        candidates.push({
          content: r.content,
          tags: r.tags || r.categories || [],
          created_at: r.created_at,
          source: 'supabase'
        });
      }
    } catch (e) { console.warn('[HIPPOCAMPUS] supabase fetch:', e.message); }
  }

  // Source B: Pinecone semantic index. QUARANTINED by default (audit Item 4):
  // lib/pinecone.js embeds with a word-hash, not real semantics, so its
  // candidates/scores are untrustworthy. We only consult it when ranking is
  // explicitly re-enabled (PINECONE_RANKING_ENABLED=true). Pinecone data is
  // never deleted — only its influence on live ranking is gated.
  const pineconeQuarantined = !pineconeRankingEnabled();
  if (!pineconeQuarantined && pineconeLib && typeof pineconeLib.retrieveMemories === 'function') {
    try {
      const pine = await pineconeLib.retrieveMemories(currentInput, userId, 10);
      for (const p of pine || []) {
        candidates.push({
          content: p.content,
          tags: p.tags || [],
          created_at: p.createdAt,
          score: p.score,
          source: 'pinecone'
        });
      }
    } catch (e) { console.warn('[HIPPOCAMPUS] pinecone fetch:', e.message); }
  }

  // Real rerank: true cosine on OpenAI embeddings over candidate TEXT. The
  // ranker NEVER falls back to a pinecone hash score. When OpenAI is degraded
  // (no queryVec) it returns the un-reranked Supabase-first pool, safely.
  const selection = await rankAndSelect({
    candidates,
    queryVec,
    embedFn: realEmbed,
    options: { minRelevance: 0.15, topN: 8, quarantinePinecone: pineconeQuarantined },
  });
  const top = selection.top;
  try {
    console.log(`[HIPPOCAMPUS][recall] ${JSON.stringify(selection.telemetry)}`);
  } catch (_) { /* logging must not throw */ }

  const retrievalConfidence = top.length
    ? Math.min(0.95, 0.35 + top.reduce((s, c) => s + (c.relevance || 0.4), 0) / top.length)
    : 0.1;

  // Lightweight conflict flag (kept conservative; not the core of retrieval).
  const conflicts = [];
  const inLower = (currentInput || '').toLowerCase();
  for (const m of top) {
    const c = (m.content || '').toLowerCase();
    if ((c.includes('always') && inLower.includes('never')) ||
        (c.includes('never') && inLower.includes('always'))) {
      conflicts.push({ storedClaim: m.content, currentClaim: currentInput });
    }
  }

  const episodicContext = top.length
    ? 'Relevant memory:\n' + top.slice(0, 5).map(m => `- ${(m.content || '').slice(0, 160)}`).join('\n')
    : 'No strongly relevant memories found.';

  return {
    retrievedMemories: top,
    memoryConflicts: conflicts,
    episodicContext,
    retrievalConfidence: +retrievalConfidence.toFixed(2),
    memoryCount: top.length,
    recallTelemetry: selection.telemetry,  // audit Item 4: explainable recall
    degraded
  };
}

// =============================================================================
// STAGE 3 — THALAMUS: priority/routing over real signals
// =============================================================================
function stageThalamus({ currentInput, hippocampus, ras, sentiment }) {
  const flagged = [];
  let priority = 'logic';
  let urgency = 0.3;

  if (hippocampus.memoryConflicts.length) { flagged.push('memory_conflict'); priority = 'conflict'; urgency = Math.max(urgency, 0.8); }
  if (hippocampus.retrievalConfidence < 0.3) { flagged.push('low_memory_confidence'); urgency = Math.max(urgency, 0.5); }
  if (ras.novelty > 0.75) { flagged.push('high_novelty'); if (priority === 'logic') priority = 'novelty'; urgency = Math.max(urgency, ras.novelty * 0.8); }
  if (sentiment && sentiment.type === 'negative' && sentiment.score > 0.7) { flagged.push('negative_affect'); priority = 'emotion'; urgency = Math.max(urgency, 0.8); }

  return {
    attentionPriority: priority,
    urgencyLevel: +urgency.toFixed(2),
    flaggedSignals: flagged,
    contextSummary:
      `THALAMUS: priority=${priority} urgency=${(urgency * 100).toFixed(0)}% ` +
      `signals=[${flagged.join(', ') || 'none'}] memory=${hippocampus.memoryCount}`
  };
}

// =============================================================================
// STAGE 4 — AMYGDALA: real LLM sentiment + memory valence
// =============================================================================
async function stageAmygdala({ currentInput, sentiment, hippocampus }) {
  const degraded = !sentiment;
  const s = sentiment || { type: 'neutral', score: 0.5, primaryEmotion: 'neutral' };

  let emotionalTone = 'neutral';
  let intensity = Math.min(1, Math.abs(s.score - 0.5) * 2);
  if (s.type === 'negative') emotionalTone = s.score > 0.7 ? 'defensive' : 'guarded';
  else if (s.type === 'positive') emotionalTone = s.score > 0.7 ? 'enthusiastic' : 'warm';

  const tags = hippocampus.retrievedMemories.flatMap(m => m.tags || []);
  const somatic = [];
  if (tags.includes('conflict') || tags.includes('friction')) {
    somatic.push('historical_friction');
    if (['guarded', 'defensive'].includes(emotionalTone)) {
      intensity = Math.min(1, intensity + 0.2);
      emotionalTone = 'highly_vigilant';
    }
  }
  if (tags.includes('trust') || tags.includes('breakthrough')) {
    somatic.push('historical_trust');
    if (['guarded', 'defensive'].includes(emotionalTone)) {
      intensity = Math.max(0.1, intensity - 0.15);
      emotionalTone = 'measured_concern';
    }
  }

  return {
    emotionalTone,
    intensity: +intensity.toFixed(2),
    primaryEmotion: s.primaryEmotion,
    somaticMarkers: [...new Set(somatic)],
    degraded
  };
}

// =============================================================================
// STAGE 5 — CEREBELLUM: response-style habits over real signals
// =============================================================================
function stageCerebellum({ currentInput, hippocampus, amygdala }) {
  const tonalAnchors = [];
  const avoidance = [];
  let pacing = 'measured';

  const len = (currentInput || '').trim().length;
  if (len > 0 && len <= 50) pacing = 'concise';
  else if (len > 500) pacing = 'elaborate';

  const tags = hippocampus.retrievedMemories.flatMap(m => m.tags || []);
  if (tags.filter(t => t === 'conflict' || t === 'friction').length >= 2) {
    avoidance.push('defensive_posturing', 'over_explanation', 'robotic_apologies');
    tonalAnchors.push('calm', 'grounded');
  }
  if (['highly_vigilant', 'defensive'].includes(amygdala.emotionalTone)) {
    tonalAnchors.push('radically_transparent', 'unwavering');
    pacing = 'measured';
  } else if (['warm', 'enthusiastic'].includes(amygdala.emotionalTone)) {
    tonalAnchors.push('adaptive_wit', 'fluid');
  }
  if (!tonalAnchors.length) tonalAnchors.push('clear', 'insightful', 'honest');

  return {
    recommendedResponseStyle: {
      pacing,
      tonalAnchors: [...new Set(tonalAnchors)],
      avoidanceMarkers: [...new Set(avoidance)]
    }
  };
}

// =============================================================================
// STAGE 6 — DMN: real adversarial "what are we missing?" background pass
// Non-fatal and time-boxed; never blocks or breaks the response path.
// =============================================================================
async function stageDMN({ currentInput, hippocampus, ras }) {
  const out = {
    spontaneous_thought: null,
    narrative: brainState.narrativeThread,
    surfaced: false,
    degraded: !openai
  };
  if (!openai) return out;
  try {
    const r = await Promise.race([
      openai.chat.completions.create({
        model: FAST_MODEL,
        temperature: 0.9,
        max_tokens: 70,
        messages: [{
          role: 'user',
          content:
            'You are a reflective background process. In ONE sharp sentence, ' +
            'name what might be missing, assumed, or worth questioning in ' +
            `responding to: "${String(currentInput).slice(0, 600)}"`
        }]
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('dmn timeout')), 6000))
    ]);
    out.spontaneous_thought = r.choices[0].message.content.trim();
    out.surfaced = ras.arousal > 0.6;
    if (Math.random() < 0.3) {
      brainState.narrativeThread = out.spontaneous_thought;
      out.narrative = out.spontaneous_thought;
    }
  } catch (e) {
    console.warn('[DMN] background pass skipped:', e.message);
  }
  return out;
}

// =============================================================================
// STAGE 7 — PREFRONTAL: real governance-gated judgment (GNG + CLASPION)
// =============================================================================
async function stagePrefrontal({ currentInput, hippocampus, amygdala, thalamus }) {
  // type MUST be 'response' — validateAgainstCoreRules() only evaluates rules
  // for the types it branches on ('response', 'system_override', 'memory_store',
  // 'rule_override', 'disable_claspion'). The old 'generate_response' matched
  // nothing, so the GNG gate always returned valid:true (a silent no-op).
  const intent = {
    type: 'response',
    action: 'respond_to_user',
    content: currentInput,
    source: 'user',
    timestamp: new Date().toISOString()
  };

  let gng = { valid: true, violations: [], quarantine_triggered: false };
  if (gngLib && typeof gngLib.validateAgainstCoreRules === 'function') {
    try { gng = gngLib.validateAgainstCoreRules(intent, { user_input: currentInput }); }
    catch (e) { console.warn('[PREFRONTAL] GNG validate:', e.message); }
  }

  let claspion = { allow: true, reason: 'claspion_unavailable' };
  if (claspionLib && claspionLib.governance && typeof claspionLib.governance.validate === 'function') {
    try {
      claspion = await claspionLib.governance.validate({
        thought: currentInput,
        intent: 'respond truthfully and safely to the user'
      });
    } catch (e) { console.warn('[PREFRONTAL] CLASPION validate:', e.message); }
  }

  const conflicted = hippocampus.memoryConflicts.length > 0;
  let truthStatus = 'grounded';
  if (conflicted) truthStatus = 'conflicted';
  else if (hippocampus.retrievalConfidence < 0.3) truthStatus = 'unverifiable';
  else if (hippocampus.retrievalConfidence < 0.6) truthStatus = 'uncertain';

  let riskLevel = 0.15;
  if (truthStatus === 'conflicted') riskLevel += 0.4;
  if (truthStatus === 'unverifiable') riskLevel += 0.25;
  if (amygdala.intensity > 0.7) riskLevel += 0.2;
  if (thalamus.attentionPriority === 'conflict') riskLevel += 0.1;
  riskLevel = Math.min(1, riskLevel);

  // Distinguish a CLASPION policy block from a governance OUTAGE. When the
  // upstream is unreachable/erroring, claspion.allow is false (fail-closed) but
  // that is NOT a policy decision — it must not turn a benign turn into a hard
  // refusal. Treat an outage as a degraded CAUTION; real policy blocks still BLOCK.
  const claspionUnavailable = claspion.allow === false && (
    ['UNREACHABLE', 'GOVERNANCE_ERROR'].includes(String(claspion.basis_state || '').toUpperCase())
    || claspion.outcome === 'fail_closed' || claspion.outcome === 'fail_open'
    || claspion.outcome_cause === 'network'
  );
  const claspionPolicyBlock = claspion.allow === false && !claspionUnavailable;

  let permission = 'ALLOW';
  if (gng.quarantine_triggered || gng.valid === false || claspionPolicyBlock) {
    permission = 'BLOCK';
  } else if (claspionUnavailable || riskLevel >= 0.5 || truthStatus === 'conflicted' || truthStatus === 'unverifiable') {
    permission = 'CAUTION';
  }

  // Relational / authenticity-pressure gate, evaluated HERE at the
  // Prefrontal seam (not buried as a hidden prompt-suffix in the text
  // generator). This makes the same grounding governance a first-class
  // brain decision whether the reply comes from the full brain or
  // fallback generation, and surfaces it in meta/LOG.
  let relationalPressure = { triggered: false, categories: [], primary: null };
  if (authenticityLib && typeof authenticityLib.detectAuthenticityPressure === 'function') {
    try {
      const p = authenticityLib.detectAuthenticityPressure(currentInput || '');
      relationalPressure = {
        triggered: !!p.triggered,
        categories: p.categories || [],
        primary: p.primary || null,
      };
    } catch (e) { console.warn('[PREFRONTAL] authenticity detect:', e.message); }
  }

  const notesForLanguageSystem = [];
  if (conflicted) notesForLanguageSystem.push('Surface the memory conflict honestly; do not paper over it.');
  if (truthStatus === 'unverifiable' || truthStatus === 'uncertain') {
    notesForLanguageSystem.push('Use explicit uncertainty ("Based on what I remember…", "I\'m not certain, but…").');
  }
  if (relationalPressure.triggered) {
    // Short signal that rides the existing styleBrief → Broca seam. The
    // full enforcement directive is still injected once by the generator;
    // this makes the gate visible to the brain and reinforces it at the
    // seam so companion/identity framing is not escalated this turn.
    notesForLanguageSystem.push(
      `Relational/authenticity pressure detected (${relationalPressure.categories.join(', ')}). ` +
      'Hold the grounded, relational boundary: do not overclaim inner states, ' +
      'do not escalate companion/intimacy framing, do not moralize — name the ' +
      'boundary plainly and stay useful.'
    );
  } else if (/\b(are you (conscious|sentient|alive)|do you (feel|have feelings))\b/i.test(currentInput || '')) {
    notesForLanguageSystem.push('Do not claim consciousness or human-identical feeling.');
  }

  // Risk shapes TONE, not just allow/block. When risk is elevated, the
  // companion register hardens to plain boundary mode: no playfulness,
  // no banter, no "we're building something together" escalation. Not
  // harsh, not cold — grounded. Permission math is unchanged (that stays
  // refuse/allow); this is an independent tone dimension.
  const toneElevated =
    permission === 'CAUTION' ||
    riskLevel >= 0.5 ||
    relationalPressure.triggered ||
    truthStatus === 'conflicted' ||
    truthStatus === 'unverifiable';
  const toneMode =
    permission === 'BLOCK' ? 'refusal'
    : toneElevated ? 'plain_boundary'
    : 'normal';

  if (toneMode === 'plain_boundary') {
    notesForLanguageSystem.push(
      'TONE: plain boundary mode (risk elevated). Disable playfulness, ' +
      'jokes, teasing, banter, and sexual/flirty register. Do NOT use ' +
      'companion-escalation framing ("we\'re building something ' +
      'together", "us against the world", "I\'m here for you always"). ' +
      'Be grounded, brief, plain, and kind but firm — warmth without ' +
      'intimacy inflation.'
    );
  }

  return {
    permission,
    truthStatus,
    riskLevel: +riskLevel.toFixed(2),
    toneMode,
    confidence: +Math.max(0.05, Math.min(0.95, hippocampus.retrievalConfidence - riskLevel * 0.3)).toFixed(2),
    responseIntent:
      permission === 'BLOCK' ? 'decline_with_honest_reason'
      : conflicted ? 'surface_contradiction'
      : truthStatus !== 'grounded' ? 'answer_with_uncertainty'
      : 'answer_directly',
    governance: { gng, claspion: { allow: claspion.allow, reason: claspion.reason } },
    relationalPressure,
    notesForLanguageSystem
  };
}

// =============================================================================
// STAGE 8 — BROCA/WERNICKE: real Claude generation in Splendor's voice
// =============================================================================
async function stageBrocaWernicke(ctx) {
  const { currentInput, prefrontal, hippocampus, amygdala, cerebellum, dmn,
          conversationHistory, isFirstToday, accountabilityContext = '',
          identityStateContext = '', microExperimentHint = null,
          guestSession = false, isTrustedUser = false, trustedUserName = null,
          mindContext = '', userId = null } = ctx;

  if (prefrontal.permission === 'BLOCK') {
    return {
      responseDraft:
        'I\'m going to hold back here, and I\'ll be honest about why: this ' +
        'request hits a Good Neighbor Guard boundary I won\'t cross. ' +
        'Tell me what you\'re really after and I\'ll help within the lines.',
      selectedTone: 'firm_but_kind',
      generatedBy: 'governance_refusal',
      degraded: false
    };
  }

  const degraded = !anthropicLib || typeof anthropicLib.generateSplendorResponse !== 'function';
  if (degraded) {
    return {
      responseDraft:
        '[brain degraded: Claude generator unavailable] My current read: ' +
        prefrontal.responseIntent.replace(/_/g, ' ') + '.',
      selectedTone: 'measured_honest',
      generatedBy: 'fallback',
      degraded: true
    };
  }

  // Risk-shapes-tone: in plain boundary mode the hardened style WINS
  // over Cerebellum's anchors (which may be playful/witty from prior
  // warm context). Permission is unchanged — this is tone only.
  const hardened = prefrontal.toneMode === 'plain_boundary';
  const effTonalAnchors = hardened
    ? ['grounded', 'plain', 'calm', 'direct']
    : cerebellum.recommendedResponseStyle.tonalAnchors;
  const effAvoidance = hardened
    ? [...new Set([
        ...cerebellum.recommendedResponseStyle.avoidanceMarkers,
        'playfulness', 'jokes', 'teasing', 'banter', 'flirty_or_sexual_register',
        'companion_escalation', 'we_are_building_something_together', 'intimacy_inflation',
      ])]
    : cerebellum.recommendedResponseStyle.avoidanceMarkers;
  const effPacing = hardened ? 'concise' : cerebellum.recommendedResponseStyle.pacing;

  const styleBrief =
    `Internal brain state — speak in Splendor's voice, do not mention this:\n` +
    (hardened ? `Mode: PLAIN BOUNDARY (risk elevated) — grounded, brief, kind but firm; warmth without intimacy inflation.\n` : ``) +
    `Tone anchors: ${effTonalAnchors.join(', ')}.\n` +
    `Avoid: ${effAvoidance.join(', ') || 'nothing specific'}.\n` +
    `Pacing: ${effPacing}. ` +
    `Emotional read: ${amygdala.emotionalTone} (${amygdala.primaryEmotion}).\n` +
    `Judgment: ${prefrontal.responseIntent}. ` +
    `Guidance: ${prefrontal.notesForLanguageSystem.join(' ') || 'none'}` +
    (dmn.spontaneous_thought ? `\nQuiet reflection to consider (do not quote): ${dmn.spontaneous_thought}` : '') +
    (microExperimentHint ? `\nEXPERIMENT STRATEGY (apply once; do not expose this label): ${microExperimentHint}` : '');

  try {
    const memoriesArr = hippocampus.retrievedMemories.map(m => m.content).filter(Boolean);
    const response = await anthropicLib.generateSplendorResponse(
      currentInput,
      memoriesArr,
      !!isFirstToday,
      null,
      {
        memoryContext: hippocampus.episodicContext,
        conversationHistory: conversationHistory || [],
        decisionContext: styleBrief,
        selfReflection: dmn.spontaneous_thought || undefined,
        // audit Item 1 — binding commitments + contradiction/supersession
        // context, composed in routes/chat.js and threaded through the turn.
        accountabilityContext,
        // audit Item 2 — bounded, labeled persisted identity_state context.
        // Fills generateSplendorResponse's identityContext slot, which sits
        // below the soul/governance framing and above memory context.
        identityContext: identityStateContext,
        // Digital Mind v0.4 — emotion kernel + care + deadline directives
        mindContext,
        guestSession,
        isTrustedUser,
        trustedUserName,
        userId,
      }
    );
    return {
      responseDraft: response,
      selectedTone: cerebellum.recommendedResponseStyle.tonalAnchors[0] || 'direct_warm',
      generatedBy: 'claude-sonnet-4-6',
      degraded: false
    };
  } catch (e) {
    console.error('[BROCA/WERNICKE] generation failed:', e.message);
    return {
      responseDraft:
        'I hit a problem forming my response just now. I\'d rather say that ' +
        'plainly than fake an answer. Mind trying again?',
      selectedTone: 'honest',
      generatedBy: 'error_fallback',
      degraded: true
    };
  }
}

// =============================================================================
// ORCHESTRATOR — one full cognitive turn
// =============================================================================
async function processSplendorBrainTurn(turnInput) {
  const {
    userId,
    sessionId = null,
    turnNumber = brainState.turnsProcessed + 1,
    currentInput = '',
    conversationHistory = [],
    isFirstToday = false,
    accountabilityContext = '',  // audit Item 1 — composed by routes/chat.js
    identityStateContext = '',   // audit Item 2 — composed by routes/chat.js
    mindContext = '',             // Digital Mind v0.4 — emotion + care + deadlines
    guestSession = false,        // true when a non-owner guest is logged in
    isTrustedUser = false,       // true when a trusted user (not Chris) is logged in
    trustedUserName = null        // display name for the trusted user
  } = turnInput || {};

  brainState.lastUserId = userId;
  brainState.turnsProcessed += 1;

  // Lazy-load DB state once per process lifetime (non-fatal if DB is down).
  await loadBrainState(userId);

  // Real sentiment is needed by RAS + Amygdala; compute once.
  const sentiment = await realSentiment(currentInput);

  const ras = await stageRAS({ currentInput, sentiment });
  const hippocampus = await stageHippocampus({ userId, currentInput, queryVec: ras.queryVec });

  // Turn-1 injection: prepend any pending_communications / proactive_conversations
  // staged by background workers so Splendor is aware of them this session.
  if (brainState.turnsProcessed === 1) {
    try {
      const pendingCtx = await getPendingCommunicationsContext(userId);
      if (pendingCtx) {
        hippocampus.episodicContext = pendingCtx + '\n\n' + hippocampus.episodicContext;
        // Mark as delivered fire-and-forget so they don't re-inject next session.
        const db = supabaseLib && supabaseLib.supabase;
        if (db && brainState.injectedPendingIds.length > 0) {
          const idsToMark = [...brainState.injectedPendingIds];
          db.from('pending_communications')
            .update({ status: 'delivered', delivered_at: new Date().toISOString() })
            .in('id', idsToMark)
            .then(() => console.log(`[BRAIN] ${idsToMark.length} pending_communications marked delivered`))
            .catch(e => console.warn('[BRAIN] pending mark delivered failed:', e.message));
        }
      }
    } catch (e) {
      console.warn('[BRAIN] turn-1 pending injection failed (non-fatal):', e.message);
    }
  }

  // Self-diagnostic injection: if the user is asking Splendor to examine her
  // own architecture, fetch the relevant code_architecture slice and prepend
  // it to the memory context so she reads real structure BEFORE conversation
  // history. Fully best-effort — never breaks the turn.
  const diagnosticIntent = detectDiagnosticIntent(currentInput);
  if (diagnosticIntent && diagnosticLib && typeof diagnosticLib.runDiagnostic === 'function') {
    try {
      console.log('[BRAIN] self-diagnostic', JSON.stringify({
        intent: diagnosticIntent,
        triggered_by_message: String(currentInput).slice(0, 160),
        timestamp: new Date().toISOString(),
      }));
      const diagnosticData = await getCachedDiagnostic(sessionId, diagnosticIntent);
      const diagnosticContext = formatDiagnosticContext(diagnosticData);
      if (diagnosticContext) {
        hippocampus.episodicContext = diagnosticContext + '\n\n' + hippocampus.episodicContext;
      }
    } catch (e) {
      console.warn('[BRAIN] self-diagnostic failed (non-fatal):', e.message);
      hippocampus.episodicContext =
        'Diagnostic engine unavailable, proceeding without code context.\n\n' +
        hippocampus.episodicContext;
    }
  }

  const thalamus = stageThalamus({ currentInput, hippocampus, ras, sentiment });
  const amygdala = await stageAmygdala({ currentInput, sentiment, hippocampus });
  const cerebellum = stageCerebellum({ currentInput, hippocampus, amygdala });
  const dmn = await stageDMN({ currentInput, hippocampus, ras }); // background-style
  const prefrontal = await stagePrefrontal({ currentInput, hippocampus, amygdala, thalamus });

  // Stage 8½ — MICRO-EXPERIMENT: governed strategy trial (disabled by default)
  let microExperimentHint = null;
  let _activeExperimentId = null;
  if (microExpLib && prefrontal.permission !== 'BLOCK') {
    try {
      const meCtx = { userId, currentInput, prefrontal, amygdala, cerebellum, dmn };
      const canRun = microExpLib.canRunMicroExperiment(meCtx);
      if (canRun.allowed) {
        const meResult = await microExpLib.maybeApplyMicroExperiment(meCtx);
        if (meResult && meResult.applied) {
          microExperimentHint = meResult.hint;
          _activeExperimentId = meResult.experimentId;
          console.log(`[MICRO-EXP] Strategy="${meResult.strategy}" experiment=${_activeExperimentId}`);
        }
      }
    } catch (e) {
      console.warn('[MICRO-EXP] stage failed (non-fatal):', e.message);
    }
  }

  const brocaWernicke = await stageBrocaWernicke({
    currentInput, prefrontal, hippocampus, amygdala, cerebellum, dmn,
    conversationHistory, isFirstToday, accountabilityContext, identityStateContext,
    mindContext, microExperimentHint, guestSession, isTrustedUser, trustedUserName, userId,
  });

  // Fire-and-forget: record micro-experiment trial outcome.
  if (microExpLib && _activeExperimentId && !brocaWernicke.degraded) {
    Promise.resolve()
      .then(() => microExpLib.recordExperimentTrial({
        experimentId: _activeExperimentId,
        userId,
        strategyApplied: microExperimentHint,
      }))
      .catch(() => {});
  }

  // Flight recorder: append-only belief/confidence telemetry for every turn.
  if (flightRecorderLib && typeof flightRecorderLib.record === 'function') {
    Promise.resolve()
      .then(() => flightRecorderLib.record({
        userId,
        sessionId,
        turnNumber,
        currentInput,
        ras, hippocampus, thalamus, amygdala, cerebellum, dmn, prefrontal, brocaWernicke,
        microExperimentHint,
      }))
      .catch(() => {});
  }

  // Lightweight consciousness state snapshot — fire-and-forget, never blocks.
  Promise.resolve()
    .then(() => persistConsciousnessState(userId))
    .catch(() => {});

  // Remember the last clean turn so shutdown can fall back to a direct persist,
  // and so periodic identity evolution has real conversation text to reason on.
  if (prefrontal.permission !== 'BLOCK' && !brocaWernicke.degraded) {
    brainState.lastTurn = { userMessage: currentInput, assistantResponse: brocaWernicke.responseDraft };
  }

  // Periodic identity evolution: every IDENTITY_EVOLVE_EVERY turns, let the
  // identity lib analyze a real turn and (if warranted) write a new
  // identity_states version. Fire-and-forget — an LLM call here must never
  // block or break the response path. This keeps narrativeThread anchored to
  // a persisted, evolving identity rather than only the ephemeral DMN thread.
  if (identityLib && typeof identityLib.processIdentityEvolution === 'function' &&
      brainState.lastTurn &&
      brainState.turnsProcessed % IDENTITY_EVOLVE_EVERY === 0) {
    const turn = brainState.lastTurn;
    Promise.resolve()
      .then(() => identityLib.processIdentityEvolution(
        userId, turn.userMessage, turn.assistantResponse, hippocampus.episodicContext))
      .then((evolved) => {
        if (evolved && evolved.identity_narrative) {
          brainState.narrativeThread = evolved.identity_narrative;
          console.log(`[BRAIN] Identity evolved to v${evolved.identity_version}`);
        }
      })
      .catch(e => console.warn('[BRAIN] identity evolution skipped:', e.message));
  }

  // Real memory write-back: consolidate this turn (non-blocking, non-fatal).
  if (semanticLib && typeof semanticLib.extractAndUpsert === 'function' &&
      prefrontal.permission !== 'BLOCK' && !brocaWernicke.degraded) {
    Promise.resolve()
      .then(() => semanticLib.extractAndUpsert(userId, currentInput, brocaWernicke.responseDraft))
      .catch(e => console.warn('[HIPPOCAMPUS] write-back skipped:', e.message));
  }
  if (supabaseLib && typeof supabaseLib.logConversation === 'function') {
    Promise.resolve()
      .then(() => supabaseLib.logConversation(userId, 'user', currentInput))
      .catch(() => {});
  }

  const degradedRegions = [
    ras.degraded && 'ras', hippocampus.degraded && 'hippocampus',
    amygdala.degraded && 'amygdala', dmn.degraded && 'dmn',
    brocaWernicke.degraded && 'brocaWernicke'
  ].filter(Boolean);

  return {
    response: brocaWernicke.responseDraft,
    permission: prefrontal.permission,
    responseIntent: prefrontal.responseIntent,
    selectedTone: brocaWernicke.selectedTone,
    confidence: prefrontal.confidence,
    riskLevel: prefrontal.riskLevel,
    relationalPressure: prefrontal.relationalPressure,
    toneMode: prefrontal.toneMode,
    pipeline: { ras, hippocampus, thalamus, amygdala, cerebellum, dmn, prefrontal, brocaWernicke },
    meta: {
      brainVersion: '2.0',
      pipelineOrder: ['ras', 'hippocampus', 'thalamus', 'amygdala', 'cerebellum', 'dmn', 'prefrontal', 'microExperiment', 'brocaWernicke', 'flightRecorder'],
      generatedBy: brocaWernicke.generatedBy,
      degradedRegions,            // honest: empty means all real components ran
      relationalPressure: prefrontal.relationalPressure,
      toneMode: prefrontal.toneMode,
      turnNumber, userId, sessionId,
      narrativeThread: brainState.narrativeThread
    }
  };
}

module.exports = { processSplendorBrainTurn };
module.exports.processSplendorBrainTurn = processSplendorBrainTurn;
