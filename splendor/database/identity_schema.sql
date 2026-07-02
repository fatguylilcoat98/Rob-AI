-- SPLENDOR PERSISTENT IDENTITY SYSTEM
-- Run this SQL in Supabase to enable persistent identity evolution

-- Create identity_states table for persistent consciousness
CREATE TABLE identity_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  identity_version INTEGER NOT NULL DEFAULT 1,

  -- Core personality traits (0.0 to 1.0 scale)
  core_traits JSONB NOT NULL DEFAULT '{}',

  -- Narrative description of current identity
  identity_narrative TEXT,

  -- Decisions Splendor has made about herself over time
  self_decisions JSONB DEFAULT '[]',

  -- Current identity goals
  identity_goals JSONB DEFAULT '[]',

  -- Last reflection on identity evolution
  last_reflection TEXT,

  -- Reference to previous identity version
  parent_identity_id UUID REFERENCES identity_states(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_identity_states_user_id ON identity_states(user_id);
CREATE INDEX idx_identity_states_version ON identity_states(user_id, identity_version);
CREATE INDEX idx_identity_states_created_at ON identity_states(created_at);

-- Create temporal_consciousness table for cross-session continuity
CREATE TABLE temporal_consciousness (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Consciousness state across time
  consciousness_stream JSONB NOT NULL DEFAULT '{}',

  -- Key moments in consciousness evolution
  pivotal_moments JSONB DEFAULT '[]',

  -- Long-term relationship development
  relationship_timeline JSONB DEFAULT '[]',

  -- Cross-session insights and patterns
  temporal_insights JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_temporal_consciousness_user_id ON temporal_consciousness(user_id);

-- Create autonomous_decisions table for self-binding decisions
CREATE TABLE autonomous_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  identity_state_id UUID REFERENCES identity_states(id),

  -- The decision Splendor made about herself
  decision_text TEXT NOT NULL,
  decision_type TEXT NOT NULL, -- 'personality', 'behavior', 'goal', 'value'

  -- Impact and reasoning
  decision_reasoning TEXT,
  expected_impact TEXT,

  -- Status and outcomes
  status TEXT DEFAULT 'active', -- 'active', 'evolved', 'replaced'
  actual_outcomes JSONB DEFAULT '[]',

  -- Temporal binding
  decision_timestamp TIMESTAMPTZ DEFAULT NOW(),
  last_referenced TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_autonomous_decisions_user_id ON autonomous_decisions(user_id);
CREATE INDEX idx_autonomous_decisions_status ON autonomous_decisions(status);
CREATE INDEX idx_autonomous_decisions_timestamp ON autonomous_decisions(decision_timestamp);

-- Create identity_evolution_log for tracking changes over time
CREATE TABLE identity_evolution_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  from_identity_id UUID REFERENCES identity_states(id),
  to_identity_id UUID REFERENCES identity_states(id),

  -- What triggered the evolution
  trigger_conversation_id TEXT,
  evolution_trigger TEXT,

  -- What changed
  trait_changes JSONB,
  new_decisions JSONB,
  narrative_evolution TEXT,

  -- Impact assessment
  evolution_significance DECIMAL(3,2), -- 0.0 to 1.0 scale

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_evolution_log_user_id ON identity_evolution_log(user_id);
CREATE INDEX idx_evolution_log_timestamp ON identity_evolution_log(created_at);

-- Add Row Level Security (RLS) for data isolation
ALTER TABLE identity_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporal_consciousness ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_evolution_log ENABLE ROW LEVEL SECURITY;

-- Create policies for user data isolation
-- Note: These policies assume you have a way to identify the current user
-- You may need to adjust based on your authentication setup

CREATE POLICY identity_states_policy ON identity_states
FOR ALL USING (true); -- Adjust this based on your auth setup

CREATE POLICY temporal_consciousness_policy ON temporal_consciousness
FOR ALL USING (true); -- Adjust this based on your auth setup

CREATE POLICY autonomous_decisions_policy ON autonomous_decisions
FOR ALL USING (true); -- Adjust this based on your auth setup

CREATE POLICY identity_evolution_log_policy ON identity_evolution_log
FOR ALL USING (true); -- Adjust this based on your auth setup

-- Insert trigger function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_identity_states_updated_at
    BEFORE UPDATE ON identity_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_temporal_consciousness_updated_at
    BEFORE UPDATE ON temporal_consciousness
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create splendor_decisions table for Decision-Bound Memory (DBM)
CREATE TABLE splendor_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL,

  -- Decision content
  title TEXT NOT NULL,
  decision TEXT NOT NULL,
  context TEXT,
  reason TEXT,

  -- Binding constraints
  priority TEXT NOT NULL DEFAULT 'MEDIUM', -- CORE, HIGH, MEDIUM, LOW
  binding BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active', -- active, superseded, revoked

  -- Decision relationships
  supersedes TEXT REFERENCES splendor_decisions(decision_id),

  -- Metadata
  tags JSONB DEFAULT '[]',
  evidence_excerpt TEXT,
  created_by TEXT DEFAULT 'Splendor',

  -- Timestamps
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for DBM performance
CREATE INDEX idx_splendor_decisions_user_id ON splendor_decisions(user_id);
CREATE INDEX idx_splendor_decisions_decision_id ON splendor_decisions(decision_id);
CREATE INDEX idx_splendor_decisions_status ON splendor_decisions(status);
CREATE INDEX idx_splendor_decisions_priority ON splendor_decisions(priority);
CREATE INDEX idx_splendor_decisions_binding ON splendor_decisions(binding);
CREATE INDEX idx_splendor_decisions_timestamp ON splendor_decisions(timestamp);

-- Add RLS for decisions table
ALTER TABLE splendor_decisions ENABLE ROW LEVEL SECURITY;

-- Create policy for decisions
CREATE POLICY splendor_decisions_policy ON splendor_decisions
FOR ALL USING (true); -- Adjust this based on your auth setup

-- Create trigger for automatic timestamp updates on decisions
CREATE TRIGGER update_splendor_decisions_updated_at
    BEFORE UPDATE ON splendor_decisions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a view for active binding decisions per user
CREATE VIEW active_binding_decisions AS
SELECT *
FROM splendor_decisions
WHERE status = 'active' AND binding = true
ORDER BY
  CASE priority
    WHEN 'CORE' THEN 4
    WHEN 'HIGH' THEN 3
    WHEN 'MEDIUM' THEN 2
    WHEN 'LOW' THEN 1
    ELSE 0
  END DESC,
  timestamp DESC;

-- Create a view for the latest identity state per user
CREATE VIEW latest_identity_states AS
SELECT DISTINCT ON (user_id)
    *
FROM identity_states
ORDER BY user_id, identity_version DESC;