'use strict';

/*
 * Admin Provenance Auditing
 *
 * PURPOSE: Privileged actions must themselves become provenance events.
 * The system allows privileged access, but every privileged action must
 * be attributed, timestamped, and preserved.
 *
 * CURRENT LIMITATION: This provides attributable auditability, NOT
 * cryptographic tamper-proofing. An operator with direct DB access can
 * modify the admin_provenance_events table itself. Future hardening paths:
 *   - Append-only triggers at the DB level
 *   - Cryptographic hash chaining across event rows
 *   - Signed audit events with key rotation
 *   - External log anchoring (separate write-once store)
 *   - Separation of duties (separate audit DB user)
 */

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

/**
 * Record a privileged action to the admin_provenance_events table.
 * Non-fatal: logs a warning if the DB write fails but does not throw.
 */
async function recordPrivilegedAction({
  actorUserId,
  actorRole = 'owner',
  targetTable,
  targetRecordId,
  actionType, // view | create | modify | delete | restore | export | access_grant | access_revoke
  oldValue = null,
  newValue = null,
  reason = null,
  sourceIp = null,
  requestId = null,
}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) {
    console.warn('[ADMIN-PROVENANCE] DB unavailable — event not recorded:', { actionType, targetTable, targetRecordId });
    return { error: 'db_unavailable' };
  }

  const VALID_ACTIONS = ['view','create','modify','delete','restore','export','access_grant','access_revoke'];
  if (!VALID_ACTIONS.includes(actionType)) {
    console.warn('[ADMIN-PROVENANCE] Invalid action_type:', actionType);
    return { error: 'invalid_action_type' };
  }

  const { data, error } = await db
    .from('admin_provenance_events')
    .insert([{
      actor_user_id: actorUserId || null,
      actor_role: actorRole,
      target_table: targetTable,
      target_record_id: targetRecordId ? String(targetRecordId) : null,
      action_type: actionType,
      old_value: oldValue || null,
      new_value: newValue || null,
      reason: reason || null,
      source_ip: sourceIp || null,
      request_id: requestId || null,
    }])
    .select()
    .single();

  if (error) {
    console.warn('[ADMIN-PROVENANCE] Failed to record event:', error.message);
    return { error: error.message };
  }

  return { event: data, error: null };
}

/**
 * Express middleware factory.
 * Wraps a route with automatic provenance recording for sensitive operations.
 * Usage: router.delete('/:id', requireAuth, requireOwner, withProvenance('flight_recorder', 'delete'), handler)
 */
function withProvenance(targetTable, actionType, getRecordId = (req) => req.params.id) {
  return async (req, res, next) => {
    req._provenanceTarget = { targetTable, actionType, recordId: getRecordId(req) };
    next();
  };
}

/**
 * Get recent admin provenance events.
 */
async function getRecentEvents({ limit = 50 } = {}) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return { events: [], error: 'db_unavailable' };

  const { data, error } = await db
    .from('admin_provenance_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  return { events: data || [], error: error ? error.message : null };
}

module.exports = { recordPrivilegedAction, withProvenance, getRecentEvents };
