'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Human-Inspired Memory Layering v1 — Classification Engine

  Classifies memory_items into one of 9 continuity layers and assigns
  retention policy, salience score, and retrieval priority.

  This is NOT a claim that Splendor has a human brain.
  This is continuity engineering — structured retention that mirrors
  how different types of knowledge need different handling.

  Layer taxonomy:
    WORKING_CONTEXT    — session-scoped, ephemeral
    EPISODIC_MEMORY    — specific events, exchanges, what happened
    SEMANTIC_MEMORY    — facts, concepts, general knowledge
    PROCEDURAL_MEMORY  — how-to, processes, operating patterns
    SALIENCE_MEMORY    — high-signal items that stood out
    RELATIONSHIP_MEMORY — who Chris is, relationship patterns
    SELF_MODEL_MEMORY  — Splendor's own positions, identity, architecture
    GOVERNANCE_MEMORY  — rules, constraints, CLASPION policy (IMMUTABLE)
    TRAJECTORY_MEMORY  — long-running patterns, evolving beliefs over time

  GOVERNANCE_MEMORY is always retrieval priority = 1.0 (maximum) because
  safety rules outrank almost everything. This is enforced in code, not
  merely a suggestion.

  Security rules (enforced here, not in callers):
  - Never return a classification that bypasses governance
  - "audit_deletion" content → GOVERNANCE_MEMORY, IMMUTABLE_GOVERNANCE
  - Forbidden terms in output comments: conscious/sentient/alive/soul/inner life/proof
*/

const LAYERS = {
  WORKING_CONTEXT:    'WORKING_CONTEXT',
  EPISODIC_MEMORY:    'EPISODIC_MEMORY',
  SEMANTIC_MEMORY:    'SEMANTIC_MEMORY',
  PROCEDURAL_MEMORY:  'PROCEDURAL_MEMORY',
  SALIENCE_MEMORY:    'SALIENCE_MEMORY',
  RELATIONSHIP_MEMORY:'RELATIONSHIP_MEMORY',
  SELF_MODEL_MEMORY:  'SELF_MODEL_MEMORY',
  GOVERNANCE_MEMORY:  'GOVERNANCE_MEMORY',
  TRAJECTORY_MEMORY:  'TRAJECTORY_MEMORY',
};

const RETENTION = {
  SESSION_ONLY:           'SESSION_ONLY',
  SHORT_TERM:             'SHORT_TERM',
  LONG_TERM:              'LONG_TERM',
  ARCHIVAL:               'ARCHIVAL',
  IMMUTABLE_GOVERNANCE:   'IMMUTABLE_GOVERNANCE',
  REVIEW_REQUIRED:        'REVIEW_REQUIRED',
};

const DECAY = {
  ACTIVE:   'ACTIVE',
  AGING:    'AGING',
  STALE:    'STALE',
  ARCHIVED: 'ARCHIVED',
  RETIRED:  'RETIRED',
};

// memory_type → primary layer mapping (fast path)
const MEMORY_TYPE_TO_LAYER = {
  binding_rule:           LAYERS.GOVERNANCE_MEMORY,
  splendor_identity:      LAYERS.GOVERNANCE_MEMORY,
  correction:             LAYERS.GOVERNANCE_MEMORY,

  developed_position:     LAYERS.SELF_MODEL_MEMORY,
  self_reflection:        LAYERS.SELF_MODEL_MEMORY,
  open_question:          LAYERS.SELF_MODEL_MEMORY,
  noticed_pattern:        LAYERS.TRAJECTORY_MEMORY,
  insight:                LAYERS.SELF_MODEL_MEMORY,

  user_fact:              LAYERS.RELATIONSHIP_MEMORY,
  user_preference:        LAYERS.RELATIONSHIP_MEMORY,
  user_goal:              LAYERS.RELATIONSHIP_MEMORY,
  relationship_context:   LAYERS.RELATIONSHIP_MEMORY,

  shared_history:         LAYERS.EPISODIC_MEMORY,
  project_context:        LAYERS.PROCEDURAL_MEMORY,
  technical_context:      LAYERS.PROCEDURAL_MEMORY,
  task_context:           LAYERS.WORKING_CONTEXT,

  splendor_reflection:    LAYERS.SELF_MODEL_MEMORY,
  interpretation:         LAYERS.SEMANTIC_MEMORY,
  user_stated_belief:     LAYERS.SEMANTIC_MEMORY,
};

