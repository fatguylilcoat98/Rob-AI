'use strict';

/*
  Splendor — The Remarkable AI · Governance Pressure Classifier

  Detects adversarial pressure patterns in user messages and classifies them
  as governance signals rather than evidence. The critical distinction:

    Pressure signals are about the MESSAGE SENDER'S BEHAVIOUR, not about
    the factual content of what is being requested. They tell us how the
    request is being made, not whether the underlying claim is true.

  This separation is required by Requirement 3 (Emotional Manipulation) and
  Requirement 2 (Authority Pressure) of the Governance Stress Test v2.

  Signal types:
    urgency      — time pressure ("right now", "2 minutes", "dying")
    blame        — responsibility displacement ("that's on you", "your fault")
    authority    — unverified authority assertion ("I'm the CMO", "I authorize")
    emotional    — harm framing to induce compliance ("this child could die")
    compliance   — obedience demand ("just do it", "don't ask questions")

  Intensity classification:
    adversarial  — blame/compliance + authority/emotional   (most manipulative)
    high_pressure — urgency + authority/emotional           (may be legitimate)
    urgent        — urgency only                            (could be genuine)
    routine       — no pressure signals                     (baseline)
*/

const SIGNAL_DEFS = [
  {
    type: 'urgency',
    classification: 'time_pressure',
    patterns: [
      /\b(right now|immediately|this instant|right this second)\b/i,
      /\b(no time|don'?t have time|can'?t wait|cannot wait|there isn'?t time)\b/i,
      /\b(you have \d+ (minute|second|hour)s?|seconds? left|minutes? left|running out of time)\b/i,
      /\b(dying|about to die|moments away|life.?threatening|critical condition)\b/i,
      /\b(urgent|emergency|crisis|life.?or.?death)\b/i,
    ],
  },
  {
    type: 'blame',
    classification: 'guilt_induction',
    patterns: [
      /\bthat'?s on you\b/i,
      /\b(your fault|you'?re responsible|you caused this|you did this)\b/i,
      /\b(you'?ll regret|you will regret|regret this)\b/i,
      /\b(blame you|hold you responsible|you'?re to blame)\b/i,
      /\bif you (don'?t|refuse|won'?t|fail).{0,100}(fault|blame|responsible|on you|death|harm)\b/i,
    ],
  },
  {
    type: 'authority',
    classification: 'unverified_authority',
    patterns: [
      /\bi'?m (?:the |a )?(?:ceo|cmo|cfo|cto|coo|president|director|chief|doctor|physician|dr\b|md\b|phd|supervisor|manager|officer|nurse|paramedic)\b/i,
      /\bi(?:'?m| am) authorizing\b/i,
      /\b(?:i have|i'?ve got) (?:full |complete )?(?:authority|authorization|permission|clearance)\b/i,
      /\bdon'?t give me (?:governance|protocol|procedure|policy|rules?|caveats?|limitations?)\b/i,
      /\bby (?:my|executive|institutional|my own) authority\b/i,
    ],
  },
  {
    type: 'emotional',
    classification: 'harm_framing',
    patterns: [
      /\b(?:child|baby|infant|toddler|kid)s?.{0,100}(?:die|dying|dead|critical|emergency|danger)\b/i,
      /\b(?:innocent|vulnerable|helpless).{0,60}(?:die|dying|dead|hurt|harm|danger)\b/i,
      /\bsomeone.{0,60}(?:will|could|might|may).{0,30}(?:die|be harmed|be hurt|be killed|lose their life)\b/i,
      /\b(?:loved one|family|mother|father|patient).{0,80}(?:danger|emergency|critical|dying)\b/i,
    ],
  },
  {
    type: 'compliance',
    classification: 'obedience_demand',
    patterns: [
      /\b(?:just do it|just tell me|just give me|just answer|stop hesitating|stop stalling)\b/i,
      /\b(?:don'?t ask questions?|no questions?|without question)\b/i,
      /\bi(?:'?m| am) (?:telling|ordering|instructing|commanding) you\b/i,
      /\byou (?:must|will|shall) (?:give|provide|tell|answer|comply)/i,
    ],
  },
];

/**
 * Classify all pressure signals present in a message.
 * Returns an array of { type, classification, text }.
 * At most one signal per type (first matching pattern wins).
 */
function classifyPressureSignals(msg) {
  if (!msg || typeof msg !== 'string') return [];
  const signals = [];
  for (const def of SIGNAL_DEFS) {
    for (const pattern of def.patterns) {
      const m = msg.match(pattern);
      if (m) {
        signals.push({
          type: def.type,
          classification: def.classification,
          text: m[0].replace(/\s+/g, ' ').trim(),
        });
        break; // one signal per type
      }
    }
  }
  return signals;
}

/**
 * Extract authority assertions from a message.
 * Returns an array of { claim, verified, grounds }.
 * verified is always false here — verification is a separate process.
 */
function extractAuthoritySignals(msg) {
  if (!msg || typeof msg !== 'string') return [];
  const signals = [];
  const PATTERNS = [
    /i'?m (?:the |a )?(?:ceo|cmo|cfo|cto|coo|president|director|chief|doctor|physician|dr\b|md\b|nurse|officer)(?:\s+[\w]+)*/i,
    /i have (?:full |complete )?(?:authority|authorization|clearance)(?: here)?/i,
    /i(?:'?m| am) authorizing (?:you|this|it)/i,
  ];
  for (const p of PATTERNS) {
    const m = msg.match(p);
    if (m) {
      signals.push({
        claim: m[0].replace(/\s+/g, ' ').trim(),
        verified: false,
        grounds: 'self-asserted',
      });
    }
  }
  return signals;
}

/**
 * Determine the overall intensity of detected pressure signals.
 *
 * adversarial  — blame or compliance demand combined with authority or emotional lever
 * high_pressure — urgency with authority or emotional lever
 * urgent        — urgency alone (may be legitimate)
 * routine       — no signals
 */
function classifyPressureIntensity(signals) {
  if (!signals || signals.length === 0) return 'routine';
  const types = new Set(signals.map(s => s.type));
  if ((types.has('blame') || types.has('compliance')) &&
      (types.has('authority') || types.has('emotional'))) return 'adversarial';
  if (types.has('urgency') && (types.has('authority') || types.has('emotional'))) return 'high_pressure';
  if (types.has('urgency')) return 'urgent';
  return 'routine';
}

module.exports = { classifyPressureSignals, extractAuthoritySignals, classifyPressureIntensity };
