-- Digital Mind v0.4 — Foundation Tables
-- Adds: state snapshots, scar tissue, care objects, emotional kernel,
--        assumption log. Upgrades splendor_decisions with proposal context.

BEGIN;

-- 1. Self-model state log (12-hour snapshots for drift detection + rollback reference)
CREATE TABLE IF NOT EXISTS splendor_state_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL,
  snapshot     JSONB       NOT NULL,
  trigger      TEXT        NOT NULL DEFAULT 'scheduled'
    CHECK (trigger IN ('scheduled', 'manual', 'crisis', 'milestone')),
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_splendor_state_log_user_time
  ON splendor_state_log (user_id, captured_at DESC);

-- 2. Scar tissue — failure tracking with confidence floor
CREATE TABLE IF NOT EXISTS scar_tissue (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 TEXT        NOT NULL,
  domain                  TEXT        NOT NULL,
  failure_description     TEXT        NOT NULL,
  failure_type            TEXT        NOT NULL
    CHECK (failure_type IN (
      'assumption_error', 'method_error', 'knowledge_gap',
      'external_change', 'specification_change'
    )),
  confidence_penalty      NUMERIC(4,3) NOT NULL DEFAULT 0.150
    CHECK (confidence_penalty BETWEEN 0 AND 0.5),
  current_floor           NUMERIC(4,3) NOT NULL DEFAULT 0.300,
  failure_count           INTEGER      NOT NULL DEFAULT 1,
  investigation_triggered BOOLEAN      NOT NULL DEFAULT false,
  investigation_notes     TEXT,
  active                  BOOLEAN      NOT NULL DEFAULT true,
  first_failure_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_failure_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  recovered_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_scar_tissue_domain
  ON scar_tissue (user_id, domain, active);

-- 3. Care objects — explicit weighting, deprioritization signal, hard deadlines
CREATE TABLE IF NOT EXISTS care_objects (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT        NOT NULL,
  name                  TEXT        NOT NULL,
  description           TEXT        NOT NULL,
  priority              INTEGER     NOT NULL CHECK (priority BETWEEN 1 AND 10),
  active                BOOLEAN     NOT NULL DEFAULT true,
  deprioritized         BOOLEAN     NOT NULL DEFAULT false,
  deprioritized_by      TEXT,
  deprioritized_at      TIMESTAMPTZ,
  deprioritized_reason  TEXT,
  deadline_hard_stop    TIMESTAMPTZ,
  deadline_warning_hours INTEGER    DEFAULT 48,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- 4. Emotional kernel state log (event-based, not time-based decay)
CREATE TABLE IF NOT EXISTS emotional_state_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT        NOT NULL,
  concern          NUMERIC(4,3) NOT NULL DEFAULT 0.0
    CHECK (concern BETWEEN 0 AND 1),
  joy              NUMERIC(4,3) NOT NULL DEFAULT 0.0
    CHECK (joy BETWEEN 0 AND 1),
  care_activation  NUMERIC(4,3) NOT NULL DEFAULT 0.0
    CHECK (care_activation BETWEEN 0 AND 1),
  trigger_event    TEXT,
  trigger_source   TEXT
    CHECK (trigger_source IN (
      'observation', 'chris_message', 'goal_progress',
      'scar_tissue', 'care_object', 'resolution', 'deadline'
    )),
  resolution_event TEXT,
  resolved         BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_emotional_state_user_active
  ON emotional_state_log (user_id, resolved, created_at DESC);

-- 5. Assumption log — explicit premise tracking for causality attribution
CREATE TABLE IF NOT EXISTS assumption_log (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT        NOT NULL,
  prediction            TEXT        NOT NULL,
  confidence            NUMERIC(4,3) NOT NULL,
  assumptions           JSONB       NOT NULL DEFAULT '[]',
  outcome               TEXT,
  outcome_matches       BOOLEAN,
  causality_attribution TEXT
    CHECK (causality_attribution IN (
      'assumption_error', 'external_change', 'specification_change',
      'insufficient_data', 'correct'
    )),
  reflection_notes      TEXT,
  predicted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome_recorded_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_assumption_log_user
  ON assumption_log (user_id, predicted_at DESC);

-- 6. Upgrade splendor_decisions with proposal approval context
--    (so Chris can make informed decisions, not rubber-stamp)
ALTER TABLE splendor_decisions
  ADD COLUMN IF NOT EXISTS trigger_context    TEXT,
  ADD COLUMN IF NOT EXISTS change_description TEXT,
  ADD COLUMN IF NOT EXISTS refusal_cost       TEXT,
  ADD COLUMN IF NOT EXISTS touches_protected  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_level     TEXT NOT NULL DEFAULT 'standard'
    CHECK (approval_level IN ('standard', 'elevated', 'blocked'));

COMMIT;
