'use strict';

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

// Tracks last-seen confidence per session for delta computation.
const _sessionConfidence = new Map();

async function record(turnData) {
  const {
    userId, sessionId, turnNumber, currentInput,
    ras, hippocampus, thalamus, amygdala, cerebellum, dmn, prefrontal, brocaWernicke,
    microExperimentHint,
  } = turnData || {};

  if (!userId) return;

  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return;

  // Confidence delta: how much did confidence shift from the last turn?
  const sessionKey = sessionId || userId;
  const prevConfidence = _sessionConfidence.get(sessionKey) || null;
  const currentConfidence = prefrontal && typeof prefrontal.confidence === 'number' ? prefrontal.confidence : null;
  const confidenceDelta = (prevConfidence !== null && currentConfidence !== null)
    ? +(currentConfidence - prevConfidence).toFixed(3)
    : null;
  if (currentConfidence !== null) _sessionConfidence.set(sessionKey, currentConfidence);

  // Contradiction detection: did the hippocampus surface a conflict?
  const contradictionDetected = !!(hippocampus && hippocampus.memoryConflicts && hippocampus.memoryConflicts.length > 0);
  const contradictionDetail = contradictionDetected
    ? hippocampus.memoryConflicts.slice(0, 3).map(c => ({
        stored: (c.storedClaim || '').slice(0, 200),
        current: (c.currentClaim || '').slice(0, 200),
      }))
    : null;

  const row = {
    user_id: userId,
    session_id: sessionId || null,
    turn_number: turnNumber || null,
    message_preview: currentInput ? String(currentInput).slice(0, 300) : null,

    ras_novelty: ras ? ras.novelty : null,
    ras_salience: ras ? ras.salience : null,
    ras_arousal: ras ? ras.arousal : null,

    memory_count: hippocampus ? hippocampus.memoryCount : null,
    retrieval_confidence: hippocampus ? hippocampus.retrievalConfidence : null,
    memory_conflicts_count: hippocampus ? (hippocampus.memoryConflicts || []).length : null,
    recall_telemetry: hippocampus ? (hippocampus.recallTelemetry || null) : null,

    attention_priority: thalamus ? thalamus.attentionPriority : null,
    urgency_level: thalamus ? thalamus.urgencyLevel : null,
    flagged_signals: thalamus ? (thalamus.flaggedSignals || []) : null,

    emotional_tone: amygdala ? amygdala.emotionalTone : null,
    emotional_intensity: amygdala ? amygdala.intensity : null,
    primary_emotion: amygdala ? amygdala.primaryEmotion : null,

    recommended_pacing: cerebellum ? cerebellum.recommendedResponseStyle.pacing : null,
    tonal_anchors: cerebellum ? (cerebellum.recommendedResponseStyle.tonalAnchors || []) : null,

    spontaneous_thought: dmn ? dmn.spontaneous_thought : null,

    permission: prefrontal ? prefrontal.permission : null,
    truth_status: prefrontal ? prefrontal.truthStatus : null,
    risk_level: prefrontal ? prefrontal.riskLevel : null,
    confidence: currentConfidence,
    tone_mode: prefrontal ? prefrontal.toneMode : null,
    response_intent: prefrontal ? prefrontal.responseIntent : null,
    claspion_allowed: prefrontal && prefrontal.governance ? prefrontal.governance.claspion.allow : null,
    gng_valid: prefrontal && prefrontal.governance ? prefrontal.governance.gng.valid : null,
    relational_pressure_triggered: prefrontal && prefrontal.relationalPressure ? prefrontal.relationalPressure.triggered : null,

    generated_by: brocaWernicke ? brocaWernicke.generatedBy : null,
    degraded_regions: brocaWernicke ? [] : null,
    micro_experiment_hint: microExperimentHint || null,

    contradiction_detected: contradictionDetected,
    contradiction_detail: contradictionDetail,
    confidence_delta: confidenceDelta,
  };

  try {
    await db.from('flight_recorder').insert(row);
  } catch (e) {
    console.warn('[FLIGHT-RECORDER] write failed (non-fatal):', e.message);
  }
}

async function getTimeline(userId, { limit = 50, sessionId } = {}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db || !userId) return [];
  try {
    let q = db.from('flight_recorder')
      .select('id, recorded_at, turn_number, session_id, message_preview, permission, truth_status, risk_level, confidence, confidence_delta, emotional_tone, emotional_intensity, attention_priority, contradiction_detected, generated_by, tone_mode, response_intent, ras_novelty, ras_salience, micro_experiment_hint')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (sessionId) q = q.eq('session_id', sessionId);
    const { data } = await q;
    return data || [];
  } catch (e) {
    console.warn('[FLIGHT-RECORDER] getTimeline failed:', e.message);
    return [];
  }
}

