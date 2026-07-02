'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Scan Loop Circuit Breaker

  Prevents the reflection cycle from spinning on stale content:
    1. Low-confidence guard  — if confidence_level <= LOW_CONF_THRESHOLD, the
       thought is not queued for communication and its inquiry is suppressed.
    2. Stale-inquiry guard   — before spawning a new inquiry thread, check
       whether an open thread on the same topic already exists.
    3. Cycle-level breaker   — if every domain pass in one cycle scores low
       confidence, the cycle is flagged as low_signal so callers can log it
       and skip redundant downstream work.

  All guards are fail-open: if the DB is unavailable or throws, no pass is
  ever suppressed — we prefer a noisy duplicate over a silent gap.
*/

const LOW_CONF_THRESHOLD = 3;        // confidence_level <= this → suppress comms
const STALE_TOPIC_CHARS  = 40;       // leading chars used for topic dedup
const MAX_OPEN_INQUIRIES  = 200;     // cap the open-inquiry lookup

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

/**
 * Returns true when the thought's confidence is so low that:
 *   - queuing a pending_communication would be noise, and
 *   - spawning a follow_up inquiry would likely be stale.
 *
 * Callers MUST still save the thought — the breaker only suppresses
 * communication and inquiry side-effects, not the thought record itself.
 */
function isTooLowConfidence(confidenceLevel) {
  return Number.isFinite(confidenceLevel) && confidenceLevel <= LOW_CONF_THRESHOLD;
}

/**
 * Returns true when an open inquiry thread already covers `topic`.
 *
 * Matching is intentionally loose: if the first STALE_TOPIC_CHARS of the
 * new topic appear as a substring of any existing open topic, we consider
 * it a duplicate. Fails-open (returns false) on any DB error.
 */
async function isStaleInquiry(topic) {
  if (!topic || typeof topic !== 'string') return false;

  try {
    const supa = safeRequireSupabase();
    const db = supa && supa.supabase;
    if (!db) return false;

    const { data: openThreads, error } = await db
      .from('inquiry_threads')
      .select('inquiry_topic')
      .in('current_status', ['active', 'researching', 'pending'])
      .limit(MAX_OPEN_INQUIRIES);

    if (error || !openThreads) return false;

    const needle = topic.slice(0, STALE_TOPIC_CHARS).toLowerCase();
    return openThreads.some(t =>
      t.inquiry_topic && t.inquiry_topic.toLowerCase().includes(needle)
    );

  } catch (_) {
    return false;
  }
}

/**
 * Given the array of per-domain confidence levels from one cycle,
 * returns true when ALL domains reported low confidence — meaning the
 * entire cycle produced no useful signal.
 */
function isCycleLowSignal(domainConfidenceLevels) {
  if (!Array.isArray(domainConfidenceLevels) || domainConfidenceLevels.length === 0) {
    return false;
  }
  return domainConfidenceLevels.every(c =>
    Number.isFinite(c) && c <= LOW_CONF_THRESHOLD
  );
}

module.exports = {
  LOW_CONF_THRESHOLD,
  isTooLowConfidence,
  isStaleInquiry,
  isCycleLowSignal,
};
