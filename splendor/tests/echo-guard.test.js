'use strict';

/*
  Echo Guard — Unit Tests
  Tests the pure detection logic extracted from oracle-interface.html.
  No DOM, no Audio API, no network.
  Run with: node --test tests/echo-guard.test.js
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ── Pure logic extracted from oracle-interface.html ──────────────────────────

const ECHO_GUARD_RESUME_DELAY_MS       = 750;
const ECHO_GUARD_FILTER_WINDOW_MS      = 3000;
const ECHO_GUARD_SIMILARITY_THRESHOLD  = 0.65;
const ECHO_GUARD_SHORT_WORD_LIMIT      = 8;

function normalize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  const wa = new Set(normalize(a).split(' ').filter(Boolean));
  const wb = new Set(normalize(b).split(' ').filter(Boolean));
  if (!wa.size && !wb.size) return 1;
  if (!wa.size || !wb.size) return 0;
  let intersection = 0;
  for (const w of wa) { if (wb.has(w)) intersection++; }
  return intersection / (wa.size + wb.size - intersection);
}

function makeGuard() {
  return {
    isAssistantSpeaking:     false,
    lastAssistantSpokenText: '',
    assistantSpeechStartedAt: 0,
    assistantSpeechEndedAt:   0,
    resumeTimer: null,
  };
}

function shouldDiscard(guard, transcript, nowMs) {
  const now = nowMs !== undefined ? nowMs : Date.now();
  if (guard.isAssistantSpeaking) return 'speaking';
  if (guard.resumeTimer !== null) return 'resume_buffer';
  const msSinceEnd = now - guard.assistantSpeechEndedAt;
  if (msSinceEnd < ECHO_GUARD_FILTER_WINDOW_MS && guard.lastAssistantSpokenText) {
    const norm = normalize(transcript);
    const assistantNorm = normalize(guard.lastAssistantSpokenText);
    if (assistantNorm.includes(norm) || norm.includes(assistantNorm.slice(0, Math.min(norm.length, 40)))) {
      return 'substring';
    }
    const sim = similarity(transcript, guard.lastAssistantSpokenText);
    if (sim >= ECHO_GUARD_SIMILARITY_THRESHOLD) return 'similarity:' + sim.toFixed(2);
    const wordCount = norm.split(' ').filter(Boolean).length;
    if (wordCount <= ECHO_GUARD_SHORT_WORD_LIMIT && assistantNorm.includes(norm)) return 'short+substring';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: transcript during assistant speech is ignored
// ─────────────────────────────────────────────────────────────────────────────
test('transcript while isAssistantSpeaking is discarded', () => {
  const guard = makeGuard();
  guard.isAssistantSpeaking = true;
  guard.lastAssistantSpokenText = 'I painted something soft and blue for you.';
  guard.assistantSpeechStartedAt = Date.now();

  const reason = shouldDiscard(guard, 'I painted something soft and blue for you.');
  assert.equal(reason, 'speaking', 'Should block during active TTS');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: transcript inside resume buffer (750 ms window) is discarded
// ─────────────────────────────────────────────────────────────────────────────
test('transcript inside resume buffer is discarded', () => {
  const guard = makeGuard();
  guard.isAssistantSpeaking = false;
  guard.resumeTimer = 42; // non-null = buffer active
  guard.lastAssistantSpokenText = 'Hello world.';
  guard.assistantSpeechEndedAt = Date.now() - 300; // 300 ms ago, within 750 ms

  const reason = shouldDiscard(guard, 'hello world');
  assert.equal(reason, 'resume_buffer');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: transcript immediately after speech that matches is discarded (substring)
// ─────────────────────────────────────────────────────────────────────────────
test('matching transcript within 3s after speech end is discarded as echo', () => {
  const guard = makeGuard();
  guard.isAssistantSpeaking = false;
  guard.resumeTimer = null;
  const endedAt = Date.now() - 500; // ended 500 ms ago, within 3 s window
  guard.assistantSpeechEndedAt = endedAt;
  guard.lastAssistantSpokenText = 'The archive holds every moment like water holds light.';

  const reason = shouldDiscard(guard, 'archive holds every moment like water holds light', endedAt + 500);
  assert.ok(reason, 'Should discard as echo');
  assert.ok(reason.startsWith('substring') || reason.startsWith('similarity'), `Reason: ${reason}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: real user transcript after delay is accepted
// ─────────────────────────────────────────────────────────────────────────────
test('unrelated user transcript after filter window is accepted', () => {
  const guard = makeGuard();
  guard.isAssistantSpeaking = false;
  guard.resumeTimer = null;
  const endedAt = Date.now() - 4000; // ended 4 s ago — outside 3 s window
  guard.assistantSpeechEndedAt = endedAt;
  guard.lastAssistantSpokenText = 'I painted something for you.';

  const reason = shouldDiscard(guard, 'What is the weather today?', endedAt + 4000);
  assert.equal(reason, null, 'Should pass through after filter window');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: unrelated user speech within 3s is not blocked
// ─────────────────────────────────────────────────────────────────────────────
test('unrelated user speech within 3s window is not blocked', () => {
  const guard = makeGuard();
  guard.isAssistantSpeaking = false;
  guard.resumeTimer = null;
  const endedAt = Date.now() - 1000;
  guard.assistantSpeechEndedAt = endedAt;
  guard.lastAssistantSpokenText = 'The archive holds every moment like water holds light.';

  const reason = shouldDiscard(guard, 'Can you help me fix a bug?', endedAt + 1000);
  assert.equal(reason, null, 'Unrelated speech should pass through');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: high-similarity transcript (>= 0.65) within 3s is discarded
// ─────────────────────────────────────────────────────────────────────────────
test('high-similarity transcript within 3s is discarded', () => {
  const guard = makeGuard();
  guard.isAssistantSpeaking = false;
  guard.resumeTimer = null;
  const endedAt = Date.now() - 800;
  guard.assistantSpeechEndedAt = endedAt;
  guard.lastAssistantSpokenText = 'I painted this for you, a soft blue landscape.';

  // Slight variation — same words mostly
  const sim = similarity('I painted this for you a soft blue landscape', 'I painted this for you, a soft blue landscape.');
  assert.ok(sim >= ECHO_GUARD_SIMILARITY_THRESHOLD, `Similarity ${sim} should be >= ${ECHO_GUARD_SIMILARITY_THRESHOLD}`);

  const reason = shouldDiscard(guard, 'I painted this for you a soft blue landscape', endedAt + 800);
  assert.ok(reason, 'Should discard as echo');
  assert.ok(reason.startsWith('similarity') || reason.startsWith('substring'), `Reason: ${reason}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: short transcript verbatim inside assistant response is discarded
// ─────────────────────────────────────────────────────────────────────────────
test('short transcript that is substring of assistant response is discarded', () => {
  const guard = makeGuard();
  guard.isAssistantSpeaking = false;
  guard.resumeTimer = null;
  const endedAt = Date.now() - 500;
  guard.assistantSpeechEndedAt = endedAt;
  guard.lastAssistantSpokenText = 'Truth is the foundation of everything I do. I never fabricate.';

  // 5 words, verbatim inside assistant text
  const reason = shouldDiscard(guard, 'truth is the foundation of', endedAt + 500);
  assert.ok(reason, 'Should discard short substring echo');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: long unrelated transcript over word limit is not blocked by short rule
// ─────────────────────────────────────────────────────────────────────────────
test('long unrelated transcript is not blocked by short-word rule', () => {
  const guard = makeGuard();
  guard.isAssistantSpeaking = false;
  guard.resumeTimer = null;
  const endedAt = Date.now() - 500;
  guard.assistantSpeechEndedAt = endedAt;
  guard.lastAssistantSpokenText = 'I painted something soft and luminous for you today.';

  // 10 words, clearly unrelated
  const longTranscript = 'Can you please explain how neural networks learn from data';
  const reason = shouldDiscard(guard, longTranscript, endedAt + 500);
  assert.equal(reason, null, 'Long unrelated transcript should not be blocked');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: similarity function works correctly
// ─────────────────────────────────────────────────────────────────────────────
test('similarity returns 1.0 for identical strings', () => {
  assert.equal(similarity('hello world', 'hello world'), 1.0);
});

test('similarity returns 0 for completely different strings', () => {
  assert.equal(similarity('cat dog fish', 'x y z'), 0);
});

test('similarity is symmetric', () => {
  const a = 'the quick brown fox';
  const b = 'the fox jumps high';
  assert.equal(similarity(a, b), similarity(b, a));
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: guard correctly resets — after filter window, nothing is blocked
// ─────────────────────────────────────────────────────────────────────────────
test('after filter window expires, even matching text is accepted', () => {
  const guard = makeGuard();
  guard.isAssistantSpeaking = false;
  guard.resumeTimer = null;
  const endedAt = Date.now() - 5000; // 5 s ago — well outside 3 s window
  guard.assistantSpeechEndedAt = endedAt;
  guard.lastAssistantSpokenText = 'I painted something soft and blue.';

  const reason = shouldDiscard(guard, 'I painted something soft and blue.', endedAt + 5000);
  assert.equal(reason, null, 'After filter window, even matching text passes through');
});
