#!/usr/bin/env node
'use strict';
/*
  CLASPION reachability + fail-mode probe.

  Run inside the deployed environment (Render shell / one-off job) to answer:
    - Is CLASPION enabled, and is CLASPION_URL set?
    - What is the effective CLASPION_FAIL_MODE and timeout?
    - Is the upstream actually reachable right now, and how is a failure
      classified (timeout / network / http_5xx / malformed)?

  It sends ONE benign validation (intent.type = 'health_probe') and prints the
  classified outcome. It writes a governance_verdicts row like any other call,
  so the probe itself is auditable. NO secrets are printed.

  Usage:  node scripts/claspion-probe.js
*/

require('dotenv').config();
const { governance } = require('../lib/claspion-governance');

(async () => {
  const state = governance.getState();
  // getState() already redacts: it reports has_api_key (bool), not the key.
  console.log('[claspion-probe] config:', JSON.stringify({
    enabled: state.enabled,
    enabled_flag: state.enabled_flag,
    has_url: state.has_url,
    has_api_key: state.has_api_key,
    fail_mode: state.fail_mode,
    timeout_ms: state.timeout_ms,
    actor_id: state.actor_id,
  }));

  if (!state.enabled) {
    console.log('[claspion-probe] CLASPION is DORMANT (disabled or no URL). No upstream call made.');
    process.exit(0);
  }

  const t0 = Date.now();
  const v = await governance.validate({
    thought: { content: 'reachability probe' },
    intent: { type: 'health_probe', target: 'self', domain: 'diagnostics' },
  });
  const ms = Date.now() - t0;

  console.log('[claspion-probe] verdict:', JSON.stringify({
    decision: v.decision,
    allow: v.allow,
    outcome: v.outcome,
    outcome_cause: v.outcome_cause,
    basis_state: v.basis_state,
    conscience_name: v.conscience_name,
    http_status: v.http_status || null,
    error_code: v.error_code || null,
    latency_ms: v.latency_ms,
    verdict_id: v.verdict_id,
  }));

  if (v.outcome === 'allow' || v.outcome === 'block') {
    console.log(`[claspion-probe] ✅ upstream REACHABLE (real verdict in ${ms}ms).`);
    process.exit(0);
  }
  console.log(`[claspion-probe] ❌ upstream NOT giving a real verdict: outcome=${v.outcome} cause=${v.outcome_cause}.` +
    ` This is the same failure mode that fails ${state.fail_mode === 'allow' ? 'OPEN' : 'CLOSED'} on live turns.`);
  process.exit(2);
})().catch((e) => {
  console.error('[claspion-probe] unexpected error:', e && e.message ? e.message : e);
  process.exit(1);
});
