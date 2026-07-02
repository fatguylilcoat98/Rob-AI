'use strict';

/*
  Audit Context Injector

  Detects when Chris is asking about internal audit/proposal data and fetches
  a compact read-only summary to inject into the system prompt as
  INTERNAL_AUDIT_CONTEXT. This lets Splendor answer from real records rather
  than saying she cannot access them.

  Security contract:
  - Requires a non-null userId (owner-authenticated callers only).
  - Read-only. No writes, approvals, denials, or deletions happen here.
  - Retrieval errors are surfaced as explicit "[retrieval failed]" markers,
    never silently swallowed into fabricated data.
*/

// ── Keyword detection ─────────────────────────────────────────────────────

const PROPOSAL_PATTERNS = [
  /\bproposal(s)?\b/i,
  /\bopen proposal/i,
  /\bpending proposal/i,
  /\bpending request/i,
  /\bautonomy request/i,
  /\bwhat.*propos/i,
  /\blist.*propos/i,
  /\bshow.*propos/i,
  /\bany.*propos/i,
  /\bpropos.*pending/i,
  /\bpropos.*open/i,
  /\bmy proposals/i,
  /\byour proposals/i,
];

const EXPRESSION_PATTERNS = [
  /\bexpression event/i,
  /\bexpression log/i,
  /\bexpression record/i,
  /\bwhat did you express/i,
  /\brecent expression/i,
  /\bwhat.*express/i,
  /\bexpress.*event/i,
  /\bart event/i,
  /\blast.*expression/i,
  /\bshow.*expression/i,
  /\blist.*expression/i,
];

const SELF_MODEL_PATTERNS = [
  /\bself.?model/i,
  /\bflagged claim/i,
  /\bidentity audit/i,
  /\bclaim audit/i,
  /\bwhat claims/i,
  /\byour claims/i,
  /\bself.?referential/i,
  /\bself model audit/i,
  /\bself model claim/i,
  /\bidentity claim/i,
  /\bflagged statement/i,
];

const THOUGHT_PATTERNS = [
  /\brecurring thought/i,
  /\brepeat thought/i,
  /\bopen thought/i,
  /\bdiagnosis.action/i,
  /\bprior instance/i,
  /\brepeat diagnosis/i,
  /\bthought tracker/i,
  /\bopen diagnos/i,
  /\bunresolved pattern/i,
  /\bstuck pattern/i,
  /\brecurring pattern/i,
  /\bkeep coming up/i,
];

function detectAuditTopics(message) {
  if (!message) return [];
  const topics = [];
  if (PROPOSAL_PATTERNS.some(p => p.test(message)))      topics.push('proposals');
  if (EXPRESSION_PATTERNS.some(p => p.test(message)))    topics.push('expression_events');
  if (SELF_MODEL_PATTERNS.some(p => p.test(message)))    topics.push('self_model');
  if (THOUGHT_PATTERNS.some(p => p.test(message)))       topics.push('recurring_thoughts');
  return topics;
}

// ── Context builders ──────────────────────────────────────────────────────

