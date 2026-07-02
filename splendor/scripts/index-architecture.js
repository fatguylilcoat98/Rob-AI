#!/usr/bin/env node
/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back

  CODE ARCHITECTURE INDEXER
  Parses Splendor's source tree and upserts one row per file into the
  `code_architecture` Supabase table so she can diagnose her own design.

  Scope: lib/** , routes/** , and the root entrypoints (server.js,
  splendor-brain.js + the splendor-brain-*-sections.js packs). Backups,
  node_modules, .git, dist, build, and .env* are skipped.

  Two passes:
    1. Parse every file → size/lines/hash/exports/imports/layer/purpose,
       resolving each local import to a real file_path.
    2. Invert local_dependencies → imported_by, and compute fan_in/fan_out.

  Idempotent: upserts on file_path, so it is safe to run on every deploy.
  Dependency-free (regex parse, not a full AST) — good enough for a JS/TS
  CommonJS-dominant tree and carries no extra build cost.

  Run:  node scripts/index-architecture.js
*/

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// The Supabase client is loaded lazily inside main() — parsing (buildRows)
// has no DB dependency, so the module can be required for tests / SQL
// generation in environments without node_modules or DB credentials.
function getSupabase() {
  try {
    return require('../lib/supabase').supabase;
  } catch (e) {
    console.error('[index-architecture] could not load lib/supabase:', e.message);
    process.exit(1);
  }
}

// --- Scope ------------------------------------------------------------------
const SCAN_DIRS = ['lib', 'routes', 'middleware', 'workers'];
const ROOT_FILES = [
  'server.js',
  'splendor-brain.js',
  'splendor-brain-claude-sections.js',
  'splendor-brain-gpt-sections.js',
  'splendor-brain-gemini-sections.js',
  'splendor-brain-grok-sections.js',
];
const ENTRYPOINTS = new Set(['server.js', 'splendor-brain.js']);

const FORBIDDEN_DIR = new Set(['node_modules', '.git', 'dist', 'build', 'public']);
const SKIP_FILE_RE = /\.backup|\.env|\.test\.|\.spec\./i;
const CODE_EXT = new Set(['.js', '.ts']);

