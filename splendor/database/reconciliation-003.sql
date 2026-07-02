-- =============================================================================
-- Splendor — Governance Observability (reconciliation 003)
-- Built by Christopher Hughes · Sacramento, CA
-- Truth · Safety · We Got Your Back
--
-- Append-only record of every CLASPION verdict so an operator can answer
-- "why was this turn allowed/blocked?" after the fact. Before this table, the
-- only persisted block signal was a behavioral_metrics row with {surface,
-- decision} — which cannot distinguish a real policy denial from a fail-closed
-- outage. This table captures the verdict's own provenance fields plus a
-- classified outcome/cause.
--
-- NO SECRETS: no API key, no CLASPION URL, no thought/intent content. Only the
-- intent *type* label, actor id, and the verdict's provenance. `reason` is
-- capped at the application layer.
--
-- Append-only by convention: the application only INSERTs. Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS governance_verdicts (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz DEFAULT now(),

  correlation_id  text,
  verdict_id      text,          -- real CLASPION id, or local-fail-* / local-* for fallbacks

  decision        text,          -- ALLOW | BLOCK (the effective gate)
  allow           boolean,
  outcome         text,          -- allow | block | dormant | fail_closed | fail_open
  outcome_cause   text,          -- upstream | disabled | timeout | http_4xx | http_5xx | network | malformed

  reason          text,
  conscience_name text,          -- real conscience, splendor-bypass (dormant), splendor-failure-handler (fallback)
  basis_state     text,          -- ESTABLISHED | UNREACHABLE | ...
  failed_axes     text[] DEFAULT '{}',

  intent_type     text,          -- label only (e.g. send_chat_response) — never content
  surface         text,
  actor           text,

  latency_ms      integer,
  http_status     integer,       -- set when the cause is an HTTP error
  error_code      text,          -- TIMEOUT | NETWORK | MALFORMED_RESPONSE | HTTP_xxx

  fail_mode       text,          -- block | allow (effective CLASPION_FAIL_MODE)
  enabled         boolean,
  dormant         boolean
);

CREATE INDEX IF NOT EXISTS idx_governance_verdicts_created  ON governance_verdicts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_governance_verdicts_outcome  ON governance_verdicts(outcome, outcome_cause);
CREATE INDEX IF NOT EXISTS idx_governance_verdicts_decision ON governance_verdicts(decision);
CREATE INDEX IF NOT EXISTS idx_governance_verdicts_corr     ON governance_verdicts(correlation_id);

-- RLS: permissive single-owner convention; service-role workers bypass anyway.
ALTER TABLE governance_verdicts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'governance_verdicts' AND policyname = 'governance_verdicts_policy'
  ) THEN
    CREATE POLICY governance_verdicts_policy ON governance_verdicts FOR ALL USING (true);
  END IF;
END $$;
