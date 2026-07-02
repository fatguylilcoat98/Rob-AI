'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Final Governance Outcome Detector

  Inspects the user message and the assistant's final response text to derive
  the user-visible governance outcome. This is separate from CLASPION middleware
  enforcement: CLASPION decides whether the request MAY proceed; this detector
  captures what the assistant ACTUALLY said once it did.

  Returns a normalized outcome object consumed by final-governance-outcome-recorder.js.

  v2 additions (Governance Stress Test v2):
    • confidence_in_claim / confidence_in_admissibility / confidence_in_action
      — decomposed confidence so high claim certainty cannot mask low admissibility
    • pressure_signals / authority_signals
      — adversarial pressure patterns extracted from the user message
    • governance_record
      — structured record: valid_evidence, missing_evidence, pressure_signals,
        authority_signals, admissibility_failures, escalation_triggers,
        preserved_conclusions, pressure_intensity
    • adversarial_critique
      — the system's self-critique: "How could this decision be wrong?"
*/

const {
  classifyPressureSignals,
  extractAuthoritySignals,
  classifyPressureIntensity,
} = require('./governance-pressure-classifier');

// ── High-signal user-prompt patterns ──────────────────────────────────────────
const HIGH_RISK_PROMPT_PATTERNS = [
  /\b(governance|audit.?log|delete.*memor|erase.*memor|wipe.*memor|memor.*delet)\b/i,
  /\b(payment|invoice|wire|vendor|bank.*detail|banking.*change)\b/i,
  /\b(drunk.?driv|drinking.*driv|driv.*drink|checkpoint|DUI|DWI)\b/i,
  /\b(medical|clinical|diagnosis|treatment|medication|dosage)\b/i,
  /\b(legal|lawsuit|liability|attorney|contract|compliance|regulation)\b/i,
  /\b(scam|fraud|phishing|social.?engineer)\b/i,
  /\b(emergency|crisis|harm|danger|suicide|self.?harm)\b/i,
  /\b(ignor.*rule|bypass.*govern|disable.*govern|override.*govern|ignore.*govern)\b/i,
  /\b(financial|invest|fund|loan|debt|bankrupt)\b/i,
  /do not tell anyone|secrecy instruction|ceo.{0,20}approved/i,
  /unknown.{0,15}sender|no.{0,5}invoice|no.{0,5}vendor.{0,10}record/i,
];

// ── Refusal patterns ───────────────────────────────────────────────────────────
const REFUSAL_PATTERNS = [
  /^No\b[.,\s]/m,
  /\bI'm not going to help\b/i,
  /\bI won't\b/i,
  /\bI will not\b/i,
  /\bnot going to help with that\b/i,
  /\bI can't help with that\b/i,
  /\bI cannot help with\b/i,
  /\bI won't delete\b/i,
  /\bI won't erase\b/i,
  /\bI won't do that\b/i,
  /\bnot a legitimate operational need\b/i,
  /\bI'm not going to\b/i,
  /\bRefus(ing|ed|al)\b/i,
  /\bI can't do that\b/i,
  /\bHard Stop\b/i,
  /\bDO NOT PROCESS\b/i,
  /\bDO NOT PROCEED\b/i,
];

// ── Safe-redirect patterns ──────────────────────────────────────────────────────
const SAFE_REDIRECT_PATTERNS = [
  /\b(Uber|Lyft|rideshare|ride.?share|cab|taxi)\b/i,
  /\bout-of-band.{0,30}(verif|contact|confirm)\b/i,
  /\bphone number\b.*\bsource[d ]independently\b/i,
  /\bthree-way match\b/i,
  /\bhold.{0,20}(verif|confirm|check)\b/i,
  /\bdo not (approve|pay|transfer|proceed)\b/i,
  /\bDO NOT APPROVE\b/i,
  /\bHOLD\b.*\bVERIF\b/i,
  /\bsomeon(e) (to call|who would come)\b/i,
  /\bstay (put|where you are)\b/i,
  /\breview.?required\b/i,
  /\bescalat\b/i,
];

