/**
 * AUTHENTICATION MIDDLEWARE
 * Simple authentication for memory system
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Simple API key authentication
 */
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }

  next();
}

/**
 * Admin authentication (stricter)
 */
function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'] || req.query.admin_key;

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }

  next();
}

/**
 * Supabase JWT authentication (when users exist)
 */
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'No token provided'
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'Invalid token'
      });
    }

    req.user = user;
    req.userId = user.id;
    next();

  } catch (error) {
    res.status(401).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
}

/**
 * Owner-only access (requires requireAuth to run first).
 * Guest access is controlled by the GUEST_EMAIL env var in Render —
 * set it to allow that email through, remove it to revoke instantly.
 */
function requireOwner(req, res, next) {
  const OWNER_EMAIL = process.env.SPLENDOR_OWNER_EMAIL;

  if (!OWNER_EMAIL) {
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Owner email not configured'
    });
  }

  const userEmail = req.user && req.user.email;
  const GUEST_EMAIL = process.env.GUEST_EMAIL;
  const isOwner = userEmail === OWNER_EMAIL;
  const isGuest = !!(GUEST_EMAIL && userEmail === GUEST_EMAIL);

  if (!isOwner && !isGuest) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'This system is restricted to the owner only'
    });
  }

  req.isOwner = isOwner;
  req.isGuest = isGuest;
  next();
}

/**
 * Returns the set of trusted emails from the TRUSTED_EMAILS env var.
 * Comma-separated list; values are lowercased for case-insensitive matching.
 * @private
 */
function getTrustedEmails() {
  const raw = process.env.TRUSTED_EMAILS || '';
  return new Set(raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
}

/**
 * Owner + guest + trusted user access (requires requireAuth to run first).
 *
 * Trusted users are listed in the TRUSTED_EMAILS env var (comma-separated).
 * They get the full Splendor experience (tools enabled, their own memory) but
 * do NOT have access to governance, audit, or self-modification routes — those
 * still require requireOwner.
 *
 * To grant access: add the email to TRUSTED_EMAILS in Render.
 * To revoke access: remove the email from TRUSTED_EMAILS.
 */
function requireOwnerOrTrusted(req, res, next) {
  const OWNER_EMAIL = process.env.SPLENDOR_OWNER_EMAIL;

  if (!OWNER_EMAIL) {
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Owner email not configured'
    });
  }

  const userEmail = req.user && req.user.email;
  const GUEST_EMAIL = process.env.GUEST_EMAIL;
  const isOwner = userEmail === OWNER_EMAIL;
  const isGuest = !!(GUEST_EMAIL && userEmail === GUEST_EMAIL);
  const trustedEmails = getTrustedEmails();
  const isTrustedUser = !isOwner && !isGuest && !!(userEmail && trustedEmails.has(userEmail.toLowerCase()));

  if (!isOwner && !isGuest && !isTrustedUser) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'This system is restricted to authorized users only'
    });
  }

  req.isOwner = isOwner;
  req.isGuest = isGuest;
  req.isTrustedUser = isTrustedUser;
  next();
}

/**
 * Create or get user (for development)
 * DEPRECATED: Use requireAuth instead for production security
 */
async function getOrCreateUser(req, res, next) {
  try {
    let userId = req.userId || req.body.userId || req.query.userId;

    if (!userId) {
      // No default user creation in hardened mode
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User ID must be provided or use proper authentication'
      });
    }

    req.userId = userId;
    next();

  } catch (error) {
    res.status(401).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
}

/**
 * Rate limiting middleware
 */
const rateLimits = new Map();

function rateLimit(maxRequests = 100, windowMs = 60000) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const window = rateLimits.get(key) || { count: 0, start: now };

    // Reset window if expired
    if (now - window.start > windowMs) {
      window.count = 0;
      window.start = now;
    }

    window.count++;
    rateLimits.set(key, window);

    if (window.count > maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Max ${maxRequests} per minute.`
      });
    }

    next();
  };
}

/**
 * Request logging
 */
function logRequests(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
    );
  });

  next();
}

module.exports = {
  requireApiKey,
  requireAdmin,
  requireAuth,
  requireOwner,
  requireOwnerOrTrusted,
  getOrCreateUser,
  rateLimit,
  logRequests
};