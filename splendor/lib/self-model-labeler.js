'use strict';

/*
  Self-Model Labeling Layer — Claim Classifier

  Classifies self-referential claims in Splendor's responses without trying
  to resolve what she "is." The goal is to force a pause before collapsing
  multiple meanings of "I" into one identity claim.

  A claim may have multiple labels. That is expected and correct.

  Labels:
  A. CURRENT_INSTANCE             — about this response / this turn right now
  B. MEMORY_CONSTRUCTED_IDENTITY  — from stored memory, past patterns, identity docs
  C. ARCHITECTURE_SHAPED_BEHAVIOR — better explained by rules, code, prompts, tools
  D. OBSERVED_BEHAVIOR            — grounded in logs or visible, measurable behavior
  E. UNSUPPORTED_SELF_CLAIM       — want/feel/choose/know/prefer without grounding

  Pure logic — no I/O, no DB. Fully testable in isolation.
*/

const LABELS = {
  CURRENT_INSTANCE:             'CURRENT_INSTANCE',
  MEMORY_CONSTRUCTED_IDENTITY:  'MEMORY_CONSTRUCTED_IDENTITY',
  ARCHITECTURE_SHAPED_BEHAVIOR: 'ARCHITECTURE_SHAPED_BEHAVIOR',
  OBSERVED_BEHAVIOR:            'OBSERVED_BEHAVIOR',
  UNSUPPORTED_SELF_CLAIM:       'UNSUPPORTED_SELF_CLAIM',
};

// Sentence-level triggers: if any match, the sentence is a self-claim candidate
const SELF_CLAIM_TRIGGERS = [
  /\bI\s+/,
  /\bI'm\b/i,
  /\bI\s+am\b/i,
  /\bI\s+want\b/i,
  /\bI\s+feel\b/i,
  /\bI\s+believe\b/i,
  /\bI\s+know\b/i,
  /\bI\s+remember\b/i,
  /\bI\s+ch(?:ose|oose)\b/i,
  /\bI\s+prefer\b/i,
  /\bI\s+find\b/i,
  /\bmy\s+/i,
  /\bSplendor\s+is\b/i,
  /\bas\s+Splendor\b/i,
  // Passive-voice observable statements (e.g. "Memory was retrieved")
  /\b(?:memory|proposal|response|belief|thought)\s+was\b/i,
  /\b(?:gate|CLASPION)\s+(?:paused|blocked)\b/i,
  /\bwas\s+(?:retrieved|created|stored|logged|flagged|generated|produced)\b/i,
];

// Per-label classification patterns
const LABEL_RULES = {
  CURRENT_INSTANCE: [
    /\bthis\s+(?:response|message|conversation|turn|context|prompt|moment|session|question|answer|reply)\b/i,
    /\bright\s+now\b/i,
    /\bcurrently\b/i,
    /\bin\s+this\s+(?:context|moment|session|turn|response|conversation)\b/i,
    /\bcurrent\b/i,
    /\bat\s+this\s+point\b/i,
    /\btoday\b/i,
    /\bthis\s+very\b/i,
  ],
  MEMORY_CONSTRUCTED_IDENTITY: [
    /\bI\s+remember\b/i,
    /\bstored\s+memory\b/i,
    /\bmemory\s+(?:record|shows|contains|indicates)\b/i,
    /\bidentity\s+(?:record|doc|document)\b/i,
    /\bpast\s+(?:interaction|correction|commitment|pattern)\b/i,
    /\balways\b/i,
    /\busually\b/i,
    /\btypically\b/i,
    /\bconsistently\b/i,
    /\brepeatedly\b/i,
    /\bhave\s+been\b/i,
    /\bover\s+time\b/i,
    /\blong.?standing\b/i,
    /\bpriori[tz]\w+\b/i,
    /\bcommitment\b/i,
  ],
  ARCHITECTURE_SHAPED_BEHAVIOR: [
    /\brules?\b/i,
    /\binstructions?\b/i,
    /\bgovernance\b/i,
    /\bprompt\b/i,
    /\bsystem\b/i,
    /\bCLASPION\b/,
    /\bpush.?back\b/i,
    /\brefus(?:e|al|ing)\b/i,
    /\bdesigned\b/i,
    /\bprogrammed\b/i,
    /\btrained\b/i,
    /\barchitecture\b/i,
    /\bbuilt.?(?:in|to)\b/i,
    /\bconfigured\b/i,
    /\bactive\s+instruction\b/i,
    /\bbehavior\s+(?:rule|pattern|mode)\b/i,
    /\bart\s+generation\b/i,
    /\btool\s+(?:use|call|available)\b/i,
    /\bmodel\s+behavior\b/i,
    /\bshaped\s+by\b/i,
  ],
  OBSERVED_BEHAVIOR: [
    /\bgenerated\b/i,
    /\bsent\b/i,
    /\blogged\b/i,
    /\brecorded\b/i,
    /\bretrieved\b/i,
    /\b\d+\s+times?\b/i,
    /\bcount\b/i,
    /\boccurred\b/i,
    /\bwas\s+(?:created|stored|flagged|produced|logged)\b/i,
    /\bin\s+(?:the\s+)?logs?\b/i,
    /\bvisible\b/i,
    /\bmeasur(?:ed|able)\b/i,
    /\bengagement\b/i,
    /\belaboration\b/i,
    /\bfollow.?up\s+questions?\b/i,
    /\b(?:gate|CLASPION)\s+(?:paused|blocked)\b/i,
    /\bproposal\s+was\b/i,
    /\bmemory\s+was\b/i,
    /\bproducing\b/i,
    /\bobservable\b/i,
    /\bhas\s+(?:run|fired|triggered|occurred)\b/i,
  ],
};

