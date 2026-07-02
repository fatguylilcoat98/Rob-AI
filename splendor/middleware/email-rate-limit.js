/*
  Splendor — The Remarkable AI
  Three-layer rate limiter for user-triggered emails.

  Cooldown (per-user): 1 email per 30 seconds
  Hourly  (per-user): 10 emails per UTC hour
  Daily   (per-user): 50 emails per UTC day

  Counters live in-memory — single-user product, restart resets are OK.

  Two-phase commit pattern: callers `check` first, then call `commit()`
  only after a successful send so a downstream failure doesn't burn a
  quota slot.
*/

const COOLDOWN_MS = 30 * 1000;
const HOURLY_LIMIT = 10;
const DAILY_LIMIT = 50;

// userId -> { lastSendAt, hourBucket, hourCount, dayBucket, dayCount }
const state = new Map();

function utcHourBucket(now) {
  return Math.floor(now / (60 * 60 * 1000));
}
function utcDayBucket(now) {
  return Math.floor(now / (24 * 60 * 60 * 1000));
}

function check(userId, now = Date.now()) {
  const entry = state.get(userId) || {
    lastSendAt: 0,
    hourBucket: utcHourBucket(now),
    hourCount: 0,
    dayBucket: utcDayBucket(now),
    dayCount: 0,
  };
  // Roll buckets on UTC boundary
  const hb = utcHourBucket(now);
  const db = utcDayBucket(now);
  if (entry.hourBucket !== hb) { entry.hourBucket = hb; entry.hourCount = 0; }
  if (entry.dayBucket  !== db) { entry.dayBucket  = db; entry.dayCount  = 0; }

  if (entry.lastSendAt && (now - entry.lastSendAt) < COOLDOWN_MS) {
    return {
      allowed: false,
      limit: 'cooldown',
      retry_after_seconds: Math.ceil((COOLDOWN_MS - (now - entry.lastSendAt)) / 1000),
    };
  }
  if (entry.hourCount >= HOURLY_LIMIT) {
    const hourEnd = (hb + 1) * 60 * 60 * 1000;
    return {
      allowed: false,
      limit: 'hourly',
      retry_after_seconds: Math.max(1, Math.ceil((hourEnd - now) / 1000)),
    };
  }
  if (entry.dayCount >= DAILY_LIMIT) {
    const dayEnd = (db + 1) * 24 * 60 * 60 * 1000;
    return {
      allowed: false,
      limit: 'daily',
      retry_after_seconds: Math.max(1, Math.ceil((dayEnd - now) / 1000)),
    };
  }
  return { allowed: true, entry };
}

function record(userId, entry, now = Date.now()) {
  entry.lastSendAt = now;
  entry.hourCount += 1;
  entry.dayCount  += 1;
  state.set(userId, entry);
}

// Programmatic helper for non-Express callers (enhanced-chat, etc).
// Returns { allowed, commit() } on pass, or
// { allowed: false, limit, retry_after_seconds } on deny.
function checkAndCommit(userId) {
  const result = check(userId);
  if (!result.allowed) {
    return {
      allowed: false,
      limit: result.limit,
      retry_after_seconds: result.retry_after_seconds,
    };
  }
  return { allowed: true, commit: () => record(userId, result.entry) };
}

// Express middleware
function emailRateLimit(req, res, next) {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  const r = checkAndCommit(userId);
  if (!r.allowed) {
    return res.status(429).json({
      error: 'rate_limit',
      limit: r.limit,
      retry_after_seconds: r.retry_after_seconds,
    });
  }
  res.locals.commitEmailSend = r.commit;
  next();
}

module.exports = {
  emailRateLimit,
  checkAndCommit,
  COOLDOWN_MS,
  HOURLY_LIMIT,
  DAILY_LIMIT,
};
