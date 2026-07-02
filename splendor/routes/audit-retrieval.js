'use strict';

/*
  Audit Retrieval — Read-Only API Routes

  Owner-only. No writes, approvals, denials, deletions, or mutations.

  GET /api/audit/proposals             — list open (pending) proposals
  GET /api/audit/proposals/counts      — status counts
  GET /api/audit/proposals/:id         — single proposal by id
  GET /api/audit/expression-events     — recent events (last 20)
  GET /api/audit/expression-events/summary — last-24h summary
  GET /api/audit/self-model-claims     — recent flagged claims
  GET /api/audit/self-model-claims/summary — last-24h summary
  GET /api/audit/recurring-thoughts    — open thoughts w/ prior_instances >= 2
*/

const express = require('express');
const { requireAuth, requireOwner } = require('../middleware/auth');
const {
  listOpenProposals,
  getProposalById,
  countProposalsByStatus,
  listRecentExpressionEvents,
  summarizeExpressionEvents24h,
  listRecentFlaggedClaims,
  summarizeFlaggedClaims24h,
  listRecurringOpenThoughts,
} = require('../lib/audit-retrieval');

const router = express.Router();

// ── proposals ─────────────────────────────────────────────────────────────

router.get('/proposals/counts', requireAuth, requireOwner, async (req, res) => {
  try {
    const counts = await countProposalsByStatus(req.userId);
    res.json({ counts });
  } catch (err) {
    if (err.message === 'database_not_configured') return res.status(503).json({ error: 'database_not_configured' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/proposals/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const proposal = await getProposalById(req.userId, req.params.id);
    if (!proposal) return res.status(404).json({ error: 'proposal_not_found' });
    res.json({ proposal });
  } catch (err) {
    if (err.message === 'database_not_configured') return res.status(503).json({ error: 'database_not_configured' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/proposals', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 20);
    const proposals = await listOpenProposals(req.userId, { limit });
    res.json({ proposals });
  } catch (err) {
    if (err.message === 'database_not_configured') return res.status(503).json({ error: 'database_not_configured' });
    res.status(500).json({ error: err.message });
  }
});

// ── expression events ─────────────────────────────────────────────────────

router.get('/expression-events/summary', requireAuth, requireOwner, async (req, res) => {
  try {
    const summary = await summarizeExpressionEvents24h(req.userId);
    res.json({ summary });
  } catch (err) {
    if (err.message === 'database_not_configured') return res.status(503).json({ error: 'database_not_configured' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/expression-events', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 20);
    const events = await listRecentExpressionEvents(req.userId, { limit });
    res.json({ events });
  } catch (err) {
    if (err.message === 'database_not_configured') return res.status(503).json({ error: 'database_not_configured' });
    res.status(500).json({ error: err.message });
  }
});

// ── self-model claims ─────────────────────────────────────────────────────

router.get('/self-model-claims/summary', requireAuth, requireOwner, async (req, res) => {
  try {
    const summary = await summarizeFlaggedClaims24h(req.userId);
    res.json({ summary });
  } catch (err) {
    if (err.message === 'database_not_configured') return res.status(503).json({ error: 'database_not_configured' });
    res.status(500).json({ error: err.message });
  }
});

router.get('/self-model-claims', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 20);
    const claims = await listRecentFlaggedClaims(req.userId, { limit });
    res.json({ claims });
  } catch (err) {
    if (err.message === 'database_not_configured') return res.status(503).json({ error: 'database_not_configured' });
    res.status(500).json({ error: err.message });
  }
});

// ── recurring thoughts ────────────────────────────────────────────────────

router.get('/recurring-thoughts', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 20);
    const thoughts = await listRecurringOpenThoughts({ limit });
    res.json({ thoughts });
  } catch (err) {
    if (err.message === 'database_not_configured') return res.status(503).json({ error: 'database_not_configured' });
    res.status(500).json({ error: err.message });
  }
});

// Block all mutating methods on the entire audit namespace
router.all('*', (req, res) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Audit retrieval endpoints are read-only.' });
  }
  res.status(404).json({ error: 'not_found' });
});

module.exports = router;
