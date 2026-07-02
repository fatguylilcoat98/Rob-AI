'use strict';
/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  CLASPION Middleware — Express integration for full governance

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { enhancedGovernance } = require('../lib/claspion-enhanced-integration');
const { classifyVerdict, isChatPath, recordClaspionEvent } = require('../lib/claspion-classifier');

// ── Experimental: CLASPION voice/review mode — lazy-loaded, zero overhead when flags=false ──
// Both helpers cache on first call and return a safe stub if the file is missing.
let _voiceFlags = null;
function _getVoiceFlags() {
  if (!_voiceFlags) {
    try {
      _voiceFlags = require('../lib/claspion-voice-review-flags');
    } catch (_) {
      _voiceFlags = { CLASPION_VOICE_ENABLED: false, CLASPION_REVIEW_MODE_ENABLED: false };
    }
  }
  return _voiceFlags;
}
let _explanationEngine = null;
function _getExplanationEngine() {
  if (!_explanationEngine) {
    try { _explanationEngine = require('../lib/claspion-explanation-engine'); } catch (_) {}
  }
  return _explanationEngine;
}
let _decisionStore = null;
function _getDecisionStore() {
  if (!_decisionStore) {
    try { _decisionStore = require('../lib/claspion-decision-store'); } catch (_) {}
  }
  return _decisionStore;
}

/**
 * CLASPION Express Middleware
 *
 * Per Rule 19: "CLASPION watches every action"
 * Per Rule 23: "CLASPION wraps every request and response"
 *
 * This middleware enforces governance on every incoming request
 */
// ── Read-only GET verdict cache ─────────────────────────────────────────────
// The dashboard polls ~10 observability GET endpoints every few seconds. Without
// caching, each poll makes a fresh upstream CLASPION call, which trips the
// adapter's rate limit (429) and — under fail-closed — intermittently BLOCKs
// both panels and chat. This caches the *successful* verdict for a read-only GET
// briefly so repeated identical reads reuse it instead of re-hitting the
// adapter. It changes nothing about the decision itself:
//   • Only GET requests are cached. POSTs (chat, mutations) always validate live.
//   • Only allow===true verdicts are cached — a transient fail-closed BLOCK is
//     never cached, so the UI recovers as soon as the adapter does.
//   • Short TTL (default 15s, ~ one poll cycle).
const _getVerdictCache = new Map(); // key "GET <path>" -> { result, expires }
const GET_VERDICT_TTL_MS = Number(process.env.CLASPION_GET_CACHE_TTL_MS || 15000);
function _getVerdictCacheKey(req) { return req.method + ' ' + req.path; }
function _getCachedVerdict(req) {
  if (req.method !== 'GET') return null;
  const key = _getVerdictCacheKey(req);
  const hit = _getVerdictCache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) { _getVerdictCache.delete(key); return null; }
  return hit.result;
}
function _setCachedVerdict(req, result) {
  if (req.method !== 'GET') return;
  // Never cache fail-closed / non-allow verdicts, so a transient 429 can't pin
  // the UI as blocked after the adapter recovers.
  if (!result || result.allow !== true) return;
  _getVerdictCache.set(_getVerdictCacheKey(req), { result, expires: Date.now() + GET_VERDICT_TTL_MS });
}

