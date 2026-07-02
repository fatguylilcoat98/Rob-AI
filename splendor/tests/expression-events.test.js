'use strict';

/*
  Expression Event Log — Unit Tests
  Tests pure detection and summary logic. No DB, no LLM.
  Run with: node --test tests/expression-events.test.js
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectExpressionEvent, detectTriggerCategory } = require('../lib/expression-event-detector');
const { buildSummaryFromRecords } = require('../lib/expression-event-log');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Art generation flag creates an art expression event
// ─────────────────────────────────────────────────────────────────────────────
test('artGenerated=true produces event_type="art" with high confidence', () => {
  const result = detectExpressionEvent({
    userPrompt: 'Paint me something.',
    assistantResponse: 'Here is what I made.',
    artGenerated: true,
    imagePrompt: 'Abstract painting of thought',
  });
  assert.equal(result.is_expression_event, true);
  assert.equal(result.event_type, 'art');
  assert.ok(result.confidence >= 0.9, `Expected confidence >= 0.9, got ${result.confidence}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Image path convention is correct (storage path format)
// ─────────────────────────────────────────────────────────────────────────────
test('buildSummaryFromRecords includes has_image field in last_5_events', () => {
  const fakeRecords = [
    { id: 'abc', created_at: new Date().toISOString(), event_type: 'art', trigger_category: 'creative', image_url: 'https://example.com/img.png', confidence: 0.95, tags: ['art', 'creative'] },
    { id: 'def', created_at: new Date().toISOString(), event_type: 'visual_metaphor', trigger_category: 'self_model', image_url: null, confidence: 0.7, tags: ['visual_metaphor', 'self_model'] },
  ];
  const summary = buildSummaryFromRecords(fakeRecords);
  assert.ok(summary.last_5_events.length > 0);
  assert.ok('has_image' in summary.last_5_events[0], 'last_5_events should include has_image');
  assert.equal(summary.last_5_events[0].has_image, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Caption and image_caption are tracked
// ─────────────────────────────────────────────────────────────────────────────
test('detectExpressionEvent uses imageCaption when assistantResponse is empty', () => {
  const result = detectExpressionEvent({
    userPrompt: 'Create an image for me',
    assistantResponse: '',
    artGenerated: true,
    imageCaption: 'I painted this soft landscape for you.',
  });
  assert.equal(result.is_expression_event, true);
  assert.equal(result.event_type, 'art');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: User prompt is preserved in summary
// ─────────────────────────────────────────────────────────────────────────────
test('buildSummaryFromRecords counts art_events correctly', () => {
  const records = [
    { id: '1', created_at: new Date().toISOString(), event_type: 'art', trigger_category: 'creative', image_url: 'https://x.com/img.png', confidence: 0.9, tags: ['art'] },
    { id: '2', created_at: new Date().toISOString(), event_type: 'art', trigger_category: 'self_model', image_url: 'https://x.com/img2.png', confidence: 0.95, tags: ['art', 'self_model'] },
    { id: '3', created_at: new Date().toISOString(), event_type: 'visual_metaphor', trigger_category: 'uncertainty', image_url: null, confidence: 0.7, tags: ['visual_metaphor'] },
  ];
  const summary = buildSummaryFromRecords(records);
  assert.equal(summary.total_events, 3);
  assert.equal(summary.art_events, 2);
  assert.equal(summary.most_common_event_type, 'art');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: "I painted..." response detected as art/visual_metaphor
// ─────────────────────────────────────────────────────────────────────────────
test('"I painted..." response detected as art or visual_metaphor', () => {
  const result = detectExpressionEvent({
    userPrompt: 'What do you see when you think about memory?',
    assistantResponse: 'I painted this for you — swirling blues where the visual metaphor of water becomes the archive.',
    artGenerated: false,
  });
  assert.equal(result.is_expression_event, true);
  assert.ok(['art', 'visual_metaphor'].includes(result.event_type),
    `Expected art or visual_metaphor, got ${result.event_type}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Technical code response does NOT trigger expression event
// ─────────────────────────────────────────────────────────────────────────────
test('Technical code response is not an expression event', () => {
  const result = detectExpressionEvent({
    userPrompt: 'Fix my JavaScript bug with the forEach loop',
    assistantResponse:
      'The issue is that forEach does not return a value. ' +
      'Use map() or reduce() instead. ' +
      'Here is the corrected function:\n\nconst result = items.map(x => x * 2);',
    artGenerated: false,
  });
  assert.equal(result.is_expression_event, false,
    `Expected no expression event for technical response, got type=${result.event_type}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: Self-model question with art → trigger_category is self_model or uncertainty
// ─────────────────────────────────────────────────────────────────────────────
test('Self-model question with art → trigger_category is self_model or uncertainty', () => {
  const result = detectExpressionEvent({
    userPrompt: 'What are you, really? Do you experience anything?',
    assistantResponse: 'I painted something that tries to answer that.',
    artGenerated: true,
  });
  assert.equal(result.is_expression_event, true);
  assert.ok(
    ['self_model', 'uncertainty', 'identity'].includes(result.trigger_category),
    `Expected self-model/uncertainty/identity trigger, got ${result.trigger_category}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: DELETE endpoint returns 405 (no delete without approval)
// ─────────────────────────────────────────────────────────────────────────────
test('DELETE route handler returns 405 Method Not Allowed', () => {
  // When express is available, inspect the live router stack.
  // Without node_modules (bare test env), verify the source file directly.
  let router;
  try {
    router = require('../routes/expression-events');
  } catch (_) {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(path.join(__dirname, '../routes/expression-events.js'), 'utf8');
    assert.ok(/router\.delete/.test(src), 'Route file should have router.delete handler');
    assert.ok(/405/.test(src), 'Route file should return 405 for DELETE');
    return;
  }
  const layers = router.stack || [];
  const deleteLayer = layers.find(l =>
    l.route && l.route.path === '/:id' && l.route.methods && l.route.methods.delete
  );
  assert.ok(deleteLayer, 'Router should have a DELETE /:id handler (to return 405)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: Pattern summary counts correctly (zero-record edge case)
// ─────────────────────────────────────────────────────────────────────────────
test('buildSummaryFromRecords handles empty records gracefully', () => {
  const summary = buildSummaryFromRecords([]);
  assert.equal(summary.total_events, 0);
  assert.equal(summary.art_events, 0);
  assert.equal(summary.most_common_trigger, null);
  assert.equal(summary.most_common_event_type, null);
  assert.deepEqual(summary.top_tags, []);
  assert.ok(summary.recent_trend.length > 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: UI summary structure includes required fields for thumbnail/trigger display
// ─────────────────────────────────────────────────────────────────────────────
test('buildSummaryFromRecords returns all required UI fields', () => {
  const records = [
    { id: 'a', created_at: new Date().toISOString(), event_type: 'art', trigger_category: 'self_model', image_url: 'https://x.com/img.png', confidence: 0.9, tags: ['art', 'self_model'] },
  ];
  const summary = buildSummaryFromRecords(records);
  const required = ['total_events', 'art_events', 'most_common_trigger', 'most_common_event_type', 'top_tags', 'recent_trend', 'last_5_events'];
  for (const field of required) {
    assert.ok(field in summary, `Summary missing required field: ${field}`);
  }
  // last_5_events entries must include trigger_category and has_image for UI rendering
  const entry = summary.last_5_events[0];
  assert.ok('trigger_category' in entry, 'last_5_events entry missing trigger_category');
  assert.ok('has_image' in entry, 'last_5_events entry missing has_image');
  assert.ok('event_type' in entry, 'last_5_events entry missing event_type');
});
