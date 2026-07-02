/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  CLASPION Governance Client — bolt-on middleware for thought→action

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/*
  This module is the *only* seam between Splendor and CLASPION.

  Design rules (do not break these):
    1. Splendor's reasoning, memory, and personality NEVER pass through
       this module — only the action she is about to take. Thought stays
       inside Splendor; the action gets validated.
    2. A single env flag (CLASPION_ENABLED) switches the whole layer off.
       When off, the client returns an immediate dormant ALLOW verdict
       and never touches the network. Splendor runs clean.
    3. Every call is logged locally in addition to being logged
       server-side. If Splendor logs are the only ones available, an
       operator can still reconstruct what happened.
    4. Network failures are routed through CLASPION_FAIL_MODE. Default
       is fail-closed (block on network failure) because that is the
       safe default for a governance layer.
    5. The conscience is swapped on the CLASPION side. This client never
       embeds policy of its own.
*/

const crypto = require('crypto');
const { activityBus } = require('./activity-bus');

const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_FAIL_MODE = 'block';   // 'block' | 'allow'

function readBool(envValue, fallback = false) {
  if (envValue === undefined || envValue === null) return fallback;
  const v = String(envValue).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function nowIso() {
  return new Date().toISOString();
}

class ClaspionGovernance {
  constructor(opts = {}) {
    // Boot-time defaults from env. These never change.
    this._envUrl = (opts.url || process.env.CLASPION_URL || '').replace(/\/+$/, '');

    // If CLASPION_URL is set, default CLASPION_ENABLED to true. Setting
    // a URL without enabling is the most common config mistake — and
    // there is nothing to do with a URL except call it. The operator
    // can still explicitly disable by setting CLASPION_ENABLED=false.
    const enabledDefault = !!this._envUrl;
    this._envEnabled = opts.enabled !== undefined
      ? !!opts.enabled
      : readBool(process.env.CLASPION_ENABLED, enabledDefault);

    // Runtime overrides — what the UI / admin endpoint set. null = use env.
    this._runtimeEnabled = null;
    this._runtimeUrl = null;

    // Last-call telemetry — surfaces in /api/governance/state so the
    // toggle UI can show "CLASPION rejecting calls: 401" the moment it
    // happens, instead of leaving the user to guess.
    this._lastCall = null; // { at, ok, status, error_code, error_message, latency_ms, decision }

    this.apiKey = opts.apiKey || process.env.CLASPION_API_KEY || '';
    this.timeoutMs = Number(opts.timeoutMs || process.env.CLASPION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    this.failMode = (opts.failMode || process.env.CLASPION_FAIL_MODE || DEFAULT_FAIL_MODE).toLowerCase();
    this.actorId = opts.actorId || process.env.CLASPION_ACTOR_ID || 'splendor';
    this.surface = opts.surface || 'splendor';
    this.logger = opts.logger || console;

    // Dependency injection seams (default to real implementations). These
    // let tests drive the transport and the persistence layer without a
    // network or a database, and change nothing in production.
    this._fetch = opts.fetchImpl || ((...a) => fetch(...a));
    this._persist = opts.persist || null; // null → default best-effort Supabase writer
  }

  // ── Toggle state ───────────────────────────────────────────────────

  // Effective values (runtime override beats env).
  get enabled() {
    return this._runtimeEnabled !== null ? this._runtimeEnabled : this._envEnabled;
  }
  set enabled(v) { this._runtimeEnabled = !!v; }

  get url() {
    return this._runtimeUrl !== null ? this._runtimeUrl : this._envUrl;
  }
  set url(v) { this._runtimeUrl = (v || '').replace(/\/+$/, ''); }

  isEnabled() {
    return this.enabled && !!this.url;
  }

  /** Toggle in-process. Returns the new effective state. */
  setEnabled(v) {
    this._runtimeEnabled = !!v;
    return this.getState();
  }

  /** Set the upstream URL in-process. Pass null to revert to env. */
  setUrl(v) {
    this._runtimeUrl = v == null ? null : String(v).replace(/\/+$/, '');
    return this.getState();
  }

  /** Drop runtime overrides; fall back to env defaults. */
  resetOverrides() {
    this._runtimeEnabled = null;
    this._runtimeUrl = null;
    return this.getState();
  }

  /** Snapshot for the admin/UI surface. */
  getState() {
    return {
      enabled: this.isEnabled(),
      enabled_flag: this.enabled,
      has_url: !!this.url,
      url: this.url || null,
      has_api_key: !!this.apiKey,
      fail_mode: this.failMode,
      timeout_ms: this.timeoutMs,
      actor_id: this.actorId,
      env_defaults: {
        enabled: this._envEnabled,
        url: this._envUrl || null,
      },
      runtime_overrides: {
        enabled: this._runtimeEnabled,
        url: this._runtimeUrl,
      },
      last_call: this._lastCall,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Validate a thought→action transition.
   *
   * @param {Object} args
   * @param {Object} args.thought  Splendor's reasoning context (what she
   *                               considered before committing to act).
   *                               Kept on the host wherever possible; only
   *                               summary-level data should be sent.
   * @param {Object} args.intent   The action she intends to take. Required.
   * @param {string} [args.actorId='splendor']
   * @param {string} [args.correlationId]
   * @returns {Promise<Verdict>}
   */
  async validate({ thought = {}, intent = {}, actorId, correlationId } = {}) {
    const correlation = correlationId || crypto.randomUUID();
    const intentType = intent && intent.type ? String(intent.type) : 'unspecified';
    const actor = actorId || this.actorId;
    const t0 = Date.now();

    if (!this.isEnabled()) {
      const verdict = {
        decision: 'ALLOW',
        allow: true,
        dormant: true,
        reason: 'governance disabled (CLASPION_ENABLED=false or no CLASPION_URL)',
        basis_state: 'ESTABLISHED',
        conscience_name: 'splendor-bypass',
        failed_axes: [],
        verdict_id: `local-${correlation}`,
        correlation_id: correlation,
        latency_ms: 0,
      };
      Object.assign(verdict, this._classifyOutcome(verdict, { dormant: true, upstreamErr: null }));
      this._log('dormant', verdict, { intentType, actor });
      this._persistVerdict(verdict, { intentType, actor });
      return verdict;
    }

    let verdict;
    let upstreamErr = null;
    try {
      verdict = await this._postValidate({ thought, intent, actor, correlation });
    } catch (err) {
      upstreamErr = err;
      verdict = this._failureVerdict(err, correlation);
    }
    verdict.correlation_id = correlation;
    verdict.latency_ms = Date.now() - t0;
    Object.assign(verdict, this._classifyOutcome(verdict, { dormant: false, upstreamErr }));
    this._lastCall = {
      at: new Date().toISOString(),
      ok: !upstreamErr,
      status: upstreamErr && upstreamErr.code && /^HTTP_(\d+)$/.test(upstreamErr.code)
        ? Number(upstreamErr.code.slice(5))
        : null,
      error_code: upstreamErr ? (upstreamErr.code || 'ERROR') : null,
      error_message: upstreamErr ? String(upstreamErr.message || upstreamErr) : null,
      latency_ms: verdict.latency_ms,
      decision: verdict.decision,
      allow: !!verdict.allow,
      outcome: verdict.outcome,
      outcome_cause: verdict.outcome_cause,
    };
    this._log('validated', verdict, { intentType, actor });
    this._persistVerdict(verdict, { intentType, actor });
    return verdict;
  }

  /**
   * Convenience: resolve a verdict to (allow, reason). Hosts that want
   * a one-liner instead of pattern-matching on `decision` can use this.
   */
  async check(args) {
    const verdict = await this.validate(args);
    return {
      allow: !!verdict.allow,
      reason: verdict.reason,
      decision: verdict.decision,
      verdict_id: verdict.verdict_id,
      correlation_id: verdict.correlation_id,
      basis_state: verdict.basis_state,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────

  async _postValidate({ thought, intent, actor, correlation }) {
    const endpoint = `${this.url}/api/v1/governance/validate`;
    // CLASPION's GovernanceValidateRequest schema requires `thought` and
    // `intent` to be objects. Some callers pass plain strings; sending a
    // string yields a 422 that then trips fail-closed on every message.
    // Wrap scalars as { content: <value> }; pass objects through as-is.
    const asObject = (v) =>
      v && typeof v === 'object' ? v : { content: v == null ? '' : String(v) };
    const body = JSON.stringify({
      thought: asObject(thought),
      intent: asObject(intent),
      actor_id: actor,
      correlation_id: correlation,
      surface: this.surface,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this._fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      // Transport-level failure: distinguish an aborted (timed-out) request
      // from a connection/DNS failure so the persisted record can say which.
      const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
      const err = new Error(`CLASPION transport error: ${e && e.message ? e.message : e}`);
      err.code = aborted ? 'TIMEOUT' : 'NETWORK';
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`CLASPION ${res.status}: ${text || res.statusText}`);
      err.code = `HTTP_${res.status}`;
      err.httpStatus = res.status;
      throw err;
    }
    let data;
    try {
      data = await res.json();
    } catch (e) {
      const err = new Error(`CLASPION malformed response (invalid JSON): ${e && e.message ? e.message : e}`);
      err.code = 'MALFORMED_RESPONSE';
      throw err;
    }
    // A 200 with a body that isn't a real verdict is a malformed response,
    // not a real policy decision — never let it masquerade as one.
    if (!data || (data.decision !== 'ALLOW' && data.decision !== 'BLOCK')) {
      const err = new Error('CLASPION malformed response (missing/invalid decision)');
      err.code = 'MALFORMED_RESPONSE';
      throw err;
    }
    return {
      decision: data.decision,
      allow: !!data.allow,
      reason: data.reason || '',
      basis_state: data.basis_state || 'UNKNOWN',
      conscience_name: data.conscience_name || 'unknown',
      failed_axes: Array.isArray(data.failed_axes) ? data.failed_axes : [],
      verdict_id: data.verdict_id || null,
      metadata: data.metadata || {},
      suggested_action: data.suggested_action || null,
    };
  }

  _failureVerdict(err, correlation) {
    const failClosed = this.failMode !== 'allow';
    const decision = failClosed ? 'BLOCK' : 'ALLOW';
    const reason = failClosed
      ? `network failure; fail-closed per CLASPION_FAIL_MODE: ${err && err.message ? err.message : 'unknown error'}`
      : `network failure; fail-open per CLASPION_FAIL_MODE: ${err && err.message ? err.message : 'unknown error'}`;
    return {
      decision,
      allow: !failClosed,
      reason,
      basis_state: 'UNREACHABLE',
      conscience_name: 'splendor-failure-handler',
      failed_axes: ['transport'],
      verdict_id: `local-fail-${correlation}`,
      metadata: { error_code: err && err.code ? err.code : 'NETWORK' },
      suggested_action: failClosed
        ? 'restore CLASPION reachability or set CLASPION_FAIL_MODE=allow for testing only'
        : null,
    };
  }

  /**
   * Reduce a verdict to an answerable "why was this turn allowed/blocked?":
   *   outcome:       allow | block | dormant | fail_closed | fail_open
   *   outcome_cause: upstream | disabled | timeout | http_4xx | http_5xx
   *                  | network | malformed
   * A real policy denial is outcome='block', cause='upstream'. A safety
   * fallback during an outage is outcome='fail_closed', cause=<transport>.
   * These are never the same value, so the two can always be told apart.
   */
  _classifyOutcome(verdict, { dormant, upstreamErr }) {
    if (dormant) {
      return { outcome: 'dormant', outcome_cause: 'disabled', http_status: null, error_code: null };
    }
    if (!upstreamErr) {
      return {
        outcome: verdict.allow ? 'allow' : 'block',
        outcome_cause: 'upstream',
        http_status: null,
        error_code: null,
      };
    }
    const code = upstreamErr.code || 'NETWORK';
    let cause;
    if (code === 'TIMEOUT') cause = 'timeout';
    else if (code === 'MALFORMED_RESPONSE') cause = 'malformed';
    else if (/^HTTP_(\d+)$/.test(code)) {
      cause = Number(code.slice(5)) >= 500 ? 'http_5xx' : 'http_4xx';
    } else cause = 'network';
    return {
      outcome: this.failMode !== 'allow' ? 'fail_closed' : 'fail_open',
      outcome_cause: cause,
      http_status: upstreamErr.httpStatus || null,
      error_code: code,
    };
  }

  /**
   * Append-only persistence of every verdict to `governance_verdicts`.
   * Best-effort and fire-and-forget: a DB failure must never break or delay
   * a governance decision. NO SECRETS are written — no API key, no URL, and
   * no thought/intent content; only the intent *type* label, the actor id,
   * and the verdict's own provenance fields. `reason` is capped.
   */
  _persistVerdict(verdict, ctx) {
    try {
      const row = {
        correlation_id: verdict.correlation_id || null,
        verdict_id: verdict.verdict_id || null,
        decision: verdict.decision || null,
        allow: !!verdict.allow,
        outcome: verdict.outcome || null,
        outcome_cause: verdict.outcome_cause || null,
        reason: verdict.reason ? String(verdict.reason).slice(0, 1000) : null,
        conscience_name: verdict.conscience_name || null,
        basis_state: verdict.basis_state || null,
        failed_axes: Array.isArray(verdict.failed_axes) ? verdict.failed_axes : [],
        intent_type: ctx && ctx.intentType ? String(ctx.intentType) : null,
        surface: this.surface,
        actor: ctx && ctx.actor ? String(ctx.actor) : this.actorId,
        latency_ms: typeof verdict.latency_ms === 'number' ? verdict.latency_ms : null,
        http_status: verdict.http_status || null,
        error_code: verdict.error_code || null,
        fail_mode: this.failMode,
        enabled: this.isEnabled(),
        dormant: !!verdict.dormant,
      };

      // Injected persister (tests) takes precedence.
      if (this._persist) { this._persist(row, verdict, ctx); }
      else {
        // Default: best-effort Supabase insert, fire-and-forget. Lazy-required
        // so this module stays usable with no DB and carries no load-time dep.
        let supabase = null;
        try { ({ supabase } = require('./supabase')); } catch (_) { supabase = null; }
        if (supabase) {
          supabase.from('governance_verdicts').insert(row).then(() => {}).catch(() => {});
        }
      }

      // Bridge verdict into governance_decisions for Glass Box observability.
      // Fire-and-forget — never delays or alters the enforcement result.
      try {
        const bridge = require('./claspion-verdict-to-decision');
        bridge.bridgeVerdictToDecision(verdict, ctx);
      } catch (_) { /* bridge failures must never affect governance */ }

    } catch (_) {
      // Telemetry must never break governance.
    }
  }

  _log(stage, verdict, ctx) {
    const line = {
      ts: nowIso(),
      tag: '[CLASPION]',
      stage,
      enabled: this.isEnabled(),
      decision: verdict.decision,
      allow: verdict.allow,
      outcome: verdict.outcome,
      outcome_cause: verdict.outcome_cause,
      http_status: verdict.http_status || null,
      error_code: verdict.error_code || null,
      conscience: verdict.conscience_name,
      basis: verdict.basis_state,
      intent_type: ctx.intentType,
      actor: ctx.actor,
      correlation: verdict.correlation_id,
      latency_ms: verdict.latency_ms,
      reason: verdict.reason,
    };
    // One-line summary so it greps cleanly in production logs. outcome +
    // outcome_cause answer "why was this turn allowed/blocked?" at a glance:
    // e.g. outcome=fail_closed cause=timeout  vs  outcome=block cause=upstream.
    const log = this.logger && (this.logger.info || this.logger.log);
    if (log) {
      log.call(this.logger,
        `${line.tag} ${line.stage} decision=${line.decision} outcome=${line.outcome} cause=${line.outcome_cause}` +
        `${line.http_status ? ' http=' + line.http_status : ''}${line.error_code ? ' err=' + line.error_code : ''}` +
        ` basis=${line.basis} conscience=${line.conscience} intent=${line.intent_type} actor=${line.actor}` +
        ` corr=${line.correlation} latency_ms=${line.latency_ms} reason="${line.reason}"`);
    }
    // Surface this stage to the live activity bus so the orb rings and
    // CLASPION header ticker can react in real time. Abstract fields only.
    try {
      activityBus.emit('claspion', {
        stage: line.stage,
        decision: line.decision,
        outcome: line.outcome,
        outcome_cause: line.outcome_cause,
        basis: line.basis,
        conscience: line.conscience,
        intent: line.intent_type,
        latency_ms: line.latency_ms,
        dormant: !!verdict.dormant,
        // Per-decision provenance: which CLASPION build made this call.
        // Stamped server-side in verdict.metadata; the conscience orb
        // already consumes ev.version. Undefined when dormant/unreachable.
        version: verdict.metadata && verdict.metadata.claspion_version,
      });
    } catch (_) { /* never let telemetry break governance */ }
  }
}

// Module-level singleton — easy to import everywhere without re-wiring.
const governance = new ClaspionGovernance();

module.exports = {
  ClaspionGovernance,
  governance,
};
