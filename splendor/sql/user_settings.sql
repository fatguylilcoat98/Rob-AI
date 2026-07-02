-- User Settings Table
-- Stores per-user preferences including sci-fi mode toggle
CREATE TABLE user_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    scifi_mode_enabled BOOLEAN DEFAULT FALSE,
    voice_first_enabled BOOLEAN DEFAULT FALSE,
    notification_enabled BOOLEAN DEFAULT TRUE,
    continuous_consciousness_interval INTEGER DEFAULT 5, -- minutes
    ambient_awareness_level VARCHAR(20) DEFAULT 'basic', -- basic, full, off
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own settings
CREATE POLICY user_settings_policy ON user_settings
FOR ALL USING (auth.uid()::text = user_id);