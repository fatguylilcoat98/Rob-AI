/*
  Splendor — Visible Conscience Engine
  TelemetryRenderer

  Renders the raw event side-feed (LIVE SYSTEM EVENTS), the rising orb
  particles, and the left-side provenance / index strip. Every value
  here is derived from a real activity-bus event. Nothing is invented:
  if the bus is silent, this stays silent.
*/
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clock(ts) {
    return new Date(ts || Date.now()).toLocaleTimeString('en-US', { hour12: true });
  }

  function TelemetryRenderer(els, opts) {
    this.eventsEl = els.events || null;       // LIVE SYSTEM EVENTS list
    this.particlesEl = els.particles || null; // layer inside the orb
    this.provenanceEl = els.provenance || null;
    this.memoryCtxEl = els.memoryCtx || null;     // "Memory Context" value
    this.contradictionEl = els.contradiction || null; // "Contradiction Index" value
    this.eventCap = (opts && opts.eventCap) || 40;
    this.provCap = (opts && opts.provCap) || 8;
  }

  // Raw side-feed: shows the actual event type + time, color-graded so
  // errors and "no-signal" events are visibly distinct from active ones.
  TelemetryRenderer.prototype.logRaw = function (ev) {
    if (!this.eventsEl || !ev || !ev.type) return;
    var empty = this.eventsEl.querySelector('.empty-state');
    if (empty) empty.remove();

    var isErr = /error|write_error|skipped|failed/i.test(ev.type);
    var isMute = /no_flag|no_signal|judge_empty|dormant/i.test(ev.type) || ev.dormant;
    var cls = 'evt' + (isErr ? ' evt--err' : isMute ? ' evt--mute' : '');

    var row = document.createElement('div');
    row.className = cls + ' evt--fresh';
    var detail = ev.reason ? (' · ' + esc(ev.reason))
      : ev.decision ? (' · ' + esc(String(ev.decision).toUpperCase()))
      : ev.error ? (' · ' + esc(String(ev.error).slice(0, 60))) : '';
    row.innerHTML =
      '<span class="evt-type">' + esc(ev.type) + '</span>' + detail +
      '<span class="evt-time">' + esc(clock(ev.ts)) + '</span>';

    this.eventsEl.insertBefore(row, this.eventsEl.firstChild);
    while (this.eventsEl.children.length > this.eventCap) {
      this.eventsEl.removeChild(this.eventsEl.lastChild);
    }
    setTimeout(function () { row.classList.remove('evt--fresh'); }, 1200);
  };

  // Provenance strip (left): real memory writes only.
  TelemetryRenderer.prototype.provenance = function (ev) {
    if (!this.provenanceEl || !ev) return;
    var empty = this.provenanceEl.querySelector('.empty-state');
    if (empty) empty.remove();
    var isWrite = ev.type === 'memory:write';
    var card = document.createElement('div');
    card.className = 'prov-card prov-card--fresh';
    var line = isWrite
      ? ('Wrote ' + esc(ev.memory_type || 'shared_history') +
         (ev.source_type ? (' · ' + esc(ev.source_type)) : ''))
      : ('Read ' + (ev.count != null ? esc(ev.count + ' rows') : 'recent context'));
    card.innerHTML =
      '<div class="prov-head">' + (isWrite ? 'Memory written' : 'Memory recalled') +
      '<span>' + esc(clock(ev.ts)) + '</span></div>' +
      '<div class="prov-body">' + line + '</div>';
    this.provenanceEl.insertBefore(card, this.provenanceEl.firstChild);
    while (this.provenanceEl.children.length > this.provCap) {
      this.provenanceEl.removeChild(this.provenanceEl.lastChild);
    }
    setTimeout(function () { card.classList.remove('prov-card--fresh'); }, 1400);
  };

  // Left index strip — driven by real signals, never faked.
  TelemetryRenderer.prototype.setMemoryContext = function (count) {
    if (this.memoryCtxEl) {
      this.memoryCtxEl.textContent = (count == null)
        ? '—'
        : (count + ' record' + (count === 1 ? '' : 's'));
    }
  };
  TelemetryRenderer.prototype.setContradictionIndex = function (level) {
    if (!this.contradictionEl) return;
    this.contradictionEl.textContent = level;
    this.contradictionEl.className = 'idx-val idx-' +
      (level === 'FLAGGED' ? 'warn' : level === 'CLEAR' ? 'ok' : 'neutral');
  };

  TelemetryRenderer.prototype.particle = function (text, kind) {
    if (!this.particlesEl || !text) return;
    var p = document.createElement('div');
    p.className = 'tparticle' +
      (kind === 'warn' ? ' tparticle--warn' : kind === 'hold' ? ' tparticle--hold' : '');
    p.textContent = text;
    p.style.left = (40 + Math.random() * 20) + '%';
    p.style.animationDuration = (2 + Math.random() * 1.4) + 's';
    p.style.animationDelay = (Math.random() * 0.35) + 's';
    this.particlesEl.appendChild(p);
    setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 4200);
  };

  global.TelemetryRenderer = TelemetryRenderer;
})(window);
