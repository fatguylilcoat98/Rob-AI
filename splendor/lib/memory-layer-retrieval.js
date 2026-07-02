'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Human-Inspired Memory Layering v1 — Layer-Aware Retrieval Scoring

  Extends the existing three-bucket retrieval model (memory-retrieval.js)
  with layer-based priority boosting and decay filtering.

  Rules:
  - GOVERNANCE_MEMORY always retrieval_priority = 1.0 — surfaces unconditionally
  - RETIRED memories never surface (active=false handles this at the DB layer)
  - STALE memories surface only if explicitly requested or governance-tagged
  - Layer priorities are additive to existing importance scoring (not replacing it)
  - Best-effort: any failure returns the base retrieval result unchanged
*/

const { LAYERS, DECAY } = require('./memory-layer-classifier');

// Layer multipliers applied to importance score during ranking.
// GOVERNANCE stays at 1.0; everything else is relative.
const LAYER_MULTIPLIER = {
  [LAYERS.GOVERNANCE_MEMORY]:  3.0,  // always floats to top
  [LAYERS.SELF_MODEL_MEMORY]:  1.8,
  [LAYERS.RELATIONSHIP_MEMORY]:1.6,
  [LAYERS.TRAJECTORY_MEMORY]:  1.5,
  [LAYERS.SALIENCE_MEMORY]:    1.4,
  [LAYERS.PROCEDURAL_MEMORY]:  1.3,
  [LAYERS.SEMANTIC_MEMORY]:    1.2,
  [LAYERS.EPISODIC_MEMORY]:    1.0,
  [LAYERS.WORKING_CONTEXT]:    0.8,
};

// Decay status penalty factors
const DECAY_PENALTY = {
  [DECAY.ACTIVE]:   1.0,
  [DECAY.AGING]:    0.85,
  [DECAY.STALE]:    0.4,
  [DECAY.ARCHIVED]: 0.1,
  [DECAY.RETIRED]:  0.0,  // never surfaces (should be active=false anyway)
};

/**
 * Score a single memory row using layer and decay signals.
 * Returns a float score that can be used to sort/filter memories.
 *
 * @param {object} memory — a memory_items row with optional memory_layer/decay_status
 * @returns {number} score 0.0–3.0+
 */
function scoreMemoryByLayer(memory) {
  const importance  = parseFloat(memory.importance)  || 0.5;
  const confidence  = parseFloat(memory.confidence)  || 0.5;

  const layer        = memory.memory_layer  || LAYERS.EPISODIC_MEMORY;
  const decayStatus  = memory.decay_status  || DECAY.ACTIVE;

  // Governance always wins
  if (layer === LAYERS.GOVERNANCE_MEMORY) return 10.0;

  if (decayStatus === DECAY.RETIRED) return 0.0;

  const multiplier  = LAYER_MULTIPLIER[layer]  || 1.0;
  const penaltyRaw  = DECAY_PENALTY[decayStatus];
  const penalty     = penaltyRaw !== undefined ? penaltyRaw : 1.0;

  // Combined: importance 60%, confidence 40%, then layer + decay applied
  const base = importance * 0.6 + confidence * 0.4;
  return base * multiplier * penalty;
}

/**
 * Filter out memories that should not surface based on decay status.
 * RETIRED and ARCHIVED (unless governance) are excluded from active retrieval.
 *
 * @param {object[]} memories
 * @returns {object[]}
 */
function filterByDecay(memories) {
  return (memories || []).filter(m => {
    if (m.memory_layer === LAYERS.GOVERNANCE_MEMORY) return true; // governance always surfaces
    const d = m.decay_status || DECAY.ACTIVE;
    return d !== DECAY.RETIRED && d !== DECAY.ARCHIVED;
  });
}

/**
 * Sort an array of memory rows by layer-aware score descending.
 * Does not mutate the input array.
 *
 * @param {object[]} memories
 * @returns {object[]}
 */
function sortByLayerPriority(memories) {
  if (!Array.isArray(memories)) return [];
  return [...memories].sort((a, b) => scoreMemoryByLayer(b) - scoreMemoryByLayer(a));
}

/**
 * Apply layer-aware boosting to the three retrieval buckets returned by
 * retrieveTurnMemories(). Governance memories are injected at the top of
 * loadBearing unconditionally; stale/retired memories are pruned.
 *
 * This function is called AFTER the base retrieval — it only re-sorts and
 * filters existing results. It does NOT issue new DB queries.
 *
 * @param {{ loadBearing: object[], relevant: object[], interior: object[] }} buckets
 * @returns {{ loadBearing: object[], relevant: object[], interior: object[] }}
 */
function applyLayerBoosts(buckets) {
  const { loadBearing = [], relevant = [], interior = [] } = buckets;

  // Filter decay from all buckets
  const filteredLoad     = filterByDecay(loadBearing);
  const filteredRelevant = filterByDecay(relevant);
  const filteredInterior = filterByDecay(interior);

  // Sort each bucket by layer-aware score
  const sortedLoad     = sortByLayerPriority(filteredLoad);
  const sortedRelevant = sortByLayerPriority(filteredRelevant);
  const sortedInterior = sortByLayerPriority(filteredInterior);

  // Ensure all governance memories from relevant/interior are promoted to loadBearing
  const govFromRelevant = sortedRelevant.filter(m => m.memory_layer === LAYERS.GOVERNANCE_MEMORY);
  const govFromInterior = sortedInterior.filter(m => m.memory_layer === LAYERS.GOVERNANCE_MEMORY);
  const govIds          = new Set([...govFromRelevant, ...govFromInterior].map(m => m.id));

  const finalLoad = [
    ...govFromRelevant,
    ...govFromInterior,
    ...sortedLoad.filter(m => !govIds.has(m.id)),
  ];

  const finalRelevant = sortedRelevant.filter(m => !govIds.has(m.id));
  const finalInterior = sortedInterior.filter(m => !govIds.has(m.id));

  return {
    loadBearing: finalLoad,
    relevant:    finalRelevant,
    interior:    finalInterior,
  };
}

/**
 * Build a layer summary for diagnostic/Oracle purposes.
 * Groups a flat array of memories by layer with counts.
 */
function buildLayerSummary(memories) {
  const counts = {};
  for (const m of memories || []) {
    const l = m.memory_layer || 'UNCLASSIFIED';
    counts[l] = (counts[l] || 0) + 1;
  }
  return counts;
}

module.exports = {
  scoreMemoryByLayer,
  filterByDecay,
  sortByLayerPriority,
  applyLayerBoosts,
  buildLayerSummary,
  LAYER_MULTIPLIER,
  DECAY_PENALTY,
};
