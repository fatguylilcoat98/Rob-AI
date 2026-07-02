'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner } = require('../middleware/auth');

function lib() {
  try { return require('../lib/flight-recorder'); } catch (_) { return null; }
}

router.use(requireAuth, requireOwner);

// GET /api/flight-recorder/timeline
// Last N turns. ?limit=50 ?session=<id>
router.get('/timeline', async (req, res) => {
  const fr = lib();
  if (!fr) return res.json([]);
  try {
    const limit = Math.min(500, parseInt(req.query.limit) || 50);
    const sessionId = req.query.session || undefined;
    const rows = await fr.getTimeline(req.userId, { limit, sessionId });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/flight-recorder/contradictions
// Turns where a memory conflict was detected.
router.get('/contradictions', async (req, res) => {
  const fr = lib();
  if (!fr) return res.json([]);
  try {
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const rows = await fr.getContradictions(req.userId, { limit });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/flight-recorder/confidence
// Confidence + delta over time — primary data source for Phase 2 visual.
router.get('/confidence', async (req, res) => {
  const fr = lib();
  if (!fr) return res.json([]);
  try {
    const limit = Math.min(500, parseInt(req.query.limit) || 100);
    const sessionId = req.query.session || undefined;
    const rows = await fr.getConfidenceTimeline(req.userId, { limit, sessionId });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/flight-recorder/archaeology
// Full cognitive history summary — Phase 4.
router.get('/archaeology', async (req, res) => {
  const fr = lib();
  if (!fr) return res.status(503).json({ error: 'flight-recorder unavailable' });
  try {
    const result = await fr.getCognitiveArchaeology(req.userId);
    if (!result) return res.status(404).json({ error: 'no recorded turns' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/flight-recorder/explain/:id
// Human-readable evidence lineage for a specific turn — Phase 3.
router.get('/explain/:id', async (req, res) => {
  const fr = lib();
  if (!fr) return res.status(503).json({ error: 'flight-recorder unavailable' });
  try {
    const result = await fr.explainRecord(req.userId, req.params.id);
    if (!result) return res.status(404).json({ error: 'record not found' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/flight-recorder/:id
// Raw record.
router.get('/:id', async (req, res) => {
  const fr = lib();
  if (!fr) return res.status(503).json({ error: 'flight-recorder unavailable' });
  try {
    const record = await fr.getRecord(req.userId, req.params.id);
    if (!record) return res.status(404).json({ error: 'record not found' });
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