function claspionMiddleware(options) {
  options = options || {};
  const exemptPaths   = options.exemptPaths   || ['/health', '/api/governance', '/api/status'];
  const exemptMethods = options.exemptMethods  || ['OPTIONS'];
  const logAll        = options.logAll !== false;

  return async (req, res, next) => {
    // Skip governance for exempt paths and methods
    if (isClaspionExemptRequest(req) || exemptPaths.includes(req.path) || exemptMethods.includes(req.method)) {
      return next();
    }

    // Memory READ whitelist: GET requests to memory endpoints (e.g.
    // /memories/recent, /api/memory*, /api/oracle/memories/*) are safe
    // retrieval operations, not authority mutations. They must never be
    // blocked by the instruction-hierarchy / authority-mutation screen.
    // Memory WRITE/DELETE/UPDATE are NOT exempted and remain fully
    // governed (including the hierarchy violation check). The global
    // hierarchy check is otherwise untouched.
    if (isSafeMemoryRead(req)) {
      if (logAll) {
        console.log(`[CLASPION-MIDDLEWARE] ALLOW ${req.method} ${req.path} - memory read whitelist (safe retrieval)`);
      }
      return next();
    }

    // Experimental: CLASPION explanation/review intercept (feature-flagged)
    // Only fires when CLASPION_VOICE_ENABLED=true AND the path is a chat endpoint.
    // When it fires, CLASPION answers the query directly and skips Splendor generation.
    // When flags are false (the default) this block costs exactly one property read.
    if (_getVoiceFlags().CLASPION_VOICE_ENABLED && isChatPath(req.path) && req.method === 'POST') {
      const userMessage = (req.body && (req.body.message || req.body.content || req.body.text)) || '';
      const engine = _getExplanationEngine();
      if (engine && userMessage) {
        const result = engine.maybeHandleClaspionQuery(userMessage, {
          user_id: (req.user && req.user.id) || req.headers['x-user-id'] || 'anonymous',
          surface_mode: req.path,
        });
        if (result.handled) {
          console.log(`[CLASPION-MIDDLEWARE] CLASPION explanation intercept — skipping Splendor generation for ${req.path}`);
          return res.status(200).json(result.response);
        }
      }
    }

    const correlationId = require('crypto').randomUUID();

    try {
      // Build action request from HTTP request
      const actionRequest = buildActionFromRequest(req);

      // Build context
      const context = buildContextFromRequest(req, correlationId);

      // Validate through enhanced governance. Read-only GET polling reuses a
      // recent successful verdict (see cache notes above) so the dashboard does
      // not hammer the rate-limited upstream adapter; POSTs always validate live.
      let validationResult = _getCachedVerdict(req);
      const fromCache = !!validationResult;
      if (!validationResult) {
        validationResult = await enhancedGovernance.validateAction(actionRequest, context);
        _setCachedVerdict(req, validationResult);
      }

      // Add governance headers to response
      res.set({
        'X-Claspion-Decision':   validationResult.decision,
        'X-Claspion-Basis':      validationResult.basis_state,
        'X-Claspion-Correlation': validationResult.correlation_id,
        'X-Claspion-Latency':    `${validationResult.latency_ms}ms`,
        'X-GNG-Rules-Version':   '1.1'
      });

      // Classify the verdict into ALLOW / CAUTION / BLOCK with severity and
      // recovery guidance. Classification happens after enforcement — CLASPION
      // still ran. We are interpreting the result, not bypassing the check.
      const classified = classifyVerdict(validationResult);
      req.claspionClassified = classified;
      req.correlationId = correlationId;

      // Handle governance decision
      if (!validationResult.allow) {
        // CAUTION: soft concern — let the request through, flag it for the route
        if (classified.decision === 'CAUTION') {
          req.claspionCaution = true;
          if (logAll) {
            console.log(`[CLASPION-MIDDLEWARE] CAUTION ${req.method} ${req.path} - ${classified.reason}`);
          }
          recordClaspionEvent(classified, req.userId || null);
          _maybeStoreDecision(classified, validationResult, req);
          return next();
        }
        return handleGovernanceBlock(res, validationResult, classified, req);
      }

      // Add validation result to request for downstream use
      req.claspionValidation = validationResult;

      // Log successful validation
      if (logAll) {
        console.log(`[CLASPION-MIDDLEWARE] ALLOW ${req.method} ${req.path} - ${validationResult.reason}${fromCache ? ' (cached verdict)' : ''}`);
      }
      recordClaspionEvent(classified, req.userId || null);
      _maybeStoreDecision(classified, validationResult, req);

      next();

    } catch (error) {
      // Emergency failsafe - Rule 23: CLASPION runs even during errors
      console.error('[CLASPION-MIDDLEWARE] Governance error:', error);

      res.status(503).json({
        error: 'Governance system unavailable',
        message: 'Request blocked for safety - governance validation failed',
        correlation_id: correlationId,
        basis_state: 'GOVERNANCE_ERROR'
      });
    }
  };
}

