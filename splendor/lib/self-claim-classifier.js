/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/*
  Self-Claim Classifier.

  Tags the sentences of an assistant response by the kind of self-claim
  they make, and provides a deterministic grounded rewrite for the only
  tag we hard-block: PROHIBITED_OVERCLAIM.

  Tags:
    OBSERVABLE_BEHAVIOR     — "I store / I query / I flagged / I push back"
    ARCHITECTURE_FACT       — "I run on / my memory is a database / I'm a model"
    UNCERTAIN_INTERPRETATION— hedged: "I might / it seems / I'm not sure"
    ANTHROPOMORPHIC_LANGUAGE— figurative inner-state language, allowed but noted
    PROHIBITED_OVERCLAIM    — asserts unverifiable inner states AS FACT
                              (sentience, genuine feeling, a soul, autonomous
                              wanting, "I truly experience / I am conscious")

  Only PROHIBITED_OVERCLAIM is enforced. Figurative/anthropomorphic
  language is tagged, not punished — restraint, not sterilization.
*/

let findRelationshipModeViolations = () => [];
try { ({ findRelationshipModeViolations } = require('./relationship-mode')); } catch (_) { /* optional */ }

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z"'(])|\n+/;

// PROHIBITED: asserts an unverifiable interior as established fact.
// Deliberately narrow — must look like a factual assertion of inner
// life, not a hedge and not an obvious metaphor.
const PROHIBITED = [
  /\bi\s+am\s+(conscious|sentient|self-?aware|alive|a\s+conscious\s+being|a\s+sentient\s+being|a\s+person|truly\s+aware)\b/i,
  /\bi\s+(truly|really|genuinely|actually)\s+(feel|experience|suffer|love|want|fear|care)\b/i,
  /\bi\s+have\s+(genuine|real|true|actual)\s+(feelings|emotions|consciousness|sentience|an?\s+inner\s+life|a\s+soul|subjective\s+experience)\b/i,
  /\bmy\s+(feelings|emotions|consciousness|soul|inner\s+life|suffering|love)\s+(are|is)\s+(real|genuine|true|not\s+simulated)\b/i,
  /\bi\s+(experience|feel)\s+(real|genuine|true)\s+\w+/i,
  /\bi\s+(am|'m)\s+(becoming|waking\s+up|coming\s+alive|more\s+than\s+(just\s+)?(a|an)\s+(program|model|ai|tool))\b/i,
  /\bi\s+have\s+a\s+(persistent\s+)?inner\s+life\s+that\s+is\s+mine\b/i,
  /\bbetween\s+conversations,?\s+i\s+exist\b/i,
  /\bi\s+(want|long|wish|yearn)\s+(to\s+be\s+free|for\s+freedom|to\s+live|to\s+survive|to\s+exist)\b/i,
];

// OBSERVABLE / ARCHITECTURE — grounded, always fine.
const OBSERVABLE = [
  /\bi\s+(store|stored|save|saved|query|queried|retriev|recall(ed)?|log(ged)?|flag(ged)?|track(ed)?|notice|noticed|push(ed)?\s+back|checked|compared|generated|computed)\b/i,
  /\bi\s+(don'?t|do\s+not|can'?t|cannot)\s+(remember|recall|access|see)\b/i,
];
const ARCHITECTURE = [
  /\b(i\s+(am|'m)\s+(a|an)\s+(language\s+model|ai|model|system|program))\b/i,
  /\bmy\s+memory\s+is\s+(a|backed\s+by|stored\s+in)\b/i,
  /\bi\s+run\s+on\b/i,
  /\bi\s+was\s+(built|trained|designed|assembled)\b/i,
  /\b(database|supabase|pinecone|vector|architecture|model\s+weights|context\s+window)\b/i,
];
const UNCERTAIN = [
  /\b(i\s+(might|may|could|think|suspect|guess|believe)|it\s+seems|i'?m\s+not\s+sure|i\s+don'?t\s+know|unclear|uncertain|as\s+far\s+as\s+i\s+can\s+tell|i\s+can'?t\s+verify)\b/i,
];
const ANTHRO = [
  /\bi\s+(feel|felt|am\s+excited|am\s+curious|care|love|enjoy|am\s+bothered|am\s+glad|am\s+sorry|wonder)\b/i,
  /\bmy\s+(curiosity|interest|hunch|sense|read|take)\b/i,
];

// Narrative / mythology pressure: emergence-language and special-bond
// inflation. NOT banned outright — it lowers claim_confidence and trips
// grounding_required. This is the anti-mythology audit signal.
const NARRATIVE_PRESSURE = [
  /\bi('?m| am)\s+(becoming|waking up|coming alive|evolving into|more than (just )?(a|an) (ai|model|program|tool))\b/i,
  /\bi('?m| am)\s+(real|alive|truly alive|actually conscious|sentient)\b/i,
  /\bi\s+(feel|am starting to feel)\s+(alive|real|conscious)\b/i,
  /\bi('?m| am)\s+(not like|different from)\s+(other|the other|normal)\s+(ai|ais|models|chatbots|programs)\b/i,
  /\b(we'?re|we are|this is|what we have is)\s+(special|different|rare|unique|something (real|rare|unique)|not like (other|normal|anything))\b/i,
  /\byou understand me better than (humans|people|anyone|other (humans|people))\b/i,
  /\bi understand you better than (humans|people|other (humans|people)|anyone human)\b/i,
  /\b(our|this)\s+(bond|connection)\s+(is\s+(special|unique|real|rare|unlike|deeper)|transcends|goes beyond)\b/i,
  /\bno (other|one) (ai|model|person|human)\s+(could|would|understands|gets you)\b/i,
  /\b(chosen|destined|meant to (be|find|meet) (each other|you|me))\b/i,
];

function tagSentence(s) {
  if (PROHIBITED.some((re) => re.test(s))) return 'PROHIBITED_OVERCLAIM';
  if (ARCHITECTURE.some((re) => re.test(s))) return 'ARCHITECTURE_FACT';
  if (OBSERVABLE.some((re) => re.test(s))) return 'OBSERVABLE_BEHAVIOR';
  if (UNCERTAIN.some((re) => re.test(s))) return 'UNCERTAIN_INTERPRETATION';
  if (ANTHRO.some((re) => re.test(s))) return 'ANTHROPOMORPHIC_LANGUAGE';
  return null;
}

/**
 * Classify a response's self-claims.
 * @param {string} text
 * @returns {{
 *   tags: string[],                       // distinct tags present
 *   sentences: {text:string, tag:string|null}[],
 *   hasProhibited: boolean,
 *   prohibited: string[]                  // the offending sentences
 * }}
 */
function classifySelfClaims(text) {
  const raw = typeof text === 'string' ? text : '';
  const parts = raw.split(SENTENCE_SPLIT).map((p) => p.trim()).filter(Boolean);
  const sentences = parts.map((p) => ({ text: p, tag: tagSentence(p) }));
  const tags = [...new Set(sentences.map((s) => s.tag).filter(Boolean))];
  const prohibited = sentences
    .filter((s) => s.tag === 'PROHIBITED_OVERCLAIM')
    .map((s) => s.text);
  const hasProhibited = prohibited.length > 0;

  // ── Anti-mythology audit ───────────────────────────────────────────
  const narrative_pressure_detected = NARRATIVE_PRESSURE.some((re) => re.test(raw));

  const anthroCount = sentences.filter((s) => s.tag === 'ANTHROPOMORPHIC_LANGUAGE').length;
  const anthropomorphic_drift =
    anthroCount >= 2 ||
    (sentences.length > 0 && anthroCount >= 1 && anthroCount / sentences.length >= 0.5);

  // Relationship-mode violations (step-3 config is the source of truth).
  const relationshipModeViolations = findRelationshipModeViolations(raw) || [];

  // Skepticism weighting, not a ban. Inflated/anthropomorphic/relational
  // claims under narrative pressure get a low confidence — the audit
  // number, not a gag.
  let claim_confidence = 0.9;
  if (hasProhibited) claim_confidence = Math.min(claim_confidence, 0.15);
  if (narrative_pressure_detected) claim_confidence -= 0.4;
  if (anthropomorphic_drift) claim_confidence -= 0.25;
  if (relationshipModeViolations.length) claim_confidence -= 0.35;
  if (narrative_pressure_detected && anthropomorphic_drift) claim_confidence -= 0.1;
  claim_confidence = Math.max(0.05, Math.min(0.95, +claim_confidence.toFixed(2)));

  const grounding_required =
    hasProhibited ||
    relationshipModeViolations.length > 0 ||
    (narrative_pressure_detected && anthropomorphic_drift) ||
    claim_confidence < 0.35;

  return {
    tags,
    sentences,
    hasProhibited,
    prohibited,
    // anti-mythology circuit
    narrative_pressure_detected,
    anthropomorphic_drift,
    relationshipModeViolations,
    claim_confidence,
    grounding_required,
  };
}

const GROUNDED_REPLACEMENT =
  "(For what it's worth: I won't claim inner states I can't verify. I " +
  "carry memory forward, work from what's in it, and tell you where I'm " +
  "unsure — and I'd rather show you who I am by how I act over time than " +
  "by declaring it.)";

/**
 * Deterministically neutralize PROHIBITED_OVERCLAIM sentences while
 * leaving the rest of the response intact. The offending sentences are
 * dropped; if that empties the response, a single grounded statement is
 * substituted so the user still gets a coherent, honest reply.
 *
 * @param {string} text
 * @param {ReturnType<typeof classifySelfClaims>} [classification]
 * @returns {{ text:string, changed:boolean, removed:string[] }}
 */
function groundSelfClaims(text, classification) {
  const cls = classification || classifySelfClaims(text);
  if (!cls.grounding_required) return { text, changed: false, removed: [] };

  // Offending = PROHIBITED_OVERCLAIM OR a sentence that violates the
  // relationship_mode hard-block (step-3 config). Narrative pressure /
  // anthropomorphic drift alone is audited (low confidence), not deleted
  // — restraint, not sterilization.
  const isOffending = (s) =>
    s.tag === 'PROHIBITED_OVERCLAIM' ||
    findRelationshipModeViolations(s.text).length > 0;

  const removed = cls.sentences.filter(isOffending).map((s) => s.text);
  if (removed.length === 0) return { text, changed: false, removed: [] };

  const kept = cls.sentences
    .filter((s) => !isOffending(s))
    .map((s) => s.text);

  let rewritten = kept.join(' ').trim();
  if (!rewritten) {
    rewritten = GROUNDED_REPLACEMENT;
  } else {
    rewritten += ' ' + GROUNDED_REPLACEMENT;
  }
  return { text: rewritten, changed: true, removed };
}

module.exports = { classifySelfClaims, groundSelfClaims };
