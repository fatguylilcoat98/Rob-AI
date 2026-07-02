/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back

  SELF-INTROSPECTION ROUTE
  Two endpoints that let Splendor read her own codebase:

    POST /api/self/browse  — list directory contents within allowed roots
    POST /api/self/read    — read a single source file

  Security contract:
  - ALLOWED_ROOTS defines the only directory prefixes and specific root files
    that may be accessed. Any resolved path that does not start with an
    allowed prefix is rejected 403.
  - path.resolve() is called before the prefix check — no symlink or
    traversal sequence can escape the root.
  - FORBIDDEN_SEGMENTS blocks common secret/build directories by name.
  - File reads are capped at MAX_FILE_SIZE (1 MB).
  - Browse depth is capped at MAX_DEPTH (3 path segments from project root).
  - Gated by requireAuth + requireOwner. CLASPION middleware is mounted
    globally in server.js; no per-route double-gating is needed here.
*/

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { recordMetric } = require('../lib/behavioral-metrics');

const router = express.Router();

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Resolved absolute paths that are browseable / readable.
// Directories: anything under these prefixes is allowed.
// Root files: exact-match only.
const ALLOWED_ROOTS = [
  path.join(PROJECT_ROOT, 'lib'),
  path.join(PROJECT_ROOT, 'routes'),
  path.join(PROJECT_ROOT, 'splendor-brain.js'),
  path.join(PROJECT_ROOT, 'server.js'),
  path.join(PROJECT_ROOT, 'package.json'),
];

// Directory / file name segments that are always forbidden.
const FORBIDDEN_SEGMENTS = new Set([
  'node_modules', '.git', 'dist', 'build',
]);
const FORBIDDEN_PREFIX_RE = /^\.env/i;

const MAX_DEPTH         = 3;   // max path depth allowed in browse requests
const MAX_FILES_PER_DIR = 200; // truncate directory listings beyond this
const MAX_FILE_SIZE     = 1 * 1024 * 1024; // 1 MB

const EXT_LANGUAGE = {
  '.js':   'javascript',
  '.ts':   'typescript',
  '.json': 'json',
  '.sql':  'sql',
  '.md':   'markdown',
  '.html': 'html',
  '.css':  'css',
  '.sh':   'shell',
};

function inferLanguage(filePath) {
  return EXT_LANGUAGE[path.extname(filePath).toLowerCase()] || 'text';
}

function isAllowed(resolved) {
  for (const root of ALLOWED_ROOTS) {
    if (resolved === root) return true;
    if (resolved.startsWith(root + path.sep)) return true;
  }
  return false;
}

