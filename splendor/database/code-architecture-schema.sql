-- =============================================================================
-- Splendor — Code Architecture Self-Index
-- Built by Christopher Hughes · Sacramento, CA
--
-- A queryable map of Splendor's own source tree so she can diagnose her
-- architecture when debugging. One row per source file. The dependency graph
-- (local_dependencies + imported_by) lets her trace the live request path:
--   user message → memory retrieval → response generation → output governance
-- by walking import edges, while (layer, pipeline_stage) let her filter by
-- role. Idempotent — safe to re-run on every deploy (upsert on file_path).
-- =============================================================================

CREATE TABLE IF NOT EXISTS code_architecture (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identity (file_path is the natural key; relative to repo root)
  file_path   TEXT NOT NULL UNIQUE,      -- 'lib/anthropic.js'
  file_name   TEXT NOT NULL,             -- 'anthropic.js'
  directory   TEXT NOT NULL,             -- 'lib' | 'routes' | 'lib/memory' | '.'
  language    TEXT NOT NULL,             -- 'javascript' | 'typescript'

  -- Role in the architecture
  layer          TEXT NOT NULL,          -- routes | retrieval | memory | generation
                                         -- | governance | brain | consciousness
                                         -- | continuity | voice | infrastructure
                                         -- | entrypoint | other
  pipeline_stage INTEGER,                -- hot-path order for the trace, 1..5;
                                         -- NULL = off the request hot path
  purpose        TEXT,                   -- 1-line description (from file header)
  is_entrypoint  BOOLEAN DEFAULT FALSE,  -- server.js / splendor-brain.js

  -- Size
  size_bytes  INTEGER NOT NULL,
  line_count  INTEGER NOT NULL,

  -- Interface
  exports        JSONB DEFAULT '[]'::jsonb,  -- [{ name, kind, line }]
  exports_count  INTEGER DEFAULT 0,

  -- Dependency graph
  imports            JSONB DEFAULT '[]'::jsonb,  -- [{ source, specifiers[], is_local }]
  local_dependencies JSONB DEFAULT '[]'::jsonb,  -- resolved local file_paths this file imports
  imported_by        JSONB DEFAULT '[]'::jsonb,  -- reverse deps: file_paths that import this file
  fan_out            INTEGER DEFAULT 0,          -- # local files this imports (coupling)
  fan_in             INTEGER DEFAULT 0,          -- # files that import this (centrality)

  -- Change detection
  content_hash TEXT,                     -- sha256 of file content
  indexed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_code_arch_layer    ON code_architecture(layer);
CREATE INDEX IF NOT EXISTS idx_code_arch_stage    ON code_architecture(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_code_arch_dir      ON code_architecture(directory);
CREATE INDEX IF NOT EXISTS idx_code_arch_fan_in   ON code_architecture(fan_in DESC);
-- GIN indexes so she can ask "who imports X" / "what does X pull in" fast.
CREATE INDEX IF NOT EXISTS idx_code_arch_localdeps ON code_architecture USING GIN (local_dependencies);
CREATE INDEX IF NOT EXISTS idx_code_arch_importedby ON code_architecture USING GIN (imported_by);

-- Single-owner app: permissive RLS mirroring the rest of the schema.
ALTER TABLE code_architecture ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'code_architecture' AND policyname = 'code_architecture_policy'
  ) THEN
    CREATE POLICY code_architecture_policy ON code_architecture FOR ALL USING (true);
  END IF;
END $$;
