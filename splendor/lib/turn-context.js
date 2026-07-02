'use strict';
/*
  Shared turn-context builder — surface-unification Phase 1.

  Before this module, the identity_state (audit Item 2) and accountability
  (audit Item 1) context blocks were assembled INLINE inside routes/chat.js
  only. The default text path (routes/enhanced-chat.js) and the voice path
  (routes/converse.js) never built them, so Splendor's commitments and
  identity continuity silently vanished off the council path (divergence D2).

  buildTurnContext() centralizes that assembly so every surface draws the
  SAME identity + accountability context. It does NOT touch memory recall
  (that is Phase 3) and it does NOT generate or govern anything — it only
  composes the two bounded, labeled, best-effort context blocks the routes
  already trust.

  Contract (unchanged from the inline chat.js behavior):
    • Each builder is best-effort: a failure degrades to an empty, fully
      shaped result and is logged, never thrown.
    • Returns { accountability: {context, metrics}, identity: {context, metrics} }
      using the exact metric shapes routes/chat.js already feeds to
      emitChatMetrics, so adopting this is behavior-preserving there.

  Run: node --test tests/turn-context.test.js
*/

const { buildAccountabilityContext } = require('./chat-accountability');
const { buildIdentityStateContext } = require('./identity-context');

// Fully-shaped empty results — identical to the inline defaults that
// routes/chat.js declared before calling each builder. Returned as fresh
// objects per call so a caller can never mutate a shared default.
function emptyAccountability() {
  return {
    context: '',
    metrics: { commitments_read: 0, contradiction_checked: 0, contradictions_caught: 0, reflexive_injected: 0 },
  };
}
function emptyIdentity() {
  return {
    context: '',
    metrics: {
      identity_state_loaded: false,
      identity_state_row_id: null,
      identity_state_age_seconds: null,
      identity_state_version: null,
      identity_state_injected: false,
    },
  };
}

/**
 * Build the shared per-turn context (identity + accountability).
 *
 * @param {object} args
 * @param {string} args.userId        - owner user id.
 * @param {string} [args.message]     - the current user message (accountability
 *                                       runs its contradiction loop over it;
 *                                       '' is valid, e.g. a voice session start).
 * @param {string} [args.logTag]      - prefix for the two diagnostic log lines
 *                                       so each surface keeps its existing
 *                                       "[CHAT]/[STREAM]/…" log format.
 * @param {object} [args.deps]        - injectable builders for testing.
 * @returns {Promise<{accountability:{context,metrics}, identity:{context,metrics}}>}
 */
async function buildTurnContext({ userId, message = '', logTag = 'TURN', deps = {} } = {}) {
  const acctBuilder = deps.buildAccountabilityContext || buildAccountabilityContext;
  const identityBuilder = deps.buildIdentityStateContext || buildIdentityStateContext;

  // Accountability (audit Item 1): binding commitments + contradiction /
  // supersession loop over the user message. Best-effort.
  let accountability = emptyAccountability();
  try {
    accountability = await acctBuilder(userId, message);
    console.log(`[${logTag}][accountability] ${JSON.stringify(accountability.metrics)}`);
  } catch (e) {
    console.error(`[${logTag}][accountability] failed (continuing without):`, e && e.message);
  }

  // Identity-state continuity (audit Item 2): bounded, labeled,
  // mythology-filtered render of the persisted identity_states row. Best-effort.
  let identity = emptyIdentity();
  try {
    identity = await identityBuilder(userId);
    console.log(`[${logTag}][identity] ${JSON.stringify(identity.metrics)}`);
  } catch (e) {
    console.error(`[${logTag}][identity] failed (continuing without):`, e && e.message);
  }

  return { accountability, identity };
}

module.exports = { buildTurnContext, emptyAccountability, emptyIdentity };
