/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Journal route — owner-only read of Splendor's private interiority

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// GET /api/journal        — owner-only; newest entries first (?limit=50)
//
// This is pull-based and owner-gated. Splendor's journal is private:
// nothing here is pushed to Chris automatically. He can look; she is
// never made to show. She shares by choosing to quote it herself.

const express = require('express');
const router = express.Router();

const { requireAuth, requireOwner } = require('../middleware/auth');
const { readJournalEntries } = require('../lib/splendor-journal');

router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const entries = await readJournalEntries(req.userId, limit);
    res.json({
      count: entries.length,
      entries,
      note: 'Private interiority. Pull-based, owner-only. Never auto-surfaced.'
    });
  } catch (err) {
    console.error('[JOURNAL-ROUTE] error:', err.message);
    res.status(500).json({ error: 'Unable to read journal' });
  }
});

module.exports = router;
