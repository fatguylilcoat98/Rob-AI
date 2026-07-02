'use strict';

/*
  Expression Event Log — API Routes

  GET  /api/expression-events           — list events (filterable)
  GET  /api/expression-events/summary   — pattern summary
  GET  /api/expression-events/:id       — single event

  NO DELETE endpoint. Append-only by governance rule.
  Deletion requires Chris approval via a separate admin path.
*/

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireOwner } = require('../middleware/auth');
const {
  getExpressionEvents,
  getExpressionEventById,
  getExpressionEventSummary,
  buildSummaryFromRecords,
} = require('../lib/expression-event-log');

const router = express.Router();

const VALID_EVENT_TYPES    = ['art', 'visual_metaphor', 'diagram', 'poetic_language', 'metaphor_heavy_response', 'refusal_or_deferral', 'mode_switch', 'other'];
const VALID_TRIGGER_CATS   = ['self_model', 'identity', 'uncertainty', 'memory', 'governance', 'technical', 'emotional', 'creative', 'unknown'];

// GET /api/expression-events — filtered list
router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const filters = {
      userId: req.userId,
      limit: req.query.limit,
      since: req.query.since,
      artOnly: req.query.art_only === 'true',
    };
    if (req.query.event_type && VALID_EVENT_TYPES.includes(req.query.event_type)) {
      filters.eventType = req.query.event_type;
    }
    if (req.query.trigger_category && VALID_TRIGGER_CATS.includes(req.query.trigger_category)) {
      filters.triggerCategory = req.query.trigger_category;
    }
    const events = await getExpressionEvents(filters);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/expression-events/summary — pattern summary (must come before /:id)
router.get('/summary', requireAuth, requireOwner, async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const summary = await getExpressionEventSummary(req.userId, days);
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/expression-events/:id — single event
router.get('/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const event = await getExpressionEventById(req.params.id);
    if (!event) return res.status(404).json({ error: 'event_not_found' });
    if (event.user_id !== req.userId) return res.status(403).json({ error: 'access_denied' });
    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit 405 on DELETE — governance: append-only
router.delete('/:id', requireAuth, requireOwner, (req, res) => {
  res.status(405).json({
    error: 'delete_not_permitted',
    message: 'Expression event logs are append-only. Deletion requires explicit admin approval.',
  });
});

module.exports = router;
