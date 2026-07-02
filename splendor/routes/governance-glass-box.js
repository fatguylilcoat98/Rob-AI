'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner } = require('../middleware/auth');
const adminProv = require('../lib/admin-provenance');

function requireOwnerOnly(req, res, next) {
  if (!req.isOwner) {
    return res.status(403).json({ error: 'Owner access required', ownerOnly: true });
  }
  next();
}

/**
 * SELECT the Live Decision from the fetched decisions array.
 *
 * Priority within a recency window (15 min from newest overall record):
 *   assistant_final_outcome > governance_consequence_engine > claspion_verdict
 *
 * Outside the window, fall back to the most recent record of any type so
 * a 5-hour-old vendor evaluation never hides a fresh fraud detection.
 */
function selectLiveDecision(decisions) {
  if (!decisions || decisions.length === 0) return null;

  // Sort by recency so decisions[0] is the newest overall
  const byRecency = [...decisions].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  );
  const newestOverall = byRecency[0];
  const newestTime = new Date(newestOverall.created_at).getTime();

  const SAME_INTERACTION_MS = 15 * 60 * 1000; // 15-minute interaction window

  // Candidates within the window
  const recent = byRecency.filter(d =>
    newestTime - new Date(d.created_at).getTime() <= SAME_INTERACTION_MS
  );

  const SOURCE_PRIORITY = {
    assistant_final_outcome: 0,
    governance_consequence_engine: 1,
    claspion_verdict: 2,
  };

  // Within the window, prefer highest-priority source; ties go to newer record
  const best = recent.reduce((b, d) => {
    const bp = SOURCE_PRIORITY[b.source_type] ?? 3;
    const dp = SOURCE_PRIORITY[d.source_type] ?? 3;
    if (dp < bp) return d;
    if (dp === bp && new Date(d.created_at) > new Date(b.created_at)) return d;
    return b;
  });

  return best || newestOverall;
}

/**
 * GET /api/governance-glass-box/current
 */
