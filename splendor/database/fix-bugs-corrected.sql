/*
 * FIX CRITICAL BUGS - DEPLOY IMMEDIATELY (CORRECTED)
 * Bug 1: Memory insert missing owner field (FIXED in code)
 * Bug 2: Missing user_settings table (FIXED below)
 */

-- Create user_settings table (safe version)
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

-- Index for performance (safe)
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists, then recreate
DROP POLICY IF EXISTS user_settings_policy ON user_settings;
CREATE POLICY user_settings_policy ON user_settings
FOR ALL USING (auth.uid()::text = user_id);

-- Create default settings for existing users (if any)
INSERT INTO user_settings (user_id, scifi_mode_enabled)
SELECT
    id::text,
    false
FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM user_settings WHERE user_settings.user_id = users.id::text
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON user_settings TO anon, authenticated;