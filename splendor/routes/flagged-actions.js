'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Flagged Actions API

  GET  /api/flagged-actions          → list all flagged actions (owner only)
  POST /api/flagged-actions/:id/outcome → mark as acted/dismissed/noted
*/

const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner } = require('../middleware/auth');
const { updateOutcome, getAllActions } = require('../lib/action-outcome-tracker');

// List all flagged actions (owner dashboard)
router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const userId = req.userId;
    const items  = await getAllActions({ userId, limit });
    res.json({ ok: true, items, total: items.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Record an outcome for a flagged action
router.post('/:id/outcome', requireAuth, requireOwner, async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body || {};

  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  if (!status) return res.status(400).json({ ok: false, error: 'status required' });

  const result = await updateOutcome(id, status, notes);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

module.exports = router;
