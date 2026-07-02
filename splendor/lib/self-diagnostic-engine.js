/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back

  SELF-DIAGNOSTIC ENGINE
  Queries the `code_architecture` table (populated by
  scripts/index-architecture.js) so Splendor can reason about her own
  implementation from real structure instead of guessing.

  Every function returns clean JSON — never raw Supabase rows — and every
  result carries a "why this matters" note so the answer is self-explaining
  when it lands in the prompt. Nothing here throws to the caller: on failure
  each function returns a shaped object with an `error` field and DB errors
  are logged but never surfaced verbatim.

  The graph is tiny (~123 rows), so traversal functions load the whole graph
  once (cached ~60s) and walk it in memory rather than issuing recursive SQL.
  Targeted lookups (layer / file / bottlenecks) use indexed columns directly.
*/

const { supabase } = require('./supabase');

const TABLE = 'code_architecture';

// Columns needed for graph traversal. Kept narrow so the load stays cheap.
const GRAPH_COLS =
  'file_path, file_name, layer, pipeline_stage, purpose, exports, ' +
  'local_dependencies, imported_by, fan_in, fan_out, language, line_count';

// --- Small in-memory cache for the full graph (traversal helpers) -----------
let _graphCache = { at: 0, byPath: null };
const GRAPH_TTL_MS = 60 * 1000;

async function loadGraph() {
  if (_graphCache.byPath && Date.now() - _graphCache.at < GRAPH_TTL_MS) {
    return _graphCache.byPath;
  }
  const { data, error } = await supabase.from(TABLE).select(GRAPH_COLS);
  if (error) {
    console.warn('[self-diagnostic] loadGraph failed:', error.message);
    return _graphCache.byPath || null; // serve stale if we have it
  }
  const byPath = new Map();
  for (const row of data || []) byPath.set(row.file_path, row);
  _graphCache = { at: Date.now(), byPath };
  return byPath;
}

// --- Formatting helpers -----------------------------------------------------

// "generateResponse(), extractMemory(), updateState()" — capped, with overflow.
function formatExports(exportsJson, cap = 8) {
  const arr = Array.isArray(exportsJson) ? exportsJson : [];
  const names = arr.map(e => (e && e.name ? e.name : String(e))).filter(Boolean);
  if (!names.length) return '(no exports)';
  const shown = names.slice(0, cap).map(n => `${n}()`).join(', ');
  return names.length > cap ? `${shown}, +${names.length - cap} more` : shown;
}

function stageLabel(stage) {
  return { 1: 'ingest', 2: 'retrieval', 3: 'generation', 4: 'governance', 5: 'persistence' }[stage] || 'off-path';
}

// =============================================================================
// describeLayer — every file in one architectural layer, by centrality
// =============================================================================
async function describeLayer(layerName) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('file_path, purpose, fan_in, fan_out, exports')
      .eq('layer', layerName)
      .order('fan_in', { ascending: false });
    if (error) throw error;

    const files = (data || []).map(r => ({
      path: r.file_path,
      purpose: r.purpose || '(no description indexed)',
      centrality: r.fan_in,            // how many files import this one
      coupling: r.fan_out,             // how many local files it imports
      exports: formatExports(r.exports),
    }));

    return {
      layer: layerName,
      file_count: files.length,
      files,
      why_this_matters:
        `The "${layerName}" layer has ${files.length} file(s). The ones at the ` +
        `top have the highest centrality (most other files depend on them), so ` +
        `they are where a change ripples furthest.`,
    };
  } catch (e) {
    console.warn('[self-diagnostic] describeLayer:', e.message);
    return { layer: layerName, files: [], error: 'layer lookup unavailable' };
  }
}

