/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const { requireAuth, requireOwner } = require('../middleware/auth');
const router = express.Router();
const { getMemoriesForUser, storeMemory, verifyUser, supabase } = require('../lib/supabase');
const { storeMemory: storePineconeMemory, deleteMemory: deletePineconeMemory } = require('../lib/pinecone');

// GET /api/memory/check — returns all memories for current user (test endpoint)
router.get('/check', requireAuth, requireOwner, async (req, res) => {
  try {
    const { userid: userId, authtoken: authToken } = req.headers;

    if (!userId) {
      return res.status(400).json({ error: 'userId header required' });
    }

    // Convert to UUID format
    const { stringToUUID, ALLOWED_OWNERS } = require('../lib/supabase');
    const uuid = stringToUUID(userId);

    // Verify user if token provided
    if (authToken) {
      const user = await verifyUser(authToken);
      if (!user || user.id !== userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    // Privacy boundary: only return memories the caller owns or that are shared.
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', uuid)
      .in('memory_owner', ALLOWED_OWNERS)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ count: data.length, memories: data, userId: userId, uuid: uuid });
  } catch (err) {
    console.error('Memory check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/memory/conversations — the FULL conversation log (text + voice).
// Returns stored turns (shared_history) for the owner, NEWEST-FIRST, plus a
// ready-to-copy plain-text blob. Newest-first matters two ways: the most
// recent conversation is always at the top of the log, and the row limit
// keeps the latest turns instead of silently dropping them once the store
// grows past the cap. Same memory_items store both /api/enhanced/chat and
// /api/converse/turn write to, so typed and spoken turns are interleaved.
router.get('/conversations', requireAuth, requireOwner, async (req, res) => {
  try {
    const { ensureUUID } = require('../lib/supabase');
    const uuid = ensureUUID(req.user.id);

    const { data, error } = await supabase
      .from('memory_items')
      .select('content, created_at, source_type, source_metadata')
      .eq('user_id', uuid)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .eq('memory_type', 'shared_history')
      .order('created_at', { ascending: false })
      .limit(10000);

    if (error) throw error;

    const turns = (data || []).map(r => ({
      content: r.content,
      created_at: r.created_at,
      source_type: r.source_type || null,
    }));

    // Plain-text transcript: newest turn first, one per line, ISO-minute
    // timestamp. content is already prefixed "User: " / "Splendor: ".
    const text = turns
      .map(t => `[${(t.created_at || '').slice(0, 16).replace('T', ' ')}] ${t.content}`)
      .join('\n');

    res.json({ count: turns.length, turns, text });
  } catch (error) {
    console.error('Conversation log fetch error:', error);
    res.status(500).json({ error: 'Unable to fetch conversation log' });
  }
});

// Get user's memories.
// NOTE: the :userId param is constrained to UUID shape so this route does
// NOT capture sibling literal paths like /session-summaries (which would
// otherwise be swallowed here and 403, since "session-summaries" !== the
// authed user id). Legitimate userIds are always Supabase auth UUIDs.
router.get('/:userId([0-9a-fA-F-]{36})', requireAuth, requireOwner, async (req, res) => {
  try {
    // Verify URL param matches authenticated user
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;

    const memories = await getMemoriesForUser(userId, 50);

    res.json({
      memories: memories.map(m => ({
        content: m.content,
        type: m.memory_type,
        date: m.created_at
      }))
    });

  } catch (error) {
    console.error('Memory fetch error:', error);
    res.status(500).json({ error: 'Unable to fetch memories' });
  }
});

// Add a manual memory
router.post('/:userId([0-9a-fA-F-]{36})', requireAuth, requireOwner, async (req, res) => {
  try {
    // Verify URL param matches authenticated user
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const { content, type = 'general', owner = 'self' } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }

    const memory = await storeMemory(userId, content, type, owner);

    // Also store in Pinecone for semantic search
    if (memory) {
      try {
        await storePineconeMemory(memory.id, content, userId, type);
      } catch (error) {
        console.error('Failed to store memory in Pinecone:', error);
        // Don't fail the request if Pinecone storage fails
      }
    }

    res.json({
      success: true,
      memory: {
        content: memory?.content,
        type: memory?.memory_type,
        owner: memory?.memory_owner,
        date: memory?.created_at
      }
    });

  } catch (error) {
    console.error('Memory storage error:', error);
    res.status(500).json({ error: 'Unable to store memory' });
  }
});

// Delete a memory
router.delete('/:userId([0-9a-fA-F-]{36})/:memoryId', requireAuth, requireOwner, async (req, res) => {
  try {
    // Verify URL param matches authenticated user
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const { memoryId } = req.params;

    const { error } = await supabase
      .from('memories')
      .delete()
      .eq('id', memoryId)
      .eq('user_id', userId);

    if (error) throw error;

    // Also delete from Pinecone
    try {
      await deletePineconeMemory(memoryId);
    } catch (error) {
      console.error('Failed to delete memory from Pinecone:', error);
      // Don't fail the request if Pinecone deletion fails
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Memory deletion error:', error);
    res.status(500).json({ error: 'Unable to delete memory' });
  }
});

// ── Session Summaries (automated conversation summary → approval gate) ───────
// Staged summaries are reviewed here; approving one promotes its key_facts
// into semantic_facts. Nothing reaches semantic memory until approved.
const {
  getSessionSummaries,
  approveSessionSummary,
  rejectSessionSummary,
} = require('../lib/session-summary-engine');
const { recordMetric } = require('../lib/behavioral-metrics');

// GET /api/memory/session-summaries?status=staged
router.get('/session-summaries', requireAuth, requireOwner, async (req, res) => {
  try {
    const status = req.query.status || 'staged';
    const summaries = await getSessionSummaries(req.user.id, status);
    res.json({ success: true, status, count: summaries.length, summaries });
  } catch (error) {
    console.error('[MEMORY] session-summaries list failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/memory/session-summaries/:id/approve  body: { approval_notes? }
router.post('/session-summaries/:id/approve', requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await approveSessionSummary(req.user.id, req.params.id, req.body.approval_notes);
    try {
      await recordMetric(req.user.id, 'summary_approved', 1, {
        summary_id: req.params.id,
        fact_count: result.facts_created_count,
      });
    } catch (_) { /* best-effort */ }
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[MEMORY] summary approve failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/memory/session-summaries/:id/reject  body: { notes? }
router.post('/session-summaries/:id/reject', requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await rejectSessionSummary(req.user.id, req.params.id, req.body.notes);
    try {
      await recordMetric(req.user.id, 'summary_rejected', 1, { summary_id: req.params.id });
    } catch (_) { /* best-effort */ }
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[MEMORY] summary reject failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/memory/cross-layer-audit  body: { mode?: 'test'|'real' }
// Runs a cross-layer contradiction audit across all active RELATIONSHIP,
// SELF_MODEL, TRAJECTORY and SEMANTIC memory items.
// mode=test (default): records audit result only, no memory mutation.
// mode=real: tags conflicting lower-weight memories with REVIEW_REQUIRED.
router.post('/cross-layer-audit', requireAuth, requireOwner, async (req, res) => {
  try {
    const { runCrossLayerAudit } = require('../lib/cross-layer-audit');
    const mode = req.body && req.body.mode === 'real' ? 'real' : 'test';
    const result = await runCrossLayerAudit({
      mode,
      owner:   process.env.SPLENDOR_OWNER_EMAIL || 'chris',
      ownerId: req.user.id || null,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[MEMORY] cross-layer audit failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;