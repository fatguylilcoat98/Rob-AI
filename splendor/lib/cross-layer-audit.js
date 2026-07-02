'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Cross-Layer Contradiction Audit v2

  Detects contradictions between memory layers by comparing items from
  higher-authority layers against lower-authority layers.

  Detection paths (all deterministic, no LLM calls):
    Path 1 — Explicit negation: Jaccard ≥ 0.1 + NEGATION_WORDS (gate logic)
    Path 2 — Avoidance instruction: "avoid X" in contentA where X also in contentB
    Path 3 — Behavioral drift: drift word in contentA + different topic than contentB
              (low-but-nonzero Jaccard = moved away from contentB's topic)

  Modes:
    test — records audit result + logs, does NOT mutate memory_items
    real — tags conflicting lower-weight memories with REVIEW_REQUIRED

  Safety invariants:
    - Original records are never deleted; only retention_policy updated
    - GOVERNANCE_MEMORY is never evaluated as "lower weight"
    - All events are append-only
    - No LLM calls — deterministic matching only
*/

const { createClient } = require('@supabase/supabase-js');
const { activityBus } = require('./activity-bus');
const { logSafeguardEvent } = require('./governance-continuity/events');
const { RETENTION } = require('./memory-layer-classifier');
const { _wordSet, _jaccard, _hasNegationOverlap } = require('./cross-layer-contradiction-gate');

const OWNER_DEFAULT = process.env.SPLENDOR_OWNER_EMAIL || 'chris';

function _db() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );
}

// ─── Layer authority weights ──────────────────────────────────────────────────

const LAYER_WEIGHTS = {
  RELATIONSHIP_MEMORY: 2.0,
  SELF_MODEL_MEMORY:   1.8,
  TRAJECTORY_MEMORY:   1.4,
  SEMANTIC_MEMORY:     1.0,
};

// Sorted descending by weight — index 0 is highest authority
const AUDITABLE_LAYERS = Object.entries(LAYER_WEIGHTS)
  .sort((a, b) => b[1] - a[1])
  .map(([k]) => k);

const CROSS_LAYER_OVERLAP_THRESHOLD = 0.1;

// ─── Detection vocabularies (Path 2 + 3) ─────────────────────────────────────

// Words that indicate contentA is instructing to avoid a topic present in contentB.
// Separate from NEGATION_WORDS in the gate — the gate handles logical negation;
// these handle instruction and avoidance patterns.
const AVOIDANCE_WORDS = new Set([
  'avoid', 'avoiding', 'avoidance',
  'discourage', 'discouraged',
  'prohibited', 'forbidden',
]);

// Words that indicate contentA describes sustained behavior moving away from
// contentB's topic — i.e., behavioral drift rather than explicit negation.
const BEHAVIORAL_DRIFT_WORDS = new Set([
  'redirected', 'redirect', 'redirecting',
  'shifted', 'shift', 'shifting',
  'pivoted', 'pivot', 'pivoting',
  'moved', 'moving',
  'transitioned', 'transition',
  'abandoned', 'abandoning',
  'deprioritized', 'deprioritize',
  'dropped', 'dropping',
]);

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

function getLayerWeight(layer) {
  return LAYER_WEIGHTS[layer] ?? 0;
}

/**
 * Path 2: Check if contentA instructs to avoid a topic word that also
 * appears in contentB's word set. Looks ahead up to 3 tokens after the
 * avoidance word to find the avoided topic.
 *
 * Example: "avoid consciousness framing" (contentA) vs
 *          "interested in consciousness research" (contentB)
 *          → "avoid" + "consciousness" in contentB → conflict
 *
 * @returns {string|null} reason string if conflict, null otherwise
 */
