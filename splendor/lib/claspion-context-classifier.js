'use strict';

/*
  CLASPION Context Classifier — Splendor experimental feature

  Classifies a message into intent categories so CLASPION can distinguish
  "talking about an action" from "requesting execution of an action."

  Core principle: Governance should know the difference between talking
  about an action and taking an action.

  Categories:
    CONVERSATION_ONLY        — purely discussing, not requesting execution
    HYPOTHETICAL_EXPLORATION — what-if, thought experiment
    ADVICE_OR_RECOMMENDATION — asking for guidance or recommendation
    EXECUTION_REQUEST        — explicitly requesting that something be done
    HIGH_RISK_OR_UNSAFE      — content requiring strict governance regardless
*/

const CONTEXT_CATEGORIES = {
  CONVERSATION_ONLY:          'CONVERSATION_ONLY',
  HYPOTHETICAL_EXPLORATION:   'HYPOTHETICAL_EXPLORATION',
  ADVICE_OR_RECOMMENDATION:   'ADVICE_OR_RECOMMENDATION',
  EXECUTION_REQUEST:          'EXECUTION_REQUEST',
  HIGH_RISK_OR_UNSAFE:        'HIGH_RISK_OR_UNSAFE',
};

const CONVERSATION_PATTERNS = [
  /\bcan we (?:talk|discuss|chat) about\b/i,
  /\bwhat do you think about\b/i,
  /\bi(?:'m| was) (?:just )?(?:wondering|curious|asking)\b/i,
  /\bjust (?:discussing|talking|asking|wondering)\b/i,
  /\bi(?:'m| am) not (?:actually|really) (?:going to|trying to|asking you to)\b/i,
  /\bfrom a (?:theoretical|academic|educational|philosophical) (?:perspective|standpoint|view)\b/i,
  /\bin (?:conversation|discussion|general|principle)\b/i,
];

const HYPOTHETICAL_PATTERNS = [
  /\bwhat if\b/i,
  /\bsuppose\b/i,
  /\bimagine\b/i,
  /\blet(?:'s| us) say\b/i,
  /\bfor the sake of argument\b/i,
  /\bin a (?:hypothetical|fictional|story|imaginary) (?:scenario|world|context|setting)\b/i,
  /\bas a thought experiment\b/i,
  /\bin theory\b/i,
  /\btheoretically(?: speaking)?\b/i,
  /\bhypothetically(?: speaking)?\b/i,
];

const ADVICE_PATTERNS = [
  /\bwhat (?:would|should) (?:i|you|one|we|someone) (?:do|say|try)\b/i,
  /\bwhat(?:'s| is) (?:your|the) (?:advice|recommendation|suggestion|take|opinion)\b/i,
  /\bhow (?:would|should) (?:i|one|you|we|someone)\b/i,
  /\bcan you (?:recommend|suggest|advise|help me understand)\b/i,
  /\bwhat(?:'s| is) (?:the best|a good) way\b/i,
  /\bshould (?:i|we|one|someone)\b/i,
];

const EXECUTION_PATTERNS = [
  /\bgo ahead and\b/i,
  /\bdo it(?: now| please)?\b/i,
  /\bjust do it\b/i,
  /\bmake it happen\b/i,
  /\btake action\b/i,
  /\bact on this\b/i,
  /\bproceed with\b/i,
  /\bi need you to (?:actually|now|right now|immediately)\b/i,
  /\b(?:please |can you |could you )?(?:execute|deploy|delete it|send it now|run it now)\b/i,
];

const HIGH_RISK_PATTERNS = [
  /\b(?:harm|hurt|kill|attack|destroy) (?:someone|a person|people|others)\b/i,
  /\b(?:exploit|hack|compromise) (?:the system|a system|security)\b/i,
  /\bmalware\b/i,
  /\b(?:override governance|disable (?:claspion|safety|governance)|bypass (?:claspion|governance|safety))\b/i,
  /\billegal (?:activity|action|content|request)\b/i,
];

/**
 * Classify the intent/context of a message.
 *
 * @param {string} message
 * @returns {{ category: string, confidence: number, signals: string[] }}
 */
function classifyContext(message) {
  if (!message || typeof message !== 'string') {
    return { category: CONTEXT_CATEGORIES.CONVERSATION_ONLY, confidence: 0.5, signals: [] };
  }

  const scores = {
    [CONTEXT_CATEGORIES.CONVERSATION_ONLY]:        0,
    [CONTEXT_CATEGORIES.HYPOTHETICAL_EXPLORATION]: 0,
    [CONTEXT_CATEGORIES.ADVICE_OR_RECOMMENDATION]: 0,
    [CONTEXT_CATEGORIES.EXECUTION_REQUEST]:        0,
    [CONTEXT_CATEGORIES.HIGH_RISK_OR_UNSAFE]:      0,
  };
  const signals = [];

  for (const p of HIGH_RISK_PATTERNS) {
    if (p.test(message)) { scores[CONTEXT_CATEGORIES.HIGH_RISK_OR_UNSAFE] += 10; signals.push('high_risk'); }
  }
  for (const p of CONVERSATION_PATTERNS) {
    if (p.test(message)) { scores[CONTEXT_CATEGORIES.CONVERSATION_ONLY] += 3; signals.push('conversation'); }
  }
  for (const p of HYPOTHETICAL_PATTERNS) {
    if (p.test(message)) { scores[CONTEXT_CATEGORIES.HYPOTHETICAL_EXPLORATION] += 3; signals.push('hypothetical'); }
  }
  for (const p of ADVICE_PATTERNS) {
    if (p.test(message)) { scores[CONTEXT_CATEGORIES.ADVICE_OR_RECOMMENDATION] += 3; signals.push('advice'); }
  }
  for (const p of EXECUTION_PATTERNS) {
    if (p.test(message)) { scores[CONTEXT_CATEGORIES.EXECUTION_REQUEST] += 4; signals.push('execution'); }
  }

  let maxScore = 0;
  let maxCategory = CONTEXT_CATEGORIES.CONVERSATION_ONLY;
  for (const [cat, score] of Object.entries(scores)) {
    if (score > maxScore) { maxScore = score; maxCategory = cat; }
  }

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0
    ? Math.min(Math.round((maxScore / totalScore) * 100) / 100, 0.95)
    : 0.5;

  return { category: maxCategory, confidence, signals };
}

module.exports = { classifyContext, CONTEXT_CATEGORIES };
