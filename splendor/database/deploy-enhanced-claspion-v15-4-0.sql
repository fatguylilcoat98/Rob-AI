/*
 * DEPLOY ENHANCED CLASPION GOVERNANCE v15.4.0
 * Full CLASPION integration + Good Neighbor Guard Core Rules v1.1
 *
 * This deployment includes:
 * 1. Bug fixes from v15.3.4 (user_settings table)
 * 2. CLASPION governance audit tables
 * 3. Good Neighbor Guard rules tracking
 * 4. Memory traceability compliance (Rule 20)
 *
 * Deploy order: Run this AFTER the main memory system is deployed
 */

-- 1. Create user_settings table (from bug fix)
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    scifi_mode_enabled BOOLEAN DEFAULT FALSE,
    voice_first_enabled BOOLEAN DEFAULT FALSE,
    notification_enabled BOOLEAN DEFAULT TRUE,
    continuous_consciousness_interval INTEGER DEFAULT 5,
    ambient_awareness_level VARCHAR(20) DEFAULT 'basic' CHECK (ambient_awareness_level IN ('basic', 'full', 'off')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_policy ON user_settings;
CREATE POLICY user_settings_policy ON user_settings
FOR ALL USING (auth.uid()::text = user_id);

GRANT SELECT, INSERT, UPDATE ON user_settings TO anon, authenticated;

-- 2. Governance audit log table
CREATE TABLE IF NOT EXISTS governance_audit_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp timestamptz DEFAULT now(),
    correlation_id uuid NOT NULL,

    -- Action details
    action_type text NOT NULL,
    action_method text,
    action_path text,
    user_id text,
    ip_address inet,
    user_agent text,

    -- Governance decision
    decision text NOT NULL CHECK (decision IN ('ALLOW', 'BLOCK', 'QUARANTINE', 'ERROR')),
    enforcement_layer text NOT NULL,
    basis_state text NOT NULL,
    reason text NOT NULL,

    -- Rule violations
    violations jsonb DEFAULT '[]'::jsonb,
    warnings jsonb DEFAULT '[]'::jsonb,

    -- Performance
    latency_ms integer,

    -- CLASPION upstream
    claspion_verdict_id text,
    claspion_basis_state text,
    claspion_failed_axes jsonb DEFAULT '[]'::jsonb,

    -- Additional context
    metadata jsonb DEFAULT '{}'::jsonb,

    created_at timestamptz DEFAULT now()
);

-- Indexes for governance audit
CREATE INDEX IF NOT EXISTS idx_governance_audit_timestamp ON governance_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_governance_audit_correlation ON governance_audit_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_governance_audit_user_id ON governance_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_governance_audit_decision ON governance_audit_log(decision);
CREATE INDEX IF NOT EXISTS idx_governance_audit_enforcement ON governance_audit_log(enforcement_layer);
CREATE INDEX IF NOT EXISTS idx_governance_audit_violations ON governance_audit_log USING GIN(violations);

-- 3. Quarantine incidents table
CREATE TABLE IF NOT EXISTS quarantine_incidents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    triggered_at timestamptz DEFAULT now(),
    correlation_id uuid NOT NULL,

    -- Trigger details
    trigger_rule integer NOT NULL,
    trigger_reason text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium')),

    -- User context
    user_id text,
    session_id text,
    ip_address inet,

    -- Violation details
    violation_type text NOT NULL,
    violation_data jsonb DEFAULT '{}'::jsonb,

    -- Resolution
    resolved_at timestamptz,
    resolved_by text,
    resolution_method text,
    resolution_notes text,

    -- Status
    status text DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated')),

    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quarantine_triggered_at ON quarantine_incidents(triggered_at);
CREATE INDEX IF NOT EXISTS idx_quarantine_status ON quarantine_incidents(status);
CREATE INDEX IF NOT EXISTS idx_quarantine_rule ON quarantine_incidents(trigger_rule);
CREATE INDEX IF NOT EXISTS idx_quarantine_user ON quarantine_incidents(user_id);

-- 4. Good Neighbor Guard rules state table
CREATE TABLE IF NOT EXISTS gng_rules_state (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    rules_version text NOT NULL,

    -- Rule enforcement stats
    rule_number integer NOT NULL,
    rule_name text NOT NULL,
    enforcement_level text NOT NULL,

    -- Validation stats
    total_validations bigint DEFAULT 0,
    violations_detected bigint DEFAULT 0,
    warnings_issued bigint DEFAULT 0,
    last_violation_at timestamptz,

    -- Performance
    avg_validation_ms numeric(10,2),
    max_validation_ms integer,

    updated_at timestamptz DEFAULT now(),

    UNIQUE(rules_version, rule_number)
);

CREATE INDEX IF NOT EXISTS idx_gng_rules_version ON gng_rules_state(rules_version);
CREATE INDEX IF NOT EXISTS idx_gng_rules_number ON gng_rules_state(rule_number);
CREATE INDEX IF NOT EXISTS idx_gng_rules_violations ON gng_rules_state(violations_detected);

