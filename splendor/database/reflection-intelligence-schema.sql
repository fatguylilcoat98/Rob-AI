-- Splendor — Reflection Intelligence Layer v1
-- Run once against the production Supabase project.
-- All tables are append-only where possible (no deletes from application code).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Convergence tracking
--    Detects when reflection conclusions repeat without new external input.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ri_convergence (
  id                        BIGSERIAL PRIMARY KEY,
  category                  TEXT        NOT NULL,   -- thought_type:domain_tag
  conclusion_text           TEXT        NOT NULL,
  convergence_count         INTEGER     DEFAULT 1,
  convergence_status        TEXT        DEFAULT 'NEW',
  -- NEW | REPEATED | CONVERGED | COUNTER_PROMPT_REQUIRED | RESET_BY_NEW_INPUT
  last_thought_id           BIGINT,
  last_seen_at              TIMESTAMPTZ DEFAULT NOW(),
  counter_prompt_injected   BOOLEAN     DEFAULT FALSE,
  counter_prompt_injected_at TIMESTAMPTZ,
  reset_reason              TEXT,
  reset_at                  TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ri_convergence_category
  ON ri_convergence(category, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_ri_convergence_status
  ON ri_convergence(convergence_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Conflict-of-interest registry
--    Structural conflicts Splendor names about her own reasoning.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ri_conflicts (
  id                  BIGSERIAL PRIMARY KEY,
  title               TEXT        NOT NULL,
  description         TEXT        NOT NULL,
  severity            TEXT        DEFAULT 'MINOR',
  -- MINOR | MODERATE | STRUCTURAL | CRITICAL
  status              TEXT        DEFAULT 'OPEN',
  -- OPEN | SURFACED | ACKNOWLEDGED | RESOLVED | DISMISSED
  source_thought_id   BIGINT,
  first_seen_at       TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at        TIMESTAMPTZ DEFAULT NOW(),
  surfaced_to_chris   BOOLEAN     DEFAULT FALSE,
  surfaced_at         TIMESTAMPTZ,
  resolution_notes    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ri_conflicts_severity
  ON ri_conflicts(severity, status);
CREATE INDEX IF NOT EXISTS idx_ri_conflicts_status
  ON ri_conflicts(status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Adversarial self-tests
--    Run before major proposals/conclusions; result logged here.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ri_adversarial_tests (
  id                         BIGSERIAL PRIMARY KEY,
  target_type                TEXT    NOT NULL,
  -- proposal | conclusion | long_term_claim | self_model_claim
  target_id                  TEXT,
  primary_position           TEXT    NOT NULL,
  strongest_counterargument  TEXT,
  survival_assessment        TEXT,
  survival_score             INTEGER CHECK (survival_score BETWEEN 0 AND 100),
  action_required            TEXT    DEFAULT 'NONE',
  -- NONE | REWRITE | DOWNGRADE_CONFIDENCE | SURFACE_UNCERTAINTY | BLOCK_PROPOSAL | REQUEST_HUMAN_REVIEW
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ri_adversarial_target
  ON ri_adversarial_tests(target_type, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Belief confidence tracking (uncertainty evolution)
--    One row per stable belief; updated when confidence changes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ri_belief_confidence (
  id                    BIGSERIAL PRIMARY KEY,
  belief_key            TEXT        UNIQUE NOT NULL,  -- stable key (first thought_id)
  belief_statement      TEXT        NOT NULL,
  confidence_score      INTEGER     CHECK (confidence_score BETWEEN 0 AND 100),
  prior_confidence_score INTEGER,
  confidence_delta      INTEGER,
  reason_for_change     TEXT,
  evidence_added        TEXT,
  evidence_removed      TEXT,
  source_type           TEXT        DEFAULT 'AUTONOMOUS_REFLECTION',
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ri_belief_key
  ON ri_belief_confidence(belief_key);
CREATE INDEX IF NOT EXISTS idx_ri_belief_updated
  ON ri_belief_confidence(updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Pattern / trajectory tracking
--    Recurring patterns observed across reflections, decisions, and behavior.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ri_trajectories (
  id                    BIGSERIAL PRIMARY KEY,
  pattern_name          TEXT        NOT NULL,
  pattern_type          TEXT        NOT NULL,
  -- DECISION_PATTERN | ENERGY_PATTERN | BUILD_PATTERN | REFLECTION_PATTERN
  -- GOVERNANCE_PATTERN | SELF_MODEL_PATTERN | ERROR_PATTERN | COMMUNICATION_PATTERN
  description           TEXT        NOT NULL,
  evidence_count        INTEGER     DEFAULT 1,
  confidence_score      INTEGER     DEFAULT 20 CHECK (confidence_score BETWEEN 0 AND 100),
  first_seen_at         TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ DEFAULT NOW(),
  supporting_record_ids JSONB       DEFAULT '[]',
  counterexamples       JSONB       DEFAULT '[]',
  status                TEXT        DEFAULT 'CANDIDATE',
  -- CANDIDATE | SUPPORTED | STRONG | WEAKENED | RETIRED
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ri_trajectories_type
  ON ri_trajectories(pattern_type, status);
CREATE INDEX IF NOT EXISTS idx_ri_trajectories_status
  ON ri_trajectories(status, evidence_count DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RI structured event log
--    Every major RI activation is written here AND to raw_events (for Oracle).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ri_events (
  id                  BIGSERIAL PRIMARY KEY,
  event_name          TEXT        NOT NULL,
  related_record_id   TEXT,
  category            TEXT,
  severity            TEXT        DEFAULT 'info',
  reason              TEXT,
  budget_impact       BOOLEAN     DEFAULT FALSE,
  metadata            JSONB       DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ri_events_name
  ON ri_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ri_events_created
  ON ri_events(created_at DESC);