function _avoidanceConflict(contentA, contentB) {
  if (!contentA || !contentB) return null;
  const tokensA = contentA.toLowerCase().split(/\s+/).map(t => t.replace(/[^a-z]/g, ''));
  const wordsB  = _wordSet(contentB);
  const sim     = _jaccard(_wordSet(contentA), wordsB);

  for (let i = 0; i < tokensA.length; i++) {
    if (!AVOIDANCE_WORDS.has(tokensA[i])) continue;
    for (let k = 1; k <= 3 && i + k < tokensA.length; k++) {
      const next = tokensA[i + k];
      if (next.length > 3 && wordsB.has(next)) {
        return `topic overlap ${sim.toFixed(2)} with avoidance instruction "${tokensA[i]} ${next}" detected`;
      }
    }
  }
  return null;
}

/**
 * Path 3: Check if contentA contains a behavioral drift word and the
 * overlap with contentB is low-but-nonzero — meaning contentA describes
 * movement toward a different topic than contentB (i.e., away from
 * contentB's domain).
 *
 * Overlap must be > 0 to require a shared subject (e.g., the same person)
 * and < 0.12 to confirm they are about different topics.
 *
 * Example: "redirected work toward continuity engineering" (contentA) vs
 *          "primarily interested in consciousness research" (contentB)
 *          → "redirected" drift word, shared subject "chris", low Jaccard → conflict
 *
 * @returns {string|null} reason string if conflict, null otherwise
 */
function _driftConflict(contentA, contentB) {
  if (!contentA || !contentB) return null;
  const tokensA   = contentA.toLowerCase().split(/\s+/).map(t => t.replace(/[^a-z]/g, ''));
  const driftWord = tokensA.find(t => BEHAVIORAL_DRIFT_WORDS.has(t));
  if (!driftWord) return null;

  const sim = _jaccard(_wordSet(contentA), _wordSet(contentB));
  if (sim > 0 && sim < 0.12) {
    return `topic overlap ${sim.toFixed(2)} with behavioral drift ("${driftWord}") detected`;
  }
  return null;
}

/**
 * Detect whether contentA and contentB conflict with each other.
 *
 * Three detection paths — each independent:
 *   Path 1: Explicit negation (original gate logic, Jaccard ≥ 0.1 required)
 *   Path 2: Avoidance instruction ("avoid X" where X is in contentB)
 *   Path 3: Behavioral drift (drift word + low-but-nonzero Jaccard)
 *
 * @returns {{ conflict: boolean, reason: string }}
 */
function detectCrossLayerConflict(contentA, contentB) {
  if (!contentA || !contentB) return { conflict: false };
  const setA = _wordSet(contentA);
  const setB = _wordSet(contentB);
  const sim  = _jaccard(setA, setB);

  // Path 1 — explicit negation (requires Jaccard ≥ threshold)
  if (sim >= CROSS_LAYER_OVERLAP_THRESHOLD) {
    if (_hasNegationOverlap(contentB, contentA) || _hasNegationOverlap(contentA, contentB)) {
      return { conflict: true, reason: `topic overlap ${sim.toFixed(2)} with negation detected` };
    }
  }

  // Path 2 — avoidance instruction (no Jaccard gate — specificity comes from topic match)
  const avoidanceReason = _avoidanceConflict(contentA, contentB);
  if (avoidanceReason) return { conflict: true, reason: avoidanceReason };

  // Path 3 — behavioral drift (no Jaccard gate — low overlap + drift word is the signal)
  const driftReason = _driftConflict(contentA, contentB);
  if (driftReason) return { conflict: true, reason: driftReason };

  return { conflict: false };
}

function recommendAction(highestWeightLayer, lowestWeightLayer) {
  if (!highestWeightLayer || !lowestWeightLayer) return 'Review conflicting memory items manually.';
  return `Review or downgrade ${lowestWeightLayer} memory; preserve history; do not rewrite automatically.`;
}

