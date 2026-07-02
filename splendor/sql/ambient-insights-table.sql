-- AMBIENT INSIGHTS TABLE
-- Fixes the missing table error for ambient awareness system

-- Create ambient_insights table
CREATE TABLE IF NOT EXISTS ambient_insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    insight_type VARCHAR(100) NOT NULL,
    insight_content TEXT NOT NULL,
    context_data JSONB DEFAULT '{}',
    confidence_score DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    priority_level VARCHAR(20) DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    is_delivered BOOLEAN DEFAULT FALSE,
    delivery_method VARCHAR(50),
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ambient_insights_user_id ON ambient_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_ambient_insights_created_at ON ambient_insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ambient_insights_insight_type ON ambient_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_ambient_insights_is_delivered ON ambient_insights(is_delivered);
CREATE INDEX IF NOT EXISTS idx_ambient_insights_priority ON ambient_insights(priority_level);

-- Alternative: If the system expects 'recent_internal_thoughts' table instead
CREATE TABLE IF NOT EXISTS recent_internal_thoughts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    thought_content TEXT NOT NULL,
    thought_type VARCHAR(100) DEFAULT 'ambient',
    context_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_processed BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for recent_internal_thoughts
CREATE INDEX IF NOT EXISTS idx_recent_internal_thoughts_user_id ON recent_internal_thoughts(user_id);
CREATE INDEX IF NOT EXISTS idx_recent_internal_thoughts_created_at ON recent_internal_thoughts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recent_internal_thoughts_type ON recent_internal_thoughts(thought_type);
CREATE INDEX IF NOT EXISTS idx_recent_internal_thoughts_processed ON recent_internal_thoughts(is_processed);