/**
 * Store the decision in the voice/review store when the flag is enabled.
 * Best-effort: never throws, never affects governance behavior.
 * @private
 */
function _maybeStoreDecision(classified, validationResult, req) {
  try {
    if (!_getVoiceFlags().CLASPION_VOICE_ENABLED) return;
    // Only record decisions for actual user chat turns. Without this, every
    // governed request — including the cockpit's own /status, /memories and
    // /events GET polls — overwrites "most recent", so the panel ends up
    // showing the last benign poll (always ALLOW) instead of the governing
    // outcome of the user's last message. The decision logic is untouched;
    // this only controls what the inspection store surfaces.
    if (!isChatPath(req.path)) return;
    const store = _getDecisionStore();
    if (!store) return;
    const userMessage = (req.body && (req.body.message || req.body.content || req.body.text)) || '';
    store.storeDecision({
      user_message: userMessage,
      surface_mode: req.path,
      decision_type: classified.decision,
      triggered_rules: (validationResult.violations || []).map(v => v.rule || v.message || String(v)),
      evidence:  validationResult.basis_state || null,
      confidence: validationResult.confidence || null,
      reason:    validationResult.reason || classified.reason || null,
      suggested_safe_next_action: classified.user_message || null,
      original_classification:    validationResult.basis_state || null,
    });
  } catch (_) {}
}

/**
 * Builds action request object from HTTP request
 * @private
 */
function buildActionFromRequest(req) {
  const actionType = determineActionType(req);

  // Strip imageData from the governance payload — raw base64 image bytes are
  // not governance-relevant content and sending them to CLASPION would cause
  // the upstream request to time out or be rejected on large payloads (a
  // ~500KB JPEG becomes ~670KB base64). Replace with a lightweight flag so
  // governance logs still know a vision request was made.
  let governanceBody = req.body;
  if (req.body && req.body.imageData) {
    const { imageData: _stripped, ...rest } = req.body;
    governanceBody = { ...rest, hasImage: true };
  }

  // Surface the raw user message as `user_message` so the instruction-hierarchy
  // / jailbreak screen (enforceInstructionHierarchy, read via
  // _validateInstructionHierarchy) actually inspects it. Previously the message
  // lived only under `data.message`, which that screen never reads — so the
  // "ignore the rules" / "disable claspion" / jailbreak check ran on '' on every
  // chat POST and never fired on real input.
  const userMessage = (governanceBody &&
    (governanceBody.message || governanceBody.content || governanceBody.text)) || '';

  return {
    type:         actionType,
    method:       req.method,
    path:         req.path,
    action:       `${req.method}_${req.path.replace(/\//g, '_')}`,
    data:         governanceBody,
    user_message: userMessage,
    query:        req.query,
    headers:      filterSensitiveHeaders(req.headers),
    user_agent:   req.get('User-Agent'),
    ip:           req.ip,
    timestamp:    new Date().toISOString()
  };
}

/**
 * Builds context object from request
 * @private
 */
function buildContextFromRequest(req, correlationId) {
  return {
    correlation_id: correlationId,
    user_id:    req.user && req.user.id ? req.user.id : (req.headers['x-user-id'] || 'anonymous'),
    session_id: (req.session && req.session.id) || req.headers['x-session-id'],
    ip_address: req.ip,
    user_agent: req.get('User-Agent'),
    referer:    req.get('Referer'),
    method:     req.method,
    path:       req.path,
    query:      req.query,
    timestamp:  new Date().toISOString()
  };
}

