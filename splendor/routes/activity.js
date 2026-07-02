/*
  Splendor — The Remarkable AI
  Activity SSE — live system events for the orb rings + CLASPION header.

  EventSource cannot send Authorization headers, so the JWT is passed
  as ?access_token=<token>. We verify it via Supabase and confirm the
  owner email before opening the stream.
*/

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { activityBus } = require('../lib/activity-bus');

const router = express.Router();

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

router.get('/stream', async (req, res) => {
  // Auth via query token (EventSource limitation).
  const token = String(req.query.access_token || '');
  const ownerEmail = process.env.SPLENDOR_OWNER_EMAIL;
  if (!supabase || !token || !ownerEmail) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user || user.email !== ownerEmail) {
      return res.status(403).json({ error: 'forbidden' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'auth_failed' });
  }

  // Open the SSE stream.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering
  res.flushHeaders?.();

  // Hello + heartbeat so the client can confirm the channel is live.
  res.write(`event: hello\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  const heartbeat = setInterval(() => {
    try { res.write(`: ping ${Date.now()}\n\n`); } catch (_) {}
  }, 15000);

  const send = (event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (_) { /* socket closed; cleanup runs in close handler */ }
  };
  const unsubscribe = activityBus.subscribe(send);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    try { res.end(); } catch (_) {}
  });
});

module.exports = router;
