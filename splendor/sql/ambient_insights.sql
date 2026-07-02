-- Ambient Insights Table
-- Stores context awareness insights from ambient monitoring
CREATE TABLE ambient_insights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    context_data JSONB NOT NULL,
    insight TEXT,
    insight_type VARCHAR(50) DEFAULT 'ambient_context',
    confidence_score DECIMAL(3,2) DEFAULT 0.7,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_ambient_insights_user_id ON ambient_insights(user_id);
CREATE INDEX idx_ambient_insights_detected_at ON ambient_insights(detected_at);
CREATE INDEX idx_ambient_insights_type ON ambient_insights(insight_type);
CREATE INDEX idx_ambient_insights_context_data ON ambient_insights USING GIN (context_data);

-- Enable RLS (Row Level Security)
ALTER TABLE ambient_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own ambient insights
CREATE POLICY ambient_insights_policy ON ambient_insights
FOR ALL USING (auth.uid()::text = user_id);

-- Auto-cleanup old ambient insights (keep last 60 days)
CREATE OR REPLACE FUNCTION cleanup_old_ambient_insights()
RETURNS void AS $$
BEGIN
    DELETE FROM ambient_insights
    WHERE detected_at < NOW() - INTERVAL '60 days';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled function to run cleanup weekly (if using pg_cron extension)
-- SELECT cron.schedule('cleanup-ambient-insights', '0 3 * * 0', 'SELECT cleanup_old_ambient_insights();');