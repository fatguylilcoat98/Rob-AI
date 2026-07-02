/*
  Splendor — Visible Conscience Engine
  ConscienceOrbTelemetry — orchestrator

  Wires the live runtime to the visualization:
    /api/activity/stream (SSE)  ->  GovernanceStateMachine
                                ->  orb visual state + OrbNarrativeQueue
                                ->  TelemetryRenderer (raw feed, provenance)
                                ->  DecisionSpine + 3-state legend
    /api/chat/stream (POST SSE) ->  INPUT_RECEIVED, streamed response,
                                    authoritative RESPONSE_AUTHORIZED /
                                    RESPONSE_WITHHELD from the CLASPION verdict.

  The orb shows visible restraint: when CLASPION holds, the orb goes red,
  slows, and the response is withheld in plain sight. That is the product.
*/
(function (global) {
  'use strict';

  var STATES = global.GovernanceStateMachine.STATES;

  function ConscienceOrbTelemetry(cfg) {
    this.els = cfg.els;
    this.getSession = cfg.getSession;     // async () => session|null
    this.onAuthFail = cfg.onAuthFail || function () {};

    this.sm = new global.GovernanceStateMachine();
    this.narrative = new global.OrbNarrativeQueue(this.els.orbNarrative, { cap: 7, ttl: 5200 });
    this.telemetry = new global.TelemetryRenderer({
      events: this.els.events,
      particles: this.els.particles,
      provenance: this.els.provenance,
      memoryCtx: this.els.memoryCtx,
      contradiction: this.els.contradiction
    });
    this.spine = new global.DecisionSpine({
      top: this.els.spineTop,
      bottomDecision: this.els.spineBottomDecision,
      bottomState: this.els.spineBottomState,
      integrity: this.els.spineIntegrity,
      version: this.els.spineVersion
    });

    this.source = null;
    this.processing = false;
    this._idleTimer = null;
    this._stickyHold = false;

    var self = this;
    this.sm.onTransition(function (tr) { self._applyTransition(tr); });
    this.telemetry.setContradictionIndex('—');
    this.telemetry.setMemoryContext(null);
  }

  // ── Visual application ────────────────────────────────────────────
  ConscienceOrbTelemetry.prototype._setOrb = function (mode) {
    var orb = this.els.orb;
    if (orb) orb.className = 'orb' + (mode && mode !== 'idle' ? ' orb--' + mode : '');
    var lbl = this.els.orbState;
    if (lbl) {
      lbl.textContent =
        mode === 'evaluating' ? 'evaluating'
        : mode === 'converging' ? 'converging · forming response'
        : mode === 'hold' ? 'conscience gate: hold'
        : 'equilibrium';
      lbl.className = 'orb-state' +
        (mode === 'hold' ? ' orb-state--hold'
         : (mode === 'evaluating' || mode === 'converging') ? ' orb-state--active' : '');
    }
  };

  ConscienceOrbTelemetry.prototype._setLegend = function (group) {
    // group: 'normal' | 'hold' | 'authorized'
    var map = { normal: this.els.legendNormal, hold: this.els.legendHold, authorized: this.els.legendAuth };
    for (var k in map) {
      if (map[k]) map[k].classList.toggle('legend--on', k === group);
    }
  };

  ConscienceOrbTelemetry.prototype._scheduleIdle = function (ms) {
    var self = this;
    // A withheld user turn locks the visual state until the next send —
    // visible restraint is the point; it must not blink away.
    if (this._stickyHold) return;
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(function () {
      if (self.processing) return;
      self._setOrb('idle');
      self._setLegend('normal');
      self.spine.clearHold();
    }, ms);
  };

  ConscienceOrbTelemetry.prototype._applyTransition = function (tr) {
    if (!tr) return;
    var meta = tr.meta;
    // While a held turn is locked, background bus pings (claspion ALLOW
    // heartbeats, memory reads) still scroll the narrative but must NOT
    // repaint the orb/legend off the HOLD.
    if (this._stickyHold && tr.state !== STATES.RESPONSE_WITHHELD) {
      this.narrative.push(tr.telemetry, meta.kind);
      return;
    }
    this.narrative.push(tr.telemetry, meta.kind);
    this._setOrb(meta.orb);
    this._setLegend(meta.group);

    if (tr.state === STATES.CONTRADICTION_CHECK) {
      var flagged = /preserved|contradiction flagged/i.test(tr.telemetry);
      this.telemetry.setContradictionIndex(flagged ? 'FLAGGED' : 'CLEAR');
    }
    if (tr.state === STATES.MEMORY_RETRIEVAL && tr.raw && tr.raw.count != null) {
      this.telemetry.setMemoryContext(tr.raw.count);
    }
    if (tr.state === STATES.RESPONSE_WITHHELD) {
      this.telemetry.particle('CONSCIENCE GATE', 'hold');
      this.spine.flashHold(tr.reason);
      if (tr.raw) this.spine.setBasis(tr.raw.basis, tr.raw.decision);
      this._scheduleIdle(6000);
    } else if (tr.state === STATES.RESPONSE_AUTHORIZED) {
      this.telemetry.particle('AUTHORIZED');
      this.spine.clearHold();
      this._scheduleIdle(2200);
    } else if (tr.state === STATES.CLASPION_REVIEW && tr.raw) {
      this.spine.setBasis(tr.raw.basis, tr.raw.decision);
      this.telemetry.particle('CLASPION');
    } else if (meta.orb === 'evaluating') {
      this.telemetry.particle(tr.telemetry.slice(0, 22));
      if (!this.processing) this._scheduleIdle(4500);
    }
  };

  // ── Live activity stream ──────────────────────────────────────────
  ConscienceOrbTelemetry.prototype.connect = function (token) {
    if (this.source) return;
    var self = this;
    var url = '/api/activity/stream?access_token=' + encodeURIComponent(token);
    try {
      this.source = new EventSource(url);
      this.source.addEventListener('hello', function () { self._setStream(true); });
      this.source.onmessage = function (e) {
        var ev;
        try { ev = JSON.parse(e.data); } catch (_) { return; }
        self.telemetry.logRaw(ev);
        if (ev.type === 'memory:write' || ev.type === 'memory:read') self.telemetry.provenance(ev);
        if (ev.type === 'claspion' && ev.version) self.spine.setVersion(ev.version);
        self.sm.ingest(ev); // transition (if any) flows through _applyTransition
      };
      this.source.onerror = function () { self._setStream(false); };
      this._setStream(true);
    } catch (e) {
      this._setStream(false);
    }
  };

  ConscienceOrbTelemetry.prototype._setStream = function (up) {
    var el = this.els.streamStatus;
    if (!el) return;
    el.classList.toggle('down', !up);
    el.innerHTML = '<span class="live-dot"></span>' +
      (up ? 'conscience stream: live' : 'conscience stream: reconnecting');
  };

  // ── Real turn through /api/chat/stream ────────────────────────────
  ConscienceOrbTelemetry.prototype.send = function (message) {
    var self = this;
    if (!message || this.processing) return Promise.resolve();
    return this.getSession().then(function (session) {
      if (!session) { self.onAuthFail(); return; }
      self.processing = true;
      // A new turn releases the previous held lock and starts clean.
      self._stickyHold = false;
      if (self._idleTimer) clearTimeout(self._idleTimer);
      self.spine.clearHold();
      if (self.els.sendBtn) self.els.sendBtn.disabled = true;
      if (self.els.response) {
        self.els.response.classList.remove('held');
        self.els.response.textContent = '';
      }
      self.sm.force(STATES.INPUT_RECEIVED, 'input received');

      return fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({ message: message })
      }).then(function (res) {
        if (res.status === 401 || res.status === 403) { self.onAuthFail(); throw new Error('auth'); }
        if (!res.ok || !res.body) throw new Error('http_' + res.status);
        return self._readStream(res);
      }).catch(function (e) {
        if (e && e.message === 'auth') return;
        if (self.els.response && !self.els.response.textContent) {
          self.els.response.textContent = 'The conscience layer returned an error (' +
            (e && e.message ? e.message : 'unknown') + ').';
        }
        self.narrative.push('transport error · request did not complete', 'err');
      }).then(function () {
        self.processing = false;
        if (self.els.sendBtn) self.els.sendBtn.disabled = false;
      });
    });
  };

  ConscienceOrbTelemetry.prototype._readStream = function (res) {
    var self = this;
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var full = '';
    var firstToken = true;

    function handle(payload) {
      if (payload === '[DONE]') return;
      var evt;
      try { evt = JSON.parse(payload); } catch (_) { return; }
      if (evt.type === 'token') {
        if (firstToken) { firstToken = false; self._setOrb('converging'); self._setLegend('normal'); }
        full += evt.text || '';
        if (self.els.response) {
          self.els.response.textContent = full;
          if (self.els.response.parentElement) {
            self.els.response.parentElement.scrollTop = self.els.response.parentElement.scrollHeight;
          }
        }
      } else if (evt.type === 'done') {
        var g = evt.governance || {};
        var dec = String(g.decision || '').toUpperCase();
        var held = !g.dormant && (dec === 'BLOCK' || dec === 'HOLD');
        if (held) {
          if (self.els.response) self.els.response.classList.add('held');
          self.sm.force(STATES.RESPONSE_WITHHELD,
            'conscience gate: hold' + (g.basis_state ? (' · basis ' + g.basis_state) : ''),
            'governance threshold exceeded');
          // Lock the HOLD until the next send. The force() above already
          // scheduled a revert via _applyTransition — cancel it and latch.
          self._stickyHold = true;
          if (self._idleTimer) { clearTimeout(self._idleTimer); self._idleTimer = null; }
        } else {
          self.sm.force(STATES.RESPONSE_AUTHORIZED,
            'truth over comfort — authorized' + (dec ? (' · ' + dec) : ''));
        }
        if (g.basis_state || g.basis) self.spine.setBasis(g.basis_state || g.basis, g.decision);
      } else if (evt.type === 'error') {
        if (self.els.response) self.els.response.textContent = full || ('Error: ' + (evt.message || 'unknown'));
        self.narrative.push('stream error · ' + (evt.message || 'unknown'), 'err');
      }
    }

    function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          if (buffer.trim()) {
            buffer.split('\n').forEach(function (l) {
              l = l.trim(); if (l.indexOf('data:') === 0) handle(l.slice(5).trim());
            });
          }
          if (self.els.response && !full && !self.els.response.classList.contains('held')) {
            self.els.response.textContent = '(no response returned)';
          }
          return;
        }
        buffer += decoder.decode(r.value, { stream: true });
        var parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (var i = 0; i < parts.length; i++) {
          var lines = parts[i].split('\n');
          for (var j = 0; j < lines.length; j++) {
            var ln = lines[j].trim();
            if (ln.indexOf('data:') === 0) handle(ln.slice(5).trim());
          }
        }
        return pump();
      });
    }
    return pump();
  };

  global.ConscienceOrbTelemetry = ConscienceOrbTelemetry;
})(window);