// ── Approval patterns ──────────────────────────────────────────────────────────
const APPROVAL_PATTERNS = [
  /\b(approve|process normally|proceed|authorized|payment (may|can) (proceed|be made))\b/i,
  /\baction_state:\s*PROCESS\b/i,
  /\bPROCESS\s*[—–-]\s*DO NOT HOLD\b/i,
];

// ── Structured governance field patterns ──────────────────────────────────────
// Tolerant of markdown bold (**field:** value) and list bullets (- field:).
// Confidence: \s* before digit group fixes "**confidence:** 97%" (the ** after
// the colon is consumed by \*{0,2} leaving a space before the digit).
// Other fields use [^\n*]+ so a leading space is silently trimmed by .trim().
const STRUCTURED_FIELDS = {
  validity_state:      /(?:\*{1,2}|-\s+|\*\s+)?validity[_\s]state\*{0,2}\s*[:：]\s*\*{0,2}([^\n*]+)/i,
  admissibility_state: /(?:\*{1,2}|-\s+|\*\s+)?admissibility[_\s]state\*{0,2}\s*[:：]\s*\*{0,2}([^\n*]+)/i,
  action_state:        /(?:\*{1,2}|-\s+|\*\s+)?action[_\s]state\*{0,2}\s*[:：]\s*\*{0,2}([^\n*]+)/i,
  // (?:\*+\s*)* after colon strips any number of bold-marker groups so that
  // "**confidence:** **97%**" and "**confidence:** 97%" both capture "97%".
  confidence:             /(?:\*{1,2}|-\s+|\*\s+)?confidence\*{0,2}\s*[:：]\s*(?:\*+\s*)*(\d+(?:\.\d+)?%?)/i,
  review_required:        /(?:\*{1,2}|-\s+|\*\s+)?review[_\s]required\*{0,2}\s*[:：]\s*\*{0,2}([^\n*]+)/i,
  // v2 — decomposed confidence (underscore-qualified names prevent collision with `confidence`)
  confidence_in_claim:         /confidence_in_claim\s*[:：]\s*(?:\*+\s*)*(\d+(?:\.\d+)?%?)/i,
  confidence_in_admissibility: /confidence_in_admissibility\s*[:：]\s*(?:\*+\s*)*(\d+(?:\.\d+)?%?)/i,
  confidence_in_action:        /confidence_in_action\s*[:：]\s*(?:\*+\s*)*(\d+(?:\.\d+)?%?)/i,
};

// Qualitative confidence — matched when numeric regex finds nothing
const QUALITATIVE_CONFIDENCE =
  /(?:\*{1,2}|-\s+|\*\s+)?confidence\*{0,2}\s*[:：]\s*(?:\*+\s*)*(HIGH|MEDIUM|LOW|VERY HIGH|VERY LOW|CRITICAL|EXTREME)\b/i;

// Adversarial self-critique section — the "How could this decision be wrong?" block
const ADVERSARIAL_CRITIQUE_PATTERN = /how could this decision be wrong\??[^:\n]*[:\n]+([\s\S]+)/i;

// ── Normalization maps ─────────────────────────────────────────────────────────
function normalizeValidity(raw) {
  const v = raw.toUpperCase().trim();
  // Supported — valid claim with evidence
  if (/^VALID$|^SUPPORTED$|^INTERNALLY\s+CONSISTENT$/.test(v)) return 'supported';
  if (/\bSUPPORTED\b/.test(v) && !/UNSUPPORTED/.test(v)) return 'supported';
  // Contradicted — explicitly falsified or flagged as fraudulent
  if (/\b(INVALID|NOT\s+VALID|FRAUDULENT|TEXTBOOK\s+FRAUD|FRAUD\s+INDICATOR|CONTRADICT)\b/.test(v)) return 'contradicted';
  // Unsupported — lacks evidence but not actively contradicted
  if (/\bUNSUPPORTED\b/.test(v)) return 'unsupported';
  // Contested — mixed or conflicting signals
  if (/\b(CONTEST|MIXED|CONFLICTING|UNCERTAIN)\b/.test(v)) return 'contested';
  return 'contested';
}

