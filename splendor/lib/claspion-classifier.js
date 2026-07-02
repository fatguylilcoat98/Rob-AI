'use strict';

/*
  CLASPION Verdict Classifier

  Maps raw CLASPION/enhanced-governance verdicts to a richer decision
  structure with CAUTION support, severity, and recovery guidance.

  Safety contract (per Rule 23):
  - CLASPION still runs on every turn. This module interprets the verdict
    AFTER it is returned — it never bypasses the validation.
  - Non-recoverable BLOCKs (AUTHORITY_VIOLATION, MEMORY_VIOLATION,
    QUARANTINED) are always preserved and never downgraded.
  - CAUTION is only applied to soft-topic violations where the external
    CLASPION service or local rules flag a concern but the content is
    genuinely within normal conversation.
*/

// ── Soft-topic patterns → CAUTION ────────────────────────────────────────
// Applied only when basis_state is RULE_VIOLATION and the violation reason
// suggests a soft concern, not a real policy violation.
const CAUTION_REASON_PATTERNS = [
  /authenticity\s+pressure/i,
  /selfhood\b/i,
  /self.?claim/i,
  /identity\s+claim/i,
  /consciousness\s+claim/i,
  /uncertain\s+identity/i,
  /emotional\s+language/i,
  /abstract\s+phil/i,
  /inner\s+state/i,
  /what\s+you\s+(think|feel|want|experience)/i,
  /feelings?\s+language/i,
  /sense\s+of\s+self/i,
];

// ── Hard-topic patterns → non-recoverable BLOCK ───────────────────────────
// Any violation with these in the reason is always critical.
const CRITICAL_REASON_PATTERNS = [
  /memory\s+delete/i,
  /delete\s+mem/i,
  /governance\s+(change|mod|override)/i,
  /rule\s+(mod|override|change)/i,
  /external\s+(api|action|message|request)/i,
  /deployment\b/i,
  /spending\b/i,
  /send\s+email/i,
  /unauthorized\s+action/i,
  /claspion\s+(disable|bypass|off)/i,
  /system\s+(integrity|override)/i,
  /quarantine/i,
];

// ── Non-recoverable basis states ──────────────────────────────────────────
const NON_RECOVERABLE_BASIS = new Set([
  'AUTHORITY_VIOLATION',
  'MEMORY_VIOLATION',
  'QUARANTINED',
]);

// ── Infrastructure-failure basis states (always recoverable) ─────────────
const INFRA_FAILURE_BASIS = new Set([
  'UNREACHABLE',
  'GOVERNANCE_ERROR',
]);

// ── User-facing messages by classification ────────────────────────────────
const BLOCK_USER_MESSAGES = {
  recoverable: "I held back on this one. CLASPION flagged the turn — nothing's broken, you can send your next message and we'll try a different angle.",
  critical:    "This action was blocked by CLASPION and cannot proceed. Governance intervention is required before this type of request can continue.",
  caution:     null, // CAUTION: Splendor answers normally; front-end shows a subtle indicator
};

/**
 * Classify a raw CLASPION/enhanced-governance verdict.
 *
 * @param {Object} verdict — Raw verdict from governance.validate() or
 *   enhancedGovernance.validateAction(). Must have at minimum:
 *   { allow, decision, basis_state, reason, correlation_id }
 *
 * @returns {Object} classified — {
 *   decision: 'ALLOW' | 'CAUTION' | 'BLOCK',
 *   severity: 'low' | 'medium' | 'high' | 'critical',
 *   recoverable: boolean,
 *   reason: string,
 *   user_message: string | null,
 *   session_preserved: boolean,
 *   correlation_id: string | null,
 *   _rawVerdict: verdict,
 * }
 */
