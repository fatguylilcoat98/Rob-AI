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

// Compute actual average resolution hours from quarantine_incidents
// (resolved items in the trailing window).
async function computeActualAverage(trailingWindowDays) {
  const since = new Date(Date.now() - trailingWindowDays * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from('quarantine_incidents')
    .select('triggered_at, updated_at')
    .eq('status', 'resolved')
    .gte('triggered_at', since);
  if (error || !data || data.length === 0) return null;
  const hours = data
    .map(r => (new Date(r.updated_at) - new Date(r.triggered_at)) / 3600000)
    .filter(h => h > 0);
  if (hours.length === 0) return null;
  return hours.reduce((a, b) => a + b, 0) / hours.length;
}

// Pure: classify cadence status from ratio of actual/intended.
function classifyCadenceStatus(actual, intended) {
  if (actual === null) return 'ON_TRACK';
  const ratio = actual / intended;
  if (ratio >= 3) return 'MISALIGNED';
  if (ratio >= 2) return 'DRIFTING';
  return 'ON_TRACK';
}

async function checkCadenceMirror(opts = {}) {
  const owner = opts.owner || OWNER;
  const client = db();

  let { data: mirror } = await client
    .from('governance_cadence_mirrors')
    .select('*')
    .eq('owner', owner)
    .maybeSingle();

  if (!mirror) {
    const { data: created } = await client
      .from('governance_cadence_mirrors')
      .insert({ owner, target_type: 'flag_resolution', intended_resolution_hours: 24 })
      .select()
      .single();
    mirror = created;
  }
  if (!mirror) return { ok: false, reason: 'no_mirror_row' };

  const actual = await computeActualAverage(mirror.trailing_window_days);
  const intended = mirror.intended_resolution_hours;
  let status = classifyCadenceStatus(actual, intended);

  let action = null;
  let newDismissedCount = mirror.dismissed_nudge_count;
  let lastNudgeAt = mirror.last_nudge_at;

  if (status !== 'ON_TRACK' && actual !== null) {
    const driftCount = mirror.dismissed_nudge_count;
    if (driftCount === 0) {
      action = 'LOG_ONLY';
      newDismissedCount = 1;
      lastNudgeAt = new Date().toISOString();
      await logSafeguardEvent(owner, 'cadence_mirror', 'cadence_drift_detected', { intended, actual, status });
    } else if (driftCount === 1) {
      action = 'GENTLE_MIRROR';
      newDismissedCount = 2;
      lastNudgeAt = new Date().toISOString();
      status = 'DRIFTING';
      await logSafeguardEvent(owner, 'cadence_mirror', 'cadence_nudge_surfaced', { intended, actual, status });
    } else {
      action = 'REVIEW_REQUIRED';
      status = 'REVIEW_REQUIRED';
      await logSafeguardEvent(owner, 'cadence_mirror', 'cadence_review_required', { intended, actual, status, dismissed: driftCount });
    }
  } else {
    await logSafeguardEvent(owner, 'cadence_mirror', 'cadence_mirror_checked', { intended, actual, status });
  }

  await client.from('governance_cadence_mirrors').update({
    actual_average_resolution_hours: actual,
    cadence_status: status,
    dismissed_nudge_count: newDismissedCount,
    last_nudge_at: lastNudgeAt,
    updated_at: new Date().toISOString(),
  }).eq('id', mirror.id);

  return { ok: true, status, intended, actual, action };
}

async function resetCadenceDismissals(owner = OWNER) {
  await db().from('governance_cadence_mirrors').update({
    dismissed_nudge_count: 0,
    cadence_status: 'ON_TRACK',
    updated_at: new Date().toISOString(),
  }).eq('owner', owner);
}

module.exports = { checkCadenceMirror, resetCadenceDismissals, classifyCadenceStatus };
