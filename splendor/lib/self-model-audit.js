'use strict';

/*
  Self-Model Labeling Layer — Response Auditor

  Scans a generated assistant response for self-referential claims,
  classifies each one, produces an audit summary, and optionally
  stores records to self_model_claim_audit in Supabase.

  The audit fires and forgets — it does not block the response pipeline.
*/

const { labelClaims, LABELS, buildAuditSummary } = require('./self-model-labeler');

let _db = null;
function getDb() {
  if (!_db && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _db;
}

async function storeAuditRecords(labeledClaims, { userId, conversationId, messageId }) {
  const db = getDb();
  if (!db || !labeledClaims.length) return;

  const records = labeledClaims.map(c => ({
    user_id: userId,
    conversation_id: conversationId || null,
    message_id: messageId || null,
    claim_text: c.claim.slice(0, 1000),
    labels: c.labels,
    evidence: c.evidence,
    confidence: c.confidence,
    alternative_explanation: c.alternative_explanation || null,
    recommended_rewrite: c.recommended_rewrite || null,
    requires_flag: c.requires_flag,
    audit_status: c.audit_status,
  }));

  const { error } = await db.from('self_model_claim_audit').insert(records);
  if (error) console.error('[self-model-audit] DB insert error:', error.message);
}

/**
 * Audit a full assistant response.
 * Stores to DB if userId is provided (fire-and-forget from caller).
 *
 * @param {string} responseText
 * @param {{ userId?: string, conversationId?: string, messageId?: string }} opts
 * @returns {Promise<object>} audit summary
 */
async function auditResponse(responseText, { userId = null, conversationId = null, messageId = null } = {}) {
  const labeledClaims = labelClaims(responseText || '');
  const summary = buildAuditSummary(labeledClaims);

  if (userId && labeledClaims.length > 0) {
    storeAuditRecords(labeledClaims, { userId, conversationId, messageId }).catch(err =>
      console.error('[self-model-audit] store error:', err.message)
    );
  }

  return summary;
}

module.exports = { auditResponse, buildAuditSummary }; // buildAuditSummary re-exported from self-model-labeler
