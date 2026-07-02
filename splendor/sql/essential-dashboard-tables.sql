-- ESSENTIAL TABLES FOR COGNITIVE DASHBOARD
-- Run these first to get the brain button working

-- 1. User Settings (for sci-fi mode toggle)
CREATE TABLE user_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    scifi_mode_enabled BOOLEAN DEFAULT FALSE,
    voice_first_enabled BOOLEAN DEFAULT FALSE,
    notification_enabled BOOLEAN DEFAULT TRUE,
    continuous_consciousness_interval INTEGER DEFAULT 5,
    ambient_awareness_level VARCHAR(20) DEFAULT 'basic',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Cognitive Profiles (main dashboard data)
CREATE TABLE cognitive_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    fingerprint JSONB NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    conversation_count INTEGER DEFAULT 0,
    confidence_score DECIMAL(3,2) DEFAULT 0.1 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Cognitive Evolution (thinking pattern changes)
CREATE TABLE cognitive_evolution (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    thinking_dimension VARCHAR(100) NOT NULL,
    previous_pattern VARCHAR(200),
    new_pattern VARCHAR(200),
    transition_trigger VARCHAR(300),
    confidence_score DECIMAL(3,2) DEFAULT 0.5,
    evolution_type VARCHAR(50),
    significance_level VARCHAR(20),
    context_data JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX idx_cognitive_profiles_user_id ON cognitive_profiles(user_id);
CREATE INDEX idx_cognitive_evolution_user_id ON cognitive_evolution(user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_evolution ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data)
CREATE POLICY user_settings_policy ON user_settings
FOR ALL USING (auth.uid()::text = user_id);

CREATE POLICY cognitive_profiles_policy ON cognitive_profiles
FOR ALL USING (auth.uid()::text = user_id);

CREATE POLICY cognitive_evolution_policy ON cognitive_evolution
FOR ALL USING (auth.uid()::text = user_id);