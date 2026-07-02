'use strict';

/*
  Governed Autonomy Layer — API Routes

  GET  /api/autonomy/proposals           — list proposals (all or filtered by ?status=)
  POST /api/autonomy/proposals/:id/approve
  POST /api/autonomy/proposals/:id/deny
  POST /api/autonomy/run                 — manually trigger an inspection cycle (owner only)
*/

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

const db = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

function ensureDb(res) {
  if (!db) { res.status(503).json({ error: 'database_not_configured' }); return false; }
  return true;
}

router.get('/proposals', requireAuth, requireOwner, async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const status = req.query.status || null;
    let query = db
      .from('autonomy_proposals')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ proposals: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/proposals/:id/approve', requireAuth, requireOwner, async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const { data: existing } = await db
      .from('autonomy_proposals')
      .select('id, status, user_id, claspion_decision, source_thought_id, title, reason')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (!existing) return res.status(404).json({ error: 'proposal_not_found' });
    if (existing.claspion_decision === 'blocked') {
      return res.status(409).json({ error: 'proposal_blocked', message: 'Blocked proposals cannot be approved.' });
    }
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: 'proposal_not_pending', status: existing.status });
    }
    const { error } = await db
      .from('autonomy_proposals')
      .update({ status: 'approved', approved_by: 'owner', approved_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) throw error;
    console.log(`[autonomy] Proposal ${req.params.id} approved by owner`);

    // Diagnosis-action gap: mark the source thought (and any similar open
    // thoughts) as resolved. Fire-and-forget — never blocks the API response.
    setImmediate(() => resolveSourceThoughts(existing, 'resolved').catch(() => {}));

    res.json({ success: true, status: 'approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/proposals/:id/deny', requireAuth, requireOwner, async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const reason = ((req.body && req.body.reason) || '').trim().slice(0, 500);
    const { data: existing } = await db
      .from('autonomy_proposals')
      .select('id, status, user_id, claspion_decision')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (!existing) return res.status(404).json({ error: 'proposal_not_found' });
    if (!['pending', 'approved'].includes(existing.status)) {
      return res.status(409).json({ error: 'proposal_cannot_be_denied', status: existing.status });
    }
    const { error } = await db
      .from('autonomy_proposals')
      .update({
        status: 'denied',
        result: { denial_reason: reason || null },
        approved_at: new Date().toISOString(),
      })
      .eq('id', req.params.id);
    if (error) throw error;
    console.log(`[autonomy] Proposal ${req.params.id} denied by owner`);
    res.json({ success: true, status: 'denied' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Diagnosis-action gap: close source thoughts on approval ──────────────────
// When a proposal is approved (or denied), flip the resolution_status of the
// autonomous thought that produced it so the pattern doesn't keep surfacing.
// Two paths: explicit link via source_thought_id, or text-similarity fallback.
function _thoughtWordSet(text) {
  return new Set((text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
}
function _thoughtJaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) { if (b.has(w)) n++; }
  return n / (a.size + b.size - n);
}

async function resolveSourceThoughts(proposal, newStatus) {
  if (!db) return;
  // Path 1: direct link.
  if (proposal.source_thought_id) {
    await db
      .from('autonomous_thoughts')
      .update({ resolution_status: newStatus })
      .eq('id', proposal.source_thought_id)
      .in('resolution_status', ['open', 'proposed']);
    console.log(`[autonomy] thought ${proposal.source_thought_id} resolution_status → ${newStatus}`);
    return;
  }
  // Path 2: text-similarity fallback — find open thoughts similar to proposal.
  const proposalText = `${proposal.title || ''} ${proposal.reason || ''}`;
  const proposalWords = _thoughtWordSet(proposalText);
  if (!proposalWords.size) return;

  const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
  const { data: candidates } = await db
    .from('autonomous_thoughts')
    .select('id, thought_content')
    .in('resolution_status', ['open', 'proposed'])
    .gte('created_at', since)
    .limit(200);

  const toUpdate = (candidates || [])
    .filter(t => _thoughtJaccard(proposalWords, _thoughtWordSet(t.thought_content)) >= 0.35)
    .map(t => t.id);

  if (toUpdate.length === 0) return;

  await db
    .from('autonomous_thoughts')
    .update({ resolution_status: newStatus })
    .in('id', toUpdate);
  console.log(`[autonomy] ${toUpdate.length} thought(s) resolution_status → ${newStatus} (similarity match)`);
}

router.post('/run', requireAuth, requireOwner, async (req, res) => {
  try {
    const { runCycle } = require('../workers/autonomy-scheduler');
    res.json({ success: true, message: 'Autonomy inspection cycle triggered. Check logs for results.' });
    setImmediate(() => runCycle('manual').catch(err =>
      console.error('[autonomy] manual cycle error:', err.message)
    ));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
