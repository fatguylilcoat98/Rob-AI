'use strict';

/*
  Read-only retrieval functions for Splendor's internal audit/proposal tables.
  Owner-authenticated callers only. No writes, deletes, approvals, or mutations.
*/

const RESULT_LIMIT = 20;

let _db = null;
function getDb() {
  if (!_db && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  if (!_db) throw new Error('database_not_configured');
  return _db;
}

// ── autonomy_proposals ────────────────────────────────────────────────────

async function listOpenProposals(userId, { limit = RESULT_LIMIT } = {}) {
  const db = getDb();
  const { data, error } = await db
    .from('autonomy_proposals')
    .select('id, status, proposal_type, title, reason, created_at, claspion_decision')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function getProposalById(userId, id) {
  const db = getDb();
  const { data, error } = await db
    .from('autonomy_proposals')
    .select('id, status, proposal_type, title, reason, created_at, claspion_decision, approved_at, result')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function countProposalsByStatus(userId) {
  const db = getDb();
  const { data, error } = await db
    .from('autonomy_proposals')
    .select('status, claspion_decision')
    .eq('user_id', userId);
  if (error) throw error;
  const counts = { pending: 0, approved: 0, denied: 0, blocked: 0, executed: 0 };
  for (const row of (data || [])) {
    if (row.claspion_decision === 'blocked') {
      counts.blocked++;
    } else if (counts[row.status] !== undefined) {
      counts[row.status]++;
    }
  }
  return counts;
}

// ── expression_events ─────────────────────────────────────────────────────

async function listRecentExpressionEvents(userId, { limit = RESULT_LIMIT } = {}) {
  const db = getDb();
  const { data, error } = await db
    .from('expression_events')
    .select('id, event_type, trigger_category, created_at, image_caption, tags, confidence')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function summarizeExpressionEvents24h(userId) {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from('expression_events')
    .select('event_type, trigger_category, created_at, tags, confidence')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const byType = {};
  for (const r of rows) {
    byType[r.event_type] = (byType[r.event_type] || 0) + 1;
  }
  return { total: rows.length, by_type: byType, events: rows.slice(0, RESULT_LIMIT) };
}

// ── self_model_claim_audit ────────────────────────────────────────────────

async function listRecentFlaggedClaims(userId, { limit = RESULT_LIMIT } = {}) {
  const db = getDb();
  const { data, error } = await db
    .from('self_model_claim_audit')
    .select('id, claim_text, labels, confidence, requires_flag, recommended_rewrite, created_at')
    .eq('user_id', userId)
    .eq('requires_flag', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function summarizeFlaggedClaims24h(userId) {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from('self_model_claim_audit')
    .select('claim_text, labels, confidence, requires_flag, recommended_rewrite, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const flagged = rows.filter(r => r.requires_flag);
  return { total: rows.length, flagged_count: flagged.length, flagged: flagged.slice(0, RESULT_LIMIT) };
}

// ── diagnosis-action gap (autonomous_thoughts) ────────────────────────────
// autonomous_thoughts has no user_id — it is a system-wide table.
// Caller must be owner-authenticated before calling this function.

async function listRecurringOpenThoughts({ limit = RESULT_LIMIT } = {}) {
  const db = getDb();
  const { data, error } = await db
    .from('autonomous_thoughts')
    .select('id, thought_content, thought_type, prior_instances, resolution_status, created_at, tags')
    .eq('resolution_status', 'open')
    .gte('prior_instances', 2)
    .order('prior_instances', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

module.exports = {
  listOpenProposals,
  getProposalById,
  countProposalsByStatus,
  listRecentExpressionEvents,
  summarizeExpressionEvents24h,
  listRecentFlaggedClaims,
  summarizeFlaggedClaims24h,
  listRecurringOpenThoughts,
};