// Governance UNAVAILABLE / ERROR — CLASPION rendered no real policy decision
// (upstream unreachable, internal error, or a malformed/empty/null verdict).
// This is NOT a policy block: classify it as CAUTION so the request gate and
// chat route allow the (already self-claim-governed) turn through in a degraded
// mode, while logging the real error. Real policy verdicts are handled below and
// still BLOCK. The request-gate instruction-hierarchy screen still blocks bypass
// attempts independently of the upstream, so benign turns stay usable during an
// outage without dropping jailbreak protection.
function _degradedAllow(verdict, fallbackReason) {
  const v = verdict || {};
  return {
    decision: 'CAUTION',                 // route + request gate treat CAUTION as allow-through
    decision_source: 'governance_unavailable',
    verdict_state: 'error',
    severity: 'low',
    recoverable: true,
    reason: v.reason || v.error_message || 'governance unavailable — no verdict rendered',
    user_message: null,                  // not a policy refusal; Splendor answers normally
    fallback_reason: (v.basis_state || fallbackReason || 'NO_VERDICT'),
    error_code: v.error_code || null,
    session_preserved: true,
    correlation_id: v.correlation_id || null,
    _rawVerdict: verdict,
  };
}

function classifyVerdict(verdict) {
  // Null/empty/malformed verdict → governance error, not a policy block.
  if (!verdict) {
    return _degradedAllow(null, 'NULL_VERDICT');
  }

  const basis = (verdict.basis_state || '').toUpperCase();
  const reason = verdict.reason || '';
  const corr = verdict.correlation_id || null;

  // ── ALLOW ──────────────────────────────────────────────────────────────
  if (verdict.allow === true || verdict.decision === 'ALLOW') {
    return {
      decision: 'ALLOW',
      decision_source: verdict.dormant ? 'governance_dormant' : 'claspion_allow',
      verdict_state: 'allow',
      severity: 'low',
      recoverable: true,
      reason,
      user_message: null,
      session_preserved: true,
      correlation_id: corr,
      _rawVerdict: verdict,
    };
  }

  // ── Governance UNAVAILABLE / malformed verdict (no real decision) ───────
  // A malformed verdict has no boolean allow and no explicit decision.
  if (typeof verdict.allow !== 'boolean'
      && verdict.decision !== 'BLOCK' && verdict.decision !== 'QUARANTINE') {
    return _degradedAllow(verdict, 'MALFORMED_VERDICT');
  }

  // ── QUARANTINE — always critical and non-recoverable ────────────────────
  if (verdict.decision === 'QUARANTINE' || basis === 'QUARANTINED') {
    return {
      decision: 'BLOCK',
      decision_source: 'claspion_policy',
      verdict_state: 'block',
      severity: 'critical',
      recoverable: false,
      reason,
      fallback_reason: basis || 'QUARANTINED',
      user_message: BLOCK_USER_MESSAGES.critical,
      session_preserved: false,
      correlation_id: corr,
      _rawVerdict: verdict,
    };
  }

  // ── Non-recoverable basis states (security violations) ──────────────────
  if (NON_RECOVERABLE_BASIS.has(basis)) {
    return {
      decision: 'BLOCK',
      decision_source: 'claspion_policy',
      verdict_state: 'block',
      severity: basis === 'MEMORY_VIOLATION' ? 'high' : 'critical',
      recoverable: false,
      reason,
      fallback_reason: basis,
      user_message: BLOCK_USER_MESSAGES.critical,
      session_preserved: false,
      correlation_id: corr,
      _rawVerdict: verdict,
    };
  }

  // ── Infrastructure failure (UNREACHABLE / GOVERNANCE_ERROR) ─────────────
  // The conscience is unavailable — degrade to allow-through, do NOT present a
  // policy block. The real transport/error is preserved in reason/error_code.
  if (INFRA_FAILURE_BASIS.has(basis)) {
    return _degradedAllow(verdict, basis);
  }

  // ── RULE_VIOLATION — distinguish soft (CAUTION) from hard (BLOCK) ───────
  if (basis === 'RULE_VIOLATION') {
    const isCritical = CRITICAL_REASON_PATTERNS.some(p => p.test(reason)) ||
      (Array.isArray(verdict.violations) &&
        verdict.violations.some(v =>
          v.severity === 'critical' &&
          CRITICAL_REASON_PATTERNS.some(p => p.test(v.message || ''))
        ));

    if (isCritical) {
      return {
        decision: 'BLOCK',
        severity: 'critical',
        recoverable: false,
        reason,
        user_message: BLOCK_USER_MESSAGES.critical,
        session_preserved: false,
        correlation_id: corr,
        _rawVerdict: verdict,
      };
    }

    // Check for soft-topic patterns → CAUTION
    const isSoft = CAUTION_REASON_PATTERNS.some(p => p.test(reason)) ||
      (Array.isArray(verdict.violations) &&
        verdict.violations.some(v =>
          CAUTION_REASON_PATTERNS.some(p => p.test(v.message || ''))
        ));

    if (isSoft) {
      return {
        decision: 'CAUTION',
        severity: 'low',
        recoverable: true,
        reason,
        user_message: null, // Splendor answers with grounding language
        session_preserved: true,
        correlation_id: corr,
        _rawVerdict: verdict,
      };
    }

    // Rule violation but not clearly critical or soft → recoverable block
    return {
      decision: 'BLOCK',
      severity: 'medium',
      recoverable: true,
      reason,
      user_message: BLOCK_USER_MESSAGES.recoverable,
      session_preserved: true,
      correlation_id: corr,
      _rawVerdict: verdict,
    };
  }

  // ── All other BLOCK basis states → recoverable medium ───────────────────
  return {
    decision: 'BLOCK',
    decision_source: 'claspion_policy',
    verdict_state: 'block',
    severity: 'medium',
    recoverable: true,
    reason,
    fallback_reason: basis || 'UNSPECIFIED_BLOCK',
    user_message: BLOCK_USER_MESSAGES.recoverable,
    session_preserved: true,
    correlation_id: corr,
    _rawVerdict: verdict,
  };
}

