'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner } = require('../middleware/auth');
const adminProv = require('../lib/admin-provenance');

// GET /api/admin-provenance/recent
router.get('/recent', requireAuth, requireOwner, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const { events, error } = await adminProv.getRecentEvents({ limit });
  if (error && error !== 'db_unavailable') return res.status(500).json({ error });
  res.json({ events });
});

module.exports = router;