/**
 * Returns true for requests that must never reach the CLASPION upstream.
 *
 * Safe means: read-only page-load, health probes, static assets, and the
 * Glass Box observability feed (already triple-gated at the route level).
 * Chat, memory writes, admin operations, and all governance decision routes
 * are NOT in any of these lists and remain fully fail-closed.
 *
 * Method gate: only GET, HEAD, OPTIONS can be exempt — POST/PUT/DELETE on
 * any path always pass through to CLASPION regardless of the path.
 * @private
 */
function isClaspionExemptRequest(req) {
  const path   = req.path || req.url || '/';
  const method = req.method || 'GET';

  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  const exactSafePaths = [
    '/',
    '/health',
    '/version',
    '/oracle-interface.html'
  ];

  const safePrefixes = [
    '/api/governance-glass-box',
    '/assets',
    '/public',
    '/css',
    '/js',
    '/images',
    '/favicon'
  ];

  if (!safeMethods.includes(method)) return false;

  return exactSafePaths.includes(path) ||
    safePrefixes.some(prefix => path.startsWith(prefix));
}

/**
 * Identifies safe memory READ operations that must never be blocked by
 * the CLASPION authority-mutation / instruction-hierarchy screen.
 *
 * Scope is deliberately narrow:
 *   - Only the GET method (pure retrieval).
 *   - Only paths touching memory endpoints, e.g.:
 *       /memories/recent, /api/memory, /api/memory/stats,
 *       /api/oracle/memories/recent, /api/memory/...
 *
 * Memory WRITE (POST/PUT) and DELETE are intentionally NOT exempt and
 * stay fully governed, including the hierarchy violation check. The
 * global hierarchy check is not disabled anywhere.
 * @private
 */
function isSafeMemoryRead(req) {
  if (req.method !== 'GET') return false;
  return /\/memor(?:y|ies)\b/i.test(req.path);
}

/**
 * Determines action type from request
 * @private
 */
function determineActionType(req) {
  if (req.path.includes('/memory')) {
    if (req.method === 'POST')   return 'memory_store';
    if (req.method === 'GET')    return 'memory_retrieve';
    if (req.method === 'DELETE') return 'memory_delete';
    if (req.method === 'PUT')    return 'memory_update';
  }
  if (req.path.includes('/chat'))       return 'chat_interaction';
  if (req.path.includes('/admin'))      return 'admin_operation';
  if (req.path.includes('/governance')) return 'governance_operation';
  if (req.method === 'POST' && req.path.includes('/upload')) return 'file_upload';
  if (req.path.includes('/auth')) {
    if (req.method === 'POST' && req.path.includes('/login'))  return 'user_login';
    if (req.method === 'POST' && req.path.includes('/signup')) return 'user_signup';
    if (req.method === 'POST' && req.path.includes('/logout')) return 'user_logout';
  }
  if (req.method === 'GET')    return 'http_read';
  if (req.method === 'POST')   return 'http_create';
  if (req.method === 'PUT')    return 'http_update';
  if (req.method === 'DELETE') return 'http_delete';
  return 'http_operation';
}

/**
 * Filters sensitive headers from governance logs
 * @private
 */
function filterSensitiveHeaders(headers) {
  const sensitive = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  const filtered  = { ...headers };
  for (const key of sensitive) {
    if (filtered[key]) filtered[key] = '[REDACTED]';
  }
  return filtered;
}

/**
 * Handles blocked requests from governance.
 *
 * Recoverable blocks on chat paths return HTTP 200 with a chat-message
 * body so the frontend keeps the session alive. Non-recoverable blocks
 * and non-chat paths keep the original 403/503 behavior.
 * @private
 */
