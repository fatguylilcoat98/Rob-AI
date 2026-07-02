'use strict';

/*
  Splendor — Governance Continuity Safeguards v1
  API routes for Oracle inspection and owner actions.

  All routes require authentication + owner-level access.
  No chat-level actor can mutate governance continuity settings.
*/

const express = require('express');
const { requireAuth, requireOwner } = require('../middleware/auth');
const gc = require('../lib/governance-continuity');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

function db() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );
}

const OWNER = process.env.SPLENDOR_OWNER_EMAIL || 'chris';

// Full status snapshot for Oracle tab
router.get('/status', requireAuth, requireOwner, async (req, res) => {
  try {
    const client = db();
    const [cadenceRow, queueRow, dormant, pendingDelegates, recentScans, eventsRow] = await Promise.all([
      client.from('governance_cadence_mirrors').select('*').eq('owner', OWNER).maybeSingle(),
      client.from('resolution_queue_health').select('*').eq('owner', OWNER).order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      gc.getDormantState(OWNER),
      gc.getPendingDelegateDecisions(OWNER),
      gc.getRecentScans(OWNER, 5),
      client.from('governance_continuity_events').select('*').eq('owner', OWNER).order('created_at', { ascending: false }).limit(20),
    ]);
    res.json({
      cadence:        cadenceRow.data   || null,
      queue:          queueRow.data     || null,
      dormant,
      pendingDelegates,
      recentScans,
      recentEvents:   eventsRow.data    || [],
    });
  } catch (err) {
    console.error('[governance-continuity] /status error:', err.message);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Run queue health check
router.get('/queue', requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await gc.checkQueueHealth({ owner: OWNER });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Run cadence mirror check
router.get('/cadence', requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await gc.checkCadenceMirror({ owner: OWNER });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// List recent retroactive safety scans
router.get('/retro-scans', requireAuth, requireOwner, async (req, res) => {
  try {
    const scans = await gc.getRecentScans(OWNER, 20);
    res.json(scans);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Trigger a new retroactive safety scan
router.post('/retro-scans/trigger', requireAuth, requireOwner, async (req, res) => {
  try {
    const { governanceChangeId, governanceChangeDescription } = req.body || {};
    const result = await gc.triggerRetroScan({ owner: OWNER, governanceChangeId, governanceChangeDescription });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// List delegate ledger entries
router.get('/delegates', requireAuth, requireOwner, async (req, res) => {
  try {
    const { data } = await db()
      .from('delegate_ledger')
      .select('*')
      .eq('owner', OWNER)
      .order('created_at', { ascending: false })
      .limit(50);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Record a new delegate decision
router.post('/delegates', requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await gc.recordDelegateDecision({ owner: OWNER, ...req.body });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Ratify a provisional delegate decision
router.post('/delegates/:id/ratify', requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await gc.ratifyDelegateDecision(req.params.id, OWNER);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Reject a provisional delegate decision
router.post('/delegates/:id/reject', requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await gc.rejectDelegateDecision(req.params.id, OWNER);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Get current dormant mode state
router.get('/dormant', requireAuth, requireOwner, async (req, res) => {
  try {
    const state = await gc.getDormantState(OWNER);
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Reactivate from dormant/maintenance (owner only)
router.post('/dormant/reactivate', requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await gc.reactivateDormantMode(OWNER);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// List governance continuity events (safeguard audit log)
router.get('/events', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const safeguard = req.query.safeguard || null;
    let q = db()
      .from('governance_continuity_events')
      .select('*')
      .eq('owner', OWNER)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (safeguard) q = q.eq('safeguard', safeguard);
    const { data } = await q;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Trigger governance version backfill (owner only)
router.post('/version-backfill', requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await gc.backfillGovernanceVersions({ owner: OWNER });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
