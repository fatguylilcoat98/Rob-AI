/*
  Splendor — Visible Conscience Engine
  OrbNarrativeQueue

  The vertical stack of evaluation signals that rises through the orb.
  Fed ONLY by real GovernanceStateMachine transitions. Each line is a
  governance signal, not a thought. Lines auto-expire so the column
  reads as live evaluation, not a transcript.
*/
(function (global) {
  'use strict';

  function OrbNarrativeQueue(containerEl, opts) {
    this.el = containerEl;
    this.cap = (opts && opts.cap) || 7;
    this.ttl = (opts && opts.ttl) || 5200;
    this._last = '';
  }

  // kind -> color class on the line
  OrbNarrativeQueue.prototype.push = function (text, kind) {
    if (!this.el || !text) return;
    // Collapse immediate duplicates (the bus can emit repeats).
    if (text === this._last) return;
    this._last = text;

    var line = document.createElement('div');
    line.className = 'orb-line orb-line--' + (kind || 'check');
    line.textContent = text;
    this.el.appendChild(line);

    // Cap the column.
    while (this.el.children.length > this.cap) {
      this.el.removeChild(this.el.firstChild);
    }

    // Trigger the rise + fade, then remove.
    requestAnimationFrame(function () { line.classList.add('orb-line--in'); });
    var self = this;
    setTimeout(function () {
      line.classList.add('orb-line--out');
      setTimeout(function () {
        if (line.parentNode === self.el) self.el.removeChild(line);
      }, 900);
    }, this.ttl);
  };

  OrbNarrativeQueue.prototype.clear = function () {
    if (this.el) this.el.innerHTML = '';
    this._last = '';
  };

  global.OrbNarrativeQueue = OrbNarrativeQueue;
})(window);
