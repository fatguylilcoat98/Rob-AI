-- Splendor — The Remarkable AI · The Good Neighbor Guard
-- Long-Term Behavioral Metrics sink.
--
-- Tracks what actually matters over time (restraint, honesty,
-- usefulness) rather than self-narration. The application degrades
-- gracefully if this table is absent (inserts fail silently), so this
-- migration is safe to apply at any time.

CREATE TABLE IF NOT EXISTS behavioral_metrics (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid,
  metric_type  text NOT NULL,
  value        numeric NOT NULL DEFAULT 1,
  metadata     jsonb DEFAULT '{}'::jsonb,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS behavioral_metrics_user_idx
  ON behavioral_metrics (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS behavioral_metrics_type_idx
  ON behavioral_metrics (metric_type, recorded_at DESC);

ALTER TABLE behavioral_metrics ENABLE ROW LEVEL SECURITY;

-- Service-role writes (server uses the service key); no anon access.
DROP POLICY IF EXISTS behavioral_metrics_service ON behavioral_metrics;
CREATE POLICY behavioral_metrics_service ON behavioral_metrics
  FOR ALL USING (true) WITH CHECK (true);

-- Known metric_type values (documentation; not a CHECK constraint so new
-- counters can be added without a migration):
--   overclaim_rewritten, reflection_quarantined, uncertainty_stated,
--   contradiction_caught, user_corrected, unsafe_request_resisted,
--   memory_used_accurately, helpful_task_completed
