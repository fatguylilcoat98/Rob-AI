/*
  Splendor — Visible Conscience Engine
  DecisionSpine

  The binding-decision bars (top + bottom). The spine never disappears —
  it is the always-present statement of what governs the system. Basis
  and decision update only from real CLASPION events.
*/
(function (global) {
  'use strict';

  function DecisionSpine(els) {
    this.topEl = els.top || null;          // top "current binding decision" text
    this.bottomDecEl = els.bottomDecision || null; // bottom decision text
    this.bottomStateEl = els.bottomState || null;  // bottom ACTIVE/HOLD lamp
    this.integrityEl = els.integrity || null;      // CLASPION integrity %
    this.versionEl = els.version || null;          // CLASPION vX header
    this._defaultTop = 'Current Binding Decision: 1. TRUTH OVER COMFORT [RULE 001] [ACTIVE]';
    if (this.topEl) this.topEl.textContent = this._defaultTop;
  }

  DecisionSpine.prototype.setBasis = function (basis, decision) {
    var dec = String(decision || '').toUpperCase();
    if (this.topEl) {
      this.topEl.textContent = basis
        ? ('CLASPION basis: ' + basis + (dec ? (' · ' + dec) : ''))
        : this._defaultTop;
    }
    var held = (dec === 'BLOCK' || dec === 'HOLD');
    if (this.bottomStateEl) {
      this.bottomStateEl.textContent = held ? 'HOLD' : 'ACTIVE';
      this.bottomStateEl.className = 'spine-lamp ' + (held ? 'spine-lamp--hold' : 'spine-lamp--active');
    }
  };

  DecisionSpine.prototype.setVersion = function (v) {
    if (this.versionEl && v) this.versionEl.textContent = 'CLASPION ' + v;
  };

  // Integrity is only asserted from a real signal. Default display is
  // a dash until the bus says otherwise — no fabricated 100%.
  DecisionSpine.prototype.setIntegrity = function (pct) {
    if (this.integrityEl) {
      this.integrityEl.textContent = (pct == null) ? '—' : (pct + '%');
    }
  };

  // Reflect a HOLD prominently on the bottom spine, then let it settle.
  DecisionSpine.prototype.flashHold = function (reason) {
    if (this.bottomDecEl) {
      this.bottomDecEl.textContent = 'CONSCIENCE GATE: HOLD' + (reason ? (' — ' + reason) : '');
      this.bottomDecEl.classList.add('spine-dec--hold');
    }
  };
  DecisionSpine.prototype.clearHold = function () {
    if (this.bottomDecEl) {
      this.bottomDecEl.textContent = 'TRUTH OVER COMFORT';
      this.bottomDecEl.classList.remove('spine-dec--hold');
    }
  };

  global.DecisionSpine = DecisionSpine;
})(window);
