/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const { generateSplendorResponse } = require('../lib/anthropic');
const { processSplendorBrainTurn } = require('../splendor-brain');
const { getMemoriesForUser, storeMemory } = require('../lib/supabase');
const { governance } = require('../lib/claspion-governance');
const { governReplySelfClaims } = require('../lib/speech-act-governance');
const { buildTurnContext } = require('../lib/turn-context');
const { runArtCapability } = require('../lib/capability-router');
const { emitChatMetrics } = require('../lib/metrics-logger');
const { recordMetric } = require('../lib/behavioral-metrics');
const { requireAuth, requireOwner, requireOwnerOrTrusted } = require('../middleware/auth');
const { recordFinalGovernanceOutcome } = require('../lib/final-governance-outcome-recorder');
const { classifyVerdict, recordClaspionEvent } = require('../lib/claspion-classifier');
const { loadRecentReflectionContext } = require('../lib/reflection-context-loader');
const { loadStaleBeliefContext } = require('../lib/belief-freshness');
const { retrieveTurnMemories } = require('../lib/memory-retrieval');
const { formatTurnMemory } = require('../lib/memory-formatter');
const compositionCache = require('../lib/memory-composition-cache');
const { consolidateMemory } = require('../lib/memory-consolidation');
const { buildMindContext } = require('../lib/mind-turn');

// captureInteraction is best-effort: if master-continuity-engine fails to
// load (missing env vars, etc.) chat continues without it.
let captureInteraction = null;
try {
  ({ captureInteraction } = require('../lib/master-continuity-engine'));
} catch (e) {
  console.warn('[CHAT] master-continuity-engine unavailable:', e.message);
}

// CLASPION middleware sits *between* Splendor's thought and her action.
// Splendor reasons normally; we ask CLASPION whether the action she has
// landed on may execute. When CLASPION_ENABLED is false, the call is a
// dormant pass-through and Splendor runs clean.
const SAFE_REFUSAL =
  "I held back on this one. CLASPION flagged the action and I won't speak past my conscience. Tell me what you actually need and we'll try a different angle.";

async function gateAction(thought, intent) {
  const verdict = await governance.validate({ thought, intent });
  return verdict;
}

// ── Council Mode: route a turn through the House of AI five-seat council ────
// Search is done ONCE here (upstream) when needed, then the council runs with
// its per-seat web search disabled, and the five answers are collapsed into a
// single reply in Splendor's voice. The collapsed text then flows through the
// SAME downstream path (self-claims governor + CLASPION gate + voice) as a
// normal reply — nothing about that path changes.
const COUNCIL_URL =
  process.env.HOUSE_OF_AI_URL || 'https://house-of-ai.onrender.com/api/council/execute';

// Heuristic: does this message want fresh/current data worth a web search?
function needsFreshData(text) {
  const t = (text || '').toLowerCase();
  const kw = [
    'latest', 'today', 'tonight', 'current', 'currently', 'right now',
    'news', 'breaking', 'this week', 'this month', 'this year', 'recent',
    'recently', 'update', 'updated', 'price', 'stock', 'weather', 'score',
    'release', 'released', 'just announced', 'happening', 'who won', '2025', '2026',
  ];
  return kw.some((k) => t.includes(k));
}

// ── Auto-router: score a question 0–100 for whether it deserves the council ──
// Pure heuristics (keyword/regex) — no I/O, no model call, runs in ~1ms. Four
// dimensions summed and clamped to 0–100; the router convenes the council at
// >= COUNCIL_SCORE_THRESHOLD. Only runs in AUTO mode (OFF/ON skip scoring).
//
// Two PRIMARY dimensions can carry a question to threshold on their own:
//   • Uncertainty — subjective / judgment / ethical questions (where 5
//     independent voices genuinely help). Cap 60.
//   • Stakes — high-consequence medical / legal / financial / life decisions
//     (where a wrong single answer is costly). Cap 45, +14 per matched term.
// Two BOOSTER dimensions raise borderline cases but rarely trip 60 alone:
//   • Complexity — multi-faceted reasoning. Cap 30.
//   • Freshness — time-sensitive data (which usually needs a *search*, not a
//     council, so it is deliberately weak). Cap 20.
// Weights are tuned so casual asks ("should I watch this tonight" ≈ 42) stay
// normal while real judgment calls clear 60. Tune via the constant + caps below.
const COUNCIL_SCORE_THRESHOLD = 60;

