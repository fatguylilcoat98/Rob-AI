'use strict';

/*
  CLASPION Audit Trail — Splendor experimental feature

  Every explanation and review creates an immutable in-memory audit record.
  Session-scoped: entries are lost on process restart.

  Records are frozen (Object.freeze) after creation — they cannot be mutated.
  is_policy_change is always false: session-only corrections are never
  permanent governance changes.
*/

const _trail = [];

/**
 * Log a CLASPION explanation event.
 */
function logExplanation({
  original_decision_id,
  user_message,
  response_generated,
  splendor_generation_skipped,
}) {
  const record = Object.freeze({
    record_type:                'EXPLANATION',
    record_id:                  _uuid(),
    timestamp:                  new Date().toISOString(),
    original_decision_id:       original_decision_id || null,
    user_message:               _truncate(user_message, 500),
    response_generated:         Boolean(response_generated),
    splendor_generation_skipped: Boolean(splendor_generation_skipped),
    session_exception_created:  false,
    is_policy_change:           false,
  });
  _trail.push(record);
  return record;
}

/**
 * Log a CLASPION review/reclassification event.
 */
function logReview({
  original_decision_id,
  original_classification,
  revised_classification,
  review_outcome,
  reason,
  splendor_generation_skipped,
  session_exception_created,
}) {
  const record = Object.freeze({
    record_type:                'REVIEW',
    record_id:                  _uuid(),
    review_id:                  _uuid(),
    timestamp:                  new Date().toISOString(),
    original_decision_id:       original_decision_id    || null,
    original_classification:    original_classification || null,
    revised_classification:     revised_classification  || null,
    review_outcome:             review_outcome          || null,
    reason:                     _truncate(reason, 500),
    splendor_generation_skipped: Boolean(splendor_generation_skipped),
    session_exception_created:  Boolean(session_exception_created),
    is_policy_change:           false,
  });
  _trail.push(record);
  return record;
}

/** Get all audit records (defensive copy). */
function getTrail() { return [..._trail]; }

/** Clear the trail (for testing). */
function clearTrail() { _trail.length = 0; }

function _uuid() { return require('crypto').randomUUID(); }

function _truncate(str, max) {
  if (!str || typeof str !== 'string') return str || null;
  return str.length > max ? str.slice(0, max) + '…' : str;
}

module.exports = { logExplanation, logReview, getTrail, clearTrail };
