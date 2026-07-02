'use strict';
/*
  Error observability — static regression guard.

  Transient image/audio/UI errors flash in the chat box and clear (2-6s timers
  + overwrite race), and the real status code was previously console-only. This
  guard asserts every transient error surface routes through recordError(), so
  window.__lastError survives the flash and can be inspected in DevTools.

  Static assertion over public/oracle-interface.html (the served frontend).
  Run: node --test tests/last-error-observability.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'oracle-interface.html'),
  'utf8'
);

test('recordError helper exists and writes window.__lastError', () => {
  assert.ok(/function recordError\s*\(/.test(HTML), 'recordError() must be defined');
  assert.ok(HTML.includes('window.__lastError'), 'must set window.__lastError');
  // The four-field shape the user inspects in DevTools.
  for (const field of ['source:', 'code:', 'message:', 'ts:']) {
    assert.ok(HTML.includes(field), `__lastError must carry ${field}`);
  }
});

test('consistent structured console log format is present', () => {
  assert.ok(
    HTML.includes("'[err] source='"),
    'must log "[err] source=<source> code=<code> message=<message>"'
  );
});

test('every approved error surface routes through recordError', () => {
  const surfaces = [
    "recordError('fault'",            // setFault
    "recordError('art:failed'",       // activity-bus art failure
    "recordError('art_failed'",       // SSE art_failed
    "recordError('converse_block",    // showConverseBlock
    "recordError('tts'",              // TTS / voice prep + playback failure
    "recordError('art_audio",         // narration audio playback failure
  ];
  for (const s of surfaces) {
    assert.ok(HTML.includes(s), `missing recordError wiring: ${s}`);
  }
});

test('observability is state+log only — no auto-dismiss timers were changed', () => {
  // The existing transient clears must remain (we did not touch UX timing).
  assert.ok(HTML.includes('ttl: 2000'), 'fault ttl must be unchanged');
  assert.ok(HTML.includes('}, 6000)'), 'art:failed banner timer must be unchanged');
  assert.ok(HTML.includes('}, 5000)'), 'converse-block banner timer must be unchanged');
});