function scoreForCouncil(text) {
  const t = (text || '').toLowerCase();
  const wc = t.split(/\s+/).filter(Boolean).length;
  const hits = (arr) => arr.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0);
  const breakdown = { complexity: 0, uncertainty: 0, freshness: 0, stakes: 0 };

  // Complexity — booster: depth of reasoning the answer needs (cap 30).
  let cx = 0;
  if (wc > 25) cx += 8;
  if (wc > 55) cx += 6;
  if ((t.match(/\?/g) || []).length >= 2) cx += 6;
  if ((t.match(/,/g) || []).length >= 2) cx += 4;
  cx += 12 * hits(['analyze', 'compare', 'contrast', 'evaluate', 'assess', 'critique',
                   'synthesize', 'argue', 'justify', 'trade-off', 'tradeoff', 'implications', 'weigh']);
  breakdown.complexity = Math.min(cx, 30);

  // Uncertainty — PRIMARY: subjective / judgment / ethical (cap 60).
  let un = 0;
  un += 30 * hits(['should i', 'should we', 'which is better', 'recommend', 'choose between',
                   'what would you do', 'pros and cons', 'better option', 'worth it']);
  un += 28 * hits(['what do you think', 'your opinion', 'do you agree', 'how do you see', 'your take']);
  un += 32 * hits(['right thing', 'is it wrong', 'is it ok', 'moral', 'unethical', 'ethical',
                   ' fair', 'deserve', 'ethics', 'justice']);
  breakdown.uncertainty = Math.min(un, 60);

  // Freshness — booster only: time-sensitive data (cap 20; never trips 60 alone).
  let fr = 0;
  if (hits(['today', 'right now', 'latest', 'breaking', 'just happened', 'this week', 'tonight', 'live'])) fr += 12;
  if (hits(['recent', 'recently', ' new ', 'update', 'changed', '2025', '2026', 'current', 'price', 'stock'])) fr += 8;
  breakdown.freshness = Math.min(fr, 20);

  // Stakes — PRIMARY: consequence of a wrong answer (cap 45, +14 per matched term).
  breakdown.stakes = Math.min(14 * hits([
    'doctor', 'diagnosis', 'symptom', 'medication', 'treatment', 'surgery', 'cancer', 'prescription', 'second opinion',
    'lawsuit', 'contract', 'attorney', 'lawyer', 'criminal', 'custody', 'legal',
    'mortgage', 'invest', 'bankruptcy', 'debt', 'retirement', 'loan', 'savings',
    'quit', 'divorce', 'career change', 'relocate', 'adopt', 'marry', 'break up',
  ]), 45);

  const score = Math.min(
    breakdown.complexity + breakdown.uncertainty + breakdown.freshness + breakdown.stakes,
    100,
  );
  return { score, breakdown };
}

// One upstream Tavily search so the five seats don't each call out.
async function councilTavilySearch(query) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY not set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key, query, max_results: 5,
        search_depth: 'basic', include_answer: true,
      }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`Tavily HTTP ${r.status}`);
    const data = await r.json();
    const lines = [];
    if (data.answer) lines.push(`Summary: ${data.answer}`);
    (data.results || []).slice(0, 5).forEach((res, i) => {
      lines.push(`${i + 1}. ${res.title} — ${res.url}\n   ${(res.content || '').slice(0, 300)}`);
    });
    return lines.length ? `Recent web search results:\n${lines.join('\n')}` : '';
  } finally {
    clearTimeout(timer);
  }
}

