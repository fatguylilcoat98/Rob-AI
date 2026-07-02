'use strict';

/*
  Governed Autonomy Layer — Autonomy Scheduler

  Runs autonomy inspection cycles on a configurable interval and at 7 AM daily.
  Each cycle: builds a self_state_report → feeds to proposal engine → stores results.

  Env vars:
    AUTONOMY_ENABLED=true         — master switch (default: false, layer is dormant)
    AUTONOMY_INTERVAL_HOURS=6     — hours between interval cycles (default: 6)
    SPLENDOR_OWNER_USER_ID        — Supabase user ID for the owner
*/

const { buildSelfStateReport } = require('../lib/self-inspection');
const { generateProposals } = require('../lib/autonomy-proposal-engine');

const INTERVAL_HOURS = Math.max(1, parseFloat(process.env.AUTONOMY_INTERVAL_HOURS || '6'));
const INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1000;

let _intervalTimer = null;
let _running = false;

function getOwnerUserId() {
  return process.env.SPLENDOR_OWNER_USER_ID || null;
}

function msUntil7AM() {
  const now = new Date();
  const next7 = new Date(now);
  next7.setHours(7, 0, 0, 0);
  if (next7 <= now) next7.setDate(next7.getDate() + 1);
  return next7.getTime() - now.getTime();
}

async function runCycle(label = 'scheduled') {
  if (_running) {
    console.log(`[autonomy-scheduler] Skipping ${label} cycle — previous cycle still running`);
    return;
  }

  const userId = getOwnerUserId();
  if (!userId) {
    console.warn('[autonomy-scheduler] SPLENDOR_OWNER_USER_ID not set — skipping cycle');
    return;
  }

  _running = true;
  console.log(`[autonomy-scheduler] Starting ${label} cycle for user ${userId}`);
  try {
    const report = await buildSelfStateReport(userId);
    console.log(`[autonomy-scheduler] Report built — conversations:${report.recent_conversations.count} memories:${report.recent_memories.count}`);

    const proposals = await generateProposals(report, userId);
    console.log(`[autonomy-scheduler] ${label} cycle complete — ${proposals.length} proposal(s) generated`);
  } catch (err) {
    console.error('[autonomy-scheduler] Cycle error:', err.message);
  } finally {
    _running = false;
  }
}

function schedule7AM() {
  const ms = msUntil7AM();
  console.log(`[autonomy-scheduler] Next 7 AM cycle in ${Math.round(ms / 60000)} minutes`);
  setTimeout(async () => {
    await runCycle('7am');
    schedule7AM();
  }, ms);
}

function start() {
  if (process.env.AUTONOMY_ENABLED !== 'true') {
    console.log('[autonomy-scheduler] AUTONOMY_ENABLED != true — governed autonomy layer dormant');
    return;
  }

  console.log(`[autonomy-scheduler] Starting governed autonomy layer (interval: ${INTERVAL_HOURS}h + 7 AM daily)`);

  _intervalTimer = setInterval(() => runCycle('interval'), INTERVAL_MS);
  schedule7AM();
}

function stop() {
  if (_intervalTimer) { clearInterval(_intervalTimer); _intervalTimer = null; }
}

module.exports = { start, stop, runCycle };