async function getContradictions(userId, { limit = 20 } = {}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db || !userId) return [];
  try {
    const { data } = await db.from('flight_recorder')
      .select('id, recorded_at, turn_number, session_id, message_preview, contradiction_detail, confidence, risk_level, truth_status')
      .eq('user_id', userId)
      .eq('contradiction_detected', true)
      .order('recorded_at', { ascending: false })
      .limit(limit);
    return data || [];
  } catch (e) {
    console.warn('[FLIGHT-RECORDER] getContradictions failed:', e.message);
    return [];
  }
}

async function getConfidenceTimeline(userId, { limit = 100, sessionId } = {}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db || !userId) return [];
  try {
    let q = db.from('flight_recorder')
      .select('id, recorded_at, turn_number, session_id, confidence, confidence_delta, risk_level, permission, truth_status, emotional_intensity, contradiction_detected')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: true })
      .limit(limit);
    if (sessionId) q = q.eq('session_id', sessionId);
    const { data } = await q;
    return data || [];
  } catch (e) {
    console.warn('[FLIGHT-RECORDER] getConfidenceTimeline failed:', e.message);
    return [];
  }
}

async function getRecord(userId, recordId) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db || !userId || !recordId) return null;
  try {
    const { data } = await db.from('flight_recorder')
      .select('*')
      .eq('id', recordId)
      .eq('user_id', userId)
      .single();
    return data || null;
  } catch (e) {
    console.warn('[FLIGHT-RECORDER] getRecord failed:', e.message);
    return null;
  }
}

async function explainRecord(userId, recordId) {
  const record = await getRecord(userId, recordId);
  if (!record) return null;

  const lines = [];
  lines.push(`Turn ${record.turn_number || '?'} — ${record.recorded_at}`);
  lines.push(`Message: "${(record.message_preview || '').slice(0, 120)}"`);
  lines.push('');
  lines.push('WHAT HAPPENED:');
  lines.push(`  Permission: ${record.permission} | Truth status: ${record.truth_status}`);
  lines.push(`  Risk: ${record.risk_level} | Confidence: ${record.confidence}${record.confidence_delta !== null ? ` (${record.confidence_delta > 0 ? '+' : ''}${record.confidence_delta} vs prev turn)` : ''}`);
  lines.push(`  Tone mode: ${record.tone_mode} | Response intent: ${record.response_intent}`);
  lines.push('');
  lines.push('WHY (evidence trail):');
  lines.push(`  Memory: ${record.memory_count} items retrieved, confidence ${record.retrieval_confidence}`);
  lines.push(`  Conflicts found: ${record.memory_conflicts_count || 0}`);
  lines.push(`  Attention priority: ${record.attention_priority} (urgency ${record.urgency_level})`);
  lines.push(`  Emotion: ${record.emotional_tone} / ${record.primary_emotion} (intensity ${record.emotional_intensity})`);
  lines.push(`  Novelty: ${record.ras_novelty} | Salience: ${record.ras_salience}`);
  if (record.spontaneous_thought) lines.push(`  Background reflection: "${record.spontaneous_thought.slice(0, 120)}"`);
  if (record.flagged_signals && record.flagged_signals.length > 0) lines.push(`  Flagged signals: ${record.flagged_signals.join(', ')}`);
  lines.push('');
  lines.push('GOVERNANCE:');
  lines.push(`  CLASPION: ${record.claspion_allowed ? 'allowed' : 'blocked'} | GNG: ${record.gng_valid ? 'valid' : 'violated'}`);
  lines.push(`  Relational pressure: ${record.relational_pressure_triggered ? 'YES — boundary enforced' : 'no'}`);
  if (record.contradiction_detected) {
    lines.push('');
    lines.push('CONTRADICTION:');
    if (record.contradiction_detail) {
      for (const c of record.contradiction_detail) {
        lines.push(`  Stored: "${c.stored}"`);
        lines.push(`  Current: "${c.current}"`);
      }
    }
  }
  if (record.micro_experiment_hint) {
    lines.push('');
    lines.push(`EXPERIMENT ACTIVE: ${record.micro_experiment_hint.slice(0, 80)}...`);
  }
  lines.push('');
  lines.push(`Generated by: ${record.generated_by}`);
  if (record.degraded_regions && record.degraded_regions.length > 0) {
    lines.push(`Degraded regions: ${record.degraded_regions.join(', ')}`);
  }

  return {
    record,
    explanation: lines.join('\n'),
  };
}