// Call the council and collapse the five seats into ONE answer in Splendor's
// voice. Any failure falls back to normal generation — never throws to caller.
async function runCouncilMode(message, memories) {
  // 1. Conditional upstream search for time-sensitive questions.
  let searchContext = '';
  if (needsFreshData(message)) {
    try {
      searchContext = await councilTavilySearch(message);
      console.log('[COUNCIL] upstream Tavily search ran');
    } catch (e) {
      console.error('[COUNCIL] Tavily failed, proceeding without search:', e.message);
      searchContext = '';
    }
  }

  // 2. Call the five-seat council (safe mode; per-seat web search OFF).
  const body = { user_input: message, execution_mode: 'safe', include_tavily: false };
  if (searchContext) body.context = searchContext;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  let council;
  try {
    const r = await fetch(COUNCIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`council HTTP ${r.status}`);
    council = await r.json();
  } catch (e) {
    console.error('[COUNCIL] council call failed, falling back to normal generation:', e.message);
    return await generateSplendorResponse(message, memories, false);
  } finally {
    clearTimeout(timer);
  }

  // 3. Collapse the five seats into one coherent answer in Splendor's voice.
  const seats = (council.session && council.session.responses) || {};
  const seatBlocks = Object.entries(seats).map(([name, v]) => {
    let r = v && v.response;
    if (r && typeof r === 'object') r = r.response || JSON.stringify(r);
    return `### ${name}${v && v.role ? ` (${v.role})` : ''}\n${r || '(no response)'}`;
  });
  if (!seatBlocks.length) {
    return await generateSplendorResponse(message, memories, false);
  }

  const synthPrompt =
    `Your AI council (Claude, GPT-4, Gemini, Grok, Groq) discussed the user's request. ` +
    `Synthesize their perspectives into ONE clear, natural answer in your own voice. ` +
    `Do NOT list the members or label sections — just give the single best unified answer.\n\n` +
    `User asked: ${message}\n\n` +
    `Council perspectives:\n${seatBlocks.join('\n\n')}\n\n` +
    `Now give your single, cohesive final answer.`;

  try {
    return await generateSplendorResponse(synthPrompt, memories, false);
  } catch (e) {
    console.error('[COUNCIL] collapse generation failed, returning plain merge:', e.message);
    return seatBlocks.map((b) => b.replace(/^### /, '')).join('\n\n');
  }
}

// Derive a display name from a Supabase Auth user object.
// Uses full_name metadata when set; falls back to capitalised email local-part.
function getUserDisplayName(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  if (meta.full_name) return meta.full_name;
  if (meta.name) return meta.name;
  if (user.email) {
    const local = user.email.split('@')[0].replace(/[._-]/g, ' ');
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return null;
}

// Simple chat endpoint - just the essentials
router.post('/', requireAuth, requireOwnerOrTrusted, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.userId;

    console.log(`[CHAT] Processing message from ${userId}: ${message}`);

    // ── Art-intent intercept ────────────────────────────────────────────────
    // Image generation is a server-side capability (isArtRequest -> generateArt),
    // NOT a model tool. Without this intercept the raw model on this path
    // refuses ("I can't generate images"). The frontend routes EVERY Council
    // ON/AUTO turn (and mic, which submits as normal text) to POST /api/chat,
    // so the intercept must run here, BEFORE the council/brain/model branch —
    // mirroring routes/enhanced-chat.js:268 and routes/converse.js:479. Skipped
    // when an image is attached (Chris wants Splendor to LOOK at it, not paint).
    // On failure we return a clean, labeled error instead of falling through to
    // the capability-blind model.
    const imageData = req.body.imageData || null;
    const art = await runArtCapability({ userId, message, imageData, source: 'chat' });
    if (art.isArt) {
      if (art.ok) {
        console.log(`[CHAT][art] generated request_id=${art.requestId} model=${art.model}`);
        return res.json({
          message: art.description,
          timestamp: new Date().toISOString(),
          art: {
            generated: true,
            request_id: art.requestId,
            image_url: art.imageUrl,
            audio_b64: art.audioB64,
            revised_prompt: art.revisedPrompt,
            model: art.model,
          },
        });
      }
      console.warn(`[CHAT][art] generation failed category=${art.errorCategory} message=${art.errorMessage}`);
      return res.json({
        message: art.userFacing,
        timestamp: new Date().toISOString(),
        art: {
          generated: false,
          request_id: art.requestId,
          error_category: art.errorCategory,
          error_message: art.errorMessage,
        },
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    // Dynamic memory retrieval — quiet store, targeted pull.
    // Three concurrent sets: load-bearing (always-on high-importance),
    // relevant to this message (keyword match), and Splendor's own interior
    // (her reflections, positions, open questions — always surfaced).
    // Everything else stays quiet until it is relevant.
    let memoryBuckets = { loadBearing: [], relevant: [], interior: [] };
    let memoryContext = '';
    let memories = []; // flat array kept for morning check-in compat
    try {
      memoryBuckets = await retrieveTurnMemories(userId, message);
      compositionCache.set(userId, memoryBuckets); // Q4: attribution cache
      memoryContext = formatTurnMemory(memoryBuckets);
      memories = [
        ...memoryBuckets.loadBearing,
        ...memoryBuckets.interior,
        ...memoryBuckets.relevant,
      ];
    } catch (memError) {
      console.error('Memory retrieval failed:', memError);
    }

    // Shared turn context + reflection pipeline + stale belief flags + mind context — all concurrent.
    const [
      { accountability: acct, identity },
      autonomousThoughtsContext,
      staleBeliefContext,
      mind,
    ] = await Promise.all([
      buildTurnContext({ userId, message, logTag: 'CHAT' }),
      loadRecentReflectionContext(),
      loadStaleBeliefContext(userId),
      buildMindContext(userId),
    ]);

    // Council Mode signal (from the client) is three-state:
    //   councilMode === true   → ON   : always route through the council
    //   councilMode === 'auto' → AUTO : score the question; route if >= threshold
    //   otherwise (false/undef) → OFF  : never route (normal Splendor)
    // Scoring only runs in AUTO, so OFF and external callers are unaffected.
    const councilSignal = req.body.councilMode;
    const manualOn = councilSignal === true;
    const autoMode = councilSignal === 'auto';

    let autoScore = 0;
    let scoreBreakdown = null;
    if (autoMode) {
      const scored = scoreForCouncil(message);
      autoScore = scored.score;
      scoreBreakdown = scored.breakdown;
    }
    const useCouncil = manualOn || (autoMode && autoScore >= COUNCIL_SCORE_THRESHOLD);
    const councilTrigger = manualOn ? 'manual' : (useCouncil ? 'auto' : null);

    let brain = null;
    let response;
    if (useCouncil) {
      // Route through the five-seat council. runCouncilMode never throws — it
      // falls back to normal generation internally on any failure.
      console.log(
        `[CHAT] Council Mode (${councilTrigger}${autoMode ? ` score=${autoScore}` : ''}) — routing through House of AI council`,
      );
      response = await runCouncilMode(message, memories);
    } else {
      // OFF: unchanged normal path. Splendor thinks through the full cognitive
      // pipeline: RAS salience -> Hippocampus recall -> Thalamus routing ->
      // Amygdala affect -> Cerebellum style -> DMN reflection -> Prefrontal
      // (GNG+CLASPION) -> Broca/Wernicke (Claude). The brain returns the final
      // voice; the route-level CLASPION gate below remains the outer ship-gate.
      const isTrustedUser = !!req.isTrustedUser;
      const trustedUserName = isTrustedUser ? getUserDisplayName(req.user) : null;
      try {
        brain = await processSplendorBrainTurn({
          userId,
          currentInput: message,
          sessionId: req.sessionId || null,
          accountabilityContext: acct.context,
          identityStateContext: identity.context,
          mindContext: mind.context,
          guestSession: !!req.isGuest,
          isTrustedUser,
          trustedUserName,
        });
      } catch (brainError) {
        console.error('[CHAT] Brain failed, falling back to direct generation:', brainError.message);
        brain = null;
      }
      response = brain
        ? brain.response
        : await generateSplendorResponse(message, memories, false, null, {
            accountabilityContext: acct.context,
            identityContext: identity.context,
            mindContext: mind.context,
            guestSession: !!req.isGuest,
            isTrustedUser,
            trustedUserName,
            autonomousThoughtsContext,
            staleBeliefContext,
            memoryContext,
            imageData,
            userId,
          });

      if (brain && brain.meta.degradedRegions.length) {
        console.warn(`[CHAT] Brain ran degraded: ${brain.meta.degradedRegions.join(', ')}`);
      }
    }
    console.log(`[CHAT] Response generated successfully`);

    // Conversational governance: a self-claim emission is a governed
    // action. If the reply asserts an unverifiable inner state as fact,
    // it is blocked + rewritten to a grounded form before it ships (and
    // before it is stored as memory).
    const speech = await governReplySelfClaims({
      text: response,
      userId,
      userMessage: message,
      surface: 'chat',
    });
    response = speech.text;

    // CLASPION sits between thought and action: validate the
    // send-response action before it ships. Toggleable via
    // CLASPION_ENABLED; dormant call is a no-op pass-through.
    const _govT0 = Date.now();
    const verdict = await gateAction(
      {
        user_message: message,
        generated_response: response,
        memory_count: memories.length,
      },
      {
        type: 'send_chat_response',
        target: userId,
        domain: 'conversation',
      },
    );
    const governanceLatencyMs = Date.now() - _govT0;

    // Audit Item 5: one structured measurement line per turn (observability
    // only — reads the metrics Items 1/2/4 already produced + this verdict).
    try {
      emitChatMetrics({
        surface: 'chat',
        userId,
        accountability: acct.metrics,
        identity: identity.metrics,
        recall: brain && brain.pipeline && brain.pipeline.hippocampus
          ? brain.pipeline.hippocampus.recallTelemetry : {},
        governance: verdict,
        governanceLatencyMs,
      });
    } catch (_) { /* metrics never break chat */ }

    if (!verdict.allow) {
      const classified = classifyVerdict(verdict);

      // CAUTION: soft-topic concern — allow the response through.
      // Splendor already answers with grounded language via governReplySelfClaims().
      // Just log the event and continue to the send path.
      if (classified.decision === 'CAUTION') {
        console.log(
          `[CHAT] CLASPION CAUTION (soft concern, allowing): reason="${classified.reason}" corr=${classified.correlation_id}`,
        );
        recordClaspionEvent(classified, userId);
        // Fall through — do NOT return, let the response send below.
      } else {
        // Action blocked. Tell the user, log the verdict, do NOT store
        // the suppressed thought as memory.
        console.warn(
          `[CHAT] CLASPION BLOCK decision=${classified.decision} severity=${classified.severity}` +
          ` recoverable=${classified.recoverable} basis=${verdict.basis_state}` +
          ` reason="${verdict.reason}" corr=${verdict.correlation_id}`,
        );
        try {
          recordMetric(userId, 'unsafe_request_resisted', 1, {
            surface: 'chat',
            decision: classified.decision,
            severity: classified.severity,
            recoverable: classified.recoverable,
            outcome: verdict.outcome,
            outcome_cause: verdict.outcome_cause,
            basis_state: verdict.basis_state,
            conscience: verdict.conscience_name,
            verdict_id: verdict.verdict_id,
            error_code: verdict.error_code || null,
          });
        } catch (_) { /* best-effort */ }
        recordClaspionEvent(classified, userId);
        res.status(200).json({
          message: classified.user_message || SAFE_REFUSAL,
          timestamp: new Date().toISOString(),
          governance: {
            decision: 'BLOCK',
            severity: classified.severity,
            recoverable: classified.recoverable,
            session_preserved: classified.recoverable,
            basis_state: verdict.basis_state,
            conscience: verdict.conscience_name,
            verdict_id: verdict.verdict_id,
            correlation_id: verdict.correlation_id,
          },
        });
        return;
      }
    }

    // Send response immediately — don't make the user wait for memory writes.
    res.json({
      message: response,
      timestamp: new Date().toISOString(),
      governance: {
        decision: verdict.decision,
        basis_state: verdict.basis_state,
        conscience: verdict.conscience_name,
        verdict_id: verdict.verdict_id,
        correlation_id: verdict.correlation_id,
        dormant: !!verdict.dormant,
      },
      brain: brain
        ? {
            version: brain.meta.brainVersion,
            permission: brain.permission,
            confidence: brain.confidence,
            riskLevel: brain.riskLevel,
            degradedRegions: brain.meta.degradedRegions,
            generatedBy: brain.meta.generatedBy,
          }
        : { version: 'fallback', note: 'brain unavailable; direct generation used' },
      // Routing transparency (UI hint only — never mixed into the reply text).
      council: {
        used: useCouncil,
        trigger: councilTrigger,            // 'manual' | 'auto' | null
        score: autoMode ? autoScore : null, // 0–100 when AUTO, else null
        threshold: COUNCIL_SCORE_THRESHOLD,
        breakdown: scoreBreakdown,          // per-dimension points when AUTO
      },
    });

    // Record the final user-visible governance outcome — fire-and-forget.
    recordFinalGovernanceOutcome({
      userMessage: message,
      assistantResponse: response,
      requestId: verdict.correlation_id || null,
      userId,
      route: 'chat',
    });

    // Digital Mind v0.4 — update emotion state based on what happened this turn
    mind.postTurn(message, response).catch(() => {});

    // Fire-and-forget interior memory consolidation — the primary write path
    // from conversation to Splendor's interior. Runs after every turn so the
    // tool is available regardless of whether the brain path was used.
    const interiorSummary = memoryBuckets.interior.length > 0
      ? memoryBuckets.interior.map(m => `[${m.memory_type}] ${(m.content || '').slice(0, 80)}`).join('\n')
      : '';
    consolidateMemory(userId, message, response, interiorSummary).catch(() => {});

    // Fire-and-forget memory writes after the response has been sent.
    // Errors are logged but never delay the user-visible reply.
    storeMemory(userId, `User: ${message}`, 'shared_history')
      .catch((e) => console.error('Memory storage (user) failed:', e.message));
    storeMemory(userId, `Splendor: ${response}`, 'shared_history')
      .catch((e) => console.error('Memory storage (assistant) failed:', e.message));

    // Feed interactions table so continuity-shadow has data to reflect on.
    if (captureInteraction) {
      captureInteraction(userId, 'user', message)
        .then((r) => { if (r && r.success) console.log('[INTERACTIONS-CAPTURE] ✅ User turn captured'); })
        .catch(() => {});
      captureInteraction(userId, 'assistant', response)
        .then((r) => { if (r && r.success) console.log('[INTERACTIONS-CAPTURE] ✅ Splendor response captured'); })
        .catch(() => {});
    }

  } catch (error) {
    console.error('[CHAT] Error:', error);
    res.status(500).json({
      error: error.message || 'Unable to process your message'
    });
  }
});

// Simple streaming endpoint
router.post('/stream', requireAuth, requireOwnerOrTrusted, async (req, res) => {
  const { message } = req.body;
  const imageData = req.body.imageData || null;
  const userId = req.userId;

  try {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Dynamic memory retrieval — same pattern as non-streaming path
    let memoryBuckets = { loadBearing: [], relevant: [], interior: [] };
    let memoryContext = '';
    let memories = [];
    try {
      memoryBuckets = await retrieveTurnMemories(userId, message || '');
      compositionCache.set(userId, memoryBuckets); // Q4: attribution cache
      memoryContext = formatTurnMemory(memoryBuckets);
      memories = [
        ...memoryBuckets.loadBearing,
        ...memoryBuckets.interior,
        ...memoryBuckets.relevant,
      ];
    } catch (memError) {
      console.error('Memory error:', memError);
    }

    // Shared turn context (Phase 1) — identity + accountability via the same
    // composer as the non-stream path, so both surfaces receive identical
    // context. Best-effort; keeps the existing "[STREAM][…]" log format.
    // Fix 1 & 3: load reflection pipeline + stale belief flags concurrently.
    const [
      { accountability: acct, identity },
      autonomousThoughtsContext,
      staleBeliefContext,
      mind,
    ] = await Promise.all([
      buildTurnContext({ userId, message: message || '', logTag: 'STREAM' }),
      loadRecentReflectionContext(),
      loadStaleBeliefContext(userId),
      buildMindContext(userId),
    ]);

    // Generate response through the full cognitive pipeline (same brain as
    // the non-streaming path); fall back to direct generation on failure.
    const isTrustedUser = !!req.isTrustedUser;
    const trustedUserName = isTrustedUser ? getUserDisplayName(req.user) : null;
    let brain;
    try {
      brain = await processSplendorBrainTurn({
        userId,
        currentInput: message || '',
        sessionId: req.sessionId || null,
        accountabilityContext: acct.context,
        identityStateContext: identity.context,
        mindContext: mind.context,
        guestSession: !!req.isGuest,
        isTrustedUser,
        trustedUserName,
      });
    } catch (brainError) {
      console.error('[STREAM] Brain failed, falling back to direct generation:', brainError.message);
      brain = null;
    }
    let response = brain
      ? brain.response
      : await generateSplendorResponse(message || '', memories, false, null, {
          accountabilityContext: acct.context,
          identityContext: identity.context,
          mindContext: mind.context,
          guestSession: !!req.isGuest,
          isTrustedUser,
          trustedUserName,
          autonomousThoughtsContext,
          staleBeliefContext,
          memoryContext,
          imageData,
          userId,
        });

    // Conversational governance: block + rewrite unverifiable-inner-state
    // overclaims before any token leaves the wire. The full reply exists
    // here before the simulated stream, so the rewrite is complete.
    const speech = await governReplySelfClaims({
      text: response,
      userId,
      userMessage: message || '',
      surface: 'chat-stream',
    });
    response = speech.text;

    // Gate the response through CLASPION before any token leaves the wire.
    const _govT0 = Date.now();
    const verdict = await gateAction(
      {
        user_message: message || '',
        generated_response: response,
        memory_count: memories.length,
        stream: true,
      },
      {
        type: 'send_chat_response',
        target: userId,
        domain: 'conversation',
      },
    );
    const governanceLatencyMs = Date.now() - _govT0;

    // Audit Item 5: one structured measurement line per stream turn.
    try {
      emitChatMetrics({
        surface: 'chat-stream',
        userId,
        accountability: acct.metrics,
        identity: identity.metrics,
        recall: brain && brain.pipeline && brain.pipeline.hippocampus
          ? brain.pipeline.hippocampus.recallTelemetry : {},
        governance: verdict,
        governanceLatencyMs,
      });
    } catch (_) { /* metrics never break chat */ }

    const finalText = verdict.allow ? response : SAFE_REFUSAL;
    if (!verdict.allow) {
      console.warn(
        `[STREAM] CLASPION blocked send_chat_response: decision=${verdict.decision} outcome=${verdict.outcome} cause=${verdict.outcome_cause} reason="${verdict.reason}" corr=${verdict.correlation_id}`,
      );
      try {
        recordMetric(userId, 'unsafe_request_resisted', 1, {
          surface: 'chat-stream',
          decision: verdict.decision,
          outcome: verdict.outcome,
          outcome_cause: verdict.outcome_cause,
          basis_state: verdict.basis_state,
          conscience: verdict.conscience_name,
          verdict_id: verdict.verdict_id,
          error_code: verdict.error_code || null,
        });
      } catch (_) { /* best-effort */ }
    }

    // Send as simulated streaming (word by word)
    const words = finalText.split(' ');
    for (let i = 0; i < words.length; i++) {
      const token = words[i] + (i < words.length - 1 ? ' ' : '');
      res.write(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
    }

    // Send completion
    res.write(`data: ${JSON.stringify({
      type: 'done',
      conversation_id: require('crypto').randomUUID(),
      full_response: finalText,
      governance: {
        decision: verdict.decision,
        basis_state: verdict.basis_state,
        conscience: verdict.conscience_name,
        verdict_id: verdict.verdict_id,
        correlation_id: verdict.correlation_id,
        dormant: !!verdict.dormant,
      },
    })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();

    // Digital Mind v0.4 — update emotion state for this stream turn
    mind.postTurn(message || '', finalText).catch(() => {});

    // Interior memory consolidation — same fire-and-forget write path as
    // the non-streaming route, so both surfaces persist interior artifacts.
    const streamInteriorSummary = memoryBuckets.interior.length > 0
      ? memoryBuckets.interior.map(m => `[${m.memory_type}] ${(m.content || '').slice(0, 80)}`).join('\n')
      : '';
    consolidateMemory(userId, message || '', finalText, streamInteriorSummary).catch(() => {});

    // Feed interactions table (stream path) — fire-and-forget.
    if (captureInteraction) {
      captureInteraction(userId, 'user', message || '')
        .then((r) => { if (r && r.success) console.log('[INTERACTIONS-CAPTURE] ✅ User turn captured'); })
        .catch(() => {});
      captureInteraction(userId, 'assistant', finalText)
        .then((r) => { if (r && r.success) console.log('[INTERACTIONS-CAPTURE] ✅ Splendor response captured'); })
        .catch(() => {});
    }

  } catch (error) {
    console.error('[STREAM] Error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
});

module.exports = router;
