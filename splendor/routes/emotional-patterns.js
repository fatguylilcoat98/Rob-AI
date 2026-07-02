/*
  Splendor — The Good Neighbor Guard
  Continuity Core: emotional patterns API.

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

  Feeds the emotional timeline in the Cognitive Archaeology panel.
    GET /api/emotional-patterns  — recent observations, newest first.
*/

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

router.get('/', requireAuth, requireOwner, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'supabase_not_configured' });
  }
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  try {
    const { data, error } = await supabase
      .from('emotional_patterns')
      .select('*')
      .eq('user_id', req.userId)
      .order('session_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ count: (data || []).length, patterns: data || [] });
  } catch (err) {
    console.error('[emotional-patterns] list failed:', err && err.message);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