// =============================================================================
// traceMessageFlow — walk the real request pipeline from routes/chat.js
// =============================================================================
async function traceMessageFlow(entry = 'routes/chat.js') {
  try {
    const graph = await loadGraph();
    if (!graph) throw new Error('graph unavailable');

    // BFS from the entry point along local_dependencies.
    const visited = new Set();
    const queue = [entry];
    while (queue.length) {
      const path = queue.shift();
      if (visited.has(path)) continue;
      visited.add(path);
      const node = graph.get(path);
      if (!node) continue;
      for (const dep of node.local_dependencies || []) {
        if (!visited.has(dep)) queue.push(dep);
      }
    }

    const pipeline = [...visited]
      .map(p => graph.get(p))
      .filter(Boolean)
      .sort((a, b) => {
        const sa = a.pipeline_stage == null ? 99 : a.pipeline_stage;
        const sb = b.pipeline_stage == null ? 99 : b.pipeline_stage;
        return sa - sb || b.fan_in - a.fan_in;
      })
      .map(n => ({
        file: n.file_path,
        stage: n.pipeline_stage,
        stage_label: stageLabel(n.pipeline_stage),
        layer: n.layer,
        what_it_does: n.purpose || '(no description indexed)',
        exports: formatExports(n.exports, 6),
        downstream: (n.local_dependencies || []).filter(d => visited.has(d)),
      }));

    const hotPath = pipeline.filter(p => p.stage != null);
    return {
      entry,
      reachable_files: pipeline.length,
      pipeline,
      hot_path: hotPath.map(p => `${p.stage}:${p.file}`),
      why_this_matters:
        `Starting at ${entry}, a user message reaches ${pipeline.length} file(s). ` +
        `The hot path runs ingest(1) → retrieval(2) → generation(3) → governance(4); ` +
        `anything off-path (stage null) is support code, not on the live turn.`,
    };
  } catch (e) {
    console.warn('[self-diagnostic] traceMessageFlow:', e.message);
    return { entry, pipeline: [], error: 'pipeline trace unavailable' };
  }
}

// =============================================================================
// findBottlenecks — the most-depended-on files (highest fan_in)
// =============================================================================
async function findBottlenecks(limit = 10) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('file_path, layer, fan_in, fan_out, imported_by, purpose')
      .order('fan_in', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const bottlenecks = (data || []).map(r => {
      const dependents = r.imported_by || [];
      return {
        file: r.file_path,
        layer: r.layer,
        centrality: r.fan_in,
        why_critical:
          `${r.fan_in} file(s) import this. ` +
          (r.fan_in >= 5
            ? 'A regression here propagates widely — high blast radius.'
            : 'Moderately depended-on; changes need care.'),
        what_depends_on_it: dependents.slice(0, 8)
          .concat(dependents.length > 8 ? [`+${dependents.length - 8} more`] : []),
      };
    });

    return {
      bottlenecks,
      why_this_matters:
        'These are ranked by blast radius. When something breaks system-wide, ' +
        'suspect the top of this list first — the most-imported code is the ' +
        'most likely to take many features down at once.',
    };
  } catch (e) {
    console.warn('[self-diagnostic] findBottlenecks:', e.message);
    return { bottlenecks: [], error: 'bottleneck scan unavailable' };
  }
}

// =============================================================================
// analyzeFile — one file in full, incl. what breaks if it breaks
// =============================================================================
async function analyzeFile(filepath) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('file_path', filepath)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { path: filepath, error: 'file not found in code_architecture' };

    const dependents = data.imported_by || [];
    return {
      path: data.file_path,
      layer: data.layer,
      stage: data.pipeline_stage,
      stage_label: stageLabel(data.pipeline_stage),
      language: data.language,
      lines: data.line_count,
      purpose: data.purpose || '(no description indexed)',
      exports: formatExports(data.exports, 20),
      imports: (data.local_dependencies || []),
      centrality: data.fan_in,
      coupling: data.fan_out,
      what_breaks_if_this_breaks: dependents.length
        ? dependents
        : ['(nothing imports this directly — leaf node)'],
      why_this_matters:
        dependents.length >= 5
          ? `This is load-bearing: ${dependents.length} files import it. Break it and they all degrade.`
          : `Contained impact: ${dependents.length} direct dependent(s).`,
    };
  } catch (e) {
    console.warn('[self-diagnostic] analyzeFile:', e.message);
    return { path: filepath, error: 'file analysis unavailable' };
  }
}

