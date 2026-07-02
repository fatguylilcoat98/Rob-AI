'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Cognitive Archaeology API

  Surfaces Splendor's belief lifecycle: how reasoning forms, gets tested,
  survives or collapses. Not memory retrieval — archaeology.

  Endpoints:
    GET /api/archaeology/summary           — event counts + survival rate
    GET /api/archaeology/survivors         — beliefs that withstood challenges
    GET /api/archaeology/abandoned         — superseded/archived beliefs
    GET /api/archaeology/oldest-untested   — active beliefs never challenged
    GET /api/archaeology/timeline/:beliefId — full event log for one belief
*/

const express = require('express');
const { requireAuth, requireOwner } = require('../middleware/auth');
const {
  getArchaeologySummary,
  getSurvivorBeliefs,
  getAbandonedBeliefs,
  getOldestUntested,
  getBeliefTimeline,
} = require('../lib/belief-archaeology');

const router = express.Router();

router.get('/summary', requireAuth, requireOwner, async (req, res) => {
  try {
    const summary = await getArchaeologySummary(req.userId);
    res.json({ summary: summary || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/survivors', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const survivors = await getSurvivorBeliefs(req.userId, limit);
    res.json({ survivors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/abandoned', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const abandoned = await getAbandonedBeliefs(req.userId, limit);
    res.json({ abandoned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/oldest-untested', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const untested = await getOldestUntested(req.userId, limit);
    res.json({ untested });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/timeline/:beliefId', requireAuth, requireOwner, async (req, res) => {
  try {
    const timeline = await getBeliefTimeline(req.params.beliefId);
    res.json({ timeline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
