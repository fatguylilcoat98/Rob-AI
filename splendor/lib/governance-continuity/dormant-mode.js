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
const DORMANT_ENABLED   = process.env.DORMANT_MODE_ENABLED !== 'false';
const MAINTENANCE_DAYS  = parseInt(process.env.MAINTENANCE_AFTER_DAYS || '30', 10);
const DORMANT_DAYS      = parseInt(process.env.DORMANT_AFTER_DAYS || '90', 10);

// Pure: determine continuity state from absence duration and thresholds.
function computeDormantState(daysSinceActivity, maintenanceDays, dormantDays) {
  if (daysSinceActivity === null || daysSinceActivity === undefined) return 'ACTIVE';
  if (daysSinceActivity >= dormantDays)    return 'DORMANT_READ_ONLY';
  if (daysSinceActivity >= maintenanceDays) return 'SOFT_MAINTENANCE';
  return 'ACTIVE';
}

// Detect last owner activity from memory_items (user_direct_statement is a
// reliable proxy for Chris actively using the system).
async function detectLastOwnerActivity() {
  const { data } = await db()
    .from('memory_items')
    .select('created_at')
    .eq('source_type', 'user_direct_statement')
    .order('created_at', { ascending: false })
    .limit(1);
  if (data && data.length > 0) return new Date(data[0].created_at);
  return null;
}

async function checkDormantMode(opts = {}) {
  const owner = opts.owner || OWNER;
  if (!DORMANT_ENABLED) return { ok: true, state: 'ACTIVE', dormantEnabled: false };

  const client = db();
  const lastActivity = await detectLastOwnerActivity();
  const daysSinceActivity = lastActivity
    ? (Date.now() - lastActivity.getTime()) / 86400000
    : null;

  const newState = computeDormantState(daysSinceActivity, MAINTENANCE_DAYS, DORMANT_DAYS);

  let { data: existing } = await client
    .from('dormant_mode_state')
    .select('*')
    .eq('owner', owner)
    .maybeSingle();

  const prevState = existing?.continuity_state || 'ACTIVE';
  const stateChanged = newState !== prevState;

  const updates = {
    continuity_state: newState,
    last_owner_activity_at: lastActivity?.toISOString() || null,
    updated_at: new Date().toISOString(),
  };
  if (newState === 'SOFT_MAINTENANCE' && prevState === 'ACTIVE') {
    updates.soft_maintenance_entered_at = new Date().toISOString();
  }
  if (newState === 'DORMANT_READ_ONLY' && prevState !== 'DORMANT_READ_ONLY') {
    updates.dormant_entered_at = new Date().toISOString();
  }

  if (existing) {
    await client.from('dormant_mode_state').update(updates).eq('id', existing.id);
  } else {
    await client.from('dormant_mode_state').insert({ owner, ...updates });
  }

  await logSafeguardEvent(owner, 'dormant_mode', 'dormant_check_started', {
    newState, prevState, daysSinceActivity,
  });

  if (stateChanged) {
    if (newState === 'SOFT_MAINTENANCE') {
      await logSafeguardEvent(owner, 'dormant_mode', 'soft_maintenance_entered', { daysSinceActivity });
    }
    if (newState === 'DORMANT_READ_ONLY') {
      await logSafeguardEvent(owner, 'dormant_mode', 'dormant_mode_entered', { daysSinceActivity });
    }
  }

  return { ok: true, state: newState, prevState, lastActivity, daysSinceActivity, stateChanged };
}

async function reactivateDormantMode(owner = OWNER) {
  const { data, error } = await db().from('dormant_mode_state').update({
    continuity_state: 'ACTIVE',
    reactivated_at: new Date().toISOString(),
    dormant_entered_at: null,
    soft_maintenance_entered_at: null,
    updated_at: new Date().toISOString(),
  }).eq('owner', owner).select().single();

  if (error) return { ok: false, reason: error.message };

  await logSafeguardEvent(owner, 'dormant_mode', 'dormant_mode_reactivated', { owner });
  return { ok: true, state: 'ACTIVE' };
}

// Returns true if non-critical memory writes should be blocked.
async function isDormantWriteBlocked(owner = OWNER) {
  const { data } = await db()
    .from('dormant_mode_state')
    .select('continuity_state')
    .eq('owner', owner)
    .maybeSingle();
  const state = data?.continuity_state || 'ACTIVE';
  const blocked = state === 'DORMANT_READ_ONLY' || state === 'ADMIN_REVIEW_REQUIRED';
  if (blocked) {
    await logSafeguardEvent(owner, 'dormant_mode', 'dormant_write_blocked', { state });
  }
  return blocked;
}

async function getDormantState(owner = OWNER) {
  const { data } = await db()
    .from('dormant_mode_state')
    .select('*')
    .eq('owner', owner)
    .maybeSingle();
  return data || { continuity_state: 'ACTIVE', owner };
}

module.exports = {
  checkDormantMode,
  reactivateDormantMode,
  isDormantWriteBlocked,
  getDormantState,
  computeDormantState,
};
