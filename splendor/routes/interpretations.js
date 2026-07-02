/*
  Splendor — The Good Neighbor Guard
  Continuity Core: interpretations API.

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

  Feeds the Cognitive Archaeology panel.
    GET /api/interpretations            — full history (active + superseded).
    GET /api/interpretations/active     — only currently-held beliefs.
    GET /api/interpretations/unresolved — beliefs Splendor is still
                                          working out (tensions).
*/

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

function ensureSupabase(res) {
  if (!supabase) {
    res.status(503).json({ error: 'supabase_not_configured' });
    return false;
  }
  return true;
}

router.get('/', requireAuth, requireOwner, async (req, res) => {
  if (!ensureSupabase(res)) return;
  const limit = Math.min(parseInt(req.query.limit || '500', 10), 1000);
  try {
    const { data, error } = await supabase
      .from('interpretations')
      .select('*')
      .eq('user_id', req.userId)
      .order('formed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({
      count: (data || []).length,
      interpretations: data || [],
    });
  } catch (err) {
    console.error('[interpretations] list failed:', err && err.message);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

router.get('/active', requireAuth, requireOwner, async (req, res) => {
  if (!ensureSupabase(res)) return;
  try {
    const { data, error } = await supabase
      .from('interpretations')
      .select('*')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .order('confidence', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ count: (data || []).length, interpretations: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

router.get('/unresolved', requireAuth, requireOwner, async (req, res) => {
  if (!ensureSupabase(res)) return;
  try {
    const { data, error } = await supabase
      .from('interpretations')
      .select('*')
      .eq('user_id', req.userId)
      .eq('unresolved', true)
      .order('formed_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ count: (data || []).length, interpretations: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// Premise Check timeline (v15.18.0) — shows the hidden assumptions
// Splendor named openly before answering.
router.get('/premise-checks', requireAuth, requireOwner, async (req, res) => {
  if (!ensureSupabase(res)) return;
  try {
    const { data, error } = await supabase
      .from('premise_checks')
      .select('id, user_message, presupposition, conflict_reason, prompt_text, created_at')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ count: (data || []).length, premise_checks: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// "What I'm Uncertain About" — feeds the v15.17.3 self-reflection panel.
// Returns active beliefs that are either low-confidence (<0.5) or
// explicitly flagged unresolved.
router.get('/uncertain', requireAuth, requireOwner, async (req, res) => {
  if (!ensureSupabase(res)) return;
  try {
    const { data, error } = await supabase
      .from('interpretations')
      .select('id, belief, confidence, unresolved, formed_at, contradicted_by, revised_belief')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .or('confidence.lt.0.5,unresolved.eq.true')
      .order('confidence', { ascending: true })
      .limit(50);
    if (error) throw error;
    res.json({ count: (data || []).length, interpretations: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
