/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// LAYER 1 — Working Memory / Session Lifecycle
// In-process Map keyed by userId holding the active conversation.
// 20-turn cap (oldest dropped), 30-minute inactivity triggers an
// episodic save via the registered onIdle callback.
//
// This is in-memory only — restarting the server clears active sessions.
// That's fine: anything important has already been committed to episodes
// (Layer 2), semantic memory (Layer 3), or compressed summaries (Layer 4).

const MAX_TURNS = 20;
const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

const sessions = new Map();
let sweeperHandle = null;
let onIdleCallback = null;

function now() {
  return Date.now();
}

function getOrCreate(userId) {
  let s = sessions.get(userId);
  if (!s) {
    s = {
      userId,
      sessionStartTime: now(),
      lastActivity: now(),
      history: []
    };
    sessions.set(userId, s);
  }
  return s;
}

function appendTurn(userId, role, content) {
  if (!userId || !role) return;
  const s = getOrCreate(userId);
  s.history.push({ role, content });
  if (s.history.length > MAX_TURNS) {
    s.history.splice(0, s.history.length - MAX_TURNS);
  }
  s.lastActivity = now();
}

function markActivity(userId) {
  const s = sessions.get(userId);
  if (s) s.lastActivity = now();
}

function getHistory(userId) {
  const s = sessions.get(userId);
  return s ? s.history.slice() : [];
}

function getSession(userId) {
  return sessions.get(userId) || null;
}

function endSession(userId) {
  const s = sessions.get(userId);
  if (!s) return null;
  sessions.delete(userId);
  return s;
}

// Register a callback to fire when a session goes idle.
// Signature: async function onIdle(userId, history, session)
function registerOnIdle(cb) {
  onIdleCallback = cb;
}

async function sweep() {
  const cutoff = now() - IDLE_MS;
  const idleUsers = [];
  for (const [userId, s] of sessions.entries()) {
    if (s.lastActivity < cutoff) idleUsers.push(userId);
  }
  for (const userId of idleUsers) {
    const s = sessions.get(userId);
    if (!s) continue;
    sessions.delete(userId);
    if (onIdleCallback) {
      try {
        await onIdleCallback(userId, s.history, s);
      } catch (err) {
        console.error('session onIdle callback error:', err.message);
      }
    }
  }
}

function startSweeper() {
  if (sweeperHandle) return;
  sweeperHandle = setInterval(() => {
    sweep().catch((err) =>
      console.error('session sweep error:', err.message)
    );
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive solely for the sweeper.
  if (sweeperHandle.unref) sweeperHandle.unref();
}

function stopSweeper() {
  if (sweeperHandle) {
    clearInterval(sweeperHandle);
    sweeperHandle = null;
  }
}

module.exports = {
  appendTurn,
  markActivity,
  getHistory,
  getSession,
  endSession,
  registerOnIdle,
  startSweeper,
  stopSweeper,
  // exposed for tests
  _sessions: sessions,
  MAX_TURNS,
  IDLE_MS
};
