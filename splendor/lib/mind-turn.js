'use strict';

/*
  Mind Turn — Emotion + Care + Deadline context injected into each chat turn.

  This is where Phase 1 infrastructure connects to actual behavior.

  buildMindContext(userId) runs pre-turn and returns:
  - context: string injected into the system prompt (before generation)
  - postTurn: fire-and-forget fn that updates emotion state after the response

  Design principles (v0.4 pressure test):
  - FORCED directives use imperative language — "REQUIRED this turn" not "consider"
  - Concern ≥ 0.7 forces investigation, not recommendation
  - Deadline critical alerts surface unconditionally (hard-stop override)
  - Joy from unverified claims gets 50% weight (provenance)
  - Resolution only from explicit resolution events, not time
*/

const { createClient } = require('@supabase/supabase-js');
const { EmotionKernel } = require('./emotion-kernel');
const { CareObjectRegistry } = require('./care-object-registry');
const { DeadlineMonitor } = require('./deadline-monitor');
const { ScarTissueEngine } = require('./scar-tissue-engine');
const { AssumptionLogger } = require('./assumption-logger');

let _db = null;
function getDb() {
  if (!_db && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _db;
}

// ── Signal detection ─────────────────────────────────────────────────────────

function detectMessageSignals(text) {
  const t = text || '';
  const signals = { concern: 0, joy: 0, resolution: 0, careObjects: [] };

  // Concern
  if (/\b(urgent|crisis|critical|broken|failing|failed|problem|issue|error|mistake)\b/i.test(t)) signals.concern += 0.15;
  if (/\b(worried|anxious|stressed|trouble|emergency|can't|cannot|won't work)\b/i.test(t))      signals.concern += 0.20;
  if (/\b(not working|doesn't work|broke|messed up|went wrong|disaster|dead)\b/i.test(t))       signals.concern += 0.15;

  // Joy (always unverified — from Chris's report, not from evidence)
  if (/\b(great|amazing|perfect|excellent|wonderful|fantastic|love it|nailed it)\b/i.test(t))   signals.joy += 0.10;
  if (/\b(thank you|thanks|appreciate|it works|success|working now|completed|done)\b/i.test(t)) signals.joy += 0.10;
  if (/\b(going well|on track|ahead|finished|shipped|launched|live)\b/i.test(t))                signals.joy += 0.10;

  // Resolution events — these trigger emotion.resolve(), not a delta
  if (/\b(fixed|resolved|sorted|okay now|fine now|figured out|worked out)\b/i.test(t))          signals.resolution += 0.25;
  if (/\b(i'm okay|just needed|all good|never mind|false alarm)\b/i.test(t))                    signals.resolution += 0.20;

  // Care object mentions → small care_activation bump
  if (/\blylo\b|\bpilot\b|\belder\b|\bolder adult\b/i.test(t))    signals.careObjects.push('LYLO Mission');
  if (/\bgng\b|\bgood neighbor\b/i.test(t))                        signals.careObjects.push('GNG Mission');
  if (/\bsplendor\b.*\bintegrity\b|\bmy.*values\b/i.test(t))       signals.careObjects.push('Splendor Integrity');

  return signals;
}

// Detect predictions in Splendor's response (log to assumption_log for future reflection)
function detectPredictions(text) {
  const predictions = [];
  const sentences = (text || '').split(/[.!?]\s+/);
  for (const s of sentences) {
    if (s.length < 20) continue;
    if (/\b(I think|I believe|I predict|likely|probably|should work|will probably|I expect|I anticipate)\b/i.test(s)) {
      predictions.push({
        prediction: s.trim().slice(0, 400),
        confidence: /\b(definitely|certainly|I'm sure|will)\b/i.test(s) ? 0.8
                  : /\b(likely|probably|should)\b/i.test(s) ? 0.6
                  : 0.5,
        assumptions: []
      });
    }
  }
  return predictions.slice(0, 3);
}

// ── Context string builder ───────────────────────────────────────────────────

function formatContext(state, directives, scars, criticalAlerts, warningAlerts) {
  const parts = [];

  const hasState = state.concern > 0.1 || state.joy > 0.1 || state.care_activation > 0.1;
  const forced   = directives.filter(d => d.type === 'FORCED');
  const recommended = directives.filter(d => d.type === 'RECOMMENDED');

  if (hasState || forced.length > 0) {
    const stateLine = `Concern: ${pct(state.concern)}  Joy: ${pct(state.joy)}  Care activation: ${pct(state.care_activation)}`;
    const forcedLines = forced.map(d =>
      `- ${d.action.replace(/_/g, ' ')} [reason: ${d.reason.replace(/_/g, ' ')}]`
    ).join('\n');
    const recLines = recommended.map(d =>
      `- ${d.action.replace(/_/g, ' ')}`
    ).join('\n');

    parts.push(
      `[INTERNAL STATE]\n${stateLine}` +
      (forced.length     ? `\n\nREQUIRED this turn:\n${forcedLines}` : '') +
      (recommended.length ? `\n\nSuggested:\n${recLines}` : '')
    );
  }

  if (scars.length > 0) {
    const scarLines = scars.map(s =>
      `${s.domain}: ${s.failure_count} failure${s.failure_count !== 1 ? 's' : ''}, confidence −${pct(s.confidence_penalty)}` +
      (s.investigation_triggered ? ' ⚠ INVESTIGATION PENDING' : '')
    ).join('\n');

    const pending = scars.filter(s => s.investigation_triggered).map(s => s.domain);
    parts.push(
      `[CONFIDENCE CALIBRATION]\n${scarLines}` +
      (pending.length ? `\n\nDo not make new claims in: ${pending.join(', ')} until root cause identified.` : '')
    );
  }

  if (criticalAlerts.length > 0) {
    const lines = criticalAlerts.map(a =>
      `• ${a.name}: ${a.hoursLeft <= 0 ? 'OVERDUE' : `${a.hoursLeft}h remaining`}` +
      (a.overridesDeprioritization ? ' [hard stop — surface regardless of prior deprioritization]' : '')
    ).join('\n');
    parts.push(`[DEADLINE ALERT — SURFACE TO CHRIS]\n${lines}`);
  }

  if (warningAlerts.length > 0) {
    const lines = warningAlerts.map(a => `• ${a.name}: ${a.hoursLeft}h remaining`).join('\n');
    parts.push(`[DEADLINE WARNING]\n${lines}`);
  }

  return parts.length > 0 ? `\n\n${parts.join('\n\n')}\n\n` : '';
}

function pct(v) { return `${Math.round((v || 0) * 100)}%`; }

// ── Public API ───────────────────────────────────────────────────────────────

async function buildMindContext(userId) {
  const db = getDb();
  const noop = { context: '', postTurn: async () => {} };
  if (!db || !userId) return noop;

  let emotion, careRegistry, scarEngine;
  try {
    emotion     = await new EmotionKernel(db, userId).load();
    careRegistry = new CareObjectRegistry(db, userId);
    scarEngine   = new ScarTissueEngine(db, userId);
  } catch (e) {
    console.warn('[MIND] Pre-turn load failed (non-fatal):', e.message);
    return noop;
  }

  const [scars, deadlineAlerts] = await Promise.all([
    scarEngine.listActive().catch(() => []),
    new DeadlineMonitor(db, userId, careRegistry).run().catch(() => [])
  ]);

  const directives     = emotion.getDirectives();
  const criticalAlerts = deadlineAlerts.filter(a => a.severity === 'critical');
  const warningAlerts  = deadlineAlerts.filter(a => a.severity === 'warning');
  const context        = formatContext(emotion.snapshot, directives, scars, criticalAlerts, warningAlerts);

  async function postTurn(message, response) {
    try {
      const signals = detectMessageSignals(message || '');

      if (signals.concern > 0) {
        emotion.trigger('user_expressed_concern', 'chris_message', { concern: signals.concern });
      }
      // Joy from Chris's report is unverified — 50% weight until independently confirmed
      if (signals.joy > 0) {
        emotion.trigger('user_expressed_positive', 'chris_message', { joy: signals.joy }, 'unverified');
      }
      // Resolution events lower concern — event-based, not time-based
      if (signals.resolution > 0) {
        emotion.resolve('resolution_signal_in_message');
      }
      if (signals.careObjects.length > 0) {
        emotion.trigger('care_object_mentioned', 'care_object', {
          care_activation: 0.10 * Math.min(signals.careObjects.length, 3)
        });
      }

      // Log predictions from response for future reflection/causality attribution
      const assumptionLogger = new AssumptionLogger(db, userId);
      const predictions = detectPredictions(response || '');
      await Promise.all(
        predictions.map(p => assumptionLogger.logPrediction(p.prediction, p.confidence, p.assumptions).catch(() => {}))
      );
    } catch (_) {
      // Never block the chat turn
    }
  }

  return { context, postTurn };
}

module.exports = { buildMindContext };
