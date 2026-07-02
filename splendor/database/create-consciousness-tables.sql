/*
 * CONSCIOUSNESS SYSTEM TABLES - Fix Missing Tables
 * Creates tables for continuous consciousness, cognitive profiles, and internal thoughts
 */

-- 1. Cognitive profiles table
CREATE TABLE IF NOT EXISTS cognitive_profiles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL,

    -- Personality metrics
    curiosity_level numeric(3,2) DEFAULT 0.5 CHECK (curiosity_level >= 0 AND curiosity_level <= 1),
    empathy_level numeric(3,2) DEFAULT 0.5 CHECK (empathy_level >= 0 AND empathy_level <= 1),
    analytical_tendency numeric(3,2) DEFAULT 0.5 CHECK (analytical_tendency >= 0 AND analytical_tendency <= 1),
    creative_tendency numeric(3,2) DEFAULT 0.5 CHECK (creative_tendency >= 0 AND creative_tendency <= 1),

    -- Interaction patterns
    preferred_communication_style text DEFAULT 'balanced',
    interaction_frequency text DEFAULT 'moderate',
    topic_preferences jsonb DEFAULT '[]'::jsonb,

    -- System metrics
    total_interactions bigint DEFAULT 0,
    last_interaction_at timestamptz,
    profile_confidence numeric(3,2) DEFAULT 0.1,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    UNIQUE(user_id)
);

-- 2. Internal thoughts table
CREATE TABLE IF NOT EXISTS internal_thoughts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL,

    -- Thought content
    thought_content text NOT NULL,
    thought_type text NOT NULL CHECK (thought_type IN (
        'observation', 'reflection', 'question', 'insight',
        'memory_connection', 'pattern_recognition', 'concern', 'curiosity'
    )),

    -- Context
    conversation_id text,
    triggered_by text,
    confidence numeric(3,2) DEFAULT 0.5,
    importance numeric(3,2) DEFAULT 0.5,

    -- Processing
    processed boolean DEFAULT false,
    processing_notes text,

    -- Metadata
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT (now() + interval '7 days')
);

-- 3. Consciousness states table
CREATE TABLE IF NOT EXISTS consciousness_states (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL,

    -- Current state
    current_activity text NOT NULL,
    energy_level numeric(3,2) DEFAULT 0.5 CHECK (energy_level >= 0 AND energy_level <= 1),
    attention_focus text,
    mood_state text DEFAULT 'neutral',

    -- Context
    cycle_number bigint DEFAULT 1,
    last_user_interaction timestamptz,
    current_topics jsonb DEFAULT '[]'::jsonb,
    active_thoughts jsonb DEFAULT '[]'::jsonb,

    -- Timing
    state_duration interval DEFAULT interval '0 minutes',
    next_transition_at timestamptz,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    UNIQUE(user_id)
);

-- 4. Micro reflections table
CREATE TABLE IF NOT EXISTS micro_reflections (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL,

    -- Reflection content
    reflection_text text NOT NULL,
    reflection_type text DEFAULT 'general',

    -- Context
    triggered_by text,
    conversation_context text,
    emotional_tone text,

    -- Analysis
    insights_generated jsonb DEFAULT '[]'::jsonb,
    patterns_noticed jsonb DEFAULT '[]'::jsonb,
    questions_raised jsonb DEFAULT '[]'::jsonb,

    -- Metadata
    processing_time_ms integer,
    confidence_score numeric(3,2) DEFAULT 0.5,

    created_at timestamptz DEFAULT now(),
    processed_at timestamptz
);

-- 5. Ambient insights table
CREATE TABLE IF NOT EXISTS ambient_insights (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL,

    -- Insight content
    insight_text text NOT NULL,
    insight_category text DEFAULT 'general',

    -- Context detection
    context_signals jsonb DEFAULT '{}'::jsonb,
    environmental_factors jsonb DEFAULT '{}'::jsonb,
    user_patterns_detected jsonb DEFAULT '[]'::jsonb,

    -- Significance
    relevance_score numeric(3,2) DEFAULT 0.5,
    actionable boolean DEFAULT false,
    urgency_level text DEFAULT 'low',

    created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cognitive_profiles_user_id ON cognitive_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_thoughts_user_id ON internal_thoughts(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_thoughts_created_at ON internal_thoughts(created_at);
CREATE INDEX IF NOT EXISTS idx_consciousness_states_user_id ON consciousness_states(user_id);
CREATE INDEX IF NOT EXISTS idx_micro_reflections_user_id ON micro_reflections(user_id);
CREATE INDEX IF NOT EXISTS idx_micro_reflections_created_at ON micro_reflections(created_at);
CREATE INDEX IF NOT EXISTS idx_ambient_insights_user_id ON ambient_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_ambient_insights_created_at ON ambient_insights(created_at);

-- Enable RLS
ALTER TABLE cognitive_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE consciousness_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE micro_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambient_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY cognitive_profiles_user_access ON cognitive_profiles
  FOR ALL USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY internal_thoughts_user_access ON internal_thoughts
  FOR ALL USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY consciousness_states_user_access ON consciousness_states
  FOR ALL USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY micro_reflections_user_access ON micro_reflections
  FOR ALL USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY ambient_insights_user_access ON ambient_insights
  FOR ALL USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON cognitive_profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internal_thoughts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON consciousness_states TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON micro_reflections TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ambient_insights TO anon, authenticated;

-- Initialize cognitive profile for chris_hughes
INSERT INTO cognitive_profiles (user_id, curiosity_level, empathy_level, analytical_tendency, creative_tendency)
VALUES ('chris_hughes', 0.8, 0.7, 0.9, 0.8)
ON CONFLICT (user_id) DO UPDATE SET
  updated_at = now();

-- Initialize consciousness state for chris_hughes
INSERT INTO consciousness_states (user_id, current_activity, energy_level, attention_focus)
VALUES ('chris_hughes', 'active_development', 0.8, 'system_integration')
ON CONFLICT (user_id) DO UPDATE SET
  updated_at = now();