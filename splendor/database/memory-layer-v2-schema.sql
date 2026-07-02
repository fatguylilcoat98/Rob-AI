-- Human-Inspired Memory Layering v2 — Phase 1 Schema
-- Adds verification_status to memory_items
-- Adds time_windows + scan tracking to ri_trajectories

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. verification_status on memory_items
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE memory_items
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNKNOWN';

ALTER TABLE memory_items
  ADD CONSTRAINT IF NOT EXISTS verification_status_check
    CHECK (verification_status IN ('SUPPORTED', 'PARTIALLY_SUPPORTED', 'CONTRADICTED', 'UNKNOWN'));

CREATE INDEX IF NOT EXISTS idx_memory_items_verification_status
  ON memory_items (verification_status)
  WHERE verification_status != 'UNKNOWN';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Trajectory resonance columns on ri_trajectories
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE ri_trajectories
  ADD COLUMN IF NOT EXISTS time_windows                   JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS counterexample_scan_completed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resonance_blocked_reason       TEXT DEFAULT NULL;

-- Add WEAKENED to valid status values by ensuring downstream code handles it.
-- (CHECK constraint on ri_trajectories.status not altered here — leave to
--  application layer to handle WEAKENED gracefully.)
