'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner } = require('../middleware/auth');
const gce = require('../lib/governance-consequence-engine');
const adminProv = require('../lib/admin-provenance');

// GET /api/governance-decisions/recent
router.get('/recent', requireAuth, requireOwner, async (req, res) => {
  const supa = require('../lib/supabase');
  const db = supa.supabase;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const { data, error } = await db
    .from('governance_decisions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ decisions: data || [] });
});

// GET /api/governance-decisions/:id
router.get('/:id', requireAuth, requireOwner, async (req, res) => {
  const supa = require('../lib/supabase');
  const db = supa.supabase;
  const { data, error } = await db
    .from('governance_decisions')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Not found' });

  adminProv.recordPrivilegedAction({
    actorUserId: req.userId,
    targetTable: 'governance_decisions',
    targetRecordId: req.params.id,
    actionType: 'view',
    sourceIp: req.ip,
  }).catch(() => {});

  res.json({ decision: data });
});

// GET /api/governance-decisions/:id/transitions
router.get('/:id/transitions', requireAuth, requireOwner, async (req, res) => {
  const supa = require('../lib/supabase');
  const db = supa.supabase;
  const { data, error } = await db
    .from('governance_state_transitions')
    .select('*')
    .eq('decision_id', req.params.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ transitions: data || [] });
});

// POST /api/governance-decisions — create a decision
router.post('/', requireAuth, requireOwner, async (req, res) => {
  const { claim, confidence, evidenceSummary, weakeningEvidence,
    validityState, admissibilityState, actionState, consequenceReason } = req.body;
  if (!claim) return res.status(400).json({ error: 'claim required' });

  const { decision, error } = await gce.createDecision({
    userId: req.userId, claim, confidence, evidenceSummary, weakeningEvidence,
    validityState, admissibilityState, actionState, consequenceReason,
    createdBy: 'owner_api'
  });
  if (error) return res.status(500).json({ error });

  adminProv.recordPrivilegedAction({
    actorUserId: req.userId, targetTable: 'governance_decisions',
    targetRecordId: decision && decision.id, actionType: 'create',
    newValue: decision, sourceIp: req.ip,
  }).catch(() => {});

  res.json({ decision });
});

// POST /api/governance-decisions/:id/transition
router.post('/:id/transition', requireAuth, requireOwner, async (req, res) => {
  const { validityState, admissibilityState, actionState, reason } = req.body;
  const { error } = await gce.transitionDecision({
    decisionId: req.params.id, userId: req.userId,
    actor: 'owner_api', validityState, admissibilityState, actionState, reason
  });
  if (error) return res.status(500).json({ error });
  res.json({ ok: true });
});

module.exports = router;