function _compact(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

async function _buildProposalsSection(userId) {
  const {
    listOpenProposals,
    countProposalsByStatus,
  } = require('./audit-retrieval');
  const [open, counts] = await Promise.all([
    listOpenProposals(userId).catch(() => null),
    countProposalsByStatus(userId).catch(() => null),
  ]);
  if (open === null && counts === null) {
    return 'PROPOSALS: [retrieval failed — data source unavailable]';
  }
  const c = counts || {};
  const header = `PROPOSALS (pending=${c.pending||0}, approved=${c.approved||0}, denied=${c.denied||0}, blocked=${c.blocked||0}, executed=${c.executed||0}):`;
  if (!open || open.length === 0) return header + '\n  No pending proposals.';
  const lines = [header];
  for (const p of open) {
    lines.push(`  [${p.id}] ${p.proposal_type||'—'} | "${_compact(p.title, 80)}" | status=${p.status} | claspion=${p.claspion_decision||'pending'} | filed=${(p.created_at||'').slice(0,10)}`);
    if (p.reason) lines.push(`    reason: ${_compact(p.reason, 140)}`);
  }
  return lines.join('\n');
}

async function _buildExpressionEventsSection(userId) {
  const {
    listRecentExpressionEvents,
    summarizeExpressionEvents24h,
  } = require('./audit-retrieval');
  const [recent, summary] = await Promise.all([
    listRecentExpressionEvents(userId, { limit: 10 }).catch(() => null),
    summarizeExpressionEvents24h(userId).catch(() => null),
  ]);
  if (recent === null) {
    return 'EXPRESSION EVENTS: [retrieval failed — data source unavailable]';
  }
  const s = summary || {};
  const header = `EXPRESSION EVENTS (last 24h: total=${s.total||0}, by_type=${JSON.stringify(s.by_type||{})})`;
  if (recent.length === 0) return header + '\n  No recent expression events.';
  const lines = [header + ':'];
  for (const e of recent) {
    lines.push(`  [${e.id}] ${e.event_type} | ${e.trigger_category||'—'} | ${(e.created_at||'').slice(0,16)} | conf=${e.confidence}`);
    if (e.image_caption) lines.push(`    caption: ${_compact(e.image_caption, 100)}`);
  }
  return lines.join('\n');
}

async function _buildSelfModelSection(userId) {
  const {
    listRecentFlaggedClaims,
    summarizeFlaggedClaims24h,
  } = require('./audit-retrieval');
  const [flagged, summary] = await Promise.all([
    listRecentFlaggedClaims(userId, { limit: 10 }).catch(() => null),
    summarizeFlaggedClaims24h(userId).catch(() => null),
  ]);
  if (flagged === null) {
    return 'SELF-MODEL CLAIMS: [retrieval failed — data source unavailable]';
  }
  const s = summary || {};
  const header = `SELF-MODEL FLAGGED CLAIMS (last 24h: ${s.flagged_count||0} flagged of ${s.total||0} total):`;
  if (flagged.length === 0) return header + '\n  No recently flagged claims.';
  const lines = [header];
  for (const c of flagged) {
    lines.push(`  [${c.id}] "${_compact(c.claim_text, 100)}" | labels=${(c.labels||[]).join(',')} | conf=${c.confidence} | ${(c.created_at||'').slice(0,16)}`);
    if (c.recommended_rewrite) lines.push(`    rewrite: ${_compact(c.recommended_rewrite, 120)}`);
  }
  return lines.join('\n');
}

async function _buildRecurringThoughtsSection() {
  const { listRecurringOpenThoughts } = require('./audit-retrieval');
  const thoughts = await listRecurringOpenThoughts().catch(() => null);
  if (thoughts === null) {
    return 'RECURRING OPEN THOUGHTS: [retrieval failed — data source unavailable]';
  }
  const header = 'RECURRING OPEN THOUGHTS (diagnosis-action gap, prior_instances ≥ 2):';
  if (thoughts.length === 0) return header + '\n  No recurring open patterns.';
  const lines = [header];
  for (const t of thoughts) {
    lines.push(`  [${t.id}] type=${t.thought_type} | prior_instances=${t.prior_instances} | resolution=${t.resolution_status} | first_seen=${(t.created_at||'').slice(0,10)}`);
    if (t.thought_content) lines.push(`    content: ${_compact(t.thought_content, 150)}`);
  }
  return lines.join('\n');
}

async function _buildAuditContext(userId, topics) {
  const builders = [];
  if (topics.includes('proposals'))         builders.push(_buildProposalsSection(userId));
  if (topics.includes('expression_events')) builders.push(_buildExpressionEventsSection(userId));
  if (topics.includes('self_model'))        builders.push(_buildSelfModelSection(userId));
  if (topics.includes('recurring_thoughts')) builders.push(_buildRecurringThoughtsSection());

  const sections = await Promise.all(builders);
  if (sections.length === 0) return '';
  return (
    '\n\nINTERNAL_AUDIT_CONTEXT (retrieved system data — IDs and timestamps are real):\n' +
    sections.join('\n\n') +
    '\n[end INTERNAL_AUDIT_CONTEXT]'
  );
}

// ── Public API ────────────────────────────────────────────────────────────

async function injectAuditContext(userMessage, userId) {
  if (!userId || !userMessage) return '';
  const topics = detectAuditTopics(userMessage);
  if (topics.length === 0) return '';
  try {
    return await _buildAuditContext(userId, topics);
  } catch (err) {
    return (
      '\n\nINTERNAL_AUDIT_CONTEXT: [all data sources unavailable — ' +
      err.message +
      '. Tell Chris the audit data is temporarily unavailable.]\n[end INTERNAL_AUDIT_CONTEXT]'
    );
  }
}

module.exports = { detectAuditTopics, injectAuditContext };
