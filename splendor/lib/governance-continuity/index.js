'use strict';
const cadenceMirror        = require('./cadence-mirror');
const queueHealth          = require('./queue-health');
const governanceVersion    = require('./governance-version');
const retroScan            = require('./retro-scan');
const delegateLedger       = require('./delegate-ledger');
const dormantMode          = require('./dormant-mode');
const consequenceVisibility = require('./consequence-visibility');
const events               = require('./events');

const OWNER = process.env.SPLENDOR_OWNER_EMAIL || 'chris';

// Run all daily safeguard checks for an owner. Each check is isolated so one
// failure doesn't block the others.
async function runAllChecks(owner = OWNER) {
  const results = {};

  try { results.cadence        = await cadenceMirror.checkCadenceMirror({ owner }); }
  catch (e) { results.cadence = { ok: false, error: e.message }; }

  try { results.queue          = await queueHealth.checkQueueHealth({ owner }); }
  catch (e) { results.queue   = { ok: false, error: e.message }; }

  try { results.dormant        = await dormantMode.checkDormantMode({ owner }); }
  catch (e) { results.dormant = { ok: false, error: e.message }; }

  try { results.versionBackfill        = await governanceVersion.backfillGovernanceVersions({ owner }); }
  catch (e) { results.versionBackfill = { ok: false, error: e.message }; }

  try { results.delegateExpiry        = await delegateLedger.expireUnratifiedDecisions(owner); }
  catch (e) { results.delegateExpiry = { ok: false, error: e.message }; }

  return results;
}

// Build daily email sections. Returns an array of { title, body } objects.
// Only includes sections where something needs attention.
async function buildDailyEmailSections(owner = OWNER) {
  const sections = [];

  try {
    const cadence = await cadenceMirror.checkCadenceMirror({ owner });
    if (cadence.status !== 'ON_TRACK') {
      const actualStr = cadence.actual !== null ? cadence.actual.toFixed(1) + 'h' : 'unknown';
      const note = cadence.action === 'REVIEW_REQUIRED'
        ? 'Your intended cadence is drifting from actual behavior — worth reviewing.'
        : 'Gentle note: cadence is drifting from your intended target.';
      sections.push({
        title: 'Cadence Mirror',
        body: `Status: ${cadence.status}. Intended: ${cadence.intended}h, Actual: ${actualStr}. ${note}`,
      });
    }
  } catch (_) {}

  try {
    const queue = await queueHealth.checkQueueHealth({ owner });
    if (queue.status !== 'HEALTHY') {
      sections.push({
        title: 'Resolution Queue Health',
        body: `Status: ${queue.status}. Open flags: ${queue.openFlagsCount}.${queue.rushedSuspected ? ' Rushed resolution pattern detected.' : ''}`,
      });
    }
  } catch (_) {}

  try {
    const dormant = await dormantMode.getDormantState(owner);
    if (dormant.continuity_state !== 'ACTIVE') {
      sections.push({
        title: 'Continuity State',
        body: `Current state: ${dormant.continuity_state}. Last activity: ${dormant.last_owner_activity_at || 'unknown'}.`,
      });
    }
  } catch (_) {}

  try {
    const pending = await delegateLedger.getPendingDelegateDecisions(owner);
    if (pending.length > 0) {
      sections.push({
        title: 'Delegate Decisions Pending Ratification',
        body: `${pending.length} provisional delegate decision(s) awaiting your ratification.`,
      });
    }
  } catch (_) {}

  return sections;
}

module.exports = {
  ...cadenceMirror,
  ...queueHealth,
  ...governanceVersion,
  ...retroScan,
  ...delegateLedger,
  ...dormantMode,
  ...consequenceVisibility,
  ...events,
  runAllChecks,
  buildDailyEmailSections,
};
