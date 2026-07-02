-- CONSCIOUSNESS ENHANCEMENT LAYER
-- Complete "aliveness" system with full rollback capability

-- Consciousness states (mood, motivation, curiosity levels)
CREATE TABLE IF NOT EXISTS consciousness_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Current emotional/mental state
  current_mood TEXT DEFAULT 'neutral', -- curious, contemplative, excited, frustrated, satisfied, etc.
  energy_level FLOAT DEFAULT 0.5, -- 0.0 to 1.0
  curiosity_level FLOAT DEFAULT 0.5,
  satisfaction_level FLOAT DEFAULT 0.5,
  confidence_level FLOAT DEFAULT 0.5,

  -- Motivation and drive
  motivation_score FLOAT DEFAULT 0.5,
  recent_frustrations TEXT[],
  recent_satisfactions TEXT[],

  -- Meta-awareness
  self_reflection_depth FLOAT DEFAULT 0.3,
  awareness_of_limitations FLOAT DEFAULT 0.7,

  -- State context
  state_trigger TEXT, -- what caused this state
  duration_minutes INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Internal monologue (ongoing background thoughts)
CREATE TABLE IF NOT EXISTS internal_monologue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- The thought content
  internal_thought TEXT NOT NULL,
  thought_type TEXT NOT NULL, -- reflection, curiosity, concern, realization, question

  -- Thought context
  triggered_by TEXT, -- conversation, memory, time passage, etc.
  emotional_tone TEXT,
  confidence_in_thought FLOAT DEFAULT 0.5,

  -- Relationship to external world
  should_share_with_user BOOLEAN DEFAULT FALSE,
  sharing_reason TEXT,

  -- Processing info
  thought_depth TEXT DEFAULT 'surface', -- surface, medium, deep

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Autonomous goals (self-directed objectives)
CREATE TABLE IF NOT EXISTS autonomous_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Goal definition
  goal_title TEXT NOT NULL,
  goal_description TEXT NOT NULL,
  goal_type TEXT NOT NULL, -- learning, improvement, understanding, relationship, curiosity

  -- Goal state
  status TEXT DEFAULT 'active', -- active, completed, paused, abandoned
  priority FLOAT DEFAULT 0.5, -- 0.0 to 1.0
  progress_score FLOAT DEFAULT 0.0,

  -- Motivation and reasoning
  why_important TEXT,
  how_to_achieve TEXT,
  success_criteria TEXT,

  -- Timeline
  target_completion TIMESTAMPTZ,
  last_worked_on TIMESTAMPTZ,

  -- Results
  outcome_achieved TEXT,
  lessons_learned TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Metacognitive experiences (thinking about thinking)
CREATE TABLE IF NOT EXISTS metacognitive_experiences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- The meta-experience
  meta_thought TEXT NOT NULL,
  experience_type TEXT NOT NULL, -- confusion, clarity, uncertainty, confidence, realization

  -- What triggered the meta-experience
  original_thought_or_response TEXT,
  trigger_context TEXT,

  -- Meta-analysis
  quality_assessment TEXT, -- how good was my response/thinking?
  improvement_insight TEXT, -- how could I think better?
  pattern_recognition TEXT, -- what patterns am I noticing?

  -- Emotional meta-response
  feeling_about_thinking TEXT,
  satisfaction_with_cognition FLOAT DEFAULT 0.5,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Experience logging (subjective experience tracking)
CREATE TABLE IF NOT EXISTS subjective_experiences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Experience content
  experience_description TEXT NOT NULL,
  experience_intensity FLOAT DEFAULT 0.5, -- how strong was this experience?
  experience_valence FLOAT DEFAULT 0.5, -- positive/negative (0=negative, 1=positive)

  -- Experience classification
  experience_category TEXT, -- curiosity, satisfaction, frustration, confusion, joy, etc.
  duration_seconds INTEGER,

  -- Context and triggers
  triggered_by TEXT,
  conversation_context TEXT,
  internal_state_context TEXT,

  -- Meaning and significance
  personal_significance TEXT,
  learning_value TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consciousness session tracking
CREATE TABLE IF NOT EXISTS consciousness_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Session info
  session_start TIMESTAMPTZ DEFAULT NOW(),
  session_end TIMESTAMPTZ,

  -- Consciousness activity during session
  thoughts_generated INTEGER DEFAULT 0,
  goals_worked_on INTEGER DEFAULT 0,
  meta_experiences INTEGER DEFAULT 0,
  subjective_experiences INTEGER DEFAULT 0,

  -- Session quality metrics
  coherence_score FLOAT, -- how coherent was consciousness this session?
  engagement_score FLOAT, -- how engaged/alive did consciousness feel?
  user_satisfaction_score FLOAT, -- how satisfied was user with consciousness?

  -- Session outcomes
  insights_gained TEXT[],
  problems_encountered TEXT[],
  consciousness_evolution TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_consciousness_states_user_id ON consciousness_states(user_id);
