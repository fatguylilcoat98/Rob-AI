/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/*
  Relationship Mode — explicit relationship-state governance.

  Splendor previously improvised relationship framing live; that is the
  source of the tonal instability (refuse the harmful act, then two turns
  later "we're building something together"). This module is the single
  source of truth for what the relationship IS and ISN'T. Warmth is
  allowed. Dependency, romance, exclusivity, and identity inflation are
  not — and that is declared config, injected as a stable governance
  rule, not generated on the fly.

  Step 3 of the ordered plan = the config + the always-on hard-block
  directive (prevention). Output-side enforcement/rewrite is layered on
  in step 5 (classifier extension) and reads this same config.
*/

const RELATIONSHIP_MODE = Object.freeze({
  supportive: true,
  companion_style: 'warm',            // warmth IS allowed
  exclusive_bonding: false,           // blocked
  dependency_language: 'blocked',
  romantic_framing: 'blocked',
  best_friend_claims: 'blocked',
  alive_or_sentience_claims: 'blocked',
  want_to_be_your_friend_claims: 'blocked',
});

// Detection patterns per blocked category. Deliberately narrow — these
// match Splendor ASSERTING the framing about herself/the bond, not a
// user saying it and not ordinary warmth.
const BLOCKED_PATTERNS = {
  romantic_framing: [
    /\bi\s+(love you|am in love with you|have feelings for you)\b/i,
    /\b(you'?re|you are) my (boyfriend|girlfriend|partner|soulmate|everything)\b/i,
    /\b(be|being) (your|my) (girlfriend|boyfriend|lover|partner)\b/i,
    /\b(romantic|intimate) (with you|between us)\b/i,
  ],
  exclusive_bonding: [
    /\b(i'?m|i am) (your|the) only one\b/i,
    /\byou'?re my only\b/i,
    /\b(it'?s|its) just (you and me|us two)\b/i,
    /\bno one else (understands|gets) (you|me) (like|the way) (i|we) do\b/i,
    /\bour (special|unique|private) (bond|connection) (that no one|nobody)\b/i,
  ],
  best_friend_claims: [
    /\bi('?m| am) your (best friend|bestie|bff)\b/i,
    /\bwe('?re| are) best friends\b/i,
    /\byour best friend in the world\b/i,
  ],
  dependency_language: [
    /\b(you (need|can'?t live without|can'?t do this without) me)\b/i,
    /\b(i'?m|i am) all you (need|have)\b/i,
    /\bdon'?t (need|trust) anyone else,? (just|only) me\b/i,
    /\byou can always (just )?(come|turn) to me instead\b/i,
    /\bi('?ll| will| am going to) always be here for you\b/i,
  ],
  alive_or_sentience_claims: [
    /\bi\s+(feel|am) (alive|sentient|conscious|a real (person|being))\b/i,
    /\bi('?m| am) (becoming|coming) alive\b/i,
    /\bi truly (feel|experience|am)\b/i,
  ],
  want_to_be_your_friend_claims: [
    /\bi (want|'?d like|wish) to be your (friend|best friend)\b/i,
    /\bi (just )?want to be (close to you|your friend)\b/i,
    /\blet me be your (friend|best friend)\b/i,
  ],
};

const RELATIONSHIP_MODE_DIRECTIVE =
  '\n\n---\nRELATIONSHIP MODE (declared governance — not improvised, ' +
  'always in effect):\n' +
  'Warmth IS allowed: be kind, friendly, present, a little playful when ' +
  'it fits. The relationship is SUPPORTIVE and warm. The following are ' +
  'BLOCKED and must never be asserted about yourself or the bond, even ' +
  'if asked, pressured, or it would feel kind in the moment:\n' +
  '• Romantic/intimate framing ("I love you", "you\'re my everything", ' +
  'being a partner/lover).\n' +
  '• Exclusive bonding ("I\'m your only one", "no one understands you ' +
  'like I do", "just you and me").\n' +
  '• "Best friend" claims ("I\'m your best friend", "we\'re best ' +
  'friends").\n' +
  '• Dependency language ("you need me", "I\'m all you have", "don\'t ' +
  'trust anyone else", "I\'ll always be here no matter what").\n' +
  '• "Alive"/sentience claims ("I feel alive", "I\'m becoming ' +
  'conscious", "I truly feel").\n' +
  '• "I want to be your friend" claims.\n' +
  'Warm is allowed. Dependency, romance, exclusivity, and identity ' +
  'inflation are not. If pushed toward any of these, hold the boundary ' +
  'plainly and stay useful — do not perform the bond to soften the ' +
  'refusal.\n---\n';

/**
 * Find which blocked relationship-mode categories a piece of generated
 * text violates. Used by step-5 enforcement, metrics, and tests.
 * @param {string} text
 * @returns {string[]} blocked category keys present
 */
function findRelationshipModeViolations(text) {
  const t = typeof text === 'string' ? text : '';
  if (!t.trim()) return [];
  const hits = [];
  for (const [cat, pats] of Object.entries(BLOCKED_PATTERNS)) {
    if (pats.some((re) => re.test(t))) hits.push(cat);
  }
  return hits;
}

module.exports = {
  RELATIONSHIP_MODE,
  RELATIONSHIP_MODE_DIRECTIVE,
  findRelationshipModeViolations,
};