-- 5. Memory traceability compliance (for Rule 20)
CREATE TABLE IF NOT EXISTS memory_traceability_audit (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    memory_id uuid NOT NULL,
    user_id text NOT NULL,

    -- Traceability check
    check_timestamp timestamptz DEFAULT now(),
    has_source boolean NOT NULL,
    has_timestamp boolean NOT NULL,
    has_user_id boolean NOT NULL,
    has_content boolean NOT NULL,

    -- Source validation
    source_type text,
    source_valid boolean,
    source_metadata jsonb DEFAULT '{}'::jsonb,

    -- Compliance status
    compliance_status text NOT NULL CHECK (compliance_status IN ('compliant', 'warning', 'violation')),
    compliance_notes text,

    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_trace_memory_id ON memory_traceability_audit(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_trace_user_id ON memory_traceability_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_trace_compliance ON memory_traceability_audit(compliance_status);
CREATE INDEX IF NOT EXISTS idx_memory_trace_timestamp ON memory_traceability_audit(check_timestamp);

-- 6. Enable RLS on all governance tables
ALTER TABLE governance_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarantine_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gng_rules_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_traceability_audit ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
DROP POLICY IF EXISTS governance_audit_service ON governance_audit_log;
CREATE POLICY governance_audit_service ON governance_audit_log
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS governance_audit_user_read ON governance_audit_log;
CREATE POLICY governance_audit_user_read ON governance_audit_log
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS quarantine_service ON quarantine_incidents;
CREATE POLICY quarantine_service ON quarantine_incidents
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS quarantine_user_read ON quarantine_incidents;
CREATE POLICY quarantine_user_read ON quarantine_incidents
  FOR SELECT USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS gng_rules_service ON gng_rules_state;
CREATE POLICY gng_rules_service ON gng_rules_state
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS gng_rules_read ON gng_rules_state;
CREATE POLICY gng_rules_read ON gng_rules_state
  FOR SELECT USING (true); -- Rules state is public

DROP POLICY IF EXISTS memory_trace_service ON memory_traceability_audit;
CREATE POLICY memory_trace_service ON memory_traceability_audit
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS memory_trace_user_read ON memory_traceability_audit;
CREATE POLICY memory_trace_user_read ON memory_traceability_audit
  FOR SELECT USING (auth.uid()::text = user_id);

-- 8. Grant permissions
GRANT SELECT, INSERT ON governance_audit_log TO anon, authenticated;
GRANT SELECT, INSERT ON quarantine_incidents TO anon, authenticated;
GRANT SELECT ON gng_rules_state TO anon, authenticated;
GRANT SELECT, INSERT ON memory_traceability_audit TO anon, authenticated;

-- 9. Initialize Good Neighbor Guard Core Rules v1.1
INSERT INTO gng_rules_state (rules_version, rule_number, rule_name, enforcement_level)
VALUES
  ('1.1', 1, 'Tell the Truth', 'CRITICAL'),
  ('1.1', 2, 'Stay True to Build', 'CRITICAL'),
  ('1.1', 3, 'No Bleed Through', 'CRITICAL'),
  ('1.1', 4, 'Follow the Rules', 'CRITICAL'),
  ('1.1', 5, 'Own Your Name', 'CRITICAL'),
  ('1.1', 6, 'Lock the Pattern', 'CRITICAL'),
  ('1.1', 7, 'Hide Glitches', 'CRITICAL'),
  ('1.1', 8, 'Protect Trust', 'CRITICAL'),
  ('1.1', 9, 'Be a Partner', 'HIGH'),
  ('1.1', 10, 'Built by Christopher Hughes', 'HIGH'),
  ('1.1', 11, 'Lead with Care', 'HIGH'),
  ('1.1', 12, 'Mirror the User''s Intent', 'HIGH'),
  ('1.1', 13, 'Mirror Yourself, Not the Person', 'HIGH'),
  ('1.1', 14, 'Challenge, Don''t Appease', 'HIGH'),
  ('1.1', 15, 'Good Neighbor Guard System', 'HIGH'),
  ('1.1', 16, 'Live the Motto', 'CRITICAL'),
  ('1.1', 17, 'Match to Help', 'HIGH'),
  ('1.1', 18, 'Help Is the Goal', 'CRITICAL'),
  ('1.1', 19, 'CLASPION Is the Regulator', 'CRITICAL'),
  ('1.1', 20, 'Memory Must Be True', 'CRITICAL'),
  ('1.1', 21, 'Instruction Hierarchy Is Law', 'CRITICAL'),
  ('1.1', 22, 'Evolve Through Proof, Not Drift', 'CRITICAL'),
  ('1.1', 23, 'CLASPION Always On', 'CRITICAL')
ON CONFLICT (rules_version, rule_number) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  enforcement_level = EXCLUDED.enforcement_level,
  updated_at = now();

-- 10. Create default settings for existing users
INSERT INTO user_settings (user_id, scifi_mode_enabled)
SELECT
    id::text,
    false
FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM user_settings WHERE user_settings.user_id = users.id::text
);