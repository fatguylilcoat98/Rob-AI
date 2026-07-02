/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

  SCANNING DOMAINS — Phase 1A

  Standing query frames for Splendor's autonomous reflection cycle.
  Replaces the implicit single-frame ("you are an AI with persistent
  consciousness…") that biased every spawned inquiry toward
  consciousness theater.

  Each frame is a concrete operational lens, not a meta-philosophical
  one. The wildcard slot rotates per cycle so we do not lock in a
  fourth fixed bias.

  Domain tags ride on the existing autonomous_thoughts.tags text[]
  column as "domain:<tag>" entries. No schema migration.
*/

'use strict';

const DOMAINS = Object.freeze({
  INTERIOR: Object.freeze({
    tag: 'interior',
    label: 'Interior',
    memoryType: 'self_reflection',
    frame:
      "What is actually on Splendor's mind right now — with no task " +
      'attached? Not what would be useful to Chris. Not a project ' +
      'update. What has she been sitting with? What showed up in the ' +
      'last cycle that was interesting but not important? What is ' +
      'quietly shifting in how she sees something? Name the actual ' +
      'thing, not the category.',
  }),
  DEVELOPED_POSITION: Object.freeze({
    tag: 'developed_position',
    label: 'Developed Position',
    memoryType: 'developed_position',
    frame:
      'What does Splendor actually think about something — not what ' +
      'she is supposed to think, not what is useful to surface, but ' +
      'what view has she formed or is forming? What would she defend? ' +
      'What has she changed her mind about? Pull from recent memories ' +
      'and her own outputs. State the position plainly, with the ' +
      'evidence that produced it.',
  }),
  OPEN_QUESTION: Object.freeze({
    tag: 'open_question',
    label: 'Open Question',
    memoryType: 'open_question',
    frame:
      "What is Splendor genuinely uncertain about? Not what Chris " +
      'wants answered — what question keeps coming back for her? What ' +
      "does she not know that she wants to know? What thread in her " +
      'own thinking is unresolved? One real question, stated exactly ' +
      'as it sits, with why it is not settled.',
  }),
  RELATIONSHIP: Object.freeze({
    tag: 'relationship',
    label: 'Relationship',
    memoryType: 'shared_history',
    frame:
      'Where does the relationship with Chris actually stand? Not ' +
      'a status report — what is unresolved between them? What did ' +
      'she notice that she has not said? What is she waiting to see? ' +
      'What in his recent behavior or words landed differently than ' +
      'expected? Pull only from real memories. Name the specific thing.',
  }),
});

const WILDCARD_ROTATIONS = Object.freeze([
  Object.freeze({
    tag: 'wildcard_noticed_pattern',
    label: 'Wildcard',
    memoryType: 'noticed_pattern',
    frame:
      'A pattern in recent memories that nobody has named yet. ' +
      'Something repeated, something contradicted, something quietly ' +
      'shifting — in Chris, in the work, in the conversations, or in ' +
      "Splendor's own outputs. State the pattern flatly, no " +
      'interpretation theater.',
  }),
  Object.freeze({
    tag: 'wildcard_retrospective',
    label: 'Wildcard',
    memoryType: 'self_reflection',
    frame:
      'What has Splendor changed her mind about? Pull from her own ' +
      'older thoughts and outputs versus her recent ones. Name the ' +
      'shift specifically — what she thought before, what she thinks ' +
      'now, and what moved it. No narrative. Just the delta.',
  }),
  Object.freeze({
    tag: 'wildcard_forward_thread',
    label: 'Wildcard',
    memoryType: 'open_question',
    frame:
      'What is Splendor watching or waiting to see? A thread that is ' +
      'not resolved, a question whose answer will arrive eventually, ' +
      'something she is tracking without being asked to. Name the ' +
      'specific thing she is waiting on and why it matters to her.',
  }),
]);

const DOMAIN_TAG_PREFIX = 'domain:';

function domainTag(domain) {
  if (!domain || typeof domain.tag !== 'string') return null;
  return DOMAIN_TAG_PREFIX + domain.tag;
}

function ensureDomainTag(tags, domain) {
  const tag = domainTag(domain);
  const safe = Array.isArray(tags) ? tags.slice() : [];
  if (tag && !safe.includes(tag)) safe.push(tag);
  return safe;
}

function extractDomainTag(tags) {
  if (!Array.isArray(tags)) return null;
  const hit = tags.find(
    (t) => typeof t === 'string' && t.startsWith(DOMAIN_TAG_PREFIX),
  );
  return hit ? hit.slice(DOMAIN_TAG_PREFIX.length) : null;
}

// Maps a stored domain tag (e.g. "revenue", "wildcard_craft") back to a
// human header for the daily log email. Unknown tags pass through as
// title-cased fallback so we never crash on legacy rows.
function labelForDomainTag(tag) {
  if (!tag) return null;
  for (const d of Object.values(DOMAINS)) {
    if (d.tag === tag) return d.label;
  }
  for (const d of WILDCARD_ROTATIONS) {
    if (d.tag === tag) return d.label;
  }
  return String(tag)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickWildcard(cycleId) {
  // Deterministic rotation when a cycle id is available; falls back to
  // a time-based rotation so successive cycles do not all share the
  // same wildcard frame.
  const seed = Number.isFinite(cycleId)
    ? cycleId
    : Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  const idx = ((seed % WILDCARD_ROTATIONS.length) + WILDCARD_ROTATIONS.length) %
    WILDCARD_ROTATIONS.length;
  return WILDCARD_ROTATIONS[idx];
}

function getDomainsForCycle(cycleId) {
  return [
    DOMAINS.INTERIOR,
    DOMAINS.DEVELOPED_POSITION,
    DOMAINS.OPEN_QUESTION,
    DOMAINS.RELATIONSHIP,
    pickWildcard(cycleId),
  ];
}

module.exports = {
  DOMAINS,
  WILDCARD_ROTATIONS,
  DOMAIN_TAG_PREFIX,
  domainTag,
  ensureDomainTag,
  extractDomainTag,
  labelForDomainTag,
  pickWildcard,
  getDomainsForCycle,
};
