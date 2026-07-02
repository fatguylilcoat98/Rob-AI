'use strict';
/*
  Double-voice fix — static regression guard.

  In CONVERSE (voice) mode, image generation plays an OpenAI TTS narration as
  the single voice. The frontend injects a system note to the Realtime model;
  if that note invites the model to SPEAK, the model's voice overlaps the
  narration (the "two voices" production bug). This guard asserts the success
  art note tells the model to STAY SILENT and no longer requests any verbal
  acknowledgment.

  Static assertion over public/oracle-interface.html (the served frontend) —
  no DOM, no browser. Run: node --test tests/converse-art-note.test.js
*/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'oracle-interface.html'),
  'utf8'
);

test('the success art note tells the Realtime model to stay silent', () => {
  assert.ok(
    HTML.includes('Do not speak or acknowledge this image event'),
    'art note must instruct the model not to speak'
  );
  assert.ok(
    HTML.includes('Stay silent until Chris speaks again'),
    'art note must instruct the model to stay silent'
  );
});

test('the old "verbal acknowledgment" wording is gone', () => {
  assert.ok(
    !/brief verbal acknowledgment/i.test(HTML),
    'the note must no longer request a verbal acknowledgment'
  );
});

test('the FAILED-image note is unaffected (it must still read the error aloud)', () => {
  // The failure path is a different note and should keep asking the model to
  // speak the literal error — this fix must not silence error reporting.
  assert.ok(
    HTML.includes('Read the error verbatim'),
    'the image-failure note must still ask the model to read the error'
  );
});

test('the TTS narration remains the single voice path (playDecodedBuffer present)', () => {
  assert.ok(
    HTML.includes('playDecodedBuffer'),
    'art narration playback path must still exist'
  );
});
