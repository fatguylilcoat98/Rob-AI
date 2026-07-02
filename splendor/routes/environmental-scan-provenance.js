'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner } = require('../middleware/auth');
const esp = require('../lib/environmental-scan-provenance');

// GET /api/environmental-scan-provenance/recent
router.get('/recent', requireAuth, requireOwner, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const { records, error } = await esp.getRecentScans({ userId: req.userId, limit });
  if (error && error !== 'db_unavailable') return res.status(500).json({ error });
  res.json({ records });
});

module.exports = router;