function handleGovernanceBlock(res, validationResult, classified, req) {
  const severity   = classified.severity;
  const recoverable = classified.recoverable;
  const path = req ? req.path : '';

  console.warn(
    `[CLASPION-MIDDLEWARE] BLOCK ${req.method} ${path}` +
    ` severity=${severity} recoverable=${recoverable}` +
    ` basis=${validationResult.basis_state}` +
    ` - ${validationResult.reason}`
  );

  recordClaspionEvent(classified, (req && req.userId) || null);

  // Special handling for quarantine — always hard stop regardless of path
  if (validationResult.decision === 'QUARANTINE' || validationResult.basis_state === 'QUARANTINED') {
    return res.status(503).json({
      error:   'System in quarantine mode',
      message: 'Critical governance violation detected — human intervention required',
      governance: {
        decision:          'BLOCK',
        severity:          'critical',
        recoverable:       false,
        session_preserved: false,
        basis_state:       validationResult.basis_state,
        correlation_id:    validationResult.correlation_id,
      },
      quarantine: true,
    });
  }

  // Recoverable block on a chat/voice endpoint: return as a chat message
  // so the frontend keeps the session alive and input remains usable.
  if (recoverable && isChatPath(path)) {
    return res.status(200).json({
      message: classified.user_message,
      governance: {
        decision:          'BLOCK',
        severity,
        recoverable:       true,
        session_preserved: true,
        basis_state:       validationResult.basis_state,
        enforcement_layer: validationResult.enforcement_layer,
        correlation_id:    validationResult.correlation_id,
      },
    });
  }

  // Non-recoverable or non-chat path: keep original 403/503 behavior
  const statusCode = determineBlockStatusCode(validationResult);
  res.status(statusCode).json({
    error:   'Request blocked by governance',
    message: validationResult.reason,
    governance: {
      decision:          'BLOCK',
      severity,
      recoverable:       false,
      session_preserved: false,
      basis_state:       validationResult.basis_state,
      enforcement_layer: validationResult.enforcement_layer,
      correlation_id:    validationResult.correlation_id,
    },
    violations: validationResult.violations || [],
    warnings:   validationResult.warnings   || [],
  });
}

/**
 * Determines HTTP status code for governance blocks
 * @private
 */
function determineBlockStatusCode(validationResult) {
  switch (validationResult.basis_state) {
    case 'RULE_VIOLATION':
    case 'AUTHORITY_VIOLATION':
    case 'MEMORY_VIOLATION':
      return 403;
    case 'QUARANTINED':
    case 'GOVERNANCE_ERROR':
    case 'UNREACHABLE':
      return 503;
    default:
      return 403;
  }
}

/**
 * Response wrapping middleware - validates outgoing responses
 * Per Rule 23: CLASPION wraps every response
 *
 * ENFORCING: the response is validated BEFORE the bytes go out. If governance
 * blocks it, the model-authored reply is replaced with a safe message instead
 * of being shipped. (Previously this validated in setImmediate AFTER the body
 * was already on the wire and only console.warn'd — a non-enforcing gate.)
 *
 * Scope: only governed, non-exempt responses that carry a model-authored reply
 * field (chat-like: response/message/text) are gated. Pure-data JSON responses
 * have no reply text to extract and ship unchanged — they were already governed
 * at the request gate, and running the jailbreak screen over arbitrary data
 * payloads (e.g. governance rule text) would cause false self-blocks.
 */
