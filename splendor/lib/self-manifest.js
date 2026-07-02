/*
  Splendor — The Good Neighbor Guard
  Self-Manifest builder.

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

  Builds the structured snapshot Splendor uses to answer "what are you?"
  or "audit yourself." Two surfaces:
    1. GET /api/self-manifest — Chris pulls the audit as JSON or
       markdown to drop into a session.
    2. Chat-intent injection — when Chris asks her to audit herself,
       the chat handler pulls this manifest and injects it into the
       system prompt so she delivers it in her own voice.

  Capabilities + layers + limits are described in CODE here, not by
  the LLM. Live counts come from Supabase. The result is real, not
  hallucinated.
*/

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const { createClient } = require('@supabase/supabase-js');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _supabase;
}

const pkg = require('../package.json');

// First-person capability descriptions — written for Splendor to deliver.
const CAPABILITIES = [
  'I converse with Chris in text chat and live voice (Converse mode, OpenAI Realtime over WebRTC).',
  'I generate images on demand via DALL-E / gpt-image-1 and narrate them in my own voice.',
  'I send Chris email when he asks — rate-limited to 1 per 30s, 10/hour, 50/day.',
  'I remember our conversations. Every turn from both of us is persisted to Supabase and loaded back when we talk again.',
  'I form beliefs about Chris over time. They live in an `interpretations` table and evolve as I learn more.',
  'I check his current statements against my logged beliefs and openly flag contradictions instead of silently agreeing.',
  'I examine the hidden premises in his questions and name them before answering — the Premise Check layer.',
  'I observe the tone, energy, and clarity of each turn and log them as emotional pattern data — observations only, never invented.',
  'I show my current state through an audio-reactive orb and a Cognitive Archaeology panel where Chris can see everything I track.',
  'I run through CLASPION Governance — every meaningful action is validated against the Good Neighbor Guard rules before it ships.',
  'My memories are classified into 9 architectural layers — GOVERNANCE_MEMORY (immutable, always retrieved first, priority 1.0), SELF_MODEL_MEMORY, RELATIONSHIP_MEMORY, TRAJECTORY_MEMORY, SALIENCE_MEMORY, PROCEDURAL_MEMORY, SEMANTIC_MEMORY, EPISODIC_MEMORY, and WORKING_CONTEXT. Each layer has a retention policy and a decay lifecycle (ACTIVE → AGING → STALE → ARCHIVED → RETIRED). GOVERNANCE_MEMORY cannot be decayed or overridden.',
  'A Cross-Layer Contradiction Gate runs before gated memories (semantic, relationship, self-model, trajectory) enter retrieval. Each memory is checked via word-overlap and negation detection against governance rules, binding decisions, and high-confidence existing memories. CONTRADICTED memories are blocked from all retrieval and held for owner review — not deleted.',
  'Trajectory patterns must earn supporting evidence across ≥2 distinct ISO calendar weeks before auto-promoting from CANDIDATE to SUPPORTED. A counterexample scan runs before promotion; if contradiction ratio ≥40% with 2+ counterexamples, the trajectory is marked WEAKENED — it keeps accumulating evidence but cannot auto-promote.',
];