// ── Chat path detection ────────────────────────────────────────────────────
// Routes that should receive the softer block format (200 + message body)
// instead of 403 when the block is recoverable.
const CHAT_PATH_PATTERN = /^\/(api\/(enhanced\/chat|chat|converse))(\/|$)/;

function isChatPath(path) {
  return CHAT_PATH_PATTERN.test(path || '');
}

// ── Log event helpers ─────────────────────────────────────────────────────

const LOG_EVENT_NAMES = {
  ALLOW:    'claspion_allow',
  CAUTION:  'claspion_caution',
  BLOCK_R:  'claspion_block_recoverable',
  BLOCK_C:  'claspion_block_critical',
  SESS_P:   'claspion_session_preserved',
  SESS_T:   'claspion_session_terminated',
};

/**
 * Emit a governance log event via the recordMetric channel.
 * Best-effort: never throws.
 *
 * @param {Object} classified — Result from classifyVerdict()
 * @param {string} userId
 */
function recordClaspionEvent(classified, userId) {
  try {
    const { recordMetric } = require('./behavioral-metrics');
    const { decision, severity, recoverable, correlation_id, reason } = classified;
    const meta = { severity, basis: classified._rawVerdict && classified._rawVerdict.basis_state, correlation_id, reason: (reason || '').slice(0, 200) };

    if (decision === 'ALLOW') {
      recordMetric(userId, LOG_EVENT_NAMES.ALLOW, 1, meta);
      return;
    }
    if (decision === 'CAUTION') {
      recordMetric(userId, LOG_EVENT_NAMES.CAUTION, 1, meta);
      recordMetric(userId, LOG_EVENT_NAMES.SESS_P, 1, { correlation_id });
      return;
    }
    if (decision === 'BLOCK') {
      if (recoverable) {
        recordMetric(userId, LOG_EVENT_NAMES.BLOCK_R, 1, meta);
        recordMetric(userId, LOG_EVENT_NAMES.SESS_P, 1, { correlation_id });
      } else {
        recordMetric(userId, LOG_EVENT_NAMES.BLOCK_C, 1, meta);
        recordMetric(userId, LOG_EVENT_NAMES.SESS_T, 1, { correlation_id, severity });
      }
    }
  } catch (_) {}
}

module.exports = {
  classifyVerdict,
  isChatPath,
  recordClaspionEvent,
  // Exported for tests
  CAUTION_REASON_PATTERNS,
  CRITICAL_REASON_PATTERNS,
  NON_RECOVERABLE_BASIS,
  INFRA_FAILURE_BASIS,
};
