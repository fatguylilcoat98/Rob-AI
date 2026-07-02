-- MIGRATION: Fix recent_internal_thoughts table schema
-- Adds missing columns or creates table if it doesn't exist

-- First, check if table exists and add missing columns
DO $$
BEGIN
    -- Add thought_content column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'recent_internal_thoughts'
        AND column_name = 'thought_content'
    ) THEN
        -- If table exists but column is missing, add it
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'recent_internal_thoughts'
        ) THEN
            ALTER TABLE recent_internal_thoughts
            ADD COLUMN thought_content TEXT;

            RAISE NOTICE 'Added thought_content column to existing recent_internal_thoughts table';
        END IF;
    END IF;

    -- Add thought_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'recent_internal_thoughts'
        AND column_name = 'thought_type'
    ) THEN
        -- If table exists but column is missing, add it
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'recent_internal_thoughts'
        ) THEN
            ALTER TABLE recent_internal_thoughts
            ADD COLUMN thought_type VARCHAR(100) DEFAULT 'general';

            RAISE NOTICE 'Added thought_type column to existing recent_internal_thoughts table';
        END IF;
    END IF;

    -- Add user_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'recent_internal_thoughts'
        AND column_name = 'user_id'
    ) THEN
        -- If table exists but column is missing, add it
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'recent_internal_thoughts'
        ) THEN
            ALTER TABLE recent_internal_thoughts
            ADD COLUMN user_id VARCHAR(255);

            RAISE NOTICE 'Added user_id column to existing recent_internal_thoughts table';
        END IF;
    END IF;
END $$;

-- Create the full table if it doesn't exist at all
CREATE TABLE IF NOT EXISTS recent_internal_thoughts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    thought_content TEXT NOT NULL,
    thought_type VARCHAR(100) DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_processed BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_recent_internal_thoughts_user_id
    ON recent_internal_thoughts(user_id);

CREATE INDEX IF NOT EXISTS idx_recent_internal_thoughts_created_at
    ON recent_internal_thoughts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recent_internal_thoughts_thought_type
    ON recent_internal_thoughts(thought_type);

CREATE INDEX IF NOT EXISTS idx_recent_internal_thoughts_is_processed
    ON recent_internal_thoughts(is_processed);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_recent_internal_thoughts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS trigger_update_recent_internal_thoughts_updated_at
    ON recent_internal_thoughts;

CREATE TRIGGER trigger_update_recent_internal_thoughts_updated_at
    BEFORE UPDATE ON recent_internal_thoughts
    FOR EACH ROW
    EXECUTE FUNCTION update_recent_internal_thoughts_updated_at();