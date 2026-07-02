-- SAFE 6-LAYER MEMORY UPDATE
-- Only creates missing components

-- Check if episodes table needs updates
DO $$
BEGIN
    -- Add missing columns to episodes if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='episodes' AND column_name='memory_tier') THEN
        ALTER TABLE episodes ADD COLUMN memory_tier TEXT DEFAULT 'episodic';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='episodes' AND column_name='decay_score') THEN
        ALTER TABLE episodes ADD COLUMN decay_score FLOAT DEFAULT 1.0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='episodes' AND column_name='topics') THEN
        ALTER TABLE episodes ADD COLUMN topics TEXT[] DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='episodes' AND column_name='emotional_tone') THEN
        ALTER TABLE episodes ADD COLUMN emotional_tone TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='episodes' AND column_name='session_duration_minutes') THEN
        ALTER TABLE episodes ADD COLUMN session_duration_minutes INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='episodes' AND column_name='message_count') THEN
        ALTER TABLE episodes ADD COLUMN message_count INTEGER;
    END IF;
END $$;

-- Create memory_summaries if it doesn't exist
CREATE TABLE IF NOT EXISTS memory_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Compressed content
  summary TEXT NOT NULL,

  -- Coverage period
  covers_period_start TIMESTAMPTZ NOT NULL,
  covers_period_end TIMESTAMPTZ NOT NULL,

  -- Source episodes
  episode_ids UUID[] DEFAULT '{}',
  episode_count INTEGER DEFAULT 0,

  -- Metadata
  compression_method TEXT DEFAULT 'ai_summary',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create semantic_facts if it doesn't exist
CREATE TABLE IF NOT EXISTS semantic_facts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Fact content
  fact_text TEXT NOT NULL,
  semantic_type TEXT NOT NULL,
  confidence_score FLOAT DEFAULT 1.0,

  -- Source tracking
  source_episode_id UUID,
  last_confirmed TIMESTAMPTZ DEFAULT NOW(),

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  superseded_by UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create conversation_sessions if it doesn't exist
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Session bounds
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  -- Session stats
  message_count INTEGER DEFAULT 0,
  total_duration_minutes INTEGER,

  -- Session outcome
  episode_id UUID,
  session_status TEXT DEFAULT 'active',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create proactive_openers if it doesn't exist
CREATE TABLE IF NOT EXISTS proactive_openers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Generated opener
  opener_text TEXT NOT NULL,
  opener_type TEXT,

  -- Context used
  days_since_last INTEGER,
  time_of_day TEXT,
  last_topic TEXT,

  -- Outcome
  was_displayed BOOLEAN DEFAULT FALSE,
  user_responded BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes (will skip if they already exist)
CREATE INDEX IF NOT EXISTS idx_episodes_user_tier ON episodes(user_id, memory_tier);
CREATE INDEX IF NOT EXISTS idx_episodes_user_decay ON episodes(user_id, decay_score);
CREATE INDEX IF NOT EXISTS idx_episodes_created_at ON episodes(created_at);

CREATE INDEX IF NOT EXISTS idx_memory_summaries_user_id ON memory_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_summaries_period ON memory_summaries(covers_period_start, covers_period_end);

CREATE INDEX IF NOT EXISTS idx_semantic_facts_user_type ON semantic_facts(user_id, semantic_type);
CREATE INDEX IF NOT EXISTS idx_semantic_facts_active ON semantic_facts(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user_id ON conversation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_status ON conversation_sessions(user_id, session_status);

CREATE INDEX IF NOT EXISTS idx_proactive_openers_user_id ON proactive_openers(user_id);

-- Enable RLS (will skip if already enabled)
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_openers ENABLE ROW LEVEL SECURITY;

-- Create policies (will skip if they already exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'episodes' AND policyname = 'episodes_policy') THEN
        CREATE POLICY episodes_policy ON episodes FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'memory_summaries' AND policyname = 'memory_summaries_policy') THEN
        CREATE POLICY memory_summaries_policy ON memory_summaries FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'semantic_facts' AND policyname = 'semantic_facts_policy') THEN
        CREATE POLICY semantic_facts_policy ON semantic_facts FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conversation_sessions' AND policyname = 'conversation_sessions_policy') THEN
        CREATE POLICY conversation_sessions_policy ON conversation_sessions FOR ALL USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'proactive_openers' AND policyname = 'proactive_openers_policy') THEN
        CREATE POLICY proactive_openers_policy ON proactive_openers FOR ALL USING (true);
    END IF;
END $$;

-- Create views (will replace if they exist)
CREATE OR REPLACE VIEW active_episodes AS
SELECT * FROM episodes
WHERE memory_tier = 'episodic'
ORDER BY created_at DESC;

CREATE OR REPLACE VIEW recent_memory_summaries AS
SELECT * FROM memory_summaries
ORDER BY covers_period_end DESC
LIMIT 5;

CREATE OR REPLACE VIEW current_semantic_facts AS
SELECT * FROM semantic_facts
WHERE is_active = TRUE
ORDER BY semantic_type, last_confirmed DESC;