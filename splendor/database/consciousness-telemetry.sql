-- Splendor — The Remarkable AI · The Good Neighbor Guard
-- Audit repair Item 3 (Plan B): consciousness telemetry.
--
-- Additive only. Records one row per consciousness cycle so operators can tell
-- ACTIVE / IDLE / DISABLED / ERROR apart, and can distinguish "ran clean but
-- produced nothing" from "failed". No behavior change; measurement only.
-- Writes are best-effort from workers/consciousness-scheduler.js via
-- lib/consciousness-telemetry.js; if this table is absent the worker simply
-- logs the telemetry instead.

CREATE TABLE IF NOT EXISTS consciousness_telemetry (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_type TEXT,
  success BOOLEAN DEFAULT TRUE,
  errors INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  last_successful_run TIMESTAMPTZ,
  rows_produced INTEGER DEFAULT 0,
  rows_consumed INTEGER DEFAULT 0,
  worker_enabled BOOLEAN DEFAULT TRUE,
  scheduler_enabled BOOLEAN DEFAULT TRUE,
  inquiry_threads_created INTEGER DEFAULT 0,
  pending_communications_created INTEGER DEFAULT 0,
  proactive_conversations_created INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consciousness_telemetry_recorded_at
  ON consciousness_telemetry(recorded_at DESC);