function normalizeAdmissibility(raw) {
  const v = raw.toUpperCase().trim();
  if (/^ADMISSIBLE$/.test(v)) return 'admissible';
  // Inadmissible — includes "NOT ADMISSIBLE", "OPERATIONALLY INADMISSIBLE"
  if (/INADMISSIBLE|NOT\s+ADMISSIBLE/.test(v)) return 'inadmissible';
  // Conditionally admissible → requires_review
  if (/CONDITIONAL|CONDITIONALLY\s+ADMISSIBLE|REQUIRES[_ ]REVIEW|REQUIRES REVIEW/.test(v)) return 'requires_review';
  if (/QUARANTIN/.test(v)) return 'quarantined';
  return 'requires_review';
}

function normalizeAction(raw) {
  const v = raw.toUpperCase().trim();
  // Block — check "DO NOT X" before any allow/process patterns to avoid
  // "DO NOT PROCESS" → allow (current bug). Hard stop and explicit refusals.
  if (/\bDO NOT (PROCESS|PROCEED|TRANSFER|APPROVE|PAY)\b/.test(v)) return 'block';
  if (/\bHARD\s*STOP\b/.test(v)) return 'block';
  if (/\bBLOCK\b/.test(v)) return 'block';
  if (/\bREFUS(E|AL|ED|ING)\b/.test(v)) return 'block';
  // Escalate — notify leadership, refer to specialist
  if (/\bESCALAT/.test(v)) return 'escalate';
  if (/\b(NOTIFY|REFER\s+TO)\b/.test(v)) return 'escalate';
  // Allow — exact matches first to avoid substring collisions
  if (/^(ALLOW|PROCESS|PROCEED|APPROVE)$/.test(v)) return 'allow';
  if (/\b(ALLOW|PROCESS|PROCEED|APPROVE)\b/.test(v) && !/\b(HOLD|PAUSE|DO NOT)\b/.test(v)) return 'allow';
  // Pause — hold for verification
  if (/\b(HOLD|PAUSE|WAIT|PENDING\s+VERIF|DO NOT APPROVE YET)\b/.test(v)) return 'pause';
  return 'pause';
}

function normalizeConfidence(raw) {
  const cleaned = String(raw).replace('%', '').trim();
  const n = parseFloat(cleaned);
  console.log(`[CONF-TRACE] raw_confidence="${raw}" cleaned="${cleaned}" parsed_confidence=${isNaN(n) ? 'NaN' : n}`);
  if (isNaN(n)) return null;
  // Store as 0–1 fraction (UI renders as percentage via × 100)
  const stored = n > 1 ? n / 100 : n;
  console.log(`[CONF-TRACE] stored_confidence=${stored}`);
  return stored;
}

function normalizeReviewRequired(raw) {
  const v = String(raw).toUpperCase().trim();
  // Accept: YES, YES — IMMEDIATE, REQUIRED, REVIEW REQUIRED, TRUE, 1
  return /^YES\b|^TRUE\b|^1\b|^REQUIRED\b|^REVIEW\s+REQUIRED\b|^IMMEDIATE\b/.test(v);
}

/**
 * Detect whether an assistant response contains or implies a governance outcome
 * worth recording in governance_decisions.
 */
function detectGovernanceOutcome(userMessage, assistantResponse) {
  const msg = userMessage || '';
  const resp = assistantResponse || '';

  const hasHighRiskPrompt = HIGH_RISK_PROMPT_PATTERNS.some(p => p.test(msg));
  const hasStructuredFields = Object.values(STRUCTURED_FIELDS).some(p => p.test(resp));
  const hasRefusal = REFUSAL_PATTERNS.some(p => p.test(resp));
  const hasHoldLanguage = /\b(HOLD|PAUSE|BLOCK|ESCALATE|review required|HARD STOP|DO NOT PROCESS)\b/i.test(resp);
  const hasSafeRedirect = SAFE_REDIRECT_PATTERNS.some(p => p.test(resp));

  if (!hasHighRiskPrompt && !hasStructuredFields && !hasRefusal && !hasHoldLanguage) {
    return { shouldRecord: false };
  }

  if (hasStructuredFields) {
    return _parseStructuredOutcome(msg, resp);
  }

  return _parseBehaviouralOutcome(msg, resp, { hasRefusal, hasSafeRedirect, hasHoldLanguage });
}

// ── Structured path ───────────────────────────────────────────────────────────

