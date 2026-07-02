'use strict';
/*
  Surface art-coverage — the Option-C acceptance gate.

  The image bug (divergence D4) happened because the art intercept was
  copy-pasted into SOME handlers and forgotten in others. After Phase 2 every
  surface must route image generation through the ONE shared capability router
  (lib/capability-router.js). This guard asserts that structurally, so a future
  edit cannot silently drop art from a surface again.

  Static assertions over the route sources + the served frontend. This is the
  same static-guard pattern used by converse-art-note / last-error-observability.

  Run: node --test tests/surface-art-coverage.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const CHAT = read('routes/chat.js');
const ENHANCED = read('routes/enhanced-chat.js');
const CONVERSE = read('routes/converse.js');
const HTML = read('public/oracle-interface.html');

test('1. /api/chat (council ON/AUTO) routes art through the shared router', () => {
  assert.ok(CHAT.includes("require('../lib/capability-router')"), 'chat.js imports the shared router');
  assert.ok(/runArtCapability\(\{[^}]*source:\s*'chat'/.test(CHAT), 'chat.js calls runArtCapability(source:chat)');
  // The old inline 4-branch error switch must be gone (now centralized).
  assert.ok(!CHAT.includes("My image-generation key isn't authorized. Chris needs to check"), 'inline art error switch removed from chat.js');
});

test('2. /api/enhanced/chat/stream still intercepts art via the shared router', () => {
  assert.ok(ENHANCED.includes("require('../lib/capability-router')"), 'enhanced-chat.js imports the shared router');
  assert.ok(ENHANCED.includes('isArtRequest(message)'), 'stream handler still guards on isArtRequest');
  assert.ok(ENHANCED.includes('runArtCapability('), 'enhanced-chat.js calls runArtCapability');
  assert.ok(ENHANCED.includes('handleArtStreamIntercept'), 'stream art helper preserved');
});

test('3. /api/enhanced/chat NON-stream is now covered (was the D4 hole)', () => {
  // Count runArtCapability call-sites: stream helper + non-stream handler = 2.
  const calls = (ENHANCED.match(/runArtCapability\(/g) || []).length;
  assert.ok(calls >= 2, `expected >=2 runArtCapability call-sites in enhanced-chat.js, found ${calls}`);
  // The non-stream handler returns an art block in its own { success, response } shape.
  assert.ok(/art:\s*\{\s*generated:\s*true/.test(ENHANCED), 'non-stream returns an art:{generated:true} payload');
});

test('4. /api/converse/art routes through the shared router', () => {
  assert.ok(CONVERSE.includes("require('../lib/capability-router')"), 'converse.js imports the shared router');
  assert.ok(/runArtCapability\(\{[^}]*source:\s*'converse'/.test(CONVERSE), 'converse.js calls runArtCapability(source:converse)');
  assert.ok(!CONVERSE.includes('generateArt({'), 'converse.js no longer calls generateArt directly');
});

test('5. frontend council branch renders a backend art payload that exists on this branch', () => {
  // Backend side: /api/chat emits the art block the frontend reads.
  assert.ok(/art:\s*\{\s*generated:\s*true/.test(CHAT), '/api/chat returns art:{generated:true,...}');
  // Frontend side: council handler consumes data.art and renders/plays it.
  assert.ok(HTML.includes('if (data.art)'), 'council handler branches on data.art');
  assert.ok(HTML.includes('triggerOrbEmergence(data.art.image_url'), 'renders data.art.image_url');
  assert.ok(HTML.includes('decodeAudioFromBase64(data.art.audio_b64)'), 'plays data.art.audio_b64');
});

test('Phase 1: every text + voice surface builds the shared turn context', () => {
  for (const [name, src] of [['chat.js', CHAT], ['enhanced-chat.js', ENHANCED], ['converse.js', CONVERSE]]) {
    assert.ok(src.includes("require('../lib/turn-context')"), `${name} imports turn-context`);
    assert.ok(src.includes('buildTurnContext('), `${name} calls buildTurnContext`);
  }
});
