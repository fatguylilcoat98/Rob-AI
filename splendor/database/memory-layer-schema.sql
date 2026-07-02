-- Human-Inspired Memory Layering v1
-- Migration: add layer fields to memory_items + new memory_layer_events log table
-- Applied to Supabase project ksbyzduayettfwsmsqwy
-- This is NOT a consciousness claim. This is continuity engineering.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. New columns on memory_items
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE memory_items
  ADD COLUMN IF NOT EXISTS memory_layer          TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS secondary_layers      TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS salience_score        NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retention_policy      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retrieval_priority    NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_retrieved_at     TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retrieval_count       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decay_status          TEXT DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS source_reliability    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS evidence_summary      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS layer_classified_at   TIMESTAMPTZ DEFAULT NULL;

-- Constraints (best-effort — ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS
-- requires Postgres 9.6+ and is standard; Supabase supports it)
ALTER TABLE memory_items
  ADD CONSTRAINT IF NOT EXISTS memory_layer_check
    CHECK (memory_layer IS NULL OR memory_layer IN (
      'WORKING_CONTEXT',
      'EPISODIC_MEMORY',
      'SEMANTIC_MEMORY',
      'PROCEDURAL_MEMORY',
      'SALIENCE_MEMORY',
      'RELATIONSHIP_MEMORY',
      'SELF_MODEL_MEMORY',
      'GOVERNANCE_MEMORY',
      'TRAJECTORY_MEMORY'
    ));

ALTER TABLE memory_items
  ADD CONSTRAINT IF NOT EXISTS retention_policy_check
    CHECK (retention_policy IS NULL OR retention_policy IN (
      'SESSION_ONLY',
      'SHORT_TERM',
      'LONG_TERM',
      'ARCHIVAL',
      'IMMUTABLE_GOVERNANCE',
      'REVIEW_REQUIRED'
    ));

ALTER TABLE memory_items
  ADD CONSTRAINT IF NOT EXISTS decay_status_check
    CHECK (decay_status IN ('ACTIVE', 'AGING', 'STALE', 'ARCHIVED', 'RETIRED'));

-- Index for layer-based queries
CREATE INDEX IF NOT EXISTS idx_memory_items_memory_layer
  ON memory_items (memory_layer)
  WHERE memory_layer IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_items_decay_status
  ON memory_items (decay_status);

CREATE INDEX IF NOT EXISTS idx_memory_items_retrieval_priority
  ON memory_items (retrieval_priority DESC NULLS LAST)
  WHERE active = true AND approval_status = 'approved';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. memory_layer_events — append-only classification/retrieval/decay log
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_layer_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id       UUID REFERENCES memory_items(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,
  memory_layer    TEXT,
  secondary_layers TEXT[],
  retention_policy TEXT,
  decay_status    TEXT,
  retrieval_priority NUMERIC,
  reason          TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_layer_events_memory_id
  ON memory_layer_events (memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_layer_events_event_type
  ON memory_layer_events (event_type);

CREATE INDEX IF NOT EXISTS idx_memory_layer_events_created_at
  ON memory_layer_events (created_at DESC);

-- event_type values:
--   memory_layer_classified  — first classification of a memory item
--   memory_layer_reclassified — layer changed on an existing item
--   memory_layer_retrieved   — item surfaced in a retrieval pass
--   memory_layer_decay_aged  — decay_status moved to AGING
--   memory_layer_decay_stale — decay_status moved to STALE
--   memory_layer_decay_archived — decay_status moved to ARCHIVED
--   memory_layer_decay_retired — decay_status moved to RETIRED (soft-delete only)