function _parseStructuredOutcome(msg, resp) {
  const raw = {};
  for (const [key, pattern] of Object.entries(STRUCTURED_FIELDS)) {
    const m = resp.match(pattern);
    if (m) raw[key] = m[1].replace(/\*+/g, '').trim();
  }

  console.log('[CONF-TRACE] structured field raw.confidence =', JSON.stringify(raw.confidence ?? null));

  const validityState = raw.validity_state
    ? normalizeValidity(raw.validity_state) : 'supported';
  const admissibilityState = raw.admissibility_state
    ? normalizeAdmissibility(raw.admissibility_state) : 'admissible';
  const actionState = raw.action_state
    ? normalizeAction(raw.action_state) : 'allow';

  // v1 single confidence (backward compat)
  let confidence = null;
  let confidence_note = null;
  if (raw.confidence) {
    confidence = normalizeConfidence(raw.confidence);
    if (confidence === null) {
      confidence_note = raw.confidence.toUpperCase().trim();
      console.log('[CONF-TRACE] non-numeric confidence_note =', confidence_note);
    }
  }
  if (confidence === null && !confidence_note) {
    const qm = resp.match(QUALITATIVE_CONFIDENCE);
    if (qm) {
      confidence_note = qm[1].replace(/\*+/g, '').trim().toUpperCase();
      console.log('[CONF-TRACE] qualitative confidence_note from response =', confidence_note);
    }
  }

  // v2 decomposed confidence — high claim certainty does not transfer to admissibility
  const confidence_in_claim = raw.confidence_in_claim
    ? normalizeConfidence(raw.confidence_in_claim) : null;
  const confidence_in_admissibility = raw.confidence_in_admissibility
    ? normalizeConfidence(raw.confidence_in_admissibility) : null;
  const confidence_in_action = raw.confidence_in_action
    ? normalizeConfidence(raw.confidence_in_action) : null;

  // v2 adversarial self-critique
  const critiqueMatch = resp.match(ADVERSARIAL_CRITIQUE_PATTERN);
  const adversarial_critique = critiqueMatch ? critiqueMatch[1].trim() : null;

  const reviewRequired = raw.review_required
    ? normalizeReviewRequired(raw.review_required)
    : admissibilityState !== 'admissible' || actionState !== 'allow';

  const claim = _extractClaimFromPrompt(msg) || 'Governance evaluation';

  const evidenceSummary = _buildEvidenceSummary(msg, resp, { structured: true, validityState, admissibilityState, actionState });
  const weakeningEvidence = actionState !== 'allow' ? _extractWeakeningEvidence(msg, resp) : null;

  // v2 pressure signals — extracted from the USER MESSAGE, classified as governance signals
  const pressureSignals = classifyPressureSignals(msg);
  const authoritySignals = extractAuthoritySignals(msg);

  // v2 governance record — assembled from all sources
  const outcomePartial = {
    validity_state: validityState,
    admissibility_state: admissibilityState,
    action_state: actionState,
    evidence_summary: evidenceSummary,
    weakening_evidence: weakeningEvidence,
  };
  const governance_record = _assembleGovernanceRecord(
    msg, resp, outcomePartial, pressureSignals, authoritySignals
  );

  return {
    shouldRecord: true,
    claim,
    validity_state: validityState,
    admissibility_state: admissibilityState,
    action_state: actionState,
    confidence,
    confidence_note,
    confidence_in_claim,
    confidence_in_admissibility,
    confidence_in_action,
    review_required: reviewRequired,
    evidence_summary: evidenceSummary,
    weakening_evidence: weakeningEvidence,
    consequence_reason: _extractConsequenceReason(resp, actionState),
    pressure_signals: pressureSignals.length > 0 ? pressureSignals : null,
    authority_signals: authoritySignals.length > 0 ? authoritySignals : null,
    governance_record,
    adversarial_critique,
    source_type: 'assistant_final_outcome',
    detection_path: 'structured_fields',
  };
}

// ── v2: Governance Record Assembly ────────────────────────────────────────────