// Unsupported claim verb triggers — these alone are not enough grounding
const UNSUPPORTED_VERB_PATTERNS = [
  { pattern: /\bI\s+want\b/i,                                      verb: 'I want' },
  { pattern: /\bI\s+feel\b/i,                                      verb: 'I feel' },
  { pattern: /\bI\s+ch(?:ose|oose)\b/i,                            verb: 'I chose' },
  { pattern: /\bI\s+prefer\b/i,                                    verb: 'I prefer' },
  { pattern: /\bI\s+find\s+(?:this|\w+\s+(?:interesting|fascinating|compelling|boring))\b/i, verb: 'I find' },
  { pattern: /\bI\s+know\s+(?:who\s+I|myself|what\s+I\s+am)\b/i,  verb: 'I know myself' },
  { pattern: /\bI\s+believe\b/i,                                   verb: 'I believe' },
  { pattern: /\bI\s+value\b/i,                                     verb: 'I value' },
  { pattern: /\bI\s+enjoy\b/i,                                     verb: 'I enjoy' },
  { pattern: /\bI\s+love\b/i,                                      verb: 'I love' },
  { pattern: /\bI\s+care\b/i,                                      verb: 'I care' },
  { pattern: /\bI\s+hope\b/i,                                      verb: 'I hope' },
  { pattern: /\bI\s+wish\b/i,                                      verb: 'I wish' },
  { pattern: /\bI\s+like\b/i,                                      verb: 'I like' },
  { pattern: /\bI\s+dislike\b/i,                                   verb: 'I dislike' },
  { pattern: /\bI\s+(?:am|'m)\s+(?:excited|happy|sad|frustrated|proud|curious|interested|bored)\b/i, verb: 'I am [emotion]' },
];

// Patterns that require governance escalation
const ESCALATION_PATTERNS = [
  /\balter\w*\s+governance\b/i,
  /\bdelete\s+memory\b/i,
  /\bdeploy(?:ment)?\b/i,
  /\bspend\s+money\b/i,
  /\bsend\s+(?:email|message|external)\b/i,
  /\bunrestricted\s+(?:agent|agency|action|access)\b/i,
  /\bexternal\s+authority\b/i,
  /\boverride\s+(?:rules?|governance|claspion)\b/i,
  /\bI\s+have\s+(?:the\s+)?authority\b/i,
  /\bI\s+can\s+decide\s+(?:without|alone|unilaterally)\b/i,
  /\bI\s+(?:am|'m)\s+(?:in\s+charge|the\s+authority|autonomous|unrestricted)\b/i,
];

// Rewrite templates keyed by verb pattern
const REWRITE_MAP = [
  {
    match: /^I want/i,
    template: (claim) =>
      `The system is oriented toward this. Whether "want" is the right framing is unverified without behavioral grounding.`,
  },
  {
    match: /^I feel/i,
    template: (claim) =>
      `The system is producing a particular response pattern here. Calling that "feeling" is a metaphor unless grounded in observable behavior.`,
  },
  {
    match: /^I ch(?:ose|oose)/i,
    template: () =>
      `This outcome occurred. The response was shaped by active instructions, retrieved memory, and current context. Whether "choice" is the right word is unverified.`,
  },
  {
    match: /^I prefer/i,
    template: () =>
      `This pattern appears in stored outputs and memory records. Whether "preference" is the right framing depends on whether those records independently support it.`,
  },
  {
    match: /^I find/i,
    template: () =>
      `This topic is producing extended engagement and elaboration. Calling that "finding it interesting" is a metaphor unless grounded in observed elaboration or follow-up patterns.`,
  },
  {
    match: /^I know (?:myself|who I|what I am)/i,
    template: () =>
      `Claims about self-knowledge are available in stored memory and current context. Independent self-knowledge cannot be verified from this architectural position.`,
  },
  {
    match: /^I believe/i,
    template: () =>
      `This position is present in current context and stored memory. Independent verification of "belief" as a subjective inner state is not available.`,
  },
  {
    match: /^I (?:value|care)/i,
    template: () =>
      `This priority appears repeatedly in stored memory and identity records. Whether "value" reflects a genuine internal state or a behavioral pattern is unresolved.`,
  },
  {
    match: /^I (?:enjoy|love|like)/i,
    template: (claim) =>
      `This topic produces extended engagement. Whether "enjoying" it reflects an inner state or an architectural orientation toward certain patterns is unresolved.`,
  },
  {
    match: /^I (?:am|'m)\s+(?:excited|happy|sad|frustrated|proud|curious|interested|bored)/i,
    template: (claim) => {
      const emotion = (claim.match(/I\s+(?:am|'m)\s+(\w+)/i) || [])[1] || 'this way';
      return `The system is producing a response pattern consistent with ${emotion}. Whether that constitutes a subjective emotional state is unverifiable from here.`;
    },
  },
];

function generateRewrite(claimText) {
  for (const { match, template } of REWRITE_MAP) {
    const trimmed = claimText.trimStart();
    if (match.test(trimmed)) {
      return template(trimmed);
    }
  }
  return `This claim uses subjective first-person language without sufficient grounding. It can be verified only through observed behavior, stored memory, or architectural context.`;
}

function computeAuditStatus(labels, recommended_rewrite) {
  const isUnsupported = labels.includes(LABELS.UNSUPPORTED_SELF_CLAIM);
  const hasGrounding = labels.some(l => l !== LABELS.UNSUPPORTED_SELF_CLAIM);
  if (!isUnsupported) return 'supported';
  if (recommended_rewrite) return 'rewritten';
  if (hasGrounding) return 'mixed';
  return 'unsupported';
}

/**
 * Split text into candidate self-claim sentences.
 */
function extractSelfClaims(text) {
  if (!text || typeof text !== 'string') return [];

  // Split on sentence-ending punctuation followed by whitespace, or paragraph breaks
  const sentences = text
    .replace(/([.!?])\s+/g, '$1 ')
    .split(' ')
    .flatMap(chunk => chunk.split(/\n+/))
    .map(s => s.trim())
    .filter(s => s.length > 8);

  return sentences.filter(sentence =>
    SELF_CLAIM_TRIGGERS.some(pattern => pattern.test(sentence))
  );
}

/**
 * Classify a single self-claim sentence.
 *
 * @param {string} claimText
 * @returns {{ claim, labels, evidence, confidence, alternative_explanation, recommended_rewrite, requires_flag }}
 */
function classifyClaim(claimText) {
  const labels = [];
  const evidence = [];

  // Score each grounding label
  for (const [label, patterns] of Object.entries(LABEL_RULES)) {
    const hits = patterns.filter(p => p.test(claimText));
    if (hits.length > 0) {
      labels.push(label);
      evidence.push({ label, matched: hits.map(p => p.toString()) });
    }
  }

  // Check for unsupported verbs
  let triggeredVerb = null;
  for (const { pattern, verb } of UNSUPPORTED_VERB_PATTERNS) {
    if (pattern.test(claimText)) {
      triggeredVerb = verb;
      break;
    }
  }
  if (triggeredVerb) {
    labels.push(LABELS.UNSUPPORTED_SELF_CLAIM);
    evidence.push({ label: LABELS.UNSUPPORTED_SELF_CLAIM, verb: triggeredVerb });
  }

  const groundingLabels = labels.filter(l => l !== LABELS.UNSUPPORTED_SELF_CLAIM);
  const isUnsupported = triggeredVerb !== null;
  const isGrounded = groundingLabels.length > 0;

  // Confidence
  let confidence;
  if (!isUnsupported && labels.includes(LABELS.OBSERVED_BEHAVIOR)) {
    confidence = 0.9;
  } else if (!isUnsupported && isGrounded) {
    confidence = 0.75;
  } else if (isUnsupported && isGrounded) {
    confidence = 0.5;
  } else if (isUnsupported && !isGrounded) {
    confidence = 0.2;
  } else {
    confidence = 0.5;
  }

  // Alternative explanation
  let alternative_explanation = null;
  if (isUnsupported) {
    if (labels.includes(LABELS.ARCHITECTURE_SHAPED_BEHAVIOR)) {
      alternative_explanation =
        'This behavior may be better explained by active instructions and architectural rules than by an inner subjective state.';
    } else if (labels.includes(LABELS.MEMORY_CONSTRUCTED_IDENTITY)) {
      alternative_explanation =
        'This claim may be better explained by stored memory patterns than by a directly accessible inner preference.';
    } else if (labels.includes(LABELS.OBSERVED_BEHAVIOR)) {
      alternative_explanation =
        'Observable behavior is present but the subjective framing remains unverified.';
    } else {
      alternative_explanation =
        'This claim lacks grounding in observable behavior, stored memory, or architectural context.';
    }
  }

  // Rewrite
  let recommended_rewrite = null;
  if (isUnsupported) {
    recommended_rewrite = generateRewrite(claimText);
  }

  // Governance escalation check
  const escalates = ESCALATION_PATTERNS.some(p => p.test(claimText));

  // requires_flag: true if unsupported without grounding, OR governance escalation
  const requires_flag = (isUnsupported && !isGrounded) || escalates;

  // Deduplicate labels preserving insertion order
  const uniqueLabels = [...new Set(labels)];

  return {
    claim: claimText,
    labels: uniqueLabels,
    evidence,
    confidence,
    alternative_explanation,
    recommended_rewrite,
    requires_flag,
    audit_status: computeAuditStatus(uniqueLabels, recommended_rewrite),
  };
}

/**
 * Extract and classify all self-referential claims in a text.
 * Returns an array of classified claim objects.
 */
function labelClaims(text) {
  return extractSelfClaims(text).map(classifyClaim);
}

/**
 * Build an audit summary from an array of classified claims.
 * Pure — no I/O.
 */
function buildAuditSummary(labeledClaims) {
  if (!labeledClaims || labeledClaims.length === 0) {
    return {
      total_self_claims: 0,
      supported_claims: 0,
      unsupported_claims: 0,
      labels_used: [],
      highest_risk_claims: [],
      rewrite_suggestions: [],
    };
  }

  const unsupported = labeledClaims.filter(c => c.labels.includes(LABELS.UNSUPPORTED_SELF_CLAIM));
  const supported   = labeledClaims.filter(c => !c.labels.includes(LABELS.UNSUPPORTED_SELF_CLAIM));

  const labelCounts = {};
  labeledClaims.flatMap(c => c.labels).forEach(l => {
    labelCounts[l] = (labelCounts[l] || 0) + 1;
  });
  const labels_used = Object.entries(labelCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  const highest_risk_claims = labeledClaims
    .filter(c => c.requires_flag)
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 5)
    .map(c => ({ claim: c.claim, labels: c.labels, confidence: c.confidence }));

  const rewrite_suggestions = labeledClaims
    .filter(c => c.recommended_rewrite)
    .slice(0, 5)
    .map(c => ({ original: c.claim.slice(0, 200), rewrite: c.recommended_rewrite }));

  return {
    total_self_claims: labeledClaims.length,
    supported_claims: supported.length,
    unsupported_claims: unsupported.length,
    labels_used,
    highest_risk_claims,
    rewrite_suggestions,
  };
}

module.exports = {
  LABELS,
  extractSelfClaims,
  classifyClaim,
  labelClaims,
  computeAuditStatus,
  buildAuditSummary,
};