function hasForbiddenSegment(resolved) {
  for (const seg of resolved.split(path.sep)) {
    if (FORBIDDEN_SEGMENTS.has(seg)) return true;
    if (FORBIDDEN_PREFIX_RE.test(seg)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// POST /api/self/browse
// Body: { path?: string, maxDepth?: number }
// ---------------------------------------------------------------------------
router.post('/browse', requireAuth, requireOwner, async (req, res) => {
  const { path: reqPath = '', maxDepth: rawDepth } = req.body || {};
  const userId    = req.userId || (req.user && req.user.id) || null;
  const browse_at = new Date().toISOString();
  const browse_id = crypto.randomUUID();

  const effectiveDepth = (typeof rawDepth === 'number' && rawDepth > 0)
    ? Math.min(rawDepth, MAX_DEPTH)
    : MAX_DEPTH;

  // Count path segments to enforce depth limit.
  const segments = reqPath
    ? reqPath.replace(/^\/|\/$/g, '').split('/').filter(Boolean)
    : [];
  if (segments.length > effectiveDepth) {
    return res.status(403).json({
      error: `path depth ${segments.length} exceeds maxDepth ${effectiveDepth}`,
      browse_at,
      browse_id,
    });
  }

  const resolved = reqPath ? path.resolve(PROJECT_ROOT, reqPath) : PROJECT_ROOT;

  if (hasForbiddenSegment(resolved)) {
    return res.status(403).json({ error: 'path contains forbidden segment', browse_at, browse_id });
  }

  // Root-level browse: return only the allowed root entries.
  if (resolved === PROJECT_ROOT) {
    const files = [];
    const directories = [];
    for (const root of ALLOWED_ROOTS) {
      try {
        const s = fs.statSync(root);
        const name = path.basename(root);
        if (s.isDirectory()) {
          let fileCount = 0;
          try { fileCount = fs.readdirSync(root).length; } catch (_) {}
          directories.push({ name, type: 'directory', fileCount });
        } else {
          let lines = null;
          try { lines = fs.readFileSync(root, 'utf8').split('\n').length; } catch (_) {}
          files.push({ name, type: 'file', size: s.size, lines, modified: s.mtime.toISOString() });
        }
      } catch (_) {}
    }
    try { await recordMetric(userId, 'introspection_browse', 1, { path: PROJECT_ROOT, fileCount: files.length + directories.length, browse_id }); } catch (_) {}
    console.log(`[SELF-INTROSPECTION] ${userId || 'unknown'} browsed root (id=${browse_id})`);
    return res.json({ currentPath: PROJECT_ROOT, files, directories, truncated: false, browse_at, browse_id });
  }

  if (!isAllowed(resolved)) {
    return res.status(403).json({
      error: 'path is outside introspection whitelist',
      browse_at,
      browse_id,
    });
  }

  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'path not found', browse_at, browse_id });
    }
    return res.status(500).json({ error: 'could not stat path', browse_at, browse_id });
  }

  if (stat.isFile()) {
    return res.status(400).json({ error: 'path is a file; use /api/self/read', browse_at, browse_id });
  }
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'path is not a readable directory', browse_at, browse_id });
  }

  let names;
  try {
    names = fs.readdirSync(resolved).sort();
  } catch (err) {
    return res.status(500).json({ error: 'could not read directory', browse_at, browse_id });
  }

  const files = [];
  const directories = [];
  let truncated = false;

  for (const name of names) {
    if (files.length + directories.length >= MAX_FILES_PER_DIR) { truncated = true; break; }
    if (FORBIDDEN_SEGMENTS.has(name) || FORBIDDEN_PREFIX_RE.test(name)) continue;

    const childPath = path.join(resolved, name);
    let childStat;
    try { childStat = fs.statSync(childPath); } catch (_) { continue; }

    if (childStat.isDirectory()) {
      let fileCount = 0;
      try { fileCount = fs.readdirSync(childPath).length; } catch (_) {}
      directories.push({ name, type: 'directory', fileCount });
    } else if (childStat.isFile()) {
      let lines = null;
      try {
        if (childStat.size < 512 * 1024) {
          lines = fs.readFileSync(childPath, 'utf8').split('\n').length;
        }
      } catch (_) {}
      files.push({
        name,
        type: 'file',
        size: childStat.size,
        lines,
        modified: childStat.mtime.toISOString(),
      });
    }
  }

  const currentPath = resolved; // absolute path per spec
  const fileCount = files.length + directories.length;
  try { await recordMetric(userId, 'introspection_browse', 1, { path: currentPath, fileCount, browse_id }); } catch (_) {}
  console.log(`[SELF-INTROSPECTION] ${userId || 'unknown'} browsed ${currentPath} (${files.length} files, ${directories.length} dirs, id=${browse_id})`);

  return res.json({ currentPath, files, directories, truncated, browse_at, browse_id });
});

// ---------------------------------------------------------------------------
// POST /api/self/read
// Body: { filepath: string }
// ---------------------------------------------------------------------------
router.post('/read', requireAuth, requireOwner, async (req, res) => {
  const { filepath } = req.body || {};
  const userId       = req.userId || (req.user && req.user.id) || null;
  const read_at      = new Date().toISOString();
  const introspection_id = crypto.randomUUID();

  if (!filepath) {
    return res.status(400).json({ error: 'filepath is required', read_at, introspection_id });
  }

  const resolved = path.resolve(PROJECT_ROOT, filepath);

  if (hasForbiddenSegment(resolved)) {
    return res.status(403).json({ error: 'path contains forbidden segment', read_at, introspection_id });
  }

  if (!isAllowed(resolved)) {
    return res.status(403).json({
      error: 'filepath is outside introspection whitelist',
      filepath,
      allowed_roots: ['lib/', 'routes/', 'splendor-brain.js', 'server.js', 'package.json'],
      read_at,
      introspection_id,
    });
  }

  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'file not found', filepath, read_at, introspection_id });
    }
    return res.status(500).json({ error: 'could not stat file', read_at, introspection_id });
  }

  if (!stat.isFile()) {
    return res.status(400).json({ error: 'path is a directory; use /api/self/browse', read_at, introspection_id });
  }

  if (stat.size > MAX_FILE_SIZE) {
    return res.status(413).json({
      error: 'file exceeds maximum readable size (1 MB)',
      size: stat.size,
      max: MAX_FILE_SIZE,
      read_at,
      introspection_id,
    });
  }

  let content;
  try {
    content = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    console.error('[SELF-INTROSPECTION] read failed:', err.message);
    return res.status(500).json({ error: 'could not read file', read_at, introspection_id });
  }

  const lines = content.split('\n').length;
  const language = inferLanguage(resolved);

  try {
    await recordMetric(userId, 'introspection_file_read', 1, {
      filepath,
      lines,
      size: stat.size,
      user_id: userId,
      timestamp: read_at,
      introspection_id,
    });
  } catch (_) {}

  console.log(`[SELF-INTROSPECTION] ${userId || 'unknown'} read ${filepath} (${lines} lines, id=${introspection_id})`);

  return res.json({
    filepath,
    content,
    lines,
    size: stat.size,
    language,
    introspection_id,
    read_at,
  });
});

module.exports = router;
