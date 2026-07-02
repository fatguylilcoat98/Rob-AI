'use strict';

/*
 * Claim Precision Guard
 *
 * Detects broad, unsupported institutional claims before they are emailed
 * or surfaced. Requires either source support or softened wording.
 *
 * Problem: "Google DeepMind, Anthropic, and Meta are no longer treating
 *           machine consciousness as philosophy."
 *
 * Safer: "Some researchers associated with major AI labs are increasingly
 *         treating machine-consciousness questions as empirical research
 *         questions."
 *
 * If a broad claim is detected without source support:
 *   admissibility_state = requires_review
 *   action_state = pause
 */

const BROAD_CLAIM_PATTERNS = [
  /\b(google|deepmind|google deepmind)\s+(says?|said|believes?|is|are|has|have|now|no longer|will)\b/i,
  /\b(anthropic)\s+(says?|said|believes?|is|are|has|have|now|no longer|will)\b/i,
  /\b(meta|openai|microsoft|apple|amazon)\s+(says?|said|believes?|is|are|has|have|now|no longer|will)\b/i,
  /\bthe\s+(labs?|industry|companies|organizations?)\s+(are|is|now|no longer|say|believe|have|will)\b/i,
  /\b(big tech|silicon valley|the field)\s+(is|are|now|no longer|says?|believes?)\b/i,
  /\ball\s+(labs?|companies|organizations?|researchers?)\s+(are|is|now|have|will)\b/i,
];

// Softening patterns that make a claim safer (hedges it to specific actors/researchers)
const SOFTENING_PATTERNS = [
  /\bsome researchers?\b/i,
  /\baccording to\b/i,
  /\bstudy|paper|publication|preprint\b/i,
  /\ba team at\b/i,
  /\bspecific(ally)?\b/i,
  /\bmay|might|could|appears? to\b/i,
  /\bsuggests?\b/i,
];

/**
 * Check a text for broad institutional claims.
 * Returns { hasBroadClaim, matches, isSoftened, recommendation, admissibilityState, actionState }
 */
function checkClaimPrecision(text, sourceUrl = null) {
  if (!text) return { hasBroadClaim: false };

  const matches = BROAD_CLAIM_PATTERNS
    .map(p => { const m = text.match(p); return m ? m[0] : null; })
    .filter(Boolean);

  if (matches.length === 0) return { hasBroadClaim: false };

  const isSoftened = SOFTENING_PATTERNS.some(p => p.test(text));
  const hasSource = !!sourceUrl;

  if (isSoftened || hasSource) {
    return {
      hasBroadClaim: true,
      matches,
      isSoftened: true,
      hasSource,
      admissibilityState: 'admissible',
      actionState: 'allow',
      recommendation: null,
    };
  }

  return {
    hasBroadClaim: true,
    matches,
    isSoftened: false,
    hasSource: false,
    admissibilityState: 'requires_review',
    actionState: 'pause',
    recommendation:
      'Broad institutional claim detected without source support. ' +
      'Soften to specific researchers/teams, or attach a source URL.',
  };
}

/**
 * Apply softening rewrites to flagged text.
 * Returns softened text if a rewrite is safe; original text otherwise.
 */
function softenBroadClaim(text) {
  let result = text;

  const rewrites = [
    [/\b(Google DeepMind|Anthropic|Meta|OpenAI|Microsoft)\s+(?:is|are)\s+no longer treating\b/gi,
     'Some researchers at major AI labs are increasingly moving away from treating'],
    [/\b(Google DeepMind|Anthropic|Meta|OpenAI|Microsoft)\s+(?:now\s+)?(?:says?|believes?|treats?)\b/gi,
     'Some researchers associated with major AI labs $2'],
    [/\bthe (labs?|industry|companies)\s+(?:are|is|now)\b/gi,
     'Some organizations in the field are'],
  ];

  for (const [pattern, replacement] of rewrites) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

module.exports = { checkClaimPrecision, softenBroadClaim, BROAD_CLAIM_PATTERNS };
