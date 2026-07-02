-- Governance Continuity Safeguards v1 schema

-- Cadence Mirror: tracks intended vs actual resolution cadence
CREATE TABLE IF NOT EXISTS governance_cadence_mirrors (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner                           TEXT NOT NULL,
  target_type                     TEXT NOT NULL DEFAULT 'flag_resolution',
  intended_resolution_hours       INTEGER NOT NULL DEFAULT 24,
  actual_average_resolution_hours FLOAT,
  trailing_window_days            INTEGER NOT NULL DEFAULT 7,
  dismissed_nudge_count           INTEGER NOT NULL DEFAULT 0,
  last_nudge_at                   TIMESTAMPTZ,
  cadence_status                  TEXT NOT NULL DEFAULT 'ON_TRACK'
    CHECK (cadence_status IN ('ON_TRACK','DRIFTING','MISALIGNED','REVIEW_REQUIRED')),
  updated_at                      TIMESTAMPTZ DEFAULT NOW(),
  created_at                      TIMESTAMPTZ DEFAULT NOW()
);

-- Resolution Queue Health: point-in-time snapshots
CREATE TABLE IF NOT EXISTS resolution_queue_health (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner                            TEXT NOT NULL,
  open_flags_count                 INTEGER NOT NULL DEFAULT 0,
  oldest_unresolved_flag_age_hours FLOAT,
  average_resolution_time_hours    FLOAT,
  recent_resolution_speed          TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK (recent_resolution_speed IN ('NORMAL','FAST','VERY_FAST')),
  rushed_resolution_suspected      BOOLEAN NOT NULL DEFAULT FALSE,
  queue_health_status              TEXT NOT NULL DEFAULT 'HEALTHY'
    CHECK (queue_health_status IN ('HEALTHY','WATCH','STRAINED','OVERLOADED')),
  checked_at                       TIMESTAMPTZ DEFAULT NOW(),
  created_at                       TIMESTAMPTZ DEFAULT NOW()
);

-- Retroactive Safety Scans: scan jobs triggered by governance changes
CREATE TABLE IF NOT EXISTS retroactive_safety_scans (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner                         TEXT NOT NULL,
  governance_change_id          TEXT,
  governance_change_description TEXT,
  scanned_record_count          INTEGER NOT NULL DEFAULT 0,
  conflict_count                INTEGER NOT NULL DEFAULT 0,
  safety_critical_count         INTEGER NOT NULL DEFAULT 0,
  status                        TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','ERROR')),
  created_at                    TIMESTAMPTZ DEFAULT NOW(),
  completed_at                  TIMESTAMPTZ
);

-- Retroactive Scan Conflicts: individual conflicts found during a scan
-- Original records are NEVER modified — only annotated here
CREATE TABLE IF NOT EXISTS retroactive_scan_conflicts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id              UUID NOT NULL REFERENCES retroactive_safety_scans(id),
  record_type          TEXT NOT NULL,
  record_id            TEXT NOT NULL,
  conflict_description TEXT NOT NULL,
  conflict_severity    TEXT NOT NULL DEFAULT 'HISTORICAL_ONLY'
    CHECK (conflict_severity IN ('SAFETY_CRITICAL','STRUCTURAL','PREFERENCE_LEVEL','HISTORICAL_ONLY')),
  annotation           TEXT,
  status               TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','REVIEWED','RESOLVED')),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Delegate Ledger: provisional decisions made by non-Chris actors
CREATE TABLE IF NOT EXISTS delegate_ledger (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner                       TEXT NOT NULL,
  delegate_identity           TEXT NOT NULL,
  delegate_type               TEXT NOT NULL DEFAULT 'HUMAN'
    CHECK (delegate_type IN ('HUMAN','AI','SYSTEM')),
  decision_text               TEXT NOT NULL,
  target_record_id            TEXT,
  authority_scope             TEXT NOT NULL DEFAULT 'limited',
  status                      TEXT NOT NULL DEFAULT 'PROVISIONAL'
    CHECK (status IN ('PROVISIONAL','RATIFIED','REJECTED','EXPIRED')),
  requires_chris_ratification BOOLEAN NOT NULL DEFAULT TRUE,
  ratified_by_chris           BOOLEAN,
  ratified_at                 TIMESTAMPTZ,
  expires_at                  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Dormant Mode State: one row per owner, upserted on each check
CREATE TABLE IF NOT EXISTS dormant_mode_state (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner                       TEXT NOT NULL UNIQUE,
  continuity_state            TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (continuity_state IN ('ACTIVE','SOFT_MAINTENANCE','DORMANT_READ_ONLY','ADMIN_REVIEW_REQUIRED')),
  last_owner_activity_at      TIMESTAMPTZ,
  soft_maintenance_entered_at TIMESTAMPTZ,
  dormant_entered_at          TIMESTAMPTZ,
  reactivated_at              TIMESTAMPTZ,
  notes                       TEXT,
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Governance Continuity Events: append-only safeguard audit log
CREATE TABLE IF NOT EXISTS governance_continuity_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner      TEXT,
  event_type TEXT NOT NULL,
  safeguard  TEXT NOT NULL,
  details    JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Governance version columns on memory_items
ALTER TABLE memory_items
  ADD COLUMN IF NOT EXISTS governance_version            TEXT DEFAULT 'UNKNOWN_LEGACY',
  ADD COLUMN IF NOT EXISTS governance_effective_date     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governing_rules_snapshot_id  TEXT,
  ADD COLUMN IF NOT EXISTS formed_under_prior_governance BOOLEAN DEFAULT TRUE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gc_events_owner_type   ON governance_continuity_events(owner, event_type);
CREATE INDEX IF NOT EXISTS idx_gc_events_safeguard    ON governance_continuity_events(safeguard, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retro_conflicts_scan   ON retroactive_scan_conflicts(scan_id);
CREATE INDEX IF NOT EXISTS idx_delegate_ledger_status ON delegate_ledger(owner, status);
CREATE INDEX IF NOT EXISTS idx_rqh_owner_checked      ON resolution_queue_health(owner, checked_at DESC);
