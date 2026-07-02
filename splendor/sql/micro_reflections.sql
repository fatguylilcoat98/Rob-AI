-- Micro Reflections Table
-- Stores continuous consciousness micro-reflections generated every 5 minutes
CREATE TABLE micro_reflections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    reflection_type VARCHAR(50) DEFAULT 'micro_continuous',
    source_activity_count INTEGER DEFAULT 0,
    consciousness_level VARCHAR(50) DEFAULT 'continuous',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_micro_reflections_user_id ON micro_reflections(user_id);
CREATE INDEX idx_micro_reflections_generated_at ON micro_reflections(generated_at);
CREATE INDEX idx_micro_reflections_type ON micro_reflections(reflection_type);

-- Enable RLS (Row Level Security)
ALTER TABLE micro_reflections ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own micro-reflections
CREATE POLICY micro_reflections_policy ON micro_reflections
FOR ALL USING (auth.uid()::text = user_id);

-- Auto-cleanup old micro-reflections (keep last 30 days)
-- This prevents the table from growing indefinitely
CREATE OR REPLACE FUNCTION cleanup_old_micro_reflections()
RETURNS void AS $$
BEGIN
    DELETE FROM micro_reflections
    WHERE generated_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled function to run cleanup daily (if using pg_cron extension)
-- SELECT cron.schedule('cleanup-micro-reflections', '0 2 * * *', 'SELECT cleanup_old_micro_reflections();');