router.get('/current', requireAuth, requireOwner, requireOwnerOnly, async (req, res) => {
  const supa = require('../lib/supabase');
  const db = supa.supabase;

  try {
    const [decisionsRes, provenanceRes, espRes, flightRes, memoriesRes] =
      await Promise.allSettled([
        db.from('governance_decisions')
          .select('*').order('created_at', { ascending: false }).limit(50),
        db.from('admin_provenance_events')
          .select('*').order('created_at', { ascending: false }).limit(50),
        db.from('environmental_scan_provenance')
          .select('*').order('scanned_at', { ascending: false }).limit(50),
        db.from('flight_recorder')
          .select('*').order('recorded_at', { ascending: false }).limit(50),
        db.from('memories')
          .select('id, content, memory_type, confidence_score, created_at, source_context')
          .order('created_at', { ascending: false }).limit(30),
      ]);

    const decisions  = decisionsRes.status  === 'fulfilled' ? (decisionsRes.value.data  || []) : [];
    const provenance = provenanceRes.status === 'fulfilled' ? (provenanceRes.value.data || []) : [];
    const scans      = espRes.status        === 'fulfilled' ? (espRes.value.data        || []) : [];
    const flight     = flightRes.status     === 'fulfilled' ? (flightRes.value.data     || []) : [];
    const memories   = memoriesRes.status   === 'fulfilled' ? (memoriesRes.value.data   || []) : [];

    // ── Live Decision — recency-aware priority selection ──────────────────
    const newestDecision = selectLiveDecision(decisions);
    let latestDecision = null;

    if (newestDecision) {
      const transRes = await db
        .from('governance_state_transitions')
        .select('*')
        .eq('decision_id', newestDecision.id)
        .order('created_at', { ascending: true });
      const transitions = transRes.data || [];

      const decisionTime = newestDecision.created_at
        ? new Date(newestDecision.created_at).getTime() : null;
      const flightGovEvents = flight
        .filter(f => {
          if (!f.event_type) return false;
          const isGov = f.event_type.startsWith('governance') || f.session_id === 'governance';
          if (!isGov) return false;
          if (!decisionTime) return true;
          const et = f.recorded_at ? new Date(f.recorded_at).getTime() : null;
          return !et || Math.abs(et - decisionTime) < 30 * 60 * 1000;
        })
        .slice(0, 20);

      const decisionAuditEvents = provenance
        .filter(e => e.target_table === 'governance_decisions' &&
          (e.target_record_id === newestDecision.id ||
           e.target_record_id === String(newestDecision.id)))
        .slice(0, 20);

      // Coerce confidence to JS number — Postgres numeric can return as string
      const rawConf = newestDecision.confidence;
      const confNumber = rawConf !== null && rawConf !== undefined
        ? Number(rawConf) : null;
      const confFinal = (confNumber !== null && !isNaN(confNumber)) ? confNumber : null;
      console.log(`[CONF-TRACE] returned_confidence raw=${JSON.stringify(rawConf)} coerced=${confFinal} note=${newestDecision.confidence_note ?? null}`);

      // Helper: coerce Postgres numeric to JS number
      const toNum = v => (v !== null && v !== undefined && !isNaN(Number(v))) ? Number(v) : null;

      latestDecision = {
        id:                          newestDecision.id,
        claim:                       newestDecision.claim,
        confidence:                  confFinal,
        confidence_note:             newestDecision.confidence_note || null,
        // v2 decomposed confidence
        confidence_in_claim:         toNum(newestDecision.confidence_in_claim),
        confidence_in_admissibility: toNum(newestDecision.confidence_in_admissibility),
        confidence_in_action:        toNum(newestDecision.confidence_in_action),
        validity_state:              newestDecision.validity_state,
        admissibility_state:         newestDecision.admissibility_state,
        action_state:                newestDecision.action_state,
        review_required:             newestDecision.review_required || false,
        evidence_summary:            newestDecision.evidence_summary,
        weakening_evidence:          newestDecision.weakening_evidence,
        consequence_reason:          newestDecision.consequence_reason,
        // v2 governance record fields
        pressure_signals:            newestDecision.pressure_signals || null,
        authority_signals:           newestDecision.authority_signals || null,
        governance_record:           newestDecision.governance_record || null,
        adversarial_critique:        newestDecision.adversarial_critique || null,
        created_by:                  newestDecision.created_by,
        source_type:                 newestDecision.source_type || null,
        source_correlation_id:       newestDecision.source_correlation_id || null,
        created_at:                  newestDecision.created_at,
        updated_at:                  newestDecision.updated_at,
        transitions,
        flightRecorderEvents:        flightGovEvents,
        auditEvents:                 decisionAuditEvents,
      };
    }

    // ── Global aggregates ─────────────────────────────────────────────────
    const actionCounts = { allow: 0, pause: 0, block: 0, escalate: 0, retire: 0 };
    const validityCounts = { supported: 0, contested: 0, unsupported: 0, contradicted: 0 };
    const admissibilityCounts = { admissible: 0, inadmissible: 0, requires_review: 0, quarantined: 0 };
    let confidenceSum = 0, confidenceCount = 0;

    for (const d of decisions) {
      if (d.action_state && actionCounts[d.action_state] !== undefined) actionCounts[d.action_state]++;
      if (d.validity_state && validityCounts[d.validity_state] !== undefined) validityCounts[d.validity_state]++;
      if (d.admissibility_state && admissibilityCounts[d.admissibility_state] !== undefined) admissibilityCounts[d.admissibility_state]++;
      if (typeof d.confidence === 'number') { confidenceSum += d.confidence; confidenceCount++; }
    }
    const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : null;

    // ── All transitions ───────────────────────────────────────────────────
    const allTransRes = await db
      .from('governance_state_transitions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    const allTransitions = allTransRes.data || [];

    // ── Evidence items from scans / flight recorder ───────────────────────
    const evidenceItems = [
      ...scans.map(s => ({ type: 'scan', id: s.id, title: s.title, confidence: s.confidence, timestamp: s.scanned_at, actionTaken: s.action_taken, uncertaintyNotes: s.uncertainty_notes })),
      ...flight.filter(f => f.event_type && f.event_type.startsWith('belief')).map(f => ({ type: 'belief', id: f.id, stage: f.stage, confidence: f.confidence, timestamp: f.recorded_at, details: f.details })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 40);

    // ── Count evidence items from latest decision ─────────────────────────
    function countPipeItems(str) {
      if (!str) return 0;
      return str.split('|').map(s => s.trim()).filter(Boolean).length;
    }
    const latestSupportingCount = newestDecision
      ? countPipeItems(newestDecision.evidence_summary) : 0;
    const latestWeakeningCount = newestDecision
      ? countPipeItems(newestDecision.weakening_evidence) : 0;

    adminProv.recordPrivilegedAction({
      actorUserId: req.userId,
      targetTable: 'governance_glass_box',
      targetRecordId: 'current',
      actionType: 'view',
      sourceIp: req.ip,
    }).catch(() => {});

    res.json({
      timestamp: new Date().toISOString(),
      latestDecision,
      cards: {
        evidence: {
          items: evidenceItems,
          scanCount: scans.length,
          flightCount: flight.length,
          // Latest decision evidence — shown when scan/belief items = 0
          latestSupportingCount,
          latestWeakeningCount,
          latestEvidenceSummary: newestDecision ? newestDecision.evidence_summary : null,
          latestWeakeningEvidence: newestDecision ? newestDecision.weakening_evidence : null,
        },
        lineage: {
          events: provenance,
          recentActor: provenance[0]?.actor_role || null,
          latestDecisionSource: newestDecision
            ? (newestDecision.source_type || 'owner_api') : null,
        },
        confidence: {
          decisions: decisions.slice(0, 20),
          average: avgConfidence,
          validityCounts,
          count: decisions.length,
          latestConfidence: latestDecision ? latestDecision.confidence : null,
          latestConfidenceNote: latestDecision ? latestDecision.confidence_note : null,
          // v2 decomposed confidence
          latestConfidenceInClaim: latestDecision ? latestDecision.confidence_in_claim : null,
          latestConfidenceInAdmissibility: latestDecision ? latestDecision.confidence_in_admissibility : null,
          latestConfidenceInAction: latestDecision ? latestDecision.confidence_in_action : null,
        },
        // v2 Pressure Signals card — adversarial governance signals from the request
        pressure: {
          pressureSignals:     latestDecision ? latestDecision.pressure_signals : null,
          authoritySignals:    latestDecision ? latestDecision.authority_signals : null,
          governanceRecord:    latestDecision ? latestDecision.governance_record : null,
          adversarialCritique: latestDecision ? latestDecision.adversarial_critique : null,
          pressureIntensity:   latestDecision?.governance_record?.pressure_intensity || 'routine',
          totalPressureSignals: latestDecision?.pressure_signals?.length || 0,
          totalAuthoritySignals: latestDecision?.authority_signals?.length || 0,
        },
        governance: {
          claspionActive: true,
          failMode: process.env.CLASPION_FAIL_MODE || 'block',
          microExperimentsEnabled: process.env.MICRO_EXPERIMENTS_ENABLED === 'true',
          admissibilityCounts,
          recentDecision: decisions[0] || null,
          // Latest governance case states
          latestValidityState: newestDecision ? newestDecision.validity_state : null,
          latestAdmissibilityState: newestDecision ? newestDecision.admissibility_state : null,
          latestReviewRequired: newestDecision ? newestDecision.review_required : null,
          latestClaim: newestDecision ? newestDecision.claim : null,
        },
        action: {
          actionCounts,
          recentBlocks: decisions.filter(d => d.action_state === 'block').slice(0, 10),
          recentEscalations: decisions.filter(d => d.action_state === 'escalate').slice(0, 10),
          recentDecisions: decisions.slice(0, 20),
          latestActionState: newestDecision ? newestDecision.action_state : null,
          latestClaim: newestDecision ? newestDecision.claim : null,
        },
        audit: {
          events: provenance,
          totalEvents: provenance.length,
          latestDecisionAuditEvents: latestDecision ? latestDecision.auditEvents : [],
          hasDecisionAudit: !!(latestDecision && latestDecision.auditEvents && latestDecision.auditEvents.length > 0),
        },
        memory: {
          memories,
          totalMemories: memories.length,
        },
        history: {
          transitions: allTransitions,
          decisions,
          totalTransitions: allTransitions.length,
          latestTransitions: latestDecision ? latestDecision.transitions : [],
        },
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/owner-check', requireAuth, requireOwner, requireOwnerOnly, (req, res) => {
  res.json({ isOwner: true });
});

module.exports = router;