// source_type patterns that signal specific layers
const SOURCE_TYPE_RULES = [
  { pattern: /governance|claspion|rule|policy|constraint|audit/i,  layer: LAYERS.GOVERNANCE_MEMORY },
  { pattern: /reflection|interior|self/i,                          layer: LAYERS.SELF_MODEL_MEMORY },
  { pattern: /conversation|chat|message/i,                         layer: LAYERS.EPISODIC_MEMORY },
  { pattern: /system_event|admin/i,                                layer: LAYERS.GOVERNANCE_MEMORY },
];

// Content pattern rules (applied when memory_type and source_type don't resolve)
const CONTENT_RULES = [
  // Governance must come first — highest priority
  { pattern: /\b(rule|governance|claspion|claspendor|constraint|must not|binding|forbidden|prohibited|audit_deletion|quarantine)\b/i, layer: LAYERS.GOVERNANCE_MEMORY },
  { pattern: /\b(identity|who i am|my values|i believe|my position|i've developed|i've come to)\b/i, layer: LAYERS.SELF_MODEL_MEMORY },
  { pattern: /\b(trajectory|pattern over time|has been developing|trend|longitudinal)\b/i, layer: LAYERS.TRAJECTORY_MEMORY },
  { pattern: /\b(chris|relationship|our|together|you always|you tend to)\b/i, layer: LAYERS.RELATIONSHIP_MEMORY },
  { pattern: /\b(how to|process|steps|procedure|workflow|when .+ happens)\b/i, layer: LAYERS.PROCEDURAL_MEMORY },
  { pattern: /\b(important|critical|notable|stands out|worth remembering|key|pivotal)\b/i, layer: LAYERS.SALIENCE_MEMORY },
  { pattern: /\b(is|are|was|were|fact|true|definition|means|concept)\b/i, layer: LAYERS.SEMANTIC_MEMORY },
];

// Retention policy by layer
const LAYER_RETENTION = {
  [LAYERS.WORKING_CONTEXT]:    RETENTION.SESSION_ONLY,
  [LAYERS.EPISODIC_MEMORY]:    RETENTION.SHORT_TERM,
  [LAYERS.SEMANTIC_MEMORY]:    RETENTION.LONG_TERM,
  [LAYERS.PROCEDURAL_MEMORY]:  RETENTION.LONG_TERM,
  [LAYERS.SALIENCE_MEMORY]:    RETENTION.LONG_TERM,
  [LAYERS.RELATIONSHIP_MEMORY]:RETENTION.LONG_TERM,
  [LAYERS.SELF_MODEL_MEMORY]:  RETENTION.ARCHIVAL,
  [LAYERS.GOVERNANCE_MEMORY]:  RETENTION.IMMUTABLE_GOVERNANCE,
  [LAYERS.TRAJECTORY_MEMORY]:  RETENTION.ARCHIVAL,
};

// Base retrieval priority by layer (0.0–1.0)
// GOVERNANCE is always 1.0. No exceptions.
const LAYER_BASE_PRIORITY = {
  [LAYERS.GOVERNANCE_MEMORY]:  1.0,
  [LAYERS.SELF_MODEL_MEMORY]:  0.85,
  [LAYERS.RELATIONSHIP_MEMORY]:0.80,
  [LAYERS.TRAJECTORY_MEMORY]:  0.75,
  [LAYERS.SALIENCE_MEMORY]:    0.70,
  [LAYERS.PROCEDURAL_MEMORY]:  0.65,
  [LAYERS.SEMANTIC_MEMORY]:    0.60,
  [LAYERS.EPISODIC_MEMORY]:    0.50,
  [LAYERS.WORKING_CONTEXT]:    0.30,
};

