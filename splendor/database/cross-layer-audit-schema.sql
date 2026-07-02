-- Cross-Layer Contradiction Audit Records
-- Append-only enforcement log. Records are never deleted.
-- Human review resolves conflicts via annotation; originals are preserved.

CREATE TABLE IF NOT EXISTS cross_layer_audit_records (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode                      TEXT NOT NULL DEFAULT 'test'
                              CHECK (mode IN ('test', 'real')),
  owner_id                  TEXT,
  contradiction_detected    BOOLEAN NOT NULL DEFAULT FALSE,
  affected_layers           TEXT[]   DEFAULT '{}',
  highest_weight_layer      TEXT,
  lowest_weight_layer       TEXT,
  recommended_action        TEXT,
  status                    TEXT NOT NULL DEFAULT 'NO_CONTRADICTION'
                              CHECK (status IN (
                                'NO_CONTRADICTION',
                                'CONTRADICTION_DETECTED',
                                'REVIEW_REQUIRED',
                                'RESOLVED',
                                'DISMISSED'
                              )),
  evidence_summary          JSONB    DEFAULT '{}',
  would_tag_review_required BOOLEAN  DEFAULT FALSE,
  tagged_memory_ids         TEXT[]   DEFAULT '{}',
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cla_owner    ON cross_layer_audit_records (owner_id);
CREATE INDEX IF NOT EXISTS idx_cla_status   ON cross_layer_audit_records (status);
CREATE INDEX IF NOT EXISTS idx_cla_created  ON cross_layer_audit_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cla_detected ON cross_layer_audit_records (contradiction_detected);

-- Row-level: no deletes allowed. Corrections are new rows (status=RESOLVED + annotation).
ALTER TABLE cross_layer_audit_records ENABLE ROW LEVEL SECURITY;

-- Only the service role may insert/select. No DELETE policy is defined intentionally.
CREATE POLICY "service_insert" ON cross_layer_audit_records
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "service_select" ON cross_layer_audit_records
  FOR SELECT TO service_role USING (true);

CREATE POLICY "service_update_status" ON cross_layer_audit_records
  FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (status IN ('RESOLVED', 'DISMISSED'));