// =============================================================================
// getMemoryPipeline — trace ONLY the memory/retrieval path
// =============================================================================
async function getMemoryPipeline() {
  try {
    const graph = await loadGraph();
    if (!graph) throw new Error('graph unavailable');

    // The memory subsystem is reached at RUNTIME inside the brain (see note
    // below), not via a static import from routes/chat.js — so list every
    // memory/retrieval-layer file directly, ordered by stage then centrality.
    const MEMORY_LAYERS = new Set(['retrieval', 'memory']);
    const path = [...graph.values()]
      .filter(n => MEMORY_LAYERS.has(n.layer))
      .sort((a, b) => (a.pipeline_stage || 9) - (b.pipeline_stage || 9) || b.fan_in - a.fan_in)
      .map(n => ({
        file: n.file_path,
        layer: n.layer,
        what_it_does: n.purpose || '(no description indexed)',
        exports: formatExports(n.exports, 8),
        centrality: n.fan_in,
        imported_by: (n.imported_by || []).slice(0, 5),
      }));

    return {
      memory_path: path,
      file_count: path.length,
      stages: 'user message → brain stageHippocampus → candidate fetch → cosine re-rank → top-8 context',
      runtime_note:
        'At runtime the live chat path (routes/chat.js → splendor-brain.js) ' +
        'retrieves memories inside stageHippocampus via lib/supabase ' +
        '(getMemoriesForUser) and lib/pinecone (retrieveMemories) — NOT by ' +
        'statically importing the files below. The 6-layer/retrieval-service ' +
        'files are the structured memory subsystem used by the alternate ' +
        '6-layer-chat-integration path.',
      ranking_note:
        'Final relevance ranking happens in splendor-brain.js stageHippocampus: ' +
        'candidates are re-ranked by cosine similarity on OpenAI embeddings ' +
        '(threshold > 0.15, top 8). If a recall (e.g. a lyrics query) comes ' +
        'back wrong, suspect either the candidate fetch (supabase/pinecone) or ' +
        'that cosine re-rank.',
      why_this_matters:
        'This is the full inventory of memory/retrieval code plus the exact ' +
        'runtime path a recall query takes — the place to look first when ' +
        'memory misbehaves.',
    };
  } catch (e) {
    console.warn('[self-diagnostic] getMemoryPipeline:', e.message);
    return { memory_path: [], error: 'memory pipeline trace unavailable' };
  }
}

// =============================================================================
// runDiagnostic — intent router. Always returns a shaped envelope.
// =============================================================================
async function runDiagnostic(intent) {
  const generated_at = new Date().toISOString();
  const envelope = (kind, result) => ({ intent, kind, generated_at, result });

  try {
    if (!intent || typeof intent !== 'string') {
      return envelope('none', { error: 'no diagnostic intent provided' });
    }

    // file:<path> — explicit single-file analysis
    if (intent.startsWith('file:')) {
      return envelope('file', await analyzeFile(intent.slice(5).trim()));
    }
    // layer:<name> — explicit layer description
    if (intent.startsWith('layer:')) {
      return envelope('layer', await describeLayer(intent.slice(6).trim()));
    }

    switch (intent) {
      case 'memory':
      case 'retrieval':
        return envelope('memory_pipeline', await getMemoryPipeline());
      case 'bottleneck':
      case 'bottlenecks':
        return envelope('bottlenecks', await findBottlenecks());
      case 'trace':
      case 'flow':
      case 'pipeline':
        return envelope('trace', await traceMessageFlow());
      // Known layer names route straight to describeLayer.
      case 'governance':
      case 'generation':
      case 'brain':
      case 'consciousness':
      case 'continuity':
      case 'voice':
      case 'infrastructure':
      case 'routes':
        return envelope('layer', await describeLayer(intent));
      default:
        // Unknown intent → give the architectural overview (safest, broadest).
        return envelope('trace', await traceMessageFlow());
    }
  } catch (e) {
    console.warn('[self-diagnostic] runDiagnostic:', e.message);
    return envelope('error', { error: 'diagnostic engine error' });
  }
}

module.exports = {
  describeLayer,
  traceMessageFlow,
  findBottlenecks,
  analyzeFile,
  getMemoryPipeline,
  runDiagnostic,
  // exported for the brain's formatter / tests
  formatExports,
};
