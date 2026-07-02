/*
 * MASTER CONTINUITY LAYER SCHEMA
 * Built by Christopher Hughes · Sacramento, CA
 * Created with Claude Code
 * Truth · Safety · We Got Your Back
 *
 * Shadow Mode Implementation - No Autonomous Surfacing
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- INTERACTIONS TABLE
-- Stores normalized interaction records for reflection analysis
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS interactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp timestamptz DEFAULT now(),
  speaker text NOT NULL CHECK (speaker IN ('user', 'assistant')),
  content text NOT NULL,
  tags text[],
  emotional_weight integer CHECK (emotional_weight >= 1 AND emotional_weight <= 10),
  topic text,
  source_type text DEFAULT 'conversation' CHECK (source_type IN ('conversation', 'memory', 'system', 'reflection')),

  -- Metadata for reflection engine
  processed_for_reflection boolean DEFAULT false,
  processing_notes jsonb,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT interactions_content_length CHECK (length(content) > 0)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- REFLECTIONS TABLE
-- Stores candidate reflections in staging (Shadow Mode)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reflections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Reflection Classification
  type text NOT NULL CHECK (type IN ('pattern', 'tension', 'value_conflict', 'insight', 'foundational')),
  state text NOT NULL DEFAULT 'missing_info' CHECK (state IN ('missing_info', 'developing_understanding', 'active_synthesis', 'ready', 'archived', 'rejected')),

  -- Core Content
  summary text NOT NULL,
  what_i_noticed text NOT NULL,
  first_seen timestamptz,
  reinforced_by text[],
  why_it_matters text,
  why_now text,

  -- Evidence Grounding
  source_interactions uuid[] NOT NULL,
  evidence_summary text NOT NULL,
  human_readable_reason text NOT NULL,

  -- Confidence & Scoring
  confidence decimal(3,2) CHECK (confidence >= 0.0 AND confidence <= 1.0),
  evidence_strength decimal(3,2) CHECK (evidence_strength >= 0.0 AND evidence_strength <= 1.0),
  signal_strength decimal(3,2) CHECK (signal_strength >= 0.0 AND signal_strength <= 1.0),
  impact_level text NOT NULL CHECK (impact_level IN ('low', 'medium', 'high', 'foundational')),

  -- Readiness Assessment
  ready_to_surface boolean DEFAULT false,
  requires_preparation boolean DEFAULT true,
  preparation_complete boolean DEFAULT false,
  readiness_score decimal(3,2) DEFAULT 0.0,
  predicted_helpfulness decimal(3,2) DEFAULT 0.0,
  predicted_harm decimal(3,2) DEFAULT 0.0,

  -- Expiration & Validation
  expiration_at timestamptz,
  last_validated_at timestamptz DEFAULT now(),

  -- Review Status (Shadow Mode)
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'approved', 'rejected', 'surfaced', 'archived')),
  reviewer_notes text,

  -- Constraint: Must have minimum sources
  CONSTRAINT reflections_min_sources CHECK (
    (impact_level = 'foundational' AND array_length(source_interactions, 1) >= 3) OR
    (impact_level != 'foundational' AND array_length(source_interactions, 1) >= 2)
  ),

  -- Constraint: Confidence cannot exceed evidence
  CONSTRAINT reflections_confidence_evidence CHECK (confidence <= evidence_strength),

  -- Constraint: Content requirements
  CONSTRAINT reflections_content_length CHECK (
    length(summary) > 10 AND
    length(what_i_noticed) > 10 AND
    length(evidence_summary) > 10 AND
    length(human_readable_reason) > 10
  )
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- REFLECTION CONFLICTS TABLE
-- Tracks conflicts between reflections or between reflections and new evidence
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reflection_conflicts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),

  conflict_type text NOT NULL CHECK (conflict_type IN ('old_pattern_vs_new_evidence', 'reflection_vs_reflection', 'belief_vs_behavior')),

  old_belief_id uuid REFERENCES reflections(id),
  old_belief_summary text,

  new_signal_id uuid REFERENCES interactions(id),
  new_signal_summary text,

  source_interactions uuid[] NOT NULL,

  resolution text CHECK (resolution IN ('downgrade_old', 'revise_belief', 'hold_tension', 'archive_old')),
  resolution_notes text,
  resolved_at timestamptz,

  status text DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved', 'dismissed'))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- REFLECTION EVALUATION TABLE
-- Tracks how well surfaced reflections performed (for future Shadow Mode testing)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reflection_evaluations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reflection_id uuid REFERENCES reflections(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  surfaced_at timestamptz DEFAULT now(),
  user_response text,

  -- Evaluation Signals
  helped_score decimal(3,2) CHECK (helped_score >= 0.0 AND helped_score <= 1.0),
  harm_signal decimal(3,2) CHECK (harm_signal >= 0.0 AND harm_signal <= 1.0),
  confusion_signal decimal(3,2) CHECK (confusion_signal >= 0.0 AND confusion_signal <= 1.0),
  withdrawal_signal decimal(3,2) CHECK (withdrawal_signal >= 0.0 AND withdrawal_signal <= 1.0),
  trust_signal decimal(3,2) CHECK (trust_signal >= 0.0 AND trust_signal <= 1.0),

  -- Admin Assessment
  admin_marked_helpful boolean,
  admin_marked_wrong boolean,
  admin_marked_too_much boolean,
  admin_notes text,

  created_at timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SYSTEM HEALTH TABLE
-- Tracks overall reflection system health and performance
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reflection_system_health (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  timestamp timestamptz DEFAULT now(),

  -- System State
  shadow_mode_enabled boolean DEFAULT true,
  autonomous_surfacing_enabled boolean DEFAULT false,
  initiative_mode_enabled boolean DEFAULT false,

  -- Processing Stats
  interactions_processed integer DEFAULT 0,
  reflections_generated integer DEFAULT 0,
  reflections_rejected integer DEFAULT 0,
  validation_failures integer DEFAULT 0,

  -- Performance Metrics
  avg_confidence decimal(3,2),
  avg_evidence_strength decimal(3,2),
  avg_readiness_score decimal(3,2),

  -- Cooldown Status
  last_emotional_event timestamptz,
  cooldown_active boolean DEFAULT false,
  cooldown_expires_at timestamptz,

  -- Health Flags
  truth_drift_detected boolean DEFAULT false,
  hallucination_risk integer DEFAULT 0,
  system_status text DEFAULT 'healthy' CHECK (system_status IN ('healthy', 'warning', 'degraded', 'disabled'))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════════

-- Interactions indexes
CREATE INDEX IF NOT EXISTS idx_interactions_user_timestamp ON interactions(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_processed ON interactions(processed_for_reflection);
CREATE INDEX IF NOT EXISTS idx_interactions_tags ON interactions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_interactions_topic ON interactions(topic);
CREATE INDEX IF NOT EXISTS idx_interactions_speaker ON interactions(speaker);

-- Reflections indexes
CREATE INDEX IF NOT EXISTS idx_reflections_user_created ON reflections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflections_state ON reflections(state);
CREATE INDEX IF NOT EXISTS idx_reflections_status ON reflections(status);
CREATE INDEX IF NOT EXISTS idx_reflections_type ON reflections(type);
CREATE INDEX IF NOT EXISTS idx_reflections_impact ON reflections(impact_level);
CREATE INDEX IF NOT EXISTS idx_reflections_ready ON reflections(ready_to_surface);
CREATE INDEX IF NOT EXISTS idx_reflections_readiness_score ON reflections(readiness_score DESC);
CREATE INDEX IF NOT EXISTS idx_reflections_expiration ON reflections(expiration_at);
CREATE INDEX IF NOT EXISTS idx_reflections_sources ON reflections USING GIN(source_interactions);

-- Conflicts indexes
CREATE INDEX IF NOT EXISTS idx_conflicts_user_created ON reflection_conflicts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON reflection_conflicts(status);
CREATE INDEX IF NOT EXISTS idx_conflicts_type ON reflection_conflicts(conflict_type);

-- Evaluations indexes
CREATE INDEX IF NOT EXISTS idx_evaluations_reflection ON reflection_evaluations(reflection_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_surfaced ON reflection_evaluations(surfaced_at DESC);

-- System health indexes
CREATE INDEX IF NOT EXISTS idx_system_health_user_timestamp ON reflection_system_health(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_status ON reflection_system_health(system_status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflection_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflection_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflection_system_health ENABLE ROW LEVEL SECURITY;

-- Interactions policies
DROP POLICY IF EXISTS "Users can view their own interactions" ON interactions;
DROP POLICY IF EXISTS "Users can insert their own interactions" ON interactions;
DROP POLICY IF EXISTS "Users can update their own interactions" ON interactions;

CREATE POLICY "Users can view their own interactions" ON interactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own interactions" ON interactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own interactions" ON interactions FOR UPDATE USING (auth.uid() = user_id);

-- Reflections policies
DROP POLICY IF EXISTS "Users can view their own reflections" ON reflections;
DROP POLICY IF EXISTS "Users can insert their own reflections" ON reflections;
DROP POLICY IF EXISTS "Users can update their own reflections" ON reflections;

CREATE POLICY "Users can view their own reflections" ON reflections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reflections" ON reflections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reflections" ON reflections FOR UPDATE USING (auth.uid() = user_id);

-- Conflicts policies
DROP POLICY IF EXISTS "Users can view their own conflicts" ON reflection_conflicts;
DROP POLICY IF EXISTS "Users can insert their own conflicts" ON reflection_conflicts;
DROP POLICY IF EXISTS "Users can update their own conflicts" ON reflection_conflicts;

CREATE POLICY "Users can view their own conflicts" ON reflection_conflicts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own conflicts" ON reflection_conflicts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own conflicts" ON reflection_conflicts FOR UPDATE USING (auth.uid() = user_id);

-- Evaluations policies
DROP POLICY IF EXISTS "Users can view their own evaluations" ON reflection_evaluations;
DROP POLICY IF EXISTS "Users can insert their own evaluations" ON reflection_evaluations;
DROP POLICY IF EXISTS "Users can update their own evaluations" ON reflection_evaluations;

CREATE POLICY "Users can view their own evaluations" ON reflection_evaluations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own evaluations" ON reflection_evaluations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own evaluations" ON reflection_evaluations FOR UPDATE USING (auth.uid() = user_id);

-- System health policies
DROP POLICY IF EXISTS "Users can view their own system health" ON reflection_system_health;
DROP POLICY IF EXISTS "Users can insert their own system health" ON reflection_system_health;
DROP POLICY IF EXISTS "Users can update their own system health" ON reflection_system_health;

CREATE POLICY "Users can view their own system health" ON reflection_system_health FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own system health" ON reflection_system_health FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own system health" ON reflection_system_health FOR UPDATE USING (auth.uid() = user_id);