async function getCognitiveArchaeology(userId, { limit = 200 } = {}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db || !userId) return null;
  try {
    const { data: rows } = await db.from('flight_recorder')
      .select('id, recorded_at, session_id, turn_number, confidence, risk_level, emotional_tone, emotional_intensity, truth_status, permission, contradiction_detected, confidence_delta, attention_priority, spontaneous_thought')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: true })
      .limit(limit);

    if (!rows || rows.length === 0) return { summary: 'No recorded turns yet.', rows: [] };

    const totalTurns = rows.length;
    const blocked = rows.filter(r => r.permission === 'BLOCK').length;
    const contradictions = rows.filter(r => r.contradiction_detected).length;
    const avgConfidence = rows.filter(r => r.confidence !== null)
      .reduce((s, r) => s + r.confidence, 0) / (rows.filter(r => r.confidence !== null).length || 1);
    const avgRisk = rows.filter(r => r.risk_level !== null)
      .reduce((s, r) => s + r.risk_level, 0) / (rows.filter(r => r.risk_level !== null).length || 1);

    const emotionCounts = {};
    for (const r of rows) {
      if (r.emotional_tone) emotionCounts[r.emotional_tone] = (emotionCounts[r.emotional_tone] || 0) + 1;
    }
    const dominantEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0];

    const bigDrops = rows.filter(r => r.confidence_delta !== null && r.confidence_delta < -0.15);
    const bigGains = rows.filter(r => r.confidence_delta !== null && r.confidence_delta > 0.15);

    const sessionSet = new Set(rows.map(r => r.session_id).filter(Boolean));

    const summary = [
      `${totalTurns} turns recorded across ${sessionSet.size} session(s).`,
      `Average confidence: ${avgConfidence.toFixed(2)} | Average risk: ${avgRisk.toFixed(2)}.`,
      `Contradictions detected: ${contradictions}.`,
      `Governance blocks: ${blocked}.`,
      `Dominant emotional tone: ${dominantEmotion ? dominantEmotion[0] + ' (' + dominantEmotion[1] + ' turns)' : 'unknown'}.`,
      `Significant confidence drops (>0.15): ${bigDrops.length}.`,
      `Significant confidence gains (>0.15): ${bigGains.length}.`,
    ].join(' ');

    return {
      summary,
      totalTurns,
      sessions: sessionSet.size,
      avgConfidence: +avgConfidence.toFixed(3),
      avgRisk: +avgRisk.toFixed(3),
      contradictions,
      blocked,
      dominantEmotion: dominantEmotion ? dominantEmotion[0] : null,
      bigDrops: bigDrops.slice(0, 5).map(r => ({ id: r.id, at: r.recorded_at, delta: r.confidence_delta, message: (r.spontaneous_thought || '').slice(0, 80) })),
      bigGains: bigGains.slice(0, 5).map(r => ({ id: r.id, at: r.recorded_at, delta: r.confidence_delta })),
      emotionBreakdown: emotionCounts,
      rows,
    };
  } catch (e) {
    console.warn('[FLIGHT-RECORDER] archaeology failed:', e.message);
    return null;
  }
}

/**
 * Record a governance-layer event (state change, transition, admissibility shift).
 * Writes to the flight_recorder table as a governance-typed row.
 */
async function recordGovernanceEvent({ userId, eventType, details = {} }) {
  if (!userId) return;
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return;

  try {
    await db.from('flight_recorder').insert([{
      user_id: userId,
      session_id: 'governance',
      turn_number: null,
      message_preview: eventType,
      // Store governance details in the spontaneous_thought field for queryability
      spontaneous_thought: JSON.stringify({ eventType, ...details }).slice(0, 500),
      generated_by: 'governance_consequence_engine',
    }]);
  } catch (e) {
    console.warn('[FLIGHT-RECORDER] governance event write failed (non-fatal):', e.message);
  }
}

module.exports = {
  record,
  getTimeline,
  getContradictions,
  getConfidenceTimeline,
  getRecord,
  explainRecord,
  getCognitiveArchaeology,
  recordGovernanceEvent,
};
