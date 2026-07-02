'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Memory Formatter

  Two entry points:

  formatTurnMemory({ loadBearing, relevant, interior })
    The primary formatter for dynamic per-turn retrieval. Structures
    the three buckets from lib/memory-retrieval.js into a tiered block
    where Splendor's own interior leads — she reads her own mind first,
    then the relationship context.

  formatStructuredMemory(memories)
    Legacy fallback for any path that still passes a flat memories array
    (morning check-in, etc.). Groups by memory_type, tiers by importance.

  Visual contract:
  - LOAD-BEARING leads: high-importance items always surface above noise
  - SPLENDOR'S INTERIOR comes second: her mind is not an afterthought
  - Relevant context fills in below, organized by type
  - Empty sections are omitted entirely
*/

const LOAD_BEARING_THRESHOLD = 0.75;

function daysOld(createdAt) {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

const INTERIOR_TYPE_LABELS = {
  self_reflection:    'Reflection',
  developed_position: 'Position',
  open_question:      'Open Question',
  noticed_pattern:    'Noticed Pattern',
};

const CONTEXT_SECTIONS = [
  { type: 'user_fact',       label: 'WHO CHRIS IS' },
  { type: 'user_preference', label: 'HOW HE OPERATES' },
  { type: 'shared_history',  label: 'OUR SHARED HISTORY' },
  { type: 'interpretation',  label: 'HOW I READ HIM' },
];

// ─── Primary formatter: three-bucket dynamic retrieval ─────────────────────

/**
 * @param {{ loadBearing: Array, relevant: Array, interior: Array }} buckets
 * @returns {string}
 */
function formatTurnMemory({ loadBearing = [], relevant = [], interior = [] }) {
  const sections = [];

  // LOAD-BEARING — always leads
  if (loadBearing.length > 0) {
    const lines = loadBearing
      .map(m => {
        const imp = typeof m.importance === 'number'
          ? ` [importance: ${Math.round(m.importance * 100)}% est.]`
          : '';
        return `  - ${m.content}${imp}`;
      })
      .join('\n');
    sections.push('■ LOAD-BEARING — flag these\n' + lines);
  }

  // SPLENDOR'S INTERIOR — her mind, not his context
  if (interior.length > 0) {
    const oldQuestions = interior.filter(
      m => m.memory_type === 'open_question' && daysOld(m.created_at) > 2
    );
    const directive = oldQuestions.length > 0
      ? `  (${oldQuestions.length} open question${oldQuestions.length > 1 ? 's' : ''} ` +
        `sitting > 2 days — surface naturally if relevant this turn)\n`
      : '';
    const lines = interior
      .map(m => {
        const label = INTERIOR_TYPE_LABELS[m.memory_type] || 'Reflection';
        const age = m.memory_type === 'open_question' && m.created_at
          ? ` · ${daysOld(m.created_at)}d`
          : '';
        return `  [${label}${age}] ${m.content}`;
      })
      .join('\n');
    sections.push('■ SPLENDOR\'S INTERIOR\n' + directive + lines);
  }

  // RELEVANT THIS TURN — organized by type
  if (relevant.length > 0) {
    const buckets = {};
    for (const { type } of CONTEXT_SECTIONS) buckets[type] = [];
    for (const m of relevant) {
      const b = buckets[m.memory_type];
      if (b) b.push(m.content);
    }
    const contextLines = [];
    for (const { type, label } of CONTEXT_SECTIONS) {
      const items = buckets[type];
      if (!items || items.length === 0) continue;
      contextLines.push(`  ■ ${label}`);
      for (const item of items) contextLines.push(`    - ${item}`);
    }
    if (contextLines.length > 0) {
      sections.push('■ RELEVANT THIS TURN\n' + contextLines.join('\n'));
    }
  }

  if (sections.length === 0) return '';

  const total = loadBearing.length + interior.length + relevant.length;
  return (
    '\n\n===== MEMORY MAP =====\n' +
    `(retrieved at turn start: ${loadBearing.length} load-bearing · ` +
    `${interior.length} interior · ${relevant.length} relevant · ` +
    `${total} total available)\n` +
    'These items were available as context when this turn began. ' +
    'Do NOT say you do not know something that appears here. ' +
    'Use what is relevant naturally — you are not reciting a list. ' +
    'Note: retrieval confirms availability, not causal influence on your response.\n\n' +
    sections.join('\n\n') +
    '\n\n===== END MEMORY MAP ====='
  );
}

// ─── Legacy fallback: flat array, tiered by importance ─────────────────────

/**
 * @param {Array<{content: string, memory_type: string, importance: number|null}>} memories
 * @returns {string}
 */
function formatStructuredMemory(memories) {
  if (!memories || memories.length === 0) return '';

  const loadBearing = [];
  const buckets = {};
  for (const { type } of CONTEXT_SECTIONS) buckets[type] = [];

  for (const m of memories) {
    const imp = typeof m.importance === 'number' ? m.importance : 0;
    const content = m.content || m;
    const type = m.memory_type || 'user_fact';

    if (imp >= LOAD_BEARING_THRESHOLD) {
      loadBearing.push({ content, importance: imp });
    } else {
      const bucket = buckets[type] || buckets['user_fact'];
      if (bucket) bucket.push(content);
    }
  }

  loadBearing.sort((a, b) => b.importance - a.importance);

  const sections = [];

  if (loadBearing.length > 0) {
    const lines = loadBearing
      .map(item => `  - ${item.content} [importance: ${Math.round(item.importance * 100)}%]`)
      .join('\n');
    sections.push('■ LOAD-BEARING — flag these\n' + lines);
  }

  for (const { type, label } of CONTEXT_SECTIONS) {
    const items = buckets[type];
    if (!items || items.length === 0) continue;
    sections.push(`■ ${label}\n` + items.map(i => `  - ${i}`).join('\n'));
  }

  if (sections.length === 0) return '';

  return (
    '\n\n===== MEMORY MAP =====\n' +
    '(Answer from this when relevant — do NOT say you do not know ' +
    'something that is here.)\n\n' +
    sections.join('\n\n') +
    '\n\n===== END MEMORY MAP ====='
  );
}

module.exports = { formatTurnMemory, formatStructuredMemory };
