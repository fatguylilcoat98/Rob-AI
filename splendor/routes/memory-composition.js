'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner } = require('../middleware/auth');
const compositionCache = require('../lib/memory-composition-cache');

// GET /api/memory-composition/latest
// Returns the memory bucket composition from the most recent chat turn.
// Powers the Memory Map card (Card 12) in the governance glass box.
//
// Observability contract — what each field can and cannot prove:
//   retrieved  — DB query result count. Confirmed.
//   injected   — context injection count. Confirmed (= retrieved; no ranking step).
//   influenced — unknowable without model internals. Always null. Never claim it.
router.get('/latest', requireAuth, requireOwner, (req, res) => {
  const comp = compositionCache.get(req.userId) || compositionCache.getLatest();
  if (!comp) {
    return res.json({
      loadBearing: [], interior: [], relevant: [],
      counts:   { loadBearing: 0, interior: 0, relevant: 0, total: 0 },
      pipeline: { retrieved: 0, injected: 0, influenced: null },
      observability: {
        retrieved:  'confirmed — DB query count',
        injected:   'confirmed — equals retrieved (no ranking step drops items)',
        influenced: 'unknowable — no attribution telemetry; never claim causal influence',
      },
      timestamp: null,
    });
  }
  const total = comp.loadBearing.length + comp.interior.length + comp.relevant.length;
  res.json({
    loadBearing: comp.loadBearing,
    interior:    comp.interior,
    relevant:    comp.relevant,
    counts: {
      loadBearing: comp.loadBearing.length,
      interior:    comp.interior.length,
      relevant:    comp.relevant.length,
      total,
    },
    pipeline: comp.pipeline || { retrieved: total, injected: total, influenced: null },
    observability: {
      retrieved:  'confirmed — DB query count',
      injected:   'confirmed — equals retrieved (no ranking step drops items)',
      influenced: 'unknowable — no attribution telemetry; never claim causal influence',
    },
    timestamp: new Date(comp.timestamp).toISOString(),
  });
});

module.exports = router;
