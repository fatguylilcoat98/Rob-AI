'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Self-Modification Proposals API

  Splendor proposes changes to her own architecture. These endpoints let
  Chris review and approve or reject those proposals from the Oracle interface.

  GET  /api/self-modification              — list all proposals (newest first)
  POST /api/self-modification/:id/approve  — approve a pending proposal
  POST /api/self-modification/:id/reject   — reject with a reason
*/

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

const db = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

function ensureDb(res) {
  if (!db) { res.status(503).json({ error: 'database_not_configured' }); return false; }
  return true;
}

router.get('/', requireAuth, requireOwner, async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const status = req.query.status || null;
    let query = db
      .from('self_modification_proposals')
      .select('*')
      .eq('user_id', req.userId)
      .order('proposed_at', { ascending: false })
      .limit(50);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ proposals: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/approve', requireAuth, requireOwner, async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const { data: existing } = await db
      .from('self_modification_proposals')
      .select('id, status, user_id')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (!existing) return res.status(404).json({ error: 'proposal_not_found' });
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: 'proposal_not_pending', status: existing.status });
    }
    const { error } = await db
      .from('self_modification_proposals')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) throw error;
    console.log(`[self-modification] Proposal ${req.params.id} approved by owner`);
    res.json({ success: true, status: 'approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reject', requireAuth, requireOwner, async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const reason = (req.body && req.body.reason || '').trim().slice(0, 500);
    const { data: existing } = await db
      .from('self_modification_proposals')
      .select('id, status, user_id')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (!existing) return res.status(404).json({ error: 'proposal_not_found' });
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: 'proposal_not_pending', status: existing.status });
    }
    const { error } = await db
      .from('self_modification_proposals')
      .update({
        status: 'rejected',
        rejection_reason: reason || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id);
    if (error) throw error;
    console.log(`[self-modification] Proposal ${req.params.id} rejected by owner`);
    res.json({ success: true, status: 'rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