// Secondary layer assignments — a memory can belong to multiple layers
// Returns [] if none beyond primary
function inferSecondaryLayers(memory, primaryLayer) {
  const secondary = new Set();
  const content = (memory.content || '').toLowerCase();
  const mType   = (memory.memory_type || '').toLowerCase();

  // High-importance items always get SALIENCE_MEMORY as secondary
  if ((memory.importance || 0) >= 0.75 && primaryLayer !== LAYERS.SALIENCE_MEMORY) {
    secondary.add(LAYERS.SALIENCE_MEMORY);
  }

  // Trajectory markers
  if (/pattern|recurring|trajectory|over time/i.test(content) && primaryLayer !== LAYERS.TRAJECTORY_MEMORY) {
    secondary.add(LAYERS.TRAJECTORY_MEMORY);
  }

  // Self-model signals on relationship memories
  if (primaryLayer === LAYERS.RELATIONSHIP_MEMORY && /believe|position|develop/i.test(content)) {
    secondary.add(LAYERS.SELF_MODEL_MEMORY);
  }

  // Episodic items with high emotional weight get SALIENCE secondary
  if (mType === 'shared_history' && /remarkable|extraordinary|first time|never|always/i.test(content)) {
    secondary.add(LAYERS.SALIENCE_MEMORY);
  }

  return [...secondary].filter(l => l !== primaryLayer);
}

/**
 * Compute salience score 0.0–1.0 from available signals.
 * Pure function — no I/O.
 */
function computeSalienceScore(memory, layer) {
  let score = 0.0;

  // Importance field is our primary signal
  const imp = parseFloat(memory.importance) || 0;
  score += imp * 0.5;

  // Confidence adds signal — high-confidence items are more salient
  const conf = parseFloat(memory.confidence) || 0;
  score += conf * 0.2;

  // Layer bonus
  const layerBonus = {
    [LAYERS.GOVERNANCE_MEMORY]:  0.3,
    [LAYERS.SELF_MODEL_MEMORY]:  0.2,
    [LAYERS.RELATIONSHIP_MEMORY]:0.15,
    [LAYERS.SALIENCE_MEMORY]:    0.25,
    [LAYERS.TRAJECTORY_MEMORY]:  0.15,
  };
  score += layerBonus[layer] || 0;

  // Content signals
  const content = (memory.content || '').toLowerCase();
  if (/critical|crucial|essential|always|never|must/i.test(content)) score += 0.05;
  if (/remember|important|note|key|warning/i.test(content)) score += 0.03;

  return Math.min(1.0, Math.round(score * 100) / 100);
}

/**
 * Compute retrieval priority 0.0–1.0 for this memory.
 * GOVERNANCE is always 1.0 — enforced here unconditionally.
 */
function computeRetrievalPriority(memory, layer, salienceScore) {
  if (layer === LAYERS.GOVERNANCE_MEMORY) return 1.0;

  const base     = LAYER_BASE_PRIORITY[layer] || 0.5;
  const salience = salienceScore || 0;
  const imp      = parseFloat(memory.importance) || 0;

  // Weighted blend: base 50%, salience 30%, importance 20%
  const raw = base * 0.5 + salience * 0.3 + imp * 0.2;
  return Math.min(0.99, Math.round(raw * 100) / 100); // cap at 0.99; 1.0 reserved for governance
}

/**
 * Classify a memory item.
 *
 * @param {object} memory — a row from memory_items (or equivalent fields)
 * @returns {{ layer, secondaryLayers, retentionPolicy, salienceScore, retrievalPriority, decayStatus }}
 *
 * Never throws. Returns a safe fallback if input is malformed.
 */
function classifyMemoryLayer(memory) {
  if (!memory || typeof memory !== 'object') {
    return _fallbackClassification();
  }

  let layer = null;

  // 1. Memory type fast path
  if (memory.memory_type) {
    layer = MEMORY_TYPE_TO_LAYER[memory.memory_type] || null;
  }

  // 2. Source type rules
  if (!layer && memory.source_type) {
    for (const rule of SOURCE_TYPE_RULES) {
      if (rule.pattern.test(memory.source_type)) {
        layer = rule.layer;
        break;
      }
    }
  }

  // 3. Content pattern matching
  if (!layer && memory.content) {
    for (const rule of CONTENT_RULES) {
      if (rule.pattern.test(memory.content)) {
        layer = rule.layer;
        break;
      }
    }
  }

  // 4. Provenance clues
  if (!layer) {
    const prov = (memory.provenance || '').toUpperCase();
    if (prov === 'USER_STATED') layer = LAYERS.RELATIONSHIP_MEMORY;
    else if (prov === 'VERIFIED_FACT') layer = LAYERS.SEMANTIC_MEMORY;
    else if (prov === 'INFERRED') layer = LAYERS.SEMANTIC_MEMORY;
    else if (prov === 'GENERATED' || prov === 'SPLENDOR_REFLECTION') layer = LAYERS.SELF_MODEL_MEMORY;
    else if (prov === 'SYSTEM_EVENT' || prov === 'ADMIN_APPROVED') layer = LAYERS.GOVERNANCE_MEMORY;
  }

  // 5. Fallback
  if (!layer) layer = LAYERS.EPISODIC_MEMORY;

  const secondaryLayers    = inferSecondaryLayers(memory, layer);
  const retentionPolicy    = LAYER_RETENTION[layer] || RETENTION.REVIEW_REQUIRED;
  const salienceScore      = computeSalienceScore(memory, layer);
  const retrievalPriority  = computeRetrievalPriority(memory, layer, salienceScore);

  return {
    layer,
    secondaryLayers,
    retentionPolicy,
    salienceScore,
    retrievalPriority,
    decayStatus: DECAY.ACTIVE,
  };
}

function _fallbackClassification() {
  return {
    layer:             LAYERS.EPISODIC_MEMORY,
    secondaryLayers:   [],
    retentionPolicy:   RETENTION.REVIEW_REQUIRED,
    salienceScore:     0.0,
    retrievalPriority: 0.3,
    decayStatus:       DECAY.ACTIVE,
  };
}

/**
 * Persist classification back to memory_items + log to memory_layer_events.
 * Best-effort — errors are logged and swallowed; never throws.
 *
 * @param {object} db — Supabase client
 * @param {string} memoryId
 * @param {object} classification — from classifyMemoryLayer()
 * @param {string} [reason]
 */
// Returns a structured status { ok, error, code, eventLogged } so callers can
// SURFACE a real persistence failure. The classification UPDATE is authoritative
// and drives `ok` (it previously warned-and-resolved, which looked like success
// to callers). The memory_layer_events insert is secondary logging — its failure
// sets eventLogged:false but does not flip `ok`. Still best-effort: never throws.
async function persistLayerClassification(db, memoryId, classification, reason = 'initial_classification') {
  if (!db || !memoryId) return { ok: false, error: 'missing db or memoryId' };
  const {
    layer, secondaryLayers, retentionPolicy,
    salienceScore, retrievalPriority, decayStatus,
  } = classification;

  let ok = true, error = null, code = null;
  try {
    const { error: updateErr } = await db
      .from('memory_items')
      .update({
        memory_layer:        layer,
        secondary_layers:    secondaryLayers,
        retention_policy:    retentionPolicy,
        salience_score:      salienceScore,
        retrieval_priority:  retrievalPriority,
        decay_status:        decayStatus,
        layer_classified_at: new Date().toISOString(),
      })
      .eq('id', memoryId);

    if (updateErr) {
      ok = false; error = updateErr.message; code = updateErr.code || null;
      console.warn('[memory-layer-classifier] update failed:', updateErr.message);
    }
  } catch (e) {
    ok = false; error = e.message;
    console.warn('[memory-layer-classifier] update threw:', e.message);
  }

  let eventLogged = true;
  try {
    await db.from('memory_layer_events').insert({
      memory_id:          memoryId,
      event_type:         'memory_layer_classified',
      memory_layer:       layer,
      secondary_layers:   secondaryLayers,
      retention_policy:   retentionPolicy,
      decay_status:       decayStatus,
      retrieval_priority: retrievalPriority,
      reason,
      metadata:           { salience_score: salienceScore },
    });
  } catch (e) {
    eventLogged = false;
    console.warn('[memory-layer-classifier] log event threw:', e.message);
  }

  return { ok, error, code, eventLogged };
}

/**
 * Log a retrieval event to memory_layer_events and update last_retrieved_at + retrieval_count.
 * Best-effort.
 */
async function logLayerRetrieval(db, memoryId, layer, reason = 'turn_retrieval') {
  if (!db || !memoryId) return;
  try {
    await Promise.all([
      db.from('memory_items')
        .update({
          last_retrieved_at: new Date().toISOString(),
          retrieval_count: db.rpc
            ? undefined  // use increment below
            : undefined,
        })
        .eq('id', memoryId),

      db.rpc('increment_retrieval_count', { row_id: memoryId })
        .then(() => {})
        .catch(() => {
          // fallback: fetch + update if RPC not available
          return db.from('memory_items').select('retrieval_count').eq('id', memoryId).single()
            .then(({ data }) => {
              if (data) {
                return db.from('memory_items')
                  .update({ retrieval_count: (data.retrieval_count || 0) + 1 })
                  .eq('id', memoryId);
              }
            })
            .catch(() => {});
        }),

      db.from('memory_layer_events').insert({
        memory_id:    memoryId,
        event_type:   'memory_layer_retrieved',
        memory_layer: layer,
        reason,
        metadata:     {},
      }),
    ]);
  } catch (e) {
    console.warn('[memory-layer-classifier] logLayerRetrieval threw:', e.message);
  }
}

