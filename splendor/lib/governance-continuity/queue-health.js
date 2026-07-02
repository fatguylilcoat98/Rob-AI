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

// Pure: determine queue health status from counts and age.
function computeQueueStatus(openFlagsCount, oldestAgeHours) {
  if (openFlagsCount >= 20 || (oldestAgeHours !== null && oldestAgeHours !== undefined && oldestAgeHours > 168)) return 'OVERLOADED';
  if (openFlagsCount >= 10 || (oldestAgeHours !== null && oldestAgeHours !== undefined && oldestAgeHours > 72))  return 'STRAINED';
  if (openFlagsCount >= 5  || (oldestAgeHours !== null && oldestAgeHours !== undefined && oldestAgeHours > 24))  return 'WATCH';
  return 'HEALTHY';
}

async function checkQueueHealth(opts = {}) {
  const owner = opts.owner || OWNER;
  const client = db();

  const { count: quarantineCount } = await client
    .from('quarantine_incidents')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  const { count: pendingCount } = await client
    .from('memory_items')
    .select('*', { count: 'exact', head: true })
    .eq('approval_status', 'pending_review');

  const openFlagsCount = (quarantineCount || 0) + (pendingCount || 0);

  const { data: oldest } = await client
    .from('quarantine_incidents')
    .select('triggered_at')
    .eq('status', 'active')
    .order('triggered_at', { ascending: true })
    .limit(1);

  const oldestAgeHours = oldest && oldest.length > 0
    ? (Date.now() - new Date(oldest[0].triggered_at)) / 3600000
    : null;

  // Check for rushed resolution pattern from last 10 resolved incidents
  const { data: recent } = await client
    .from('quarantine_incidents')
    .select('triggered_at, updated_at')
    .eq('status', 'resolved')
    .order('updated_at', { ascending: false })
    .limit(10);

  let avgResolutionHours = null;
  let recentSpeed = 'NORMAL';
  let rushedSuspected = false;

  if (recent && recent.length > 0) {
    const times = recent
      .map(r => (new Date(r.updated_at) - new Date(r.triggered_at)) / 3600000)
      .filter(h => h >= 0);
    if (times.length > 0) {
      avgResolutionHours = times.reduce((a, b) => a + b, 0) / times.length;
      if (avgResolutionHours < 0.167) {
        recentSpeed = 'VERY_FAST';
        rushedSuspected = times.length >= 3;
      } else if (avgResolutionHours < 0.5) {
        recentSpeed = 'FAST';
      }
    }
  }

  const status = computeQueueStatus(openFlagsCount, oldestAgeHours);

  await logSafeguardEvent(owner, 'queue_health', 'resolution_queue_health_checked', {
    openFlagsCount, oldestAgeHours, avgResolutionHours, recentSpeed, rushedSuspected, status,
  });
  if (status === 'STRAINED')   await logSafeguardEvent(owner, 'queue_health', 'resolution_queue_strained',  { openFlagsCount });
  if (status === 'OVERLOADED') await logSafeguardEvent(owner, 'queue_health', 'resolution_queue_overloaded', { openFlagsCount });
  if (rushedSuspected)         await logSafeguardEvent(owner, 'queue_health', 'rushed_resolution_pattern_detected', { avgResolutionHours });

  await client.from('resolution_queue_health').insert({
    owner,
    open_flags_count: openFlagsCount,
    oldest_unresolved_flag_age_hours: oldestAgeHours,
    average_resolution_time_hours: avgResolutionHours,
    recent_resolution_speed: recentSpeed,
    rushed_resolution_suspected: rushedSuspected,
    queue_health_status: status,
  });

  return { ok: true, status, openFlagsCount, oldestAgeHours, avgResolutionHours, recentSpeed, rushedSuspected };
}

module.exports = { checkQueueHealth, computeQueueStatus };