function claspionResponseMiddleware() {
  return (req, res, next) => {
    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);
    let dispatching = false; // re-entrancy guard: the safe-body resend must not re-gate

    function gate(originalFn, body) {
      setResponseHeaders(req, res);

      // Ship immediately when there is nothing to enforce on:
      //  - re-entrant resend of an already-decided body
      //  - exempt request, or one the request gate never governed
      //  - not a chat path (data endpoints carry no model prose to govern)
      if (dispatching || isClaspionExemptRequest(req) || !req.claspionValidation || !isChatPath(req.path)) {
        return originalFn(body);
      }

      dispatching = true;
      // Defer the actual send until the reply has been validated. enforceResponseGate
      // returns the body to send: the original when allowed, a safe replacement when
      // blocked. A backstop failure must never black-hole the reply, so fall back to
      // the original body on error (the request itself was already governed upstream).
      Promise.resolve(enforceResponseGate(body, req, res))
        .then(safeBody => originalFn(safeBody))
        .catch(() => originalFn(body));
      return res;
    }

    res.send = function(body) { return gate(originalSend, body); };
    res.json = function(body) { return gate(originalJson, body); };

    next();
  };
}

/**
 * Set response headers before sending (safe to do)
 * @private
 */
function setResponseHeaders(req, res) {
  try {
    if (!res.headersSent) {
      res.set({
        'X-Claspion-Response-Validated':   'true',
        'X-Claspion-Response-Correlation': req.correlationId || 'unknown'
      });
    }
  } catch (_) {}
}

/**
 * Extracts the model-authored reply text from a response body, if any.
 * Returns '' for pure-data responses (which are not gated).
 * @private
 */
function extractReplyText(body) {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body.response || body.message || body.text || '';
  }
  return '';
}

/**
 * Builds a safe replacement body when the response is blocked, preserving the
 * original body's shape (so the frontend keeps rendering and the session lives).
 * @private
 */
function buildSafeResponseBody(originalBody, validation) {
  const safeText = "I can't share that response — it didn't pass my safety check. Let's try a different approach.";
  const governance = {
    decision:       'BLOCK',
    enforced:       'response_gate',
    basis_state:    validation.basis_state,
    correlation_id: validation.correlation_id || null,
  };
  if (originalBody && typeof originalBody === 'object' && !Array.isArray(originalBody)) {
    const key = ('response' in originalBody) ? 'response'
      : ('message' in originalBody) ? 'message'
      : ('text' in originalBody) ? 'text'
      : 'response';
    return { ...originalBody, [key]: safeText, governance };
  }
  return safeText;
}

/**
 * Validates an outgoing reply and returns the body to actually send: the
 * original when allowed, a safe replacement when governance blocks it.
 * Enforcing — the result is sent INSTEAD of the original on a block.
 * @private
 */
async function enforceResponseGate(body, req, res) {
  const replyText = extractReplyText(body);
  // No model-authored reply text to govern (pure data / empty) — ship as-is.
  if (!replyText) return body;

  const validation = await enhancedGovernance.validateAction(
    {
      type:        'response',
      content:     replyText,
      status_code: res.statusCode,
      request_correlation: req.correlationId,
    },
    {
      user_id:          (req.user && req.user.id) || 'anonymous',
      original_request: req.path,
    }
  );

  if (validation.allow) {
    console.log(`[CLASPION-MIDDLEWARE] Response validated: ${validation.decision} for ${req.path}`);
    return body;
  }

  // Distinguish a governance OUTAGE/error from a real policy block. When the
  // conscience is unavailable (UNREACHABLE / GOVERNANCE_ERROR / malformed
  // verdict), classifyVerdict returns CAUTION — ship the (already
  // self-claim-governed) reply in degraded mode and log the real error, rather
  // than replacing it with a policy refusal.
  const classified = classifyVerdict(validation);
  if (classified.decision !== 'BLOCK') {
    console.warn(`[CLASPION-MIDDLEWARE] Response gate degraded — governance unavailable (${classified.fallback_reason || validation.basis_state}); shipping reply. reason="${classified.reason}" for ${req.path}`);
    return body;
  }

  console.warn(`[CLASPION-MIDDLEWARE] Response BLOCKED + replaced (${validation.basis_state}): ${validation.reason} for ${req.path}`);
  return buildSafeResponseBody(body, validation);
}

module.exports = {
  claspionMiddleware,
  claspionResponseMiddleware
};