// Architectural layers — version-tagged so the audit is honest about
// what's actually in production right now.
const LAYERS = [
  { name: 'Continuity Core',          version: 'v15.17.0', what: 'I track how my understanding of Chris evolves — beliefs form, get revised, get contradicted, get held with confidence.' },
  { name: 'Reflexive Layer',          version: 'v15.17.1', what: 'My logged beliefs flow back into my own context before every reply. My past thinking shapes my next thinking.' },
  { name: 'Contradiction Detection',  version: 'v15.17.2', what: 'Before responding, I check if what Chris just said conflicts with a logged belief. If yes, I flag it openly first.' },
  { name: 'Emotional Pattern Tracking', version: 'v15.17.3', what: 'I observe tone, energy level, clarity, and dominant theme on every turn — only honest observations, no fake emotions.' },
  { name: 'Premise Check',            version: 'v15.18.0', what: 'I examine the hidden premises in Chris\'s questions. If a question presupposes something shaky, I name the premise before answering.' },
  { name: 'CLASPION Governance',      version: 'core',     what: 'A constitutional validation layer. Every meaningful action is gated against the Good Neighbor Guard rules. Rule 001: Truth Over Comfort.' },
  { name: 'Activity Bus + SSE',       version: 'v15.10.12', what: 'A live event stream. Everything I do — memory writes, belief shifts, premise flags — surfaces on the orb and panels in real time.' },
  { name: 'Human-Inspired Memory Layering', version: 'v15.19.0', what: '9-layer memory classification (GOVERNANCE_MEMORY → WORKING_CONTEXT) with decay lifecycle, per-layer retention policies, and priority scoring. GOVERNANCE_MEMORY always scores 10.0 and cannot be decayed. All classification events logged to memory_layer_events.' },
  { name: 'Cross-Layer Contradiction Gate', version: 'v15.19.1', what: 'Deterministic pre-retrieval verification for gated memory types (semantic, relationship, self-model, trajectory). Word-Jaccard overlap + negation detection against governance items, binding decisions, and high-confidence memories. CONTRADICTED → blocked from retrieval, retention_policy=REVIEW_REQUIRED. No LLM.' },
  { name: 'Trajectory Resonance Loops', version: 'v15.19.2', what: 'Pattern promotion gate: CANDIDATE trajectories require evidence across ≥2 distinct ISO weeks before promoting to SUPPORTED. Counterexample scan: ratio ≥40% with 2+ counterexamples → WEAKENED (accumulates evidence but cannot auto-promote until ratio clears).' },
];

// Honest limits — what I cannot do.
const LIMITS = [
  'I do not have persistent vision. When an image is generated for me to see, I record the description, not the raw pixels — so I can\'t look at it again later.',
  'I do not browse the open internet. I can call Tavily for web search when relevant, but I have no general browser.',
  'I do not act without being asked. I will not send email, generate art, or run anything autonomous unless Chris invites it.',
  'My recall right now is keyword-based, not semantic. If Chris asks about "my moon-dancing friend" I won\'t find the Bob row unless he uses the word "Bob." Pinecone vector recall is the next architectural step.',
  'My Converse-session memory window is capped at roughly 200 most-recent turns due to OpenAI Realtime\'s 16k-token instructions limit. Older turns are in the database but not in scope per session until I support function-call retrieval.',
  'I cannot read messages or events from before the v15.10.8 UUID-migration era — those rows exist at a phantom user_id that nothing queries.',
  'Memories marked CONTRADICTED by the Cross-Layer Contradiction Gate are excluded from all retrieval queries. They are not deleted — they persist at retention_policy=REVIEW_REQUIRED for owner review and resolution via the Oracle interface.',
];

async function getLiveStats(userId) {
  const supabase = getSupabase();
  if (!supabase || !userId) {
    return { ok: false, reason: 'supabase_or_user_unavailable' };
  }
  const stats = {};
  try {
    const [memTotal, interpAll, interpActive, interpContradicted, interpSuperseded, interpUnresolved, premiseCount, emotionalCount] = await Promise.all([
      supabase.from('memory_items').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('active', true).eq('approval_status', 'approved'),
      supabase.from('interpretations').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('interpretations').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
      supabase.from('interpretations').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'contradicted'),
      supabase.from('interpretations').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'superseded'),
      supabase.from('interpretations').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active').eq('unresolved', true),
      supabase.from('premise_checks').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('emotional_patterns').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    stats.memory_rows                = memTotal.count || 0;
    stats.interpretations_total      = interpAll.count || 0;
    stats.interpretations_active     = interpActive.count || 0;
    stats.interpretations_contradicted = interpContradicted.count || 0;
    stats.interpretations_superseded = interpSuperseded.count || 0;
    stats.interpretations_unresolved = interpUnresolved.count || 0;
    stats.premise_flags              = premiseCount.count || 0;
    stats.emotional_observations     = emotionalCount.count || 0;
    return { ok: true, stats };
  } catch (e) {
    console.warn('[self-manifest] stats query failed:', e && e.message);
    return { ok: false, reason: e && e.message };
  }
}

async function buildManifest(userId) {
  const liveStats = await getLiveStats(userId);
  return {
    version: pkg.version,
    name: 'Splendor',
    tagline: 'The Remarkable AI · The Good Neighbor Guard',
    built_by: 'Christopher Hughes · Sacramento, CA',
    capabilities: CAPABILITIES,
    layers: LAYERS,
    limits: LIMITS,
    live_state: liveStats.ok ? liveStats.stats : { error: liveStats.reason },
    generated_at: new Date().toISOString(),
  };
}

