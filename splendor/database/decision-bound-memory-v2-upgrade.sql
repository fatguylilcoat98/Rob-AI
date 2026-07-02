-- DECISION-BOUND MEMORY v2 UPGRADE
-- Enhanced statuses and conflict resolution

-- Add new columns for v2 features
DO $$
BEGIN
    -- Add proposal_reason for proposed decisions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='splendor_decisions' AND column_name='proposal_reason') THEN
        ALTER TABLE splendor_decisions ADD COLUMN proposal_reason TEXT;
    END IF;

    -- Add conflict_with for decisions marked as CONFLICT
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='splendor_decisions' AND column_name='conflict_with') THEN
        ALTER TABLE splendor_decisions ADD COLUMN conflict_with TEXT[];
    END IF;

    -- Add approved_by for tracking who approved proposals
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='splendor_decisions' AND column_name='approved_by') THEN
        ALTER TABLE splendor_decisions ADD COLUMN approved_by TEXT;
    END IF;

    -- Add approved_at timestamp
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='splendor_decisions' AND column_name='approved_at') THEN
        ALTER TABLE splendor_decisions ADD COLUMN approved_at TIMESTAMPTZ;
    END IF;
END $$;

-- Update status constraints to include new v2 statuses
ALTER TABLE splendor_decisions
DROP CONSTRAINT IF EXISTS splendor_decisions_status_check;

ALTER TABLE splendor_decisions
ADD CONSTRAINT splendor_decisions_status_check
CHECK (status IN ('active', 'revoked', 'superseded', 'CONFLICT', 'PROPOSED', 'PROPOSED_REJECTED'));

-- Create index for conflict resolution queries
CREATE INDEX IF NOT EXISTS idx_splendor_decisions_status_priority
ON splendor_decisions(user_id, status, priority);

-- Create index for proposal tracking
CREATE INDEX IF NOT EXISTS idx_splendor_decisions_proposals
ON splendor_decisions(user_id, status)
WHERE status IN ('PROPOSED', 'PROPOSED_REJECTED');

-- Add view for active decisions with priority ordering
CREATE OR REPLACE VIEW active_decisions_v2 AS
SELECT
    decision_id,
    user_id,
    title,
    decision,
    priority,
    CASE
        WHEN priority = 'CORE' THEN 4
        WHEN priority = 'HIGH' THEN 3
        WHEN priority = 'MEDIUM' THEN 2
        WHEN priority = 'LOW' THEN 1
        ELSE 0
    END as priority_weight,
    reason,
    context,
    evidence_excerpt,
    created_at,
    conflict_with
FROM splendor_decisions
WHERE status = 'active' AND binding = true
ORDER BY priority_weight DESC, created_at ASC;

-- Add view for proposed decisions
CREATE OR REPLACE VIEW proposed_decisions_v2 AS
SELECT
    decision_id,
    user_id,
    title,
    decision,
    priority,
    reason,
    proposal_reason,
    context,
    evidence_excerpt,
    created_at
FROM splendor_decisions
WHERE status = 'PROPOSED'
ORDER BY created_at DESC;

-- Add trigger for automatic conflict detection
CREATE OR REPLACE FUNCTION detect_decision_conflicts()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check for conflicts on new ACTIVE decisions
    IF NEW.status = 'active' AND NEW.binding = true THEN
        -- Simple conflict detection: same priority decisions with overlapping topics
        -- This is basic - the application logic will handle more sophisticated conflict detection
        NULL; -- Placeholder for future automated conflict detection
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS decision_conflict_trigger ON splendor_decisions;
CREATE TRIGGER decision_conflict_trigger
    AFTER INSERT OR UPDATE ON splendor_decisions
    FOR EACH ROW
    EXECUTE FUNCTION detect_decision_conflicts();