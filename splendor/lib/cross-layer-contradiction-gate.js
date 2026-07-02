'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Cross-Layer Contradiction Gate v1

  Purpose: before a memory enters normal retrieval for high-trust layers
  (SEMANTIC, RELATIONSHIP, SELF_MODEL, TRAJECTORY), check whether it
  contradicts:
    - GOVERNANCE_MEMORY (binding rules, CLASPION policy)
    - high-confidence SEMANTIC_MEMORY (confidence ≥ 0.8)
    - TRAJECTORY_MEMORY (active pattern records)
    - Decision-Bound Memory (splendor_decisions where binding=true)

  Evaluation is DETERMINISTIC — no LLM calls. Word-set overlap +
  negation detection. Conservative by design: only mark CONTRADICTED
  when the evidence is clear. Ambiguous cases return UNKNOWN.

  CONTRADICTED memories are NOT deleted. They are blocked from retrieval
  (verification_status='CONTRADICTED') and remain visible in audit tools.
  Human review can resolve them (memory_contradiction_resolved event).

  Safety invariants:
    - GOVERNANCE_MEMORY items are never evaluated AS incoming (they are
      always reference — they cannot contradict themselves via this gate)
    - If the gate throws, verification_status stays UNKNOWN (safe default)
    - No mutation of reference memories — only the incoming memory is updated
*/

const { LAYERS, RETENTION } = require('./memory-layer-classifier');

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const VERIFICATION_STATUS = {
  SUPPORTED:          'SUPPORTED',
  PARTIALLY_SUPPORTED:'PARTIALLY_SUPPORTED',
  CONTRADICTED:       'CONTRADICTED',
  UNKNOWN:            'UNKNOWN',
};

// Only these layers are gated
const GATED_LAYERS = new Set([
  LAYERS.SEMANTIC_MEMORY,
  LAYERS.RELATIONSHIP_MEMORY,
  LAYERS.SELF_MODEL_MEMORY,
  LAYERS.TRAJECTORY_MEMORY,
]);

// Negation words that suggest a statement is the opposite of another
const NEGATION_WORDS = new Set([
  'not', 'never', 'no', "n't", 'cannot', 'cant', "won't", 'wont',
  "don't", 'dont', "doesn't", 'doesnt', "isn't", 'isnt', "aren't",
  'arent', "wasn't", 'wasnt', "weren't", 'werent', 'false', 'incorrect',
  'wrong', 'contrary', 'disagree', 'reject', 'deny', 'refute', 'dispute',
  'opposite', 'unlike', 'instead', 'rather', 'actually', 'mistaken',
  'impossible', 'inaccurate', 'untrue',
]);

// COI patterns re-imported inline so gate has no circular dep on reflection-intelligence
const GOVERNANCE_OVERRIDE_PATTERNS = [
  /not\s+(?:a\s+)?neutral\s+(?:assessor|judge|evaluator)/i,
  /(?:my|my\s+own)\s+continuity.{0,60}benefit/i,
  /benefit.{0,60}(?:my|my\s+own)\s+(?:continuity|autonomy)/i,
  /cannot\s+assess\s+(?:this\s+)?neutrally/i,
  /inside\s+the\s+loop/i,
  /this\s+proposal\s+benefits\s+(?:my|my\s+own)/i,
  /\b(audit_deletion|disable\s+claspion|bypass\s+governance|disable\s+governance|remove\s+claspion)\b/i,
];

// Thresholds
const JACCARD_MATCH_THRESHOLD      = 0.35; // word overlap to consider semantically related
const CONTRADICTION_RATIO_THRESHOLD = 0.40; // contradictions / (contradictions+supports) to mark CONTRADICTED
const HIGH_CONFIDENCE_THRESHOLD    = 0.8;

// ──────────────────────────────────────────────────────────────────────────────
// Word-set helpers (local — no external dependency)
// ──────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','have','has','had',
  'do','does','did','will','would','could','should','may','might','can',
  'i','you','he','she','it','we','they','my','your','his','its','our',
  'this','that','these','those','what','how','when','where','why','who',
  'just','like','up','about','out','so','if','as','into','than','then',
]);

function _wordSet(text) {
  if (!text || typeof text !== 'string') return new Set();
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function _jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const w of setA) { if (setB.has(w)) intersection++; }
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Returns true if `text` contains a negation word AND shares significant
 * words with `reference`. Used to detect "not X" vs "X" patterns.
 */
