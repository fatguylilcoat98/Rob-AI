'use strict';
/*
  Council art render — frontend regression guard (supersedes PR #127).

  /api/chat returns an art payload when Council ON/AUTO intercepts an image
  request: { art: { generated, image_url, audio_b64, ... } }. The council
  response handler must render the image + play the narration audio through
  the existing orb-emergence / decoded-audio paths, skipping prepareSpeech so
  narration is the single voice.

  Static assertions over public/oracle-interface.html.
  Run: node --test tests/council-art-render.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'oracle-interface.html'),
  'utf8'
);

// Scope assertions to the council fetch block (postChat('/api/chat' … up to
// the streamChat fallback line).
const councilBlockStart = HTML.indexOf("postChat('/api/chat'");
const councilBlockEnd   = HTML.indexOf('const streamRes = await streamChat(text, imageData)');
assert.ok(councilBlockStart > -1, 'council block must exist');
assert.ok(councilBlockEnd   > -1, 'stream fallback must exist');
const COUNCIL = HTML.slice(councilBlockStart, councilBlockEnd);

test('council handler detects data.art.generated', () => {
  assert.ok(COUNCIL.includes('data.art.generated'), 'must branch on data.art.generated');
});

test('council handler calls triggerOrbEmergence with data.art.image_url', () => {
  assert.ok(COUNCIL.includes('triggerOrbEmergence(data.art.image_url'), 'must render data.art.image_url');
});

test('council handler plays data.art.audio_b64 via decodeAudioFromBase64', () => {
  assert.ok(COUNCIL.includes('decodeAudioFromBase64(data.art.audio_b64)'), 'must decode data.art.audio_b64');
});

test('council handler skips prepareSpeech when an art payload is present', () => {
  const artGuardIdx   = COUNCIL.indexOf('if (data.art)');
  const artReturnIdx  = COUNCIL.indexOf('return;', artGuardIdx);
  const prepSpeechIdx = COUNCIL.lastIndexOf('prepareSpeech(replyText)');
  assert.ok(artGuardIdx   > -1, 'if (data.art) guard must exist');
  assert.ok(artReturnIdx  > -1, 'return after art guard must exist');
  assert.ok(prepSpeechIdx > -1, 'prepareSpeech must still exist for the non-art path');
  assert.ok(prepSpeechIdx > artReturnIdx, 'prepareSpeech is unreachable when data.art is truthy');
});

test('council handler routes art failures through recordError("art:failed")', () => {
  assert.ok(COUNCIL.includes("recordError('art:failed'"), 'art failure must call recordError("art:failed")');
});
