'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner } = require('../middleware/auth');

function safeRequireLib() {
  try { return require('../lib/micro-experiments'); } catch (_) { return null; }
}

router.use(requireAuth, requireOwner);

router.get('/status', async (req, res) => {
  const lib = safeRequireLib();
  if (!lib) return res.json({ enabled: false, reason: 'module_unavailable' });
  try {
    const experiments = await lib.getExperimentsForUser(req.userId);
    const counts = {};
    for (const e of experiments) { counts[e.status] = (counts[e.status] || 0) + 1; }
    res.json({
      enabled: process.env.MICRO_EXPERIMENTS_ENABLED === 'true',
      auto_activate: process.env.MICRO_EXPERIMENTS_AUTO_ACTIVATE === 'true',
      counts,
      total: experiments.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', async (req, res) => {
  const lib = safeRequireLib();
  if (!lib) return res.json([]);
  try {
    const { status } = req.query;
    const experiments = await lib.getExperimentsForUser(req.userId, status);
    res.json(experiments);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/trials', async (req, res) => {
  const lib = safeRequireLib();
  if (!lib) return res.json([]);
  try {
    const trials = await lib.getTrialsForExperiment(req.params.id);
    res.json(trials);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/reviews', async (req, res) => {
  const lib = safeRequireLib();
  if (!lib) return res.json([]);
  try {
    const reviews = await lib.getReviewsForExperiment(req.params.id);
    res.json(reviews);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/review', async (req, res) => {
  const lib = safeRequireLib();
  if (!lib) return res.status(503).json({ error: 'micro-experiments module unavailable' });
  try {
    const review = await lib.reviewMicroExperiment(req.params.id);
    if (!review) return res.status(404).json({ error: 'experiment not found or review failed' });
    res.json(review);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/activate', async (req, res) => {
  if (process.env.MICRO_EXPERIMENTS_ENABLED !== 'true') {
    return res.status(403).json({ error: 'MICRO_EXPERIMENTS_ENABLED is not set to true' });
  }
  const { supabase } = (() => { try { return require('../lib/supabase'); } catch (_) { return {}; } })();
  if (!supabase) return res.status(503).json({ error: 'supabase unavailable' });
  try {
    const { data, error } = await supabase
      .from('micro_experiments')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('id, strategy, status')
      .single();
    if (error || !data) return res.status(404).json({ error: 'experiment not found' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  if (process.env.MICRO_EXPERIMENTS_ENABLED !== 'true') {
    return res.status(403).json({ error: 'MICRO_EXPERIMENTS_ENABLED is not set to true' });
  }
  const lib = safeRequireLib();
  if (!lib) return res.status(503).json({ error: 'micro-experiments module unavailable' });
  const { strategy, title, hypothesis, expected_signal, risk_level } = req.body || {};
  if (!strategy || !title || !hypothesis) {
    return res.status(400).json({ error: 'strategy, title, and hypothesis are required' });
  }
  if (lib.isForbiddenStrategy(strategy)) {
    return res.status(400).json({ error: 'forbidden strategy' });
  }
  const { supabase } = (() => { try { return require('../lib/supabase'); } catch (_) { return {}; } })();
  if (!supabase) return res.status(503).json({ error: 'supabase unavailable' });
  try {
    const { data, error } = await supabase
      .from('micro_experiments')
      .insert({
        user_id: req.userId,
        strategy,
        title,
        hypothesis,
        expected_signal: expected_signal || null,
        risk_level: risk_level || 'low',
        status: 'proposed',
        created_by: 'owner',
      })
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
