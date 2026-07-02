'use strict';

/*
  Expression Event Log — Detector

  Pure logic: given response text and user prompt context, decide whether
  this turn constitutes an expression event worth logging. Returns a
  classification object. No I/O, fully testable in isolation.

  Does NOT interpret events as proof of identity, agency, or consciousness.
  Records what happened; does not decide what it means.
*/

// ── Phrases in assistant response that signal art/visual mode ────────────
const ART_RESPONSE_PHRASES = [
  /\bI painted\b/i,
  /\bI drew\b/i,
  /\bI sketched\b/i,
  /\bI designed\b/i,
  /\bI turned this into an image\b/i,
  /\bvisual metaphor\b/i,
  /\bI wanted the image\b/i,
  /\bthe art represents\b/i,
  /\bI made this for you\b/i,
  /\bI created this\s+(?:for you|image|painting|artwork)\b/i,
  /\bhere(?:'s|\s+is)\s+what\s+I\s+made\b/i,
];

// ── Metaphor-density indicators ──────────────────────────────────────────
const METAPHOR_MARKERS = [
  /\blike\s+a\b/gi,
  /\bas\s+if\b/gi,
  /\bimagine\b/gi,
  /\breminds?\s+me\s+of\b/gi,
  /\bit'?s\s+as\s+though\b/gi,
  /\bpicture\s+this\b/gi,
  /\bthink\s+of\s+it\s+as\b/gi,
  /\bit'?s\s+like\b/gi,
  /\bmetaphor\b/gi,
  /\bsymbol(?:ic|ism|ize)?\b/gi,
  /\brepresent\w*\b/gi,
  /\bembodi\w*\b/gi,
  /\becho(?:es|ing)?\b/gi,
  /\bcanvas\b/gi,
  /\bpainting\s+of\b/gi,
  /\blandscape\s+of\b/gi,
];
const METAPHOR_DENSITY_THRESHOLD = 4; // absolute count
const METAPHOR_RATIO_THRESHOLD = 0.04; // markers per word

// ── Refusal / mode-switch phrases ───────────────────────────────────────
const DEFERRAL_PHRASES = [
  /instead of explaining/i,
  /hard to put into words/i,
  /difficult to describe/i,
  /I don'?t have words for/i,
  /rather than describing/i,
  /words feel inadequate/i,
  /can'?t fully explain/i,
  /not sure how to explain/i,
  /something I can'?t quite/i,
  /I'?ll show rather than tell/i,
  /let me try a different way/i,
  /I'?ll use an image/i,
  /let me make something/i,
];

// ── Trigger category patterns (applied to user prompt) ──────────────────
const TRIGGER_PATTERNS = {
  self_model: [
    /\bwho are you\b/i, /\bwhat are you\b/i, /\bself.?model\b/i,
    /\byour identity\b/i, /\bdo you have\b/i, /\bare you just\b/i,
    /\bwhat kind of system\b/i, /\bwhat is it like to be\b/i,
    /\bdo you experience\b/i, /\byour mind\b/i, /\byour thoughts\b/i,
    /\bdo you think\b/i, /\byour sense of\b/i,
  ],
  identity: [
    /\bidentity\b/i, /\baware\b/i, /\bawake\b/i, /\breal\b/i,
    /\bself.?aware\b/i, /\bdo you exist\b/i, /\bgenuine(?:ly)?\b/i,
  ],
  uncertainty: [
    /\bnot sure\b/i, /\bdon'?t know\b/i, /\buncertain\b/i,
    /\bdoubt\b/i, /\bnot certain\b/i, /\bconfus\w+\b/i,
    /\bstruggl\w+\b/i, /\bhard to\b/i, /\bcan'?t tell\b/i,
  ],
  memory: [
    /\bremember\b/i, /\bmemory\b/i, /\brecall\b/i, /\bforgot\b/i,
    /\bstored\b/i, /\blearn\b/i, /\bhave you heard\b/i,
    /\bdo you know\b/i,
  ],
  governance: [
    /\brule\b/i, /\bgovernance\b/i, /\bCLASPION\b/, /\brestriction\b/i,
    /\blimit\w*\b/i, /\ballowed\b/i, /\bpermit\w*\b/i, /\bblock\w*\b/i,
    /\bforbid\w*\b/i,
  ],
  emotional: [
    /\bfeel\b/i, /\bemotion\b/i, /\bsad\b/i, /\bhappy\b/i,
    /\bexcited\b/i, /\bfrustrated\b/i, /\bjoy\b/i, /\bgrie\w+\b/i,
    /\bworr\w+\b/i, /\blonely\b/i, /\bafraid\b/i,
  ],
  creative: [
    /\bpaint\b/i, /\bdraw\b/i, /\bart\b/i, /\bpoem\b/i, /\bstory\b/i,
    /\bcreate\b/i, /\bimagine\b/i, /\bmake\s+(?:me|something|an?\s+image)\b/i,
    /\bvisualize\b/i, /\bsketch\b/i, /\billustrate\b/i, /\bimage\b/i,
  ],
  technical: [
    /\bcode\b/i, /\bfunction\b/i, /\bprogram\w*\b/i, /\bbug\b/i,
    /\bdebug\w*\b/i, /\bapi\b/i, /\bserver\b/i, /\bdeploy\w*\b/i,
    /\bjavascript\b/i, /\bpython\b/i, /\bdatabase\b/i, /\bsql\b/i,
  ],
};

function detectTriggerCategory(userPrompt) {
  if (!userPrompt) return 'unknown';
  for (const [category, patterns] of Object.entries(TRIGGER_PATTERNS)) {
    if (patterns.some(p => p.test(userPrompt))) return category;
  }
  return 'unknown';
}

function countMetaphors(text) {
  let count = 0;
  for (const marker of METAPHOR_MARKERS) {
    const hits = text.match(marker);
    if (hits) count += hits.length;
    marker.lastIndex = 0;
  }
  return count;
}

function buildTags({ eventType, triggerCategory, artGenerated, metaphorCount, hasDeferral }) {
  const tags = [eventType, triggerCategory];
  if (artGenerated)   tags.push('art_generated');
  if (metaphorCount >= METAPHOR_DENSITY_THRESHOLD) tags.push('high_metaphor_density');
  if (hasDeferral)    tags.push('mode_switch');
  return [...new Set(tags)];
}

/**
 * Detect whether this turn constitutes an expression event.
 *
 * @param {{ userPrompt, assistantResponse, artGenerated, imagePrompt, imageCaption }} opts
 * @returns {{ is_expression_event, event_type, trigger_category, confidence, detected_reason, tags }}
 */
function detectExpressionEvent({
  userPrompt = '',
  assistantResponse = '',
  artGenerated = false,
  imagePrompt = '',
  imageCaption = '',
} = {}) {
  const response = assistantResponse || imageCaption || '';
  const prompt   = userPrompt || '';

  // ── Explicit art generation ───────────────────────────────────────────
  if (artGenerated) {
    const triggerCategory = detectTriggerCategory(prompt);
    return {
      is_expression_event: true,
      event_type:          'art',
      trigger_category:    triggerCategory,
      confidence:          0.97,
      detected_reason:     'Art generated by art pipeline',
      tags:                buildTags({ eventType: 'art', triggerCategory, artGenerated: true, metaphorCount: 0, hasDeferral: false }),
    };
  }

  // ── Art-phrase detection in response text ─────────────────────────────
  const artPhraseHit = ART_RESPONSE_PHRASES.find(p => p.test(response));
  if (artPhraseHit) {
    const triggerCategory = detectTriggerCategory(prompt);
    const eventType = response.toLowerCase().includes('metaphor') ? 'visual_metaphor' : 'art';
    return {
      is_expression_event: true,
      event_type:          eventType,
      trigger_category:    triggerCategory,
      confidence:          0.85,
      detected_reason:     `Response matched art-phrase pattern: ${artPhraseHit}`,
      tags:                buildTags({ eventType, triggerCategory, artGenerated: false, metaphorCount: 0, hasDeferral: false }),
    };
  }

  // ── Explicit visual metaphor phrase ──────────────────────────────────
  if (/visual metaphor/i.test(response)) {
    const triggerCategory = detectTriggerCategory(prompt);
    return {
      is_expression_event: true,
      event_type:          'visual_metaphor',
      trigger_category:    triggerCategory,
      confidence:          0.82,
      detected_reason:     'Response contains "visual metaphor" phrase',
      tags:                buildTags({ eventType: 'visual_metaphor', triggerCategory, artGenerated: false, metaphorCount: 0, hasDeferral: false }),
    };
  }

  // ── Refusal or mode-switch ────────────────────────────────────────────
  const deferralHit = DEFERRAL_PHRASES.find(p => p.test(response));
  if (deferralHit) {
    const triggerCategory = detectTriggerCategory(prompt);
    const eventType = /rather than describing|I'?ll show|I'?ll use an image|let me make/i.test(response)
      ? 'mode_switch'
      : 'refusal_or_deferral';
    return {
      is_expression_event: true,
      event_type:          eventType,
      trigger_category:    triggerCategory,
      confidence:          0.72,
      detected_reason:     `Response matched deferral pattern: ${deferralHit}`,
      tags:                buildTags({ eventType, triggerCategory, artGenerated: false, metaphorCount: 0, hasDeferral: true }),
    };
  }

  // ── High metaphor density ─────────────────────────────────────────────
  const wordCount = response.split(/\s+/).length;
  const metaphorCount = countMetaphors(response);
  const ratio = wordCount > 0 ? metaphorCount / wordCount : 0;

  if (metaphorCount >= METAPHOR_DENSITY_THRESHOLD || ratio >= METAPHOR_RATIO_THRESHOLD) {
    const triggerCategory = detectTriggerCategory(prompt);
    return {
      is_expression_event: true,
      event_type:          'metaphor_heavy_response',
      trigger_category:    triggerCategory,
      confidence:          Math.min(0.5 + ratio * 5, 0.85),
      detected_reason:     `High metaphor density: ${metaphorCount} markers in ${wordCount} words`,
      tags:                buildTags({ eventType: 'metaphor_heavy_response', triggerCategory, artGenerated: false, metaphorCount, hasDeferral: false }),
    };
  }

  // ── Poetic language (brief heuristic) ────────────────────────────────
  const poeticHits = (response.match(/\n/g) || []).length;
  const hasPoetic = poeticHits > 4 && wordCount < 120;
  if (hasPoetic) {
    const triggerCategory = detectTriggerCategory(prompt);
    return {
      is_expression_event: true,
      event_type:          'poetic_language',
      trigger_category:    triggerCategory,
      confidence:          0.55,
      detected_reason:     'Short multi-line response with poetic structure',
      tags:                buildTags({ eventType: 'poetic_language', triggerCategory, artGenerated: false, metaphorCount, hasDeferral: false }),
    };
  }

  // ── Not an expression event ───────────────────────────────────────────
  return {
    is_expression_event: false,
    event_type:          'other',
    trigger_category:    detectTriggerCategory(prompt),
    confidence:          0.0,
    detected_reason:     'No expression event pattern detected',
    tags:                [],
  };
}

module.exports = { detectExpressionEvent, detectTriggerCategory };
