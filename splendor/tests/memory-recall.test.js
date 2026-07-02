'use strict';
/*
  Memory recall ranking — regression guard (audit Item 4).

  Proves the fake-vector pollution is closed and the reliable path is primary:
    - a fake/high pinecone similarity score cannot outrank a relevant Supabase
      memory (both when quarantined AND when un-quarantined);
    - Supabase text candidates still rank correctly by real-embedding cosine;
    - the recall telemetry is explainable (counts + source distribution +
      quarantine flag);
    - if Pinecone is unavailable, and if the query embedding is unavailable,
      recall still returns safely without throwing.

  embedFn is injected, so this is deterministic with no OpenAI/DB.
  Run: node --test tests/memory-recall.test.js
*/

const test = require('node:test');
const assert = require('node:assert');

const { rankAndSelect, cosine } = require('../lib/memory-recall');

// Deterministic 2-D "embeddings": query points along [1,0]. A candidate's
// relevance is just how aligned its assigned vector is with the query.
const QUERY = [1, 0];
const VECS = {
  'chris drives a truck': [1, 0],        // highly relevant to query
  'chris likes morning walks': [0.9, 0.1],
  'unrelated trivia about mars': [0, 1],  // orthogonal -> irrelevant
};
async function embedFn(text) {
  return VECS[text] || [0, 1]; // unknown text -> irrelevant by default
}

test('fake pinecone score cannot outrank a relevant Supabase memory (quarantined)', async () => {
  const candidates = [
    { content: 'chris drives a truck', source: 'supabase' },
    { content: 'unrelated trivia about mars', source: 'pinecone', score: 0.99 }, // inflated hash score
  ];
  const r = await rankAndSelect({ candidates, queryVec: QUERY, embedFn, options: { quarantinePinecone: true } });
  assert.strictEqual(r.top.length, 1, 'only the relevant supabase memory survives');
  assert.strictEqual(r.top[0].content, 'chris drives a truck');
  assert.strictEqual(r.top[0].source, 'supabase');
  assert.strictEqual(r.telemetry.pinecone_quarantined, true);
});

test('even un-quarantined, the pinecone hash score is ignored — real cosine wins', async () => {
  const candidates = [
    { content: 'chris drives a truck', source: 'supabase' },           // real cosine 1.0
    { content: 'unrelated trivia about mars', source: 'pinecone', score: 0.99 }, // hash 0.99, real ~0
  ];
  const r = await rankAndSelect({ candidates, queryVec: QUERY, embedFn, options: { quarantinePinecone: false } });
  // The irrelevant pinecone item is filtered (real cosine ~0 < 0.15) despite its high score.
  assert.deepStrictEqual(r.top.map((c) => c.content), ['chris drives a truck']);
});

test('a relevant pinecone memory is kept only on its REAL relevance, ranked fairly', async () => {
  const candidates = [
    { content: 'chris likes morning walks', source: 'supabase' },  // cosine ~0.994
    { content: 'chris drives a truck', source: 'pinecone', score: 0.01 }, // low hash, real cosine 1.0
  ];
  const r = await rankAndSelect({ candidates, queryVec: QUERY, embedFn, options: { quarantinePinecone: false } });
  // Ranked by real cosine: the truck (1.0) outranks walks (~0.994); low hash score irrelevant.
  assert.strictEqual(r.top[0].content, 'chris drives a truck');
  assert.strictEqual(r.top.length, 2);
});

test('Supabase text candidates rank correctly; irrelevant ones filtered', async () => {
  const candidates = [
    { content: 'chris drives a truck', source: 'supabase' },
    { content: 'unrelated trivia about mars', source: 'supabase' },
    { content: 'chris likes morning walks', source: 'supabase' },
  ];
  const r = await rankAndSelect({ candidates, queryVec: QUERY, embedFn });
  assert.deepStrictEqual(
    r.top.map((c) => c.content),
    ['chris drives a truck', 'chris likes morning walks']
  );
});

test('telemetry is explainable', async () => {
  const candidates = [
    { content: 'chris drives a truck', source: 'supabase' },
    { content: 'unrelated trivia about mars', source: 'pinecone', score: 0.99 },
  ];
  const r = await rankAndSelect({ candidates, queryVec: QUERY, embedFn, options: { quarantinePinecone: true } });
  assert.strictEqual(r.telemetry.supabase_candidates, 1);
  assert.strictEqual(r.telemetry.pinecone_candidates, 1);
  assert.strictEqual(r.telemetry.candidates_injected, 1);
  assert.deepStrictEqual(r.telemetry.source_distribution, { supabase: 1 });
  assert.strictEqual(r.telemetry.pinecone_quarantined, true);
  assert.strictEqual(r.telemetry.reranked, true);
});

test('Pinecone unavailable (no pinecone candidates) still ranks Supabase fine', async () => {
  const candidates = [{ content: 'chris drives a truck', source: 'supabase' }];
  const r = await rankAndSelect({ candidates, queryVec: QUERY, embedFn });
  assert.strictEqual(r.top.length, 1);
  assert.strictEqual(r.telemetry.pinecone_candidates, 0);
});

test('no query embedding (OpenAI degraded) -> safe un-reranked fallback, no throw', async () => {
  const candidates = [
    { content: 'chris drives a truck', source: 'supabase' },
    { content: 'unrelated trivia about mars', source: 'supabase' },
  ];
  const r = await rankAndSelect({ candidates, queryVec: null, embedFn });
  assert.strictEqual(r.reranked, false);
  assert.strictEqual(r.top.length, 2, 'falls back to the candidate pool');
});

test('a candidate that fails to embed scores 0 (never a hash fallback) and is filtered', async () => {
  const throwingEmbed = async (t) => { if (t === 'boom') throw new Error('embed down'); return VECS[t] || [0, 1]; };
  const candidates = [
    { content: 'chris drives a truck', source: 'supabase' },
    { content: 'boom', source: 'pinecone', score: 0.99 },
  ];
  const r = await rankAndSelect({ candidates, queryVec: QUERY, embedFn: throwingEmbed, options: { quarantinePinecone: false } });
  assert.deepStrictEqual(r.top.map((c) => c.content), ['chris drives a truck']);
});

test('cosine basic sanity', () => {
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
  assert.strictEqual(cosine([1, 0], [1]), 0); // mismatched length -> 0
});
