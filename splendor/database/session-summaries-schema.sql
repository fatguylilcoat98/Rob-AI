-- =============================================================================
-- Splendor — Session Summaries (automated conversation summary → approval gate)
-- Built by Christopher Hughes · Sacramento, CA
--
-- Every consciousness deep-reflection cycle (~6h), Splendor summarizes the
-- conversation that happened since the last summary and STAGES it here for
-- human review. Nothing reaches semantic_facts until Chris approves a row.
-- Idempotent — safe to run repeatedly.
-- =============================================================================

CREATE TABLE IF NOT EXISTS session_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- When the summary was generated and the message window it covers
  cycle_timestamp       TIMESTAMPTZ DEFAULT NOW(),
  message_window_start  TIMESTAMPTZ,
  message_window_end    TIMESTAMPTZ,
  message_count         INTEGER DEFAULT 0,

  -- AI-generated content
  summary_text  TEXT NOT NULL,
  key_facts     JSONB DEFAULT '[]'::jsonb,  -- [{fact: string, confidence: 0-1}]

  -- Review lifecycle: staged → approved | rejected
  status         TEXT NOT NULL DEFAULT 'staged'
                 CHECK (status IN ('staged', 'approved', 'rejected')),
  approval_notes TEXT,

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_session_summaries_user_status
  ON session_summaries(user_id, status);
CREATE INDEX IF NOT EXISTS idx_session_summaries_cycle
  ON session_summaries(user_id, cycle_timestamp DESC);

-- RLS: single-owner app; service-role workers and the owner route bypass via
-- the service key. Permissive policy mirrors the existing semantic_facts setup.
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'session_summaries' AND policyname = 'session_summaries_policy'
  ) THEN
    CREATE POLICY session_summaries_policy ON session_summaries FOR ALL USING (true);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Provenance columns on semantic_facts so an approved summary's facts carry
-- where they came from. Additive + guarded — existing rows/readers unaffected
-- (loadSemanticMemory only selects fact_text / semantic_type / confidence_score).
-- -----------------------------------------------------------------------------
-- semantic_facts is the approval target: an approved summary's key_facts are
-- promoted here. It is canonically defined in 6-layer-memory-schema.sql, but
-- that schema may not have been applied to every environment — so create it
-- here IF NOT EXISTS (idempotent, no-op where it already exists). We omit the
-- canonical FK on source_episode_id -> episodes(id) so this migration is
-- self-contained and doesn't depend on the episodes table existing; the column
-- is kept as a plain UUID and readers (loadSemanticMemory) only select
-- fact_text / semantic_type / confidence_score / is_active / last_confirmed.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS semantic_facts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  fact_text TEXT NOT NULL,
  semantic_type TEXT NOT NULL,            -- preference | relationship | identity | goal | pattern
  confidence_score FLOAT DEFAULT 1.0,
  source_episode_id UUID,                 -- canonical FK omitted (see note above)
  last_confirmed TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  superseded_by UUID REFERENCES semantic_facts(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_semantic_facts_user_type ON semantic_facts(user_id, semantic_type);
CREATE INDEX IF NOT EXISTS idx_semantic_facts_active    ON semantic_facts(user_id, is_active);

ALTER TABLE semantic_facts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'semantic_facts' AND policyname = 'semantic_facts_policy'
  ) THEN
    CREATE POLICY semantic_facts_policy ON semantic_facts FOR ALL USING (true);
  END IF;
END $$;

-- Provenance columns so an approved summary's facts carry where they came
-- from. Additive + guarded — existing rows/readers unaffected.
ALTER TABLE semantic_facts ADD COLUMN IF NOT EXISTS provenance TEXT;
ALTER TABLE semantic_facts ADD COLUMN IF NOT EXISTS source      TEXT;
ALTER TABLE semantic_facts ADD COLUMN IF NOT EXISTS source_id   UUID;
ALTER TABLE semantic_facts ADD COLUMN IF NOT EXISTS trust_level TEXT;
