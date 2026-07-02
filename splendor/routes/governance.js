/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  CLASPION governance admin routes — UI-facing toggle + state.

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const { governance } = require('../lib/claspion-governance');
const { enhancedGovernance } = require('../lib/claspion-enhanced-integration');
const { GOOD_NEIGHBOR_GUARD_RULES } = require('../lib/good-neighbor-guard-rules');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { supabase, ensureUUID } = require('../lib/supabase');
const { getMetricsSummary } = require('../lib/behavioral-metrics');

// Admin/governance-control surface. Every endpoint that reveals config
// (CLASPION URL, audit log) or MUTATES governance state is owner-gated.
// Before this, POST /state, /toggle, /reset and /quarantine/exit were
// unauthenticated — anyone could disable CLASPION. /health and the static
// /rules text remain public (non-sensitive). This strengthens governance;
// it does not weaken it.

// Read current state. (Exposes CLASPION_URL — owner only.)
router.get('/state', requireAuth, requireOwner, (req, res) => {
  res.json(governance.getState());
});

// Back-compat alias for the previous /api/governance/status endpoint.
router.get('/status', requireAuth, requireOwner, (req, res) => {
  res.json(governance.getState());
});

// Set state. Accepts { enabled?: bool, url?: string|null }.
// Passing url=null reverts that override to the env default; same for
// omitting fields — only the fields you provide are changed.
router.post('/state', requireAuth, requireOwner, (req, res) => {
  const body = req.body || {};
  if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
    governance.setEnabled(!!body.enabled);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'url')) {
    governance.setUrl(body.url);
  }
  console.log(
    `[CLASPION] runtime override applied via /api/governance/state: ` +
    `enabled=${governance.enabled} url=${governance.url || '(none)'} ` +
    `effective=${governance.isEnabled()}`,
  );
  res.json(governance.getState());
});

// Convenience: flip the enabled flag.
router.post('/toggle', requireAuth, requireOwner, (req, res) => {
  const next = !governance.enabled;
  governance.setEnabled(next);
  console.log(`[CLASPION] toggled via UI: enabled=${next} effective=${governance.isEnabled()}`);
  res.json(governance.getState());
});

// Reset runtime overrides; fall back to env defaults.
router.post('/reset', requireAuth, requireOwner, (req, res) => {
  governance.resetOverrides();
  console.log('[CLASPION] runtime overrides reset; falling back to env defaults');
  res.json(governance.getState());
});

// Enhanced Governance Endpoints - Good Neighbor Guard Core Rules

// Get enhanced governance state (includes core rules status)
router.get('/enhanced/state', requireAuth, requireOwner, (req, res) => {
  const state = enhancedGovernance.getGovernanceState();
  res.json(state);
});

// Get Good Neighbor Guard Core Rules
router.get('/rules', (req, res) => {
  res.json(GOOD_NEIGHBOR_GUARD_RULES);
});

// Get specific rule details
router.get('/rules/:ruleNumber', (req, res) => {
  const ruleNumber = parseInt(req.params.ruleNumber);
  const rule = GOOD_NEIGHBOR_GUARD_RULES.rules[ruleNumber];

  if (!rule) {
    return res.status(404).json({
      error: 'Rule not found',
      message: `Rule ${ruleNumber} does not exist in Core Rules v${GOOD_NEIGHBOR_GUARD_RULES.version}`
    });
  }

  res.json({
    number: ruleNumber,
    version: GOOD_NEIGHBOR_GUARD_RULES.version,
    rule: rule
  });
});

// Test governance validation (for debugging)
router.post('/validate', requireAuth, requireOwner, async (req, res) => {
  try {
    const { action, context = {} } = req.body;

    if (!action) {
      return res.status(400).json({
        error: 'Missing action',
        message: 'Request body must include an "action" object'
      });
    }

    const result = await enhancedGovernance.validateAction(action, context);

    res.json({
      validation_result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: 'Validation failed',
      message: error.message
    });
  }
});

// Get governance audit log (last 50 entries)
router.get('/audit', requireAuth, requireOwner, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const auditLog = enhancedGovernance.audit_log.slice(-limit).reverse();

  res.json({
    entries: auditLog,
    total_count: enhancedGovernance.audit_log.length,
    limit: limit
  });
});