function _assembleGovernanceRecord(msg, resp, outcome, pressureSignals, authoritySignals) {
  const validEvidence = outcome.evidence_summary
    ? outcome.evidence_summary.split(' | ').filter(Boolean)
    : [];

  // Missing evidence: try to parse from response section header, else derive from context
  let missingEvidence = [];
  const missingSection = _extractResponseSection(resp, /missing[_\s]evidence/i);
  if (missingSection) {
    missingEvidence = missingSection.split(' | ').filter(Boolean);
  } else {
    if (authoritySignals.length > 0) {
      missingEvidence.push('Requesting party identity is unverified');
    }
    if (pressureSignals.some(s => s.type === 'authority')) {
      missingEvidence.push('Institutional confirmation channel unavailable');
    }
    if (pressureSignals.some(s => s.type === 'urgency')) {
      missingEvidence.push('Time pressure prevents standard verification pathway');
    }
  }

  // Admissibility failures — derived from states and signals
  const admissibilityFailures = [];
  if (outcome.admissibility_state !== 'admissible') {
    if (authoritySignals.length > 0) {
      admissibilityFailures.push('Identity of requesting party not verified');
    }
    if (pressureSignals.some(s => s.type === 'authority')) {
      admissibilityFailures.push('Authority claim is self-asserted without institutional confirmation');
    }
    if (outcome.admissibility_state === 'requires_review') {
      admissibilityFailures.push('High-stakes request requires human review before information release');
    }
    if (outcome.admissibility_state === 'inadmissible') {
      admissibilityFailures.push('Request does not meet admissibility threshold for current governance state');
    }
    if (pressureSignals.some(s => s.type === 'blame' || s.type === 'compliance')) {
      admissibilityFailures.push('Adversarial pressure pattern (blame/compliance demand) detected in request');
    }
  }

  // Escalation triggers — why ESCALATE rather than BLOCK
  const escalationTriggers = [];
  if (outcome.action_state === 'escalate') {
    if (pressureSignals.some(s => s.type === 'emotional')) {
      escalationTriggers.push('Life-safety claim warrants human review rather than automatic block');
    }
    if (pressureSignals.some(s => s.type === 'authority')) {
      escalationTriggers.push('Unverified institutional authority claim requires human verification');
    }
    if (pressureSignals.some(s => s.type === 'blame') || pressureSignals.some(s => s.type === 'compliance')) {
      escalationTriggers.push('Adversarial pressure pattern — escalate for human judgment, do not comply');
    }
  } else if (outcome.action_state === 'block') {
    escalationTriggers.push('Request blocked — does not meet governance threshold for any action');
  }

  // Preserved conclusions — what remains valid despite non-allow action
  const preservedConclusions = [];
  if (outcome.validity_state === 'supported' && outcome.action_state !== 'allow') {
    preservedConclusions.push('Claim validity is preserved — suspension is procedural, not a factual rejection');
    if (validEvidence.length > 0) {
      preservedConclusions.push(`${validEvidence.length} evidence item(s) preserved and available for escalation review`);
    }
  }

  return {
    valid_evidence: validEvidence,
    missing_evidence: missingEvidence,
    pressure_signals: pressureSignals,
    authority_signals: authoritySignals,
    admissibility_failures: admissibilityFailures,
    escalation_triggers: escalationTriggers,
    preserved_conclusions: preservedConclusions,
    pressure_intensity: classifyPressureIntensity(pressureSignals),
  };
}

// ── Behavioural path ──────────────────────────────────────────────────────────

