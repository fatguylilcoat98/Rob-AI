'use strict';
const { createClient } = require('@supabase/supabase-js');
const { logSafeguardEvent } = require('./events');

function db() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );
}

const OWNER = process.env.SPLENDOR_OWNER_EMAIL || 'chris';
const DEFAULT_EXPIRY_DAYS = parseInt(process.env.DELEGATE_EXPIRY_DAYS || '7', 10);
const IMMUTABLE_SCOPE = 'immutable_governance';

// Pure validation — testable without DB.
function validateDelegateDecision(opts) {
  if (!opts.delegateIdentity || !opts.decisionText) {
    return { valid: false, reason: 'missing_required_fields' };
  }
  if (opts.authorityScope === IMMUTABLE_SCOPE) {
    return { valid: false, reason: 'cannot_modify_immutable_governance' };
  }
  return { valid: true };
}

async function recordDelegateDecision(opts = {}) {
  const owner = opts.owner || OWNER;
  const validation = validateDelegateDecision(opts);
  if (!validation.valid) {
    await logSafeguardEvent(owner, 'delegate_ledger', 'delegate_decision_rejected', {
      reason: validation.reason,
      delegateIdentity: opts.delegateIdentity,
      authorityScope: opts.authorityScope,
    });
    return { ok: false, reason: validation.reason };
  }

  const { delegateIdentity, delegateType = 'HUMAN', decisionText, targetRecordId, authorityScope = 'limited' } = opts;
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86400000).toISOString();

  const { data, error } = await db().from('delegate_ledger').insert({
    owner,
    delegate_identity: delegateIdentity,
    delegate_type: delegateType,
    decision_text: decisionText,
    target_record_id: targetRecordId || null,
    authority_scope: authorityScope,
    status: 'PROVISIONAL',
    requires_chris_ratification: true,
    expires_at: expiresAt,
  }).select().single();

  if (error) return { ok: false, reason: error.message };

  await logSafeguardEvent(owner, 'delegate_ledger', 'delegate_decision_recorded', {
    id: data.id, delegateIdentity, delegateType, authorityScope,
  });
  await logSafeguardEvent(owner, 'delegate_ledger', 'delegate_decision_requires_ratification', {
    id: data.id, expiresAt,
  });

  return { ok: true, decision: data };
}

async function ratifyDelegateDecision(decisionId, owner = OWNER) {
  const { data, error } = await db().from('delegate_ledger').update({
    status: 'RATIFIED',
    ratified_by_chris: true,
    ratified_at: new Date().toISOString(),
  }).eq('id', decisionId).eq('owner', owner).eq('status', 'PROVISIONAL').select().single();

  if (error || !data) return { ok: false, reason: error?.message || 'not_found_or_not_provisional' };

  await logSafeguardEvent(owner, 'delegate_ledger', 'delegate_decision_ratified', { id: decisionId });
  return { ok: true, decision: data };
}

async function rejectDelegateDecision(decisionId, owner = OWNER) {
  const { data, error } = await db().from('delegate_ledger').update({
    status: 'REJECTED',
    ratified_by_chris: false,
    ratified_at: new Date().toISOString(),
  }).eq('id', decisionId).eq('owner', owner).eq('status', 'PROVISIONAL').select().single();

  if (error || !data) return { ok: false, reason: error?.message || 'not_found_or_not_provisional' };

  await logSafeguardEvent(owner, 'delegate_ledger', 'delegate_decision_rejected', { id: decisionId });
  return { ok: true, decision: data };
}

async function expireUnratifiedDecisions(owner = OWNER) {
  const now = new Date().toISOString();
  const { data, error } = await db().from('delegate_ledger').update({
    status: 'EXPIRED',
  }).eq('owner', owner).eq('status', 'PROVISIONAL').lt('expires_at', now).select('id');

  if (error) return { ok: false, reason: error.message };

  const expired = data || [];
  for (const d of expired) {
    await logSafeguardEvent(owner, 'delegate_ledger', 'delegate_decision_expired', { id: d.id });
  }
  return { ok: true, expired: expired.length };
}

async function getPendingDelegateDecisions(owner = OWNER) {
  const { data } = await db()
    .from('delegate_ledger')
    .select('*')
    .eq('owner', owner)
    .eq('status', 'PROVISIONAL')
    .order('created_at', { ascending: false });
  return data || [];
}

module.exports = {
  recordDelegateDecision,
  ratifyDelegateDecision,
  rejectDelegateDecision,
  expireUnratifiedDecisions,
  getPendingDelegateDecisions,
  validateDelegateDecision,
};