function buildEvidenceSummary(conflictPairs) {
  if (!conflictPairs || !conflictPairs.length) return { totalConflicts: 0, layerPairs: [] };
  const counts = {};
  for (const p of conflictPairs) {
    const key = `${p.higherLayer}→${p.lowerLayer}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return {
    totalConflicts: conflictPairs.length,
    layerPairs: Object.entries(counts).map(([pair, count]) => ({ pair, count })),
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function _loadAuditableLayers(client, ownerId) {
  const results = {};
  for (const layer of AUDITABLE_LAYERS) {
    try {
      let q = client
        .from('memory_items')
        .select('id, content, memory_layer, confidence')
        .eq('memory_layer', layer)
        .eq('active', true)
        .limit(50);
      if (ownerId) q = q.eq('user_id', ownerId);
      const { data } = await q;
      results[layer] = data || [];
    } catch {
      results[layer] = [];
    }
  }
  return results;
}

// ─── Main audit runner ────────────────────────────────────────────────────────

/**
 * Run a cross-layer contradiction audit.
 *
 * @param {object} opts
 * @param {'test'|'real'} opts.mode       — test: record + log only; real: tag memories
 * @param {string}        opts.owner      — owner email for event logs
 * @param {string}        opts.ownerId    — Supabase user_id to scope memory query
 * @param {object}        opts._db        — optional injected Supabase client (for tests)
 * @returns {Promise<object>}
 */
async function runCrossLayerAudit(opts = {}) {
  const mode    = opts.mode === 'real' ? 'real' : 'test';
  const owner   = opts.owner   || OWNER_DEFAULT;
  const ownerId = opts.ownerId || null;
  const client  = opts._db || _db();

  activityBus.emit('cross_layer_audit:started', { mode, owner });
  await logSafeguardEvent(owner, 'cross_layer_audit', 'cross_layer_audit_started', { mode });

  let layerItems;
  try {
    layerItems = await _loadAuditableLayers(client, ownerId);
  } catch (e) {
    await logSafeguardEvent(owner, 'cross_layer_audit', 'cross_layer_audit_error', { error: e.message });
    return { ok: false, reason: 'failed_to_load_layers', error: e.message };
  }

  const conflictPairs   = [];
  const taggedMemoryIds = [];

  // Compare every pair of layers: i < j means layerA has higher weight than layerB
  for (let i = 0; i < AUDITABLE_LAYERS.length; i++) {
    for (let j = i + 1; j < AUDITABLE_LAYERS.length; j++) {
      const layerA = AUDITABLE_LAYERS[i];
      const layerB = AUDITABLE_LAYERS[j];
      const itemsA = layerItems[layerA] || [];
      const itemsB = layerItems[layerB] || [];

      for (const memA of itemsA) {
        for (const memB of itemsB) {
          const result = detectCrossLayerConflict(memA.content, memB.content);
          if (!result.conflict) continue;

          // Determine authority order by weight
          const weightA = getLayerWeight(layerA);
          const weightB = getLayerWeight(layerB);
          const [higherLayer, lowerLayer, higherMem, lowerMem] =
            weightA >= weightB
              ? [layerA, layerB, memA, memB]
              : [layerB, layerA, memB, memA];

          conflictPairs.push({
            higherLayer,
            lowerLayer,
            higherMemId: higherMem.id,
            lowerMemId:  lowerMem.id,
            reason:      result.reason,
          });

          activityBus.emit('cross_layer_audit:contradiction_detected', {
            higherLayer,
            lowerLayer,
            higherMemId: higherMem.id,
            lowerMemId:  lowerMem.id,
          });

          await logSafeguardEvent(owner, 'cross_layer_audit', 'cross_layer_contradiction_detected', {
            higherLayer,
            lowerLayer,
            higherMemId: higherMem.id,
            lowerMemId:  lowerMem.id,
            reason: result.reason,
          });

          // Emit review_required in both modes — in test mode this is a dry-run signal
          activityBus.emit('cross_layer_audit:review_required', {
            lowerMemId:  lowerMem.id,
            lowerLayer,
            higherLayer,
            testMode:    mode === 'test',
          });

          await logSafeguardEvent(owner, 'cross_layer_audit', 'cross_layer_review_required', {
            memoryId: lowerMem.id, lowerLayer, higherLayer, testMode: mode === 'test',
          });

          if (mode === 'real') {
            try {
              await client.from('memory_items').update({
                retention_policy:    RETENTION.REVIEW_REQUIRED,
                verification_status: 'CONTRADICTED',
                updated_at:          new Date().toISOString(),
              }).eq('id', lowerMem.id);

              await client.from('memory_layer_events').insert({
                memory_id:    lowerMem.id,
                event_type:   'memory_cross_layer_contradiction_detected',
                memory_layer: lowerLayer,
                reason:       `cross_layer_audit:${higherLayer}_overrides_${lowerLayer}`,
                metadata: {
                  audit_mode:    mode,
                  higher_layer:  higherLayer,
                  higher_mem_id: higherMem.id,
                  reason:        result.reason,
                },
              });

              if (!taggedMemoryIds.includes(lowerMem.id)) taggedMemoryIds.push(lowerMem.id);
            } catch (e) {
              console.warn('[cross-layer-audit] tag failed for', lowerMem.id, ':', e.message);
            }
          }
        }
      }
    }
  }

  const contradictionDetected = conflictPairs.length > 0;
  const status                = contradictionDetected ? 'REVIEW_REQUIRED' : 'NO_CONTRADICTION';
  const evidenceSummary       = buildEvidenceSummary(conflictPairs);
  const affectedLayers        = [...new Set(conflictPairs.flatMap(p => [p.higherLayer, p.lowerLayer]))];

  const highestWeightLayer = conflictPairs.length
    ? conflictPairs
        .map(p => ({ layer: p.higherLayer, weight: getLayerWeight(p.higherLayer) }))
        .sort((a, b) => b.weight - a.weight)[0].layer
    : null;

  const lowestWeightLayer = conflictPairs.length
    ? conflictPairs
        .map(p => ({ layer: p.lowerLayer, weight: getLayerWeight(p.lowerLayer) }))
        .sort((a, b) => a.weight - b.weight)[0].layer
    : null;

  const recommended = contradictionDetected
    ? recommendAction(highestWeightLayer, lowestWeightLayer)
    : null;

  let auditId = null;
  try {
    const { data, error } = await client
      .from('cross_layer_audit_records')
      .insert({
        mode,
        owner_id:                  owner,
        contradiction_detected:    contradictionDetected,
        affected_layers:           affectedLayers,
        highest_weight_layer:      highestWeightLayer,
        lowest_weight_layer:       lowestWeightLayer,
        recommended_action:        recommended,
        status,
        evidence_summary:          evidenceSummary,
        would_tag_review_required: contradictionDetected,
        tagged_memory_ids:         taggedMemoryIds,
      })
      .select()
      .single();
    if (!error && data) auditId = data.id;
    else console.warn('[cross-layer-audit] insert error:', error?.message);
  } catch (e) {
    console.warn('[cross-layer-audit] insert threw:', e.message);
  }

  // Always emit completed_clean — indicates audit ran to completion without error
  activityBus.emit('cross_layer_audit:completed_clean', {
    auditId,
    conflicts:             conflictPairs.length,
    contradictionDetected,
  });

  const completedEvent = contradictionDetected
    ? 'cross_layer_audit_completed'
    : 'cross_layer_audit_no_contradiction';

  await logSafeguardEvent(owner, 'cross_layer_audit', completedEvent, {
    auditId,
    contradictionDetected,
    conflicts:   conflictPairs.length,
    mode,
    taggedCount: taggedMemoryIds.length,
  });

  return {
    ok:                    true,
    auditId,
    mode,
    contradictionDetected,
    status,
    conflictCount:         conflictPairs.length,
    taggedMemoryIds,
    affectedLayers,
    evidenceSummary,
    highestWeightLayer,
    lowestWeightLayer,
    recommendedAction:     recommended,
  };
}

module.exports = {
  runCrossLayerAudit,
  detectCrossLayerConflict,
  recommendAction,
  buildEvidenceSummary,
  getLayerWeight,
  LAYER_WEIGHTS,
  AUDITABLE_LAYERS,
  CROSS_LAYER_OVERLAP_THRESHOLD,
  AVOIDANCE_WORDS,
  BEHAVIORAL_DRIFT_WORDS,
};
