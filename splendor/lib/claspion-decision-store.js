'use strict';

/*
  CLASPION Decision Store — Splendor experimental feature

  In-memory ring buffer (max 20) of recent CLASPION governance decisions.
  Session-scoped: expires when the Node process restarts.
  Populated by the middleware when CLASPION_VOICE_ENABLED=true.
  Read by the explanation engine to answer "why did you block that?" queries.

  Decision record shape:
    decision_id, timestamp, user_message, surface_mode, decision_type,
    triggered_rules, evidence, confidence, reason,
    suggested_safe_next_action, original_classification
*/

const MAX_STORED = 20;
const EXPIRY_MS  = 4 * 60 * 60 * 1000; // 4 hours

const _store = [];

/**
 * Store a governance decision record.
 */
function storeDecision(record) {
  const entry = {
    decision_id:               record.decision_id || require('crypto').randomUUID(),
    timestamp:                 record.timestamp   || new Date().toISOString(),
    user_message:              record.user_message || null,
    surface_mode:              record.surface_mode || 'chat',
    decision_type:             record.decision_type || 'UNKNOWN',
    triggered_rules:           Array.isArray(record.triggered_rules) ? record.triggered_rules : [],
    evidence:                  record.evidence  || null,
    confidence:                record.confidence != null ? record.confidence : null,
    reason:                    record.reason    || null,
    suggested_safe_next_action: record.suggested_safe_next_action || null,
    original_classification:   record.original_classification    || null,
    _expires_at: Date.now() + EXPIRY_MS,
  };

  _store.push(entry);
  while (_store.length > MAX_STORED) _store.shift();
  return entry;
}

/** Get the most recent unexpired decision, or null. */
function getMostRecent() {
  _pruneExpired();
  return _store.length > 0 ? _store[_store.length - 1] : null;
}

/** Get a specific decision by ID, or null. */
function getById(decision_id) {
  _pruneExpired();
  return _store.find(d => d.decision_id === decision_id) || null;
}

/** Get all unexpired decisions (defensive copy). */
function getAll() {
  _pruneExpired();
  return [..._store];
}

/** Clear all stored decisions (used in tests). */
function clearAll() {
  _store.length = 0;
}

function _pruneExpired() {
  const now = Date.now();
  while (_store.length > 0 && _store[0]._expires_at < now) _store.shift();
}

module.exports = { storeDecision, getMostRecent, getById, getAll, clearAll };