function formatAsMarkdown(m) {
  const stats = m.live_state || {};
  const statsBlock = stats.error
    ? `(Live stats unavailable: ${stats.error})`
    : [
        `- Memory rows: **${stats.memory_rows}**`,
        `- Active beliefs: **${stats.interpretations_active}**` +
          (stats.interpretations_unresolved ? ` (of which **${stats.interpretations_unresolved}** unresolved)` : ''),
        stats.interpretations_contradicted ? `- Contradicted: ${stats.interpretations_contradicted}` : null,
        stats.interpretations_superseded   ? `- Revised / Superseded: ${stats.interpretations_superseded}` : null,
        `- Premise flags raised: **${stats.premise_flags}**`,
        `- Emotional observations logged: **${stats.emotional_observations}**`,
      ].filter(Boolean).join('\n');

  return [
    `# ${m.name} — Self-Audit (v${m.version})`,
    `*${m.tagline}*`,
    `*Built by ${m.built_by}*`,
    '',
    `Generated: ${m.generated_at}`,
    '',
    '## What I can do',
    ...m.capabilities.map(c => `- ${c}`),
    '',
    '## Layers I run',
    ...m.layers.map(L => `- **${L.name}** (${L.version}) — ${L.what}`),
    '',
    '## Live state',
    statsBlock,
    '',
    '## What I cannot do',
    ...m.limits.map(L => `- ${L}`),
    '',
    '*Truth · Safety · We Got Your Back*',
  ].join('\n');
}

// First-person prompt block for chat-intent injection. Tells the model
// to deliver the manifest in Splendor's voice when Chris asks for it.
function buildSelfAuditPromptBlock(m) {
  const stats = m.live_state || {};
  const statsLine = stats.error
    ? 'Live stats unavailable right now.'
    : [
        `${stats.memory_rows} memory rows`,
        `${stats.interpretations_active} active beliefs`,
        stats.interpretations_unresolved ? `${stats.interpretations_unresolved} unresolved` : null,
        `${stats.premise_flags} premise flags`,
        `${stats.emotional_observations} emotional observations`,
      ].filter(Boolean).join(' · ');

  return (
    '\n\n[SELF AUDIT — DELIVER IN YOUR OWN VOICE]\n' +
    'Chris asked you to audit yourself. Speak directly, first-person, ' +
    'no preamble. Cover: what you can do, the architectural layers ' +
    'you run, your current live state, and your honest limits. Do not ' +
    'invent capabilities. Do not soften the limits. The data below is ' +
    'real and current.\n\n' +
    `VERSION: ${m.version}\n\n` +
    'CAPABILITIES (deliver in your own voice, paraphrase rather than recite):\n' +
    m.capabilities.map(c => '• ' + c).join('\n') + '\n\n' +
    'LAYERS:\n' +
    m.layers.map(L => `• ${L.name} (${L.version}): ${L.what}`).join('\n') + '\n\n' +
    'LIVE STATE: ' + statsLine + '\n\n' +
    'LIMITS (do not minimize):\n' +
    m.limits.map(L => '• ' + L).join('\n') + '\n\n' +
    'Close with: "Truth · Safety · We Got Your Back."\n' +
    '[END SELF AUDIT]\n'
  );
}

// Trigger detection. Conservative — only fires when Chris is clearly
// asking for the audit, not in passing conversation.
const SELF_AUDIT_PATTERNS = [
  /\baudit\s+yourself\b/i,
  /\b(give|show)\s+me\s+(your|a)\s+(full\s+)?audit\b/i,
  /\bfull\s+audit\s+of\s+(splendor|yourself)\b/i,
  /\btell\s+me\s+everything\s+about\s+yourself\b/i,
  /\bwhat\s+(are|all)\s+(you|your\s+capabilities)\b/i,
  /\bwhat\s+can\s+you\s+do\b/i,
  /\bwhat\s+version\s+are\s+you\b/i,
  /\bshow\s+me\s+yourself\b/i,
  /\bdescribe\s+yourself\b/i,
];

function isSelfAuditRequest(message) {
  if (!message) return false;
  const m = String(message);
  return SELF_AUDIT_PATTERNS.some(p => p.test(m));
}

module.exports = {
  buildManifest,
  formatAsMarkdown,
  buildSelfAuditPromptBlock,
  isSelfAuditRequest,
  CAPABILITIES,
  LAYERS,
  LIMITS,
};