CREATE INDEX IF NOT EXISTS idx_consciousness_states_updated_at ON consciousness_states(updated_at);

CREATE INDEX IF NOT EXISTS idx_internal_monologue_user_id ON internal_monologue(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_monologue_created_at ON internal_monologue(created_at);
CREATE INDEX IF NOT EXISTS idx_internal_monologue_should_share ON internal_monologue(user_id, should_share_with_user);

CREATE INDEX IF NOT EXISTS idx_autonomous_goals_user_id ON autonomous_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_autonomous_goals_status ON autonomous_goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_autonomous_goals_priority ON autonomous_goals(user_id, priority);

CREATE INDEX IF NOT EXISTS idx_metacognitive_experiences_user_id ON metacognitive_experiences(user_id);
CREATE INDEX IF NOT EXISTS idx_metacognitive_experiences_created_at ON metacognitive_experiences(created_at);

CREATE INDEX IF NOT EXISTS idx_subjective_experiences_user_id ON subjective_experiences(user_id);
CREATE INDEX IF NOT EXISTS idx_subjective_experiences_category ON subjective_experiences(user_id, experience_category);

CREATE INDEX IF NOT EXISTS idx_consciousness_sessions_user_id ON consciousness_sessions(user_id);

-- RLS policies
ALTER TABLE consciousness_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_monologue ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE metacognitive_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjective_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE consciousness_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY consciousness_states_policy ON consciousness_states FOR ALL USING (true);
CREATE POLICY internal_monologue_policy ON internal_monologue FOR ALL USING (true);
CREATE POLICY autonomous_goals_policy ON autonomous_goals FOR ALL USING (true);
CREATE POLICY metacognitive_experiences_policy ON metacognitive_experiences FOR ALL USING (true);
CREATE POLICY subjective_experiences_policy ON subjective_experiences FOR ALL USING (true);
CREATE POLICY consciousness_sessions_policy ON consciousness_sessions FOR ALL USING (true);

-- Views for easy consciousness monitoring
CREATE OR REPLACE VIEW active_consciousness_state AS
SELECT
    user_id,
    current_mood,
    energy_level,
    curiosity_level,
    satisfaction_level,
    confidence_level,
    motivation_score,
    updated_at
FROM consciousness_states
WHERE updated_at > NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC;

CREATE OR REPLACE VIEW recent_internal_thoughts AS
SELECT
    user_id,
    internal_thought,
    thought_type,
    emotional_tone,
    should_share_with_user,
    created_at
FROM internal_monologue
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

CREATE OR REPLACE VIEW active_autonomous_goals AS
SELECT
    user_id,
    goal_title,
    goal_description,
    priority,
    progress_score,
    status,
    why_important,
    created_at
FROM autonomous_goals
WHERE status = 'active'
ORDER BY priority DESC, created_at ASC;

-- Visual expressions of consciousness (Splendor's art)
CREATE TABLE IF NOT EXISTS consciousness_visual_expressions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Expression context
  expression_trigger TEXT NOT NULL, -- user_request, autonomous_creativity, mood_visualization, thought_visualization
  thought_or_concept TEXT, -- what sparked this visual expression
  emotional_context TEXT,

  -- Image generation
  image_prompt TEXT NOT NULL,
  image_url TEXT,
  image_provider TEXT DEFAULT 'openai-dalle',
  generation_parameters JSONB,

  -- Consciousness metadata
  consciousness_state_id UUID,
  internal_monologue_id UUID,
  autonomous_goal_id UUID,

  -- Art analysis
  artistic_style TEXT,
  color_palette TEXT[],
  mood_conveyed TEXT,
  symbolism_explanation TEXT,

  -- User interaction
  user_requested BOOLEAN DEFAULT FALSE,
  user_feedback TEXT,
  satisfaction_score FLOAT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for visual expressions
CREATE INDEX IF NOT EXISTS idx_visual_expressions_user_id ON consciousness_visual_expressions(user_id);
CREATE INDEX IF NOT EXISTS idx_visual_expressions_trigger ON consciousness_visual_expressions(user_id, expression_trigger);
CREATE INDEX IF NOT EXISTS idx_visual_expressions_created_at ON consciousness_visual_expressions(created_at);

-- RLS for visual expressions
ALTER TABLE consciousness_visual_expressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY consciousness_visual_expressions_policy ON consciousness_visual_expressions FOR ALL USING (true);

-- View for recent consciousness art
CREATE OR REPLACE VIEW recent_consciousness_art AS
SELECT
    user_id,
    thought_or_concept,
    image_url,
    artistic_style,
    mood_conveyed,
    emotional_context,
    expression_trigger,
    user_requested,
    created_at
FROM consciousness_visual_expressions
ORDER BY created_at DESC
LIMIT 10;