-- CREATE NEW TABLE FOR AMBIENT AWARENESS
-- Since recent_internal_thoughts is a view, create a new table

-- Create new table for storing internal thoughts
CREATE TABLE IF NOT EXISTS internal_thoughts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    thought_content TEXT NOT NULL,
    thought_type VARCHAR(100) DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_processed BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    source VARCHAR(50) DEFAULT 'ambient'
);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_internal_thoughts_user_id
    ON internal_thoughts(user_id);

CREATE INDEX IF NOT EXISTS idx_internal_thoughts_created_at
    ON internal_thoughts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_thoughts_thought_type
    ON internal_thoughts(thought_type);

CREATE INDEX IF NOT EXISTS idx_internal_thoughts_is_processed
    ON internal_thoughts(is_processed);

CREATE INDEX IF NOT EXISTS idx_internal_thoughts_source
    ON internal_thoughts(source);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_internal_thoughts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS trigger_update_internal_thoughts_updated_at
    ON internal_thoughts;

CREATE TRIGGER trigger_update_internal_thoughts_updated_at
    BEFORE UPDATE ON internal_thoughts
    FOR EACH ROW
    EXECUTE FUNCTION update_internal_thoughts_updated_at();