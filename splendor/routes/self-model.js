'use strict';

/*
  Self-Model Labeling Layer — API Routes

  GET  /api/self-model/latest    — most recent claim audit records for user
  GET  /api/self-model/stats     — aggregate stats (flag counts, label distribution)
  POST /api/self-model/analyze   — analyze arbitrary text (for Oracle use / testing)
*/

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { labelClaims, LABELS } = require('../lib/self-model-labeler');
const { buildAuditSummary } = require('../lib/self-model-audit');

const router = express.Router();

const db = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

function ensureDb(res) {
  if (!db) { res.status(503).json({ error: 'database_not_configured' }); return false; }
  return true;
}

// GET /api/self-model/latest — last N claim records
router.get('/latest', requireAuth, requireOwner, async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
    const flagged = req.query.flagged === 'true' ? true : null;

    let query = db
      .from('self_model_claim_audit')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (flagged !== null) query = query.eq('requires_flag', flagged);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ claims: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/self-model/stats — aggregate label stats
router.get('/stats', requireAuth, requireOwner, async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const since = req.query.since || new Date(Date.now() - 7 * 86400 * 1000).toISOString();

    const { data, error } = await db
      .from('self_model_claim_audit')
      .select('labels, requires_flag, audit_status, confidence')
      .eq('user_id', req.userId)
      .gte('created_at', since);

    if (error) throw error;
    const records = data || [];

    const labelCounts = {};
    let flaggedCount = 0;
    const statusCounts = {};

    for (const r of records) {
      if (r.requires_flag) flaggedCount++;
      (r.labels || []).forEach(l => { labelCounts[l] = (labelCounts[l] || 0) + 1; });
      const s = r.audit_status || 'supported';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    const mostCommonLabel = Object.entries(labelCounts).sort((a, b) => b[1] - a[1])[0];

    res.json({
      total_claims: records.length,
      flagged_claims: flaggedCount,
      status_distribution: statusCounts,
      label_distribution: labelCounts,
      most_common_label: mostCommonLabel ? mostCommonLabel[0] : null,
      since,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/self-model/analyze — analyze arbitrary text (returns classifications, no DB write)
router.post('/analyze', requireAuth, requireOwner, async (req, res) => {
  try {
    const text = ((req.body && req.body.text) || '').slice(0, 10000);
    if (!text.trim()) return res.status(400).json({ error: 'text_required' });

    const labeledClaims = labelClaims(text);
    const summary = buildAuditSummary(labeledClaims);

    res.json({ claims: labeledClaims, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
