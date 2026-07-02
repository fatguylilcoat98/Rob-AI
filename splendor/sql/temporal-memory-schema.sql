-- TEMPORAL MEMORY SYSTEM SCHEMA
-- Implements honest, time-aware memory with precision tracking

-- Create temporal_memories table with enhanced timestamp tracking
CREATE TABLE IF NOT EXISTS temporal_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  memory_type VARCHAR(50) DEFAULT 'conversation',

  -- Temporal precision fields
  conversation_date TIMESTAMP WITH TIME ZONE NOT NULL, -- When the conversation actually happened
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), -- When the memory was formed
  last_accessed TIMESTAMP WITH TIME ZONE, -- When last recalled

  -- Context and confidence tracking
  context_type VARCHAR(20) DEFAULT 'real-time', -- real-time, recalled, inferred
  confidence_level DECIMAL(3,2) DEFAULT 1.0 CHECK (confidence_level >= 0.0 AND confidence_level <= 1.0),
  evolution_stage VARCHAR(20) DEFAULT 'initial', -- initial, refined, changed

  -- Access and usage tracking
  access_count INTEGER DEFAULT 0,
  source_conversation_id UUID,
  reality_context JSONB, -- Store reality context from when memory was formed

  -- Evolution and relationship tracking
  superseded_by UUID REFERENCES temporal_memories(id), -- Points to newer version
  thinking_pattern_shift BOOLEAN DEFAULT false, -- Flags significant changes in thinking

  -- Metadata
  created_by_system VARCHAR(50) DEFAULT 'splendor',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_temporal_memories_user_id ON temporal_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_temporal_memories_conversation_date ON temporal_memories(conversation_date DESC);
CREATE INDEX IF NOT EXISTS idx_temporal_memories_created_at ON temporal_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_temporal_memories_confidence ON temporal_memories(confidence_level);
CREATE INDEX IF NOT EXISTS idx_temporal_memories_evolution ON temporal_memories(evolution_stage);
CREATE INDEX IF NOT EXISTS idx_temporal_memories_superseded ON temporal_memories(superseded_by);
CREATE INDEX IF NOT EXISTS idx_temporal_memories_content_search ON temporal_memories USING gin(to_tsvector('english', content));

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_temporal_memory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_temporal_memory_updated_at ON temporal_memories;
CREATE TRIGGER trigger_temporal_memory_updated_at
    BEFORE UPDATE ON temporal_memories
    FOR EACH ROW
    EXECUTE FUNCTION update_temporal_memory_updated_at();

-- Helper functions for RPC calls from the application

-- Function to increment access count
CREATE OR REPLACE FUNCTION increment_access_count(memory_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE temporal_memories
    SET access_count = access_count + 1,
        last_accessed = now()
    WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql;

-- Function to degrade confidence over time
CREATE OR REPLACE FUNCTION degrade_old_memories(user_uuid UUID, days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE temporal_memories
    SET confidence_level = GREATEST(0.1, confidence_level * 0.9)
    WHERE user_id = user_uuid
      AND conversation_date < (now() - INTERVAL '1 day' * days_old)
      AND confidence_level >= 0.15
      AND superseded_by IS NULL;

    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- Function to find evolution chains
CREATE OR REPLACE FUNCTION get_memory_evolution_chain(start_memory_id UUID)
RETURNS TABLE(
    id UUID,
    content TEXT,
    evolution_stage VARCHAR(20),
    conversation_date TIMESTAMP WITH TIME ZONE,
    confidence_level DECIMAL(3,2),
    level INTEGER
) AS $$
WITH RECURSIVE evolution_chain AS (
    -- Start with the base memory
    SELECT
        tm.id,
        tm.content,
        tm.evolution_stage,
        tm.conversation_date,
        tm.confidence_level,
        0 as level
    FROM temporal_memories tm
    WHERE tm.id = start_memory_id

    UNION ALL

    -- Find memories that supersede this one
    SELECT
        tm.id,
        tm.content,
        tm.evolution_stage,
        tm.conversation_date,
        tm.confidence_level,
        ec.level + 1
    FROM temporal_memories tm
    JOIN evolution_chain ec ON tm.id = ec.superseded_by
)
SELECT * FROM evolution_chain ORDER BY level;
$$ LANGUAGE sql;

-- Row Level Security (will be enabled if needed)
-- ALTER TABLE temporal_memories ENABLE ROW LEVEL SECURITY;

-- Example policy (commented out - enable if RLS is needed)
-- CREATE POLICY "Users can access their own temporal memories" ON temporal_memories
--   FOR ALL USING (auth.uid()::uuid = user_id);

-- Grant necessary permissions
-- GRANT ALL ON temporal_memories TO authenticated;
-- GRANT ALL ON temporal_memories TO anon;