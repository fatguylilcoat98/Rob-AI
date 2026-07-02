-- =============================================================================
-- Splendor — Consciousness Architecture Reconciliation (002)
-- Built by Christopher Hughes · Sacramento, CA
-- Truth · Safety · We Got Your Back
--
-- Aligns the deployed `identity_states` table with what lib/identity.js writes
-- and reads. The deployed table predates the lib's schema:
--   * identity_version was text   (lib treats it as an integer: 1, then +1)
--   * self_decisions / identity_goals / last_reflection / updated_at columns
--     were absent, so initializeIdentityState() failed with PGRST204
--     ("Could not find the 'identity_goals' column ... in the schema cache").
--
-- Additive and safe: the table had 0 rows when applied, so the integer cast is
-- risk-free, and all new columns are nullable/defaulted. The pre-existing
-- columns (stable_principles, active_decision_ids) are untouched.
-- Idempotent — safe to re-run.
-- =============================================================================

-- 1. identity_version → integer (lib does initial 1, then currentVersion + 1).
ALTER TABLE identity_states
  ALTER COLUMN identity_version TYPE integer USING (NULLIF(identity_version, '')::integer);
ALTER TABLE identity_states
  ALTER COLUMN identity_version SET DEFAULT 1;

-- 2. Columns the lib writes/reads that the deployed table lacked.
ALTER TABLE identity_states ADD COLUMN IF NOT EXISTS self_decisions  jsonb DEFAULT '[]'::jsonb;
ALTER TABLE identity_states ADD COLUMN IF NOT EXISTS identity_goals  jsonb DEFAULT '[]'::jsonb;
ALTER TABLE identity_states ADD COLUMN IF NOT EXISTS last_reflection text;
ALTER TABLE identity_states ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

-- 3. Reload PostgREST's schema cache so the new columns resolve immediately.
NOTIFY pgrst, 'reload schema';
