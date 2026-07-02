'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Challenge Events API

  POST /api/challenge-events         → submit a correction/pushback, injects into memory
  GET  /api/challenge-events         → list recent challenges (owner only)
*/

const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner } = require('../middleware/auth');
const { submitChallenge, getRecentChallenges } = require('../lib/challenge-injector');

// Submit a challenge / correction (injects immediately into Splendor's memory)
router.post('/', requireAuth, requireOwner, async (req, res) => {
  const {
    challenge_text,
    referenced_thought_id,
    referenced_memory_id,
  } = req.body || {};

  if (!challenge_text || !challenge_text.trim()) {
    return res.status(400).json({ ok: false, error: 'challenge_text is required' });
  }

  const result = await submitChallenge({
    challengeText:        challenge_text,
    referencedThoughtId:  referenced_thought_id || null,
    referencedMemoryId:   referenced_memory_id  || null,
    userId:               req.userId || null,
  });

  if (!result.ok) return res.status(500).json(result);
  res.status(201).json(result);
});

// List recent challenge events
router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit     = Math.min(parseInt(req.query.limit) || 30, 100);
    const userId    = req.userId;
    const challenges = await getRecentChallenges({ userId, limit });
    res.json({ ok: true, challenges, total: challenges.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
