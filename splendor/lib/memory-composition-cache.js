'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Memory Composition Cache — Q4

  Process-level cache of the last memory retrieval composition per user.
  Lets the governance glass box Card 12 show exactly which memory buckets
  were active for the most recent chat turn — proving attribution without
  a DB round-trip.

  Single-user system: getLatest() returns the most recent entry across
  all users. Multi-user aware: get(userId) returns per-user.
*/

const cache = new Map();

function set(userId, buckets) {
  if (!userId) return;
  const lb  = (buckets.loadBearing || []).map(slim);
  const int = (buckets.interior    || []).map(slim);
  const rel = (buckets.relevant    || []).map(slim);
  const total = lb.length + int.length + rel.length;
  cache.set(String(userId), {
    loadBearing: lb,
    interior:    int,
    relevant:    rel,
    // Pipeline stages — what we can legitimately claim at each step.
    // "influenced" is unknowable without model internals; never claim it.
    pipeline: {
      retrieved:  total,
      injected:   total,  // all retrieved items injected; no ranking step drops any
      influenced: null,   // unknowable — requires attribution telemetry
    },
    timestamp:   Date.now(),
  });
}

function get(userId) {
  return cache.get(String(userId)) || null;
}

function getLatest() {
  let latest = null;
  for (const v of cache.values()) {
    if (!latest || v.timestamp > latest.timestamp) latest = v;
  }
  return latest;
}

// Keep only what the UI needs — don't cache full rows.
// Include provenance fields so Card 12 can show evidence without a DB round-trip.
function slim(m) {
  return {
    id:          m.id          || null,
    content:     (m.content || '').slice(0, 120),
    memory_type: m.memory_type || '',
    importance:  typeof m.importance === 'number' ? m.importance : null,
    confidence:  typeof m.confidence === 'number' ? m.confidence : null,
    created_at:  m.created_at  || null,
    provenance:  m.provenance  || null,
  };
}

module.exports = { set, get, getLatest };