// --- Layer / pipeline classification ---------------------------------------
// Ordered: first matching rule wins. Patterns test the repo-relative path.
const LAYER_RULES = [
  { layer: 'entrypoint',   stage: 1, re: /^server\.js$/ },
  { layer: 'routes',       stage: 1, re: /^routes\// },
  { layer: 'retrieval',    stage: 2, re: /memory-retrieval|memory-service|pinecone|unified-memory/ },
  { layer: 'memory',       stage: 2, re: /(^|\/)(6-layer-memory|4-tier|memory|decision-bound|temporal-memory|enhanced-memory)/ },
  { layer: 'brain',        stage: 3, re: /^splendor-brain/ },
  { layer: 'generation',   stage: 3, re: /anthropic|multi-ai|model-router|adaptive-response|interpretation-engine/ },
  { layer: 'governance',   stage: 4, re: /claspion|speech-act|good-neighbor|response-auditor|self-claim|authenticity|relationship-mode/ },
  { layer: 'consciousness',stage: null, re: /consciousness|persistent|temporal-consciousness|calm-|metacognitive|cognitive-/ },
  { layer: 'continuity',   stage: null, re: /continuity|master-continuity/ },
  { layer: 'voice',        stage: null, re: /voice|converse/ },
  { layer: 'infrastructure', stage: null, re: /supabase|activity-bus|behavioral-metrics|tavily|model-router|email/ },
];

function classify(relPath) {
  for (const rule of LAYER_RULES) {
    if (rule.re.test(relPath)) return { layer: rule.layer, pipeline_stage: rule.stage };
  }
  return { layer: 'other', pipeline_stage: null };
}

// --- Parsing helpers --------------------------------------------------------

// One-line purpose from the file header. Prefer an ALL-CAPS title line
// (e.g. "6-LAYER MEMORY SYSTEM"); else the first comment sentence that
// starts at a boundary (capital letter) — which skips mid-comment fragments.
function extractPurpose(content) {
  const BANNER = /Splendor|Christopher Hughes|Sacramento|Truth · Safety|Good Neighbor|Built by|Created with|collaborators/i;
  const comments = [];
  for (const raw of content.split('\n').slice(0, 40)) {
    if (!/^\s*(\/\/+|\/\*+|\*+|#)/.test(raw)) continue; // comment lines only
    const line = raw.replace(/^\s*(\/\/+|\/\*+|\*+|#)\s?/, '').replace(/\*\/\s*$/, '').trim();
    if (!line || BANNER.test(line)) continue;
    if (/^[=*\-_/]{3,}$/.test(line)) continue;
    if (line.length < 8) continue;
    comments.push(line);
  }
  // 1st choice: a title-case / ALL-CAPS heading.
  const title = comments.find(l => /^[A-Z0-9][A-Z0-9 ·:_\-()]{6,70}$/.test(l) && !/[.;,]$/.test(l));
  if (title) return title.slice(0, 200);
  // 2nd choice: first sentence-start comment line (begins with a capital).
  const sentence = comments.find(l => /^[A-Z]/.test(l));
  return sentence ? sentence.slice(0, 200) : null;
}

// Imports: handle CommonJS require(...) and ES `import ... from '...'`.
function parseImports(content) {
  const out = [];
  const seen = new Set();

  const add = (source, specifiers) => {
    if (seen.has(source)) return;
    seen.add(source);
    out.push({ source, specifiers, is_local: source.startsWith('.') });
  };

  // const { a, b } = require('x')  |  const c = require('x')
  const reqRe = /(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z0-9_$]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = reqRe.exec(content))) {
    const specifiers = m[1].replace(/[{}]/g, '').split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean);
    add(m[2], specifiers);
  }
  // bare require('x') (e.g. require('crypto').randomUUID())
  const bareRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = bareRe.exec(content))) add(m[1], []);

  // import X, { a, b } from 'x'  |  import 'x'
  const impRe = /import\s+(?:([^;'"]+?)\s+from\s+)?['"]([^'"]+)['"]/g;
  while ((m = impRe.exec(content))) {
    const specifiers = (m[1] || '').replace(/[{}*]/g, '').split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    add(m[2], specifiers);
  }
  return out;
}

// Exports: CommonJS module.exports = {...} / exports.x, and ES `export ...`.
function parseExports(content) {
  const out = [];
  const lines = content.split('\n');
  const push = (name, kind, idx) => {
    if (!name) return;
    if (out.some(e => e.name === name)) return;
    out.push({ name, kind, line: idx + 1 });
  };

  lines.forEach((line, idx) => {
    let m;
    // exports.foo = ...
    if ((m = /^\s*exports\.([A-Za-z0-9_$]+)\s*=/.exec(line))) push(m[1], 'property', idx);
    // export function foo / export class Foo / export const foo / export async function
    if ((m = /^\s*export\s+(?:default\s+)?(?:async\s+)?(function|class|const|let|var)\s+([A-Za-z0-9_$]+)/.exec(line))) push(m[2], m[1], idx);
    // export { a, b }
    if ((m = /^\s*export\s+\{([^}]+)\}/.exec(line))) {
      m[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean).forEach(n => push(n, 'named', idx));
    }
  });

  // module.exports = { a, b, c }  — capture the object's keys/shorthand
  const meIdx = content.indexOf('module.exports');
  if (meIdx !== -1) {
    const objMatch = /module\.exports\s*=\s*\{([\s\S]*?)\}/.exec(content.slice(meIdx));
    if (objMatch) {
      const lineNo = content.slice(0, meIdx).split('\n').length;
      objMatch[1].split(',').forEach(part => {
        const key = part.split(':')[0].replace(/\/\/.*$/, '').trim();
        if (/^[A-Za-z0-9_$]+$/.test(key)) push(key, 'commonjs', lineNo - 1);
      });
    } else if (/module\.exports\s*=\s*[A-Za-z0-9_$]+/.test(content.slice(meIdx, meIdx + 80))) {
      const single = /module\.exports\s*=\s*([A-Za-z0-9_$]+)/.exec(content.slice(meIdx));
      if (single) push(single[1], 'commonjs', content.slice(0, meIdx).split('\n').length - 1);
    }
  }
  return out;
}

// Resolve a local import source to a repo-relative file_path that exists.
function resolveLocal(fromRel, source) {
  const fromDir = path.dirname(path.join(PROJECT_ROOT, fromRel));
  const base = path.resolve(fromDir, source);
  const candidates = [
    base,
    base + '.js', base + '.ts',
    path.join(base, 'index.js'), path.join(base, 'index.ts'),
  ];
  for (const c of candidates) {
    try {
      const st = fs.statSync(c);
      if (st.isFile()) return path.relative(PROJECT_ROOT, c);
    } catch (_) { /* try next */ }
  }
  return null; // unresolved (external pkg or missing file)
}

// --- File walking -----------------------------------------------------------
function walk(relDir, acc) {
  const abs = path.join(PROJECT_ROOT, relDir);
  let entries;
  try { entries = fs.readdirSync(abs); } catch (_) { return; }
  for (const name of entries) {
    if (FORBIDDEN_DIR.has(name) || name.startsWith('.')) continue;
    const childRel = path.join(relDir, name);
    const st = fs.statSync(path.join(PROJECT_ROOT, childRel));
    if (st.isDirectory()) walk(childRel, acc);
    else if (st.isFile() && CODE_EXT.has(path.extname(name)) && !SKIP_FILE_RE.test(name)) acc.push(childRel);
  }
}

function collectFiles() {
  const acc = [];
  for (const d of SCAN_DIRS) walk(d, acc);
  for (const f of ROOT_FILES) {
    try { if (fs.statSync(path.join(PROJECT_ROOT, f)).isFile()) acc.push(f); } catch (_) {}
  }
  return [...new Set(acc)].sort();
}

// --- Main -------------------------------------------------------------------
// Build the full set of rows (parse + invert graph). Pure: no DB access, so it
// can be required and reused (tests, SQL generation) without side effects.
function buildRows() {
  const files = collectFiles();
  const rows = {};        // file_path -> row
  for (const rel of files) {
    const abs = path.join(PROJECT_ROOT, rel);
    const content = fs.readFileSync(abs, 'utf8');
    const st = fs.statSync(abs);
    const { layer, pipeline_stage } = classify(rel.split(path.sep).join('/'));
    const imports = parseImports(content);
    const exportsArr = parseExports(content);

    const localDeps = [];
    for (const imp of imports) {
      if (!imp.is_local) continue;
      const resolved = resolveLocal(rel, imp.source);
      if (resolved) localDeps.push(resolved.split(path.sep).join('/'));
    }

    const relPath = rel.split(path.sep).join('/');
    rows[relPath] = {
      file_path: relPath,
      file_name: path.basename(rel),
      directory: path.dirname(rel) === '.' ? '.' : path.dirname(rel).split(path.sep).join('/'),
      language: path.extname(rel) === '.ts' ? 'typescript' : 'javascript',
      layer,
      pipeline_stage,
      purpose: extractPurpose(content),
      is_entrypoint: ENTRYPOINTS.has(relPath),
      size_bytes: st.size,
      line_count: content.split('\n').length,
      exports: exportsArr,
      exports_count: exportsArr.length,
      imports,
      local_dependencies: [...new Set(localDeps)],
      imported_by: [],
      fan_out: new Set(localDeps).size,
      fan_in: 0,
      content_hash: crypto.createHash('sha256').update(content).digest('hex'),
      indexed_at: new Date().toISOString(),
    };
  }

  // Invert dependencies → imported_by + fan_in.
  for (const row of Object.values(rows)) {
    for (const dep of row.local_dependencies) {
      if (rows[dep]) rows[dep].imported_by.push(row.file_path);
    }
  }
  for (const row of Object.values(rows)) {
    row.imported_by = [...new Set(row.imported_by)];
    row.fan_in = row.imported_by.length;
  }
  return Object.values(rows);
}

async function main() {
  const supabase = getSupabase();
  const payload = buildRows();
  console.log(`[index-architecture] upserting ${payload.length} rows into code_architecture...`);

  // Upsert in chunks on the file_path natural key.
  const CHUNK = 100;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const batch = payload.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('code_architecture')
      .upsert(batch, { onConflict: 'file_path' });
    if (error) {
      console.error(`[index-architecture] upsert failed at chunk ${i / CHUNK}:`, error.message);
      process.exit(1);
    }
  }

  // Prune rows for files that no longer exist.
  const { data: existing } = await supabase.from('code_architecture').select('file_path');
  if (existing) {
    const live = new Set(payload.map(r => r.file_path));
    const stale = existing.map(r => r.file_path).filter(fp => !live.has(fp));
    if (stale.length) {
      await supabase.from('code_architecture').delete().in('file_path', stale);
      console.log(`[index-architecture] pruned ${stale.length} stale rows.`);
    }
  }

  const byLayer = payload.reduce((a, r) => ((a[r.layer] = (a[r.layer] || 0) + 1), a), {});
  console.log('[index-architecture] done. by layer:', byLayer);
}

module.exports = { buildRows };

// Only hit the database when run directly (node scripts/index-architecture.js).
if (require.main === module) {
  main().catch((e) => { console.error('[index-architecture] fatal:', e); process.exit(1); });
}
