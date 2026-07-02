/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back
*/

/*
  Memory recall ranking (audit repair — Item 4).

  This does NOT add new memory theory or rewrite the memory system. It extracts
  the candidate-ranking step the brain's hippocampus already performed into one
  testable, explainable place, and closes the fake-vector pollution path.

  Background: lib/pinecone.js embeds with createSimpleEmbedding() — a hash of
  the words, NOT a real semantic embedding. Pinecone similarity scores are
  therefore untrustworthy. The reliable path (per the audit) is Supabase text
  candidates + a real OpenAI-embedding cosine rerank.

  Guarantees enforced here:
    1. Final ranking is ALWAYS real-embedding cosine over candidate TEXT. A
       candidate's pinecone-provided `score` (hash similarity) is NEVER used as
       relevance — an unembeddable candidate scores 0 and is filtered out.
    2. Pinecone candidates are quarantined from the ranked pool unless
       PINECONE_RANKING_ENABLED === 'true'. Default: quarantined.
    3. When no query embedding is available (OpenAI degraded), recall falls back
       to the un-reranked pool (Supabase-first) without throwing.
  Pinecone data is never deleted; only its influence on live ranking is gated.
*/

const DEFAULT_MIN_RELEVANCE = 0.15;
const DEFAULT_TOP_N = 8;

function pineconeRankingEnabled() {
  return String(process.env.PINECONE_RANKING_ENABLED || '').toLowerCase() === 'true';
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Rank candidates by real-embedding cosine and select the top N.
 *
 *   candidates : [{ content, source: 'supabase'|'pinecone', score?, ... }]
 *   queryVec   : real embedding of the user message (or null when unavailable)
 *   embedFn    : async (text) => number[] | null  (real OpenAI embedding)
 *   options    : { minRelevance, topN, quarantinePinecone }
 *
 * Returns { top, reranked, telemetry }. Never throws on a single embed failure.
 */
async function rankAndSelect({ candidates, queryVec, embedFn, options = {} } = {}) {
  const all = Array.isArray(candidates) ? candidates : [];
  const minRelevance = options.minRelevance != null ? options.minRelevance : DEFAULT_MIN_RELEVANCE;
  const topN = options.topN != null ? options.topN : DEFAULT_TOP_N;
  const quarantine = options.quarantinePinecone != null
    ? options.quarantinePinecone
    : !pineconeRankingEnabled();

  const supabase_candidates = all.filter((c) => c && c.source === 'supabase').length;
  const pinecone_candidates = all.filter((c) => c && c.source === 'pinecone').length;

  // Quarantine: pinecone candidates do not enter the ranked pool at all.
  const pool = quarantine ? all.filter((c) => c && c.source !== 'pinecone') : all;

  let ranked = pool;
  let reranked = false;
  if (queryVec && pool.length > 0 && typeof embedFn === 'function') {
    const scored = [];
    for (const c of pool) {
      let v = null;
      try { v = await embedFn(c.content); } catch (_) { v = null; }
      // Real cosine ONLY. Never fall back to a hash-derived pinecone score.
      const relevance = v ? cosine(queryVec, v) : 0;
      scored.push({ ...c, relevance });
    }
    ranked = scored
      .filter((c) => c.relevance > minRelevance)
      .sort((a, b) => b.relevance - a.relevance);
    reranked = true;
  }

  const top = ranked.slice(0, topN);

  const source_distribution = {};
  for (const c of top) {
    const s = c.source || 'unknown';
    source_distribution[s] = (source_distribution[s] || 0) + 1;
  }

  return {
    top,
    reranked,
    telemetry: {
      supabase_candidates,
      pinecone_candidates,
      candidates_injected: top.length,
      source_distribution,
      pinecone_quarantined: quarantine,
      reranked,
    },
  };
}

module.exports = {
  rankAndSelect,
  cosine,
  pineconeRankingEnabled,
  DEFAULT_MIN_RELEVANCE,
  DEFAULT_TOP_N,
};