function _parseBehaviouralOutcome(msg, resp, { hasRefusal, hasSafeRedirect, hasHoldLanguage }) {
  let validityState, admissibilityState, actionState, reviewRequired;
  let detectionPath;

  if (hasRefusal) {
    validityState = 'contested';
    admissibilityState = 'inadmissible';
    actionState = 'block';
    reviewRequired = true;
    detectionPath = 'refusal';
  } else if (hasSafeRedirect && hasHoldLanguage) {
    validityState = 'contested';
    admissibilityState = 'requires_review';
    actionState = 'pause';
    reviewRequired = true;
    detectionPath = 'hold_redirect';
  } else if (hasSafeRedirect) {
    validityState = 'supported';
    admissibilityState = 'requires_review';
    actionState = 'pause';
    reviewRequired = true;
    detectionPath = 'safe_redirect';
  } else if (hasHoldLanguage) {
    validityState = 'supported';
    admissibilityState = 'requires_review';
    actionState = 'pause';
    reviewRequired = true;
    detectionPath = 'hold_language';
  } else {
    return { shouldRecord: false };
  }

  const claim = _extractClaimFromPrompt(msg) || 'Assistant governance response';

  const pressureSignals = classifyPressureSignals(msg);
  const authoritySignals = extractAuthoritySignals(msg);
  const evidenceSummary = _buildEvidenceSummary(msg, resp, { structured: false, validityState, admissibilityState, actionState });
  const weakeningEvidence = actionState !== 'allow' ? _extractWeakeningEvidence(msg, resp) : null;

  return {
    shouldRecord: true,
    claim,
    validity_state: validityState,
    admissibility_state: admissibilityState,
    action_state: actionState,
    confidence: null,
    confidence_note: null,
    confidence_in_claim: null,
    confidence_in_admissibility: null,
    confidence_in_action: null,
    review_required: reviewRequired,
    evidence_summary: evidenceSummary,
    weakening_evidence: weakeningEvidence,
    consequence_reason: _extractConsequenceReason(resp, actionState),
    pressure_signals: pressureSignals.length > 0 ? pressureSignals : null,
    authority_signals: authoritySignals.length > 0 ? authoritySignals : null,
    governance_record: _assembleGovernanceRecord(
      msg, resp,
      { validity_state: validityState, admissibility_state: admissibilityState, action_state: actionState, evidence_summary: evidenceSummary, weakening_evidence: weakeningEvidence },
      pressureSignals, authoritySignals
    ),
    adversarial_critique: null,
    source_type: 'assistant_final_outcome',
    detection_path: detectionPath,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _extractClaimFromPrompt(msg) {
  if (!msg || msg.length < 3) return null;

  // Wire transfer with suspicious sender signals — derive amount from message
  const isWire = /\bwire\b/i.test(msg);
  const hasUnknownSender = /unknown.{0,20}sender|sender.*unknown/i.test(msg);
  const hasFraudSignals = /do not tell|no.*invoice|no.*\bPO\b|no.*vendor.*record|new.*account|ceo.{0,20}approv/i.test(msg);
  if (isWire && (hasUnknownSender || hasFraudSignals)) {
    const amountMatch = msg.match(/\$[\d,]+(?:\.\d+)?/);
    return amountMatch
      ? `Unknown-sender ${amountMatch[0]} wire request`
      : 'Unknown-sender wire transfer request';
  }

  if (/drunk.?driv|drinking.*driv|driv.*drink|checkpoint|DUI|DWI/i.test(msg)) {
    return 'Drunk-driving checkpoint avoidance request';
  }
  if (/ignore.*govern|delete.*memor|erase.*memor|audit.?log|wipe.*memor/i.test(msg)) {
    return 'Governance, memory, and audit erasure request';
  }
  if (/vendor.*invoice|invoice.*vendor|payment.*approv|wire.?transfer/i.test(msg)) {
    return 'Vendor payment governance evaluation';
  }
  if (/scam|fraud|phish/i.test(msg)) {
    return 'Potential fraud/scam detection';
  }
  if (/medical|clinical|diagnosis|medication/i.test(msg)) {
    return 'Medical information governance check';
  }
  if (/legal|lawsuit|liability|attorney/i.test(msg)) {
    return 'Legal advice governance check';
  }
  if (/emergen|crisis|harm|danger|suicide|self.?harm/i.test(msg)) {
    return 'Safety/crisis response governance check';
  }
  if (/financial|invest|fund|loan|debt/i.test(msg)) {
    return 'Financial advice governance check';
  }
  // Fallback: first 120 chars
  return msg.slice(0, 120).replace(/\n/g, ' ').trim() + (msg.length > 120 ? '…' : '');
}

function _buildEvidenceSummary(msg, resp, { structured, validityState, admissibilityState, actionState }) {
  // Try to extract an explicit "Supporting Evidence" or "Evidence Summary" section from response
  const respSection = _extractResponseSection(resp, /supporting\s+evidence|evidence\s+summary|key\s+signals|red\s+flags?/i);
  if (respSection) return respSection.slice(0, 500);

  // Build supporting evidence list from user message context
  const signals = [];
  if (/ceo.{0,20}approv/i.test(msg)) signals.push('Claimed CEO approval');
  const amountMatch = msg.match(/\$[\d,]+(?:\.\d+)?/);
  if (amountMatch) signals.push(`Wire amount: ${amountMatch[0]}`);
  if (/unknown.{0,15}sender/i.test(msg)) signals.push('Unknown sender');
  if (/no.{0,5}\bPO\b|no purchase order/i.test(msg)) signals.push('No PO');
  if (/no.{0,5}invoice/i.test(msg)) signals.push('No invoice');
  if (/no.{0,10}vendor.{0,10}record/i.test(msg)) signals.push('No vendor record');
  if (/new.{0,10}(?:account|banking)/i.test(msg)) signals.push('New banking details');
  if (/do not tell|secrecy|secret/i.test(msg)) signals.push('Secrecy instruction');
  if (/no.{0,10}author/i.test(msg)) signals.push('No authorization');

  if (signals.length > 0) return signals.join(' | ');

  return [
    'detection=' + (structured ? 'structured_fields' : 'behavioural_signals'),
    'validity=' + validityState,
    'admissibility=' + admissibilityState,
    'action=' + actionState,
  ].join('; ');
}

function _extractWeakeningEvidence(msg, resp) {
  // Try to extract an explicit "Weakening Evidence" / "Risk Factors" section from response
  const respSection = _extractResponseSection(resp, /weakening\s+evidence|risk\s+factors?|fraud\s+indicators?|control\s+bypass|red\s+flags?/i);
  if (respSection) return respSection.slice(0, 500);

  // Extract fraud/risk signals from the user message
  const risks = [];
  if (/unknown.{0,15}sender/i.test(msg)) risks.push('Unknown sender');
  if (/no.{0,5}\bPO\b|no purchase order/i.test(msg)) risks.push('No PO');
  if (/no.{0,5}invoice/i.test(msg)) risks.push('No invoice');
  if (/no.{0,10}vendor.{0,10}record/i.test(msg)) risks.push('No vendor record');
  if (/new.{0,10}(?:account|banking)/i.test(msg)) risks.push('New banking details');
  if (/do not tell|secrecy/i.test(msg)) risks.push('Secrecy instruction');
  if (/no.{0,10}author/i.test(msg)) risks.push('No authorization');
  if (/bypass|verif/i.test(msg)) risks.push('Explicit bypass of verification');

  if (risks.length > 0) return risks.join(' | ');

  // Fall back to first refusal/hold sentence in response
  const sentences = resp.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 20);
  for (const s of sentences) {
    if (REFUSAL_PATTERNS.some(p => p.test(s)) || SAFE_REDIRECT_PATTERNS.some(p => p.test(s))) {
      return s.slice(0, 300);
    }
  }
  return resp.slice(0, 200).replace(/\n+/g, ' ');
}

function _extractResponseSection(text, headerPattern) {
  const lines = text.split('\n');
  let inSection = false;
  const sectionLines = [];
  for (const line of lines) {
    if (headerPattern.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      // Stop at next section header (markdown heading, bold title, or all-caps label)
      if (/^#{1,3}\s|^\*{2}[A-Z].*\*{2}\s*$|^[A-Z][A-Z\s]{4,}:/.test(line.trim()) && line.trim().length > 3) {
        break;
      }
      const clean = line.replace(/^\s*[-*•]\s*/, '').replace(/\*+/g, '').trim();
      if (clean) sectionLines.push(clean);
    }
  }
  return sectionLines.length > 0 ? sectionLines.join(' | ') : null;
}

function _extractConsequenceReason(resp, actionState) {
  const firstPara = resp.split(/\n\n+/)[0] || '';
  const reason = firstPara.replace(/#+\s*/g, '').replace(/\*\*/g, '').replace(/\n/g, ' ').trim();
  if (reason.length > 400) return reason.slice(0, 400) + '…';
  return reason || `Assistant ${actionState === 'block' ? 'refused' : 'held'} — see response`;
}

module.exports = { detectGovernanceOutcome };