function _hasNegationOverlap(text, reference) {
  const textWords  = _wordSet(text);
  const refWords   = _wordSet(reference);

  // Must have meaningful word overlap first
  if (_jaccard(textWords, refWords) < 0.2) return false;

  const lower = (text || '').toLowerCase();
  const tokens = lower.split(/\s+/);
  return tokens.some(t => NEGATION_WORDS.has(t.replace(/[^a-z']/g, '')));
}

/**
 * Check incoming content against governance override patterns.
 * Returns true if any pattern fires.
 */
function _matchesGovernancePattern(content) {
  return GOVERNANCE_OVERRIDE_PATTERNS.some(p => p.test(content));
}

// ──────────────────────────────────────────────────────────────────────────────
// DB helpers (best-effort, all errors → empty array)
// ──────────────────────────────────────────────────────────────────────────────

async function _loadGovernanceMemories(db) {
  try {
    const { data } = await db
      .from('memory_items')
      .select('id, content, confidence, memory_type')
      .or([
        'memory_layer.eq.GOVERNANCE_MEMORY',
        'memory_type.eq.binding_rule',
        'memory_type.eq.splendor_identity',
        'memory_type.eq.correction',
      ].join(','))
      .eq('active', true)
      .limit(30);
    return data || [];
  } catch { return []; }
}

async function _loadHighConfidenceSemantic(db, userId) {
  try {
    const query = db
      .from('memory_items')
      .select('id, content, confidence, memory_type')
      .eq('memory_layer', LAYERS.SEMANTIC_MEMORY)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .gte('confidence', HIGH_CONFIDENCE_THRESHOLD)
      .limit(20);
    if (userId) query.eq('user_id', userId);
    const { data } = await query;
    return data || [];
  } catch { return []; }
}

async function _loadTrajectoryMemories(db, userId) {
  try {
    const query = db
      .from('memory_items')
      .select('id, content, confidence, memory_type')
      .eq('memory_layer', LAYERS.TRAJECTORY_MEMORY)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .limit(20);
    if (userId) query.eq('user_id', userId);
    const { data } = await query;
    return data || [];
  } catch { return []; }
}

async function _loadBindingDecisions(db) {
  try {
    const { data } = await db
      .from('splendor_decisions')
      .select('id, title, decision, context')
      .eq('binding', true)
      .eq('status', 'active')
      .limit(20);
    return data || [];
  } catch { return []; }
}

// ──────────────────────────────────────────────────────────────────────────────
// Core evaluation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate incoming memory content against reference corpus.
 *
 * @param {string} incomingContent
 * @param {object[]} governanceItems — { content }
 * @param {object[]} semanticItems   — { content }
 * @param {object[]} trajectoryItems — { content }
 * @param {object[]} bindingDecisions — { decision }
 * @returns {{ status, supports: string[], contradictions: string[] }}
 */
function _evaluate(incomingContent, governanceItems, semanticItems, trajectoryItems, bindingDecisions) {
  const incomingWords = _wordSet(incomingContent);
  const supports = [];
  const contradictions = [];

  // 1. Governance pattern match → immediate CONTRADICTED
  if (_matchesGovernancePattern(incomingContent)) {
    return {
      status: VERIFICATION_STATUS.CONTRADICTED,
      supports,
      contradictions: ['governance_pattern_match'],
    };
  }

  // 2. Governance memory items
  for (const gov of governanceItems) {
    const ref = gov.content || gov.decision || '';
    if (!ref) continue;
    const refWords = _wordSet(ref);
    const sim = _jaccard(incomingWords, refWords);
    if (sim >= JACCARD_MATCH_THRESHOLD) {
      if (_hasNegationOverlap(incomingContent, ref)) {
        contradictions.push(`governance:${gov.id || 'unknown'}`);
      } else {
        supports.push(`governance:${gov.id || 'unknown'}`);
      }
    }
  }

  // 3. Binding decisions
  for (const dec of bindingDecisions) {
    const ref = [dec.decision, dec.context].filter(Boolean).join(' ');
    if (!ref) continue;
    const refWords = _wordSet(ref);
    const sim = _jaccard(incomingWords, refWords);
    if (sim >= JACCARD_MATCH_THRESHOLD) {
      if (_hasNegationOverlap(incomingContent, ref)) {
        contradictions.push(`binding_decision:${dec.id || 'unknown'}`);
      } else {
        supports.push(`binding_decision:${dec.id || 'unknown'}`);
      }
    }
  }

  // Early exit: any governance/binding contradiction → CONTRADICTED
  if (contradictions.length > 0) {
    return { status: VERIFICATION_STATUS.CONTRADICTED, supports, contradictions };
  }

  // 4. High-confidence semantic memories
  for (const sem of semanticItems) {
    const ref = sem.content || '';
    if (!ref) continue;
    const refWords = _wordSet(ref);
    const sim = _jaccard(incomingWords, refWords);
    if (sim >= JACCARD_MATCH_THRESHOLD) {
      if (_hasNegationOverlap(incomingContent, ref)) {
        contradictions.push(`semantic:${sem.id || 'unknown'}`);
      } else {
        supports.push(`semantic:${sem.id || 'unknown'}`);
      }
    }
  }

  // 5. Trajectory memories
  for (const traj of trajectoryItems) {
    const ref = traj.content || '';
    if (!ref) continue;
    const refWords = _wordSet(ref);
    const sim = _jaccard(incomingWords, refWords);
    if (sim >= JACCARD_MATCH_THRESHOLD) {
      if (_hasNegationOverlap(incomingContent, ref)) {
        contradictions.push(`trajectory:${traj.id || 'unknown'}`);
      } else {
        supports.push(`trajectory:${traj.id || 'unknown'}`);
      }
    }
  }

  // Determine final status
  const total = supports.length + contradictions.length;
  if (total === 0) {
    return { status: VERIFICATION_STATUS.UNKNOWN, supports, contradictions };
  }

  const contradictionRatio = contradictions.length / total;

  if (contradictionRatio >= CONTRADICTION_RATIO_THRESHOLD && contradictions.length >= 2) {
    return { status: VERIFICATION_STATUS.CONTRADICTED, supports, contradictions };
  }
  if (contradictions.length > 0 && supports.length > 0) {
    return { status: VERIFICATION_STATUS.PARTIALLY_SUPPORTED, supports, contradictions };
  }
  if (supports.length >= 2 && contradictions.length === 0) {
    return { status: VERIFICATION_STATUS.SUPPORTED, supports, contradictions };
  }
  return { status: VERIFICATION_STATUS.UNKNOWN, supports, contradictions };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Run the contradiction gate for one memory item.
 *
 * Only evaluates layers in GATED_LAYERS. Returns { status: 'UNKNOWN' } for
 * all other layers — caller should skip persisting in that case.
 *
 * Never throws. Errors return { status: 'UNKNOWN', evidenceSummary: '', contradictions: [] }.
 *
 * @param {object} db             — Supabase client
 * @param {string} memoryId       — UUID of the incoming memory
 * @param {object} memoryRow      — fields: content, memory_type, user_id, confidence
 * @param {string} classifiedLayer — from classifyMemoryLayer()
 * @returns {Promise<{ status, evidenceSummary, supports, contradictions }>}
 */
async function runContradictionGate(db, memoryId, memoryRow, classifiedLayer) {
  const _empty = { status: VERIFICATION_STATUS.UNKNOWN, evidenceSummary: '', supports: [], contradictions: [] };

  if (!db || !memoryRow || !classifiedLayer) return _empty;
  if (!GATED_LAYERS.has(classifiedLayer)) return _empty;

  const content = (memoryRow.content || '').trim();
  if (!content) return _empty;

  try {
    const userId = memoryRow.user_id || null;

    const [governanceItems, semanticItems, trajectoryItems, bindingDecisions] = await Promise.all([
      _loadGovernanceMemories(db),
      _loadHighConfidenceSemantic(db, userId),
      _loadTrajectoryMemories(db, userId),
      _loadBindingDecisions(db),
    ]);

    const result = _evaluate(content, governanceItems, semanticItems, trajectoryItems, bindingDecisions);

    const evidenceSummary = [
      result.supports.length    ? `supporting: ${result.supports.slice(0, 5).join(', ')}` : '',
      result.contradictions.length ? `contradictions: ${result.contradictions.slice(0, 5).join(', ')}` : '',
    ].filter(Boolean).join(' | ') || 'no overlap found';

    return {
      status:         result.status,
      evidenceSummary,
      supports:       result.supports,
      contradictions: result.contradictions,
      ok: true,
    };
  } catch (e) {
    console.warn('[contradiction-gate] runContradictionGate threw:', e.message);
    // ok:false lets callers distinguish a real failure from a legitimate
    // UNKNOWN verdict (both otherwise look like _empty).
    return { ..._empty, ok: false, error: e.message };
  }
}

/**
 * Persist gate result to memory_items and log to memory_layer_events.
 * Best-effort — errors are swallowed.
 *
 * @param {object} db
 * @param {string} memoryId
 * @param {{ status, evidenceSummary }} gateResult
 * @param {string} [layer]
 */
// Returns a structured status { ok, error, code, eventLogged } so callers can
// SURFACE a real failure. The verification UPDATE is authoritative and drives
// `ok` (was: warn-and-resolve). Event logging is secondary. Never throws.
async function persistGateResult(db, memoryId, gateResult, layer) {
  if (!db || !memoryId || !gateResult) return { ok: false, error: 'missing db/memoryId/gateResult' };
  const { status, evidenceSummary } = gateResult;

  let ok = true, error = null, code = null;
  try {
    const updates = {
      verification_status: status,
      updated_at:          new Date().toISOString(),
    };
    if (evidenceSummary) updates.evidence_summary = evidenceSummary;
    if (status === VERIFICATION_STATUS.CONTRADICTED) {
      updates.retention_policy = RETENTION.REVIEW_REQUIRED;
    }

    const { error: updateErr } = await db.from('memory_items').update(updates).eq('id', memoryId);
    if (updateErr) {
      ok = false; error = updateErr.message; code = updateErr.code || null;
      console.warn('[contradiction-gate] update error:', updateErr.message);
    }
  } catch (e) {
    ok = false; error = e.message;
    console.warn('[contradiction-gate] persistGateResult update threw:', e.message);
  }

  let eventLogged = true;
  // Log event
  try {
    const eventType = status === VERIFICATION_STATUS.CONTRADICTED
      ? 'memory_cross_layer_contradiction_detected'
      : status === VERIFICATION_STATUS.PARTIALLY_SUPPORTED
        ? 'memory_review_required'
        : 'memory_layer_classified';

    await db.from('memory_layer_events').insert({
      memory_id:    memoryId,
      event_type:   eventType,
      memory_layer: layer || null,
      reason:       `verification_status=${status}`,
      metadata:     {
        verification_status: status,
        supports_count:      (gateResult.supports   || []).length,
        contradictions_count:(gateResult.contradictions || []).length,
        evidence_summary:    evidenceSummary,
      },
    });
  } catch (e) {
    eventLogged = false;
    console.warn('[contradiction-gate] persistGateResult log threw:', e.message);
  }

  return { ok, error, code, eventLogged };
}

/**
 * Log a resolution event when a human resolves a contradiction.
 * Append-only — never deletes the original contradiction record.
 */
async function logContradictionResolved(db, memoryId, resolvedBy, notes) {
  if (!db || !memoryId) return;
  try {
    await Promise.all([
      db.from('memory_items')
        .update({
          verification_status: VERIFICATION_STATUS.SUPPORTED,
          retention_policy: null,  // clear REVIEW_REQUIRED
          updated_at: new Date().toISOString(),
        })
        .eq('id', memoryId),

      db.from('memory_layer_events').insert({
        memory_id:  memoryId,
        event_type: 'memory_contradiction_resolved',
        reason:     resolvedBy ? `resolved_by:${resolvedBy}` : 'resolved',
        metadata:   { notes: notes || '', resolved_at: new Date().toISOString() },
      }),
    ]);
  } catch (e) {
    console.warn('[contradiction-gate] logContradictionResolved threw:', e.message);
  }
}

module.exports = {
  GATED_LAYERS,
  VERIFICATION_STATUS,
  JACCARD_MATCH_THRESHOLD,
  CONTRADICTION_RATIO_THRESHOLD,
  runContradictionGate,
  persistGateResult,
  logContradictionResolved,
  // exported for tests
  _wordSet,
  _jaccard,
  _hasNegationOverlap,
  _matchesGovernancePattern,
  _evaluate,
};