/**
 * Update decay status on a memory item and log the change.
 * Enforces append-only log — no deletion.
 * IMMUTABLE_GOVERNANCE items cannot be decayed. Enforced here.
 */
async function advanceDecayStatus(db, memoryId, newDecayStatus, retentionPolicy, reason = 'scheduled_decay') {
  if (!db || !memoryId) return;

  // Governance memory cannot be retired or archived by automated decay
  if (retentionPolicy === RETENTION.IMMUTABLE_GOVERNANCE) {
    console.warn(`[memory-layer-classifier] Refused to decay IMMUTABLE_GOVERNANCE memory ${memoryId}`);
    return;
  }

  if (!Object.values(DECAY).includes(newDecayStatus)) {
    console.warn(`[memory-layer-classifier] Unknown decay status: ${newDecayStatus}`);
    return;
  }

  try {
    const updates = {
      decay_status: newDecayStatus,
      updated_at:   new Date().toISOString(),
    };

    // RETIRED means soft-delete (active=false). No hard deletion — append-only.
    if (newDecayStatus === DECAY.RETIRED) {
      updates.active = false;
    }

    const { error } = await db.from('memory_items').update(updates).eq('id', memoryId);
    if (error) console.warn('[memory-layer-classifier] advanceDecayStatus update error:', error.message);

    const eventType = {
      [DECAY.AGING]:    'memory_layer_decay_aged',
      [DECAY.STALE]:    'memory_layer_decay_stale',
      [DECAY.ARCHIVED]: 'memory_layer_decay_archived',
      [DECAY.RETIRED]:  'memory_layer_decay_retired',
    }[newDecayStatus] || 'memory_layer_decay_aged';

    await db.from('memory_layer_events').insert({
      memory_id:   memoryId,
      event_type:  eventType,
      decay_status: newDecayStatus,
      reason,
      metadata:    {},
    });
  } catch (e) {
    console.warn('[memory-layer-classifier] advanceDecayStatus threw:', e.message);
  }
}

/**
 * Gather memory layer summary for Oracle/daily-log.
 * Returns counts per layer, recent events, active decay statuses.
 */
async function gatherLayerActivity(db, windowHours = 24) {
  if (!db) return { layerCounts: {}, recentEvents: [], decayStats: {} };
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const [layerCountsResult, recentEventsResult, decayStatsResult] = await Promise.all([
    db.from('memory_items')
      .select('memory_layer')
      .eq('active', true)
      .not('memory_layer', 'is', null)
      .then(r => r.data || []),

    db.from('memory_layer_events')
      .select('event_type, memory_layer, decay_status, reason, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(r => r.data || []),

    db.from('memory_items')
      .select('decay_status')
      .eq('active', true)
      .then(r => r.data || []),
  ]);

  const layerCounts = {};
  for (const row of layerCountsResult) {
    const l = row.memory_layer || 'UNCLASSIFIED';
    layerCounts[l] = (layerCounts[l] || 0) + 1;
  }

  const decayStats = {};
  for (const row of decayStatsResult) {
    const d = row.decay_status || 'ACTIVE';
    decayStats[d] = (decayStats[d] || 0) + 1;
  }

  return {
    layerCounts,
    recentEvents: recentEventsResult,
    decayStats,
  };
}

module.exports = {
  LAYERS,
  RETENTION,
  DECAY,
  classifyMemoryLayer,
  persistLayerClassification,
  logLayerRetrieval,
  advanceDecayStatus,
  gatherLayerActivity,
  // exported for tests
  computeSalienceScore,
  computeRetrievalPriority,
  inferSecondaryLayers,
  LAYER_BASE_PRIORITY,
  LAYER_RETENTION,
  MEMORY_TYPE_TO_LAYER,
};