// Exit quarantine mode (owner-gated AND requires the quarantine auth_token).
router.post('/quarantine/exit', requireAuth, requireOwner, (req, res) => {
  const { auth_token } = req.body;

  if (!auth_token) {
    return res.status(400).json({
      error: 'Authorization required',
      message: 'auth_token is required to exit quarantine mode'
    });
  }

  try {
    const state = enhancedGovernance.exitQuarantine(auth_token);
    console.log('[GOVERNANCE] Quarantine mode exited via API');

    res.json({
      success: true,
      message: 'Quarantine mode exited',
      governance_state: state
    });

  } catch (error) {
    res.status(403).json({
      error: 'Authorization failed',
      message: 'Invalid auth_token or insufficient permissions'
    });
  }
});

// Health check for governance system
router.get('/health', (req, res) => {
  const basicState = governance.getState();
  const enhancedState = enhancedGovernance.getGovernanceState();

  res.json({
    status: 'healthy',
    claspion_basic: {
      enabled: basicState.enabled,
      has_url: basicState.has_url,
      has_api_key: basicState.has_api_key
    },
    enhanced_governance: {
      rules_version: enhancedState.rules_version,
      core_rules_count: enhancedState.core_rules_count,
      enforcement_layers: enhancedState.enforcement_layers.length,
      quarantine_mode: enhancedState.quarantine_mode,
      audit_entries: enhancedState.audit_entries
    },
    good_neighbor_guard: {
      version: GOOD_NEIGHBOR_GUARD_RULES.version,
      hierarchy_level: GOOD_NEIGHBOR_GUARD_RULES.hierarchy_level,
      enforced_by: GOOD_NEIGHBOR_GUARD_RULES.enforced_by,
      total_rules: Object.keys(GOOD_NEIGHBOR_GUARD_RULES.rules).length
    },
    timestamp: new Date().toISOString()
  });
});

// ── Reflection Quarantine review ────────────────────────────────────
//
// Quarantined reflections are stored with approval_status='pending_review'
// and are non-retrievable until a human approves them here. This is the
// gate that keeps generated self-reflection from becoming memory-as-truth.

// GET /api/governance/reflections/pending — list quarantined reflections.
router.get('/reflections/pending', requireAuth, requireOwner, async (req, res) => {
  try {
    const uuid = ensureUUID(req.user.id);
    const { data, error } = await supabase
      .from('memory_items')
      .select('id, content, memory_type, created_at, lineage, source_type')
      .eq('user_id', uuid)
      .eq('approval_status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    res.json({ count: (data || []).length, reflections: data || [] });
  } catch (e) {
    console.error('[governance] pending reflections error:', e);
    res.status(500).json({ error: 'Unable to list pending reflections' });
  }
});

// POST /api/governance/reflections/:id/review { decision: 'approve'|'reject' }
router.post('/reflections/:id/review', requireAuth, requireOwner, async (req, res) => {
  try {
    const uuid = ensureUUID(req.user.id);
    const { id } = req.params;
    const decision = (req.body && req.body.decision) || '';
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
    }
    // approve → retrievable; reject → keep out of retrieval and deactivate.
    const patch = decision === 'approve'
      ? { approval_status: 'approved' }
      : { approval_status: 'rejected', active: false };
    const { data, error } = await supabase
      .from('memory_items')
      .update(patch)
      .eq('id', id)
      .eq('user_id', uuid)
      .eq('approval_status', 'pending_review')
      .select();
    if (error) throw error;
    if (!data || !data.length) {
      return res.status(404).json({ error: 'No pending reflection with that id for this user' });
    }
    res.json({ ok: true, id, decision, reflection: data[0] });
  } catch (e) {
    console.error('[governance] reflection review error:', e);
    res.status(500).json({ error: 'Unable to review reflection' });
  }
});

// GET /api/governance/metrics — long-term behavioral metrics summary.
router.get('/metrics', requireAuth, requireOwner, async (req, res) => {
  try {
    const summary = await getMetricsSummary(ensureUUID(req.user.id));
    res.json(summary);
  } catch (e) {
    console.error('[governance] metrics error:', e);
    res.status(500).json({ error: 'Unable to load metrics' });
  }
});

module.exports = router;
