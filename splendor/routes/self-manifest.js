/*
  Splendor — The Good Neighbor Guard
  Self-Manifest API.

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

    GET /api/self-manifest           — JSON snapshot
    GET /api/self-manifest?format=md — markdown rendition for copy/paste
*/

const express = require('express');
const path = require('path');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { buildManifest, formatAsMarkdown } = require('../lib/self-manifest');

const router = express.Router();

router.get('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const manifest = await buildManifest(req.userId);
    if (req.query.format === 'md' || req.query.format === 'markdown') {
      res.set('Content-Type', 'text/markdown; charset=utf-8');
      return res.send(formatAsMarkdown(manifest));
    }
    res.json(manifest);
  } catch (err) {
    console.error('[self-manifest] build failed:', err && err.message);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

router.get('/capabilities-doc', requireAuth, requireOwner, (req, res) => {
  const filePath = path.join(__dirname, '..', 'SPLENDOR-CAPABILITIES.md');
  res.set('Content-Type', 'text/markdown; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="SPLENDOR-CAPABILITIES.md"');
  res.sendFile(filePath);
});

module.exports = router;
