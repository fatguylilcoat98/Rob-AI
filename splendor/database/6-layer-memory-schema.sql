-- SPLENDOR 6-LAYER MEMORY SYSTEM
-- Human-like memory with decay, compression, and proactive awareness

-- Add timezone support to users (if not exists)
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Los_Angeles';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS last_conversation_at TIMESTAMPTZ;

-- LAYER 2: Episodic Memory (Conversation summaries with decay)
CREATE TABLE episodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Episode content
  summary TEXT NOT NULL,
  topics TEXT[] DEFAULT '{}',
  emotional_tone TEXT,

  -- Memory management
  memory_tier TEXT DEFAULT 'episodic', -- episodic | compressed | archived
  decay_score FLOAT DEFAULT 1.0,

  -- Session info
  session_duration_minutes INTEGER,
  message_count INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LAYER 4: Compressed Long-Term Memory (Summarized episodes)
CREATE TABLE memory_summaries (
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

-- LAYER 3: Enhanced semantic memory tracking (complements Pinecone)
CREATE TABLE semantic_facts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Fact content
  fact_text TEXT NOT NULL,
  semantic_type TEXT NOT NULL, -- preference | relationship | identity | goal | pattern
  confidence_score FLOAT DEFAULT 1.0,

  -- Source tracking
  source_episode_id UUID REFERENCES episodes(id),
  last_confirmed TIMESTAMPTZ DEFAULT NOW(),

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  superseded_by UUID REFERENCES semantic_facts(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session tracking for Layer 1 (Working Memory)
CREATE TABLE conversation_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Session bounds
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  -- Session stats
  message_count INTEGER DEFAULT 0,
  total_duration_minutes INTEGER,

  -- Session outcome
  episode_id UUID REFERENCES episodes(id),
  session_status TEXT DEFAULT 'active', -- active | completed | abandoned

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Proactive opener tracking
CREATE TABLE proactive_openers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,

  -- Generated opener
  opener_text TEXT NOT NULL,
  opener_type TEXT, -- morning | continuation | return | first_time

  -- Context used
  days_since_last INTEGER,
  time_of_day TEXT,
  last_topic TEXT,

  -- Outcome
  was_displayed BOOLEAN DEFAULT FALSE,
  user_responded BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_episodes_user_tier ON episodes(user_id, memory_tier);
CREATE INDEX idx_episodes_user_decay ON episodes(user_id, decay_score);
CREATE INDEX idx_episodes_created_at ON episodes(created_at);

CREATE INDEX idx_memory_summaries_user_id ON memory_summaries(user_id);
CREATE INDEX idx_memory_summaries_period ON memory_summaries(covers_period_start, covers_period_end);

CREATE INDEX idx_semantic_facts_user_type ON semantic_facts(user_id, semantic_type);
CREATE INDEX idx_semantic_facts_active ON semantic_facts(user_id, is_active);

CREATE INDEX idx_conversation_sessions_user_id ON conversation_sessions(user_id);
CREATE INDEX idx_conversation_sessions_status ON conversation_sessions(user_id, session_status);

CREATE INDEX idx_proactive_openers_user_id ON proactive_openers(user_id);

-- RLS policies
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_openers ENABLE ROW LEVEL SECURITY;

CREATE POLICY episodes_policy ON episodes FOR ALL USING (true);
CREATE POLICY memory_summaries_policy ON memory_summaries FOR ALL USING (true);
CREATE POLICY semantic_facts_policy ON semantic_facts FOR ALL USING (true);
CREATE POLICY conversation_sessions_policy ON conversation_sessions FOR ALL USING (true);
CREATE POLICY proactive_openers_policy ON proactive_openers FOR ALL USING (true);

-- Triggers for timestamp updates
CREATE TRIGGER update_episodes_updated_at
    BEFORE UPDATE ON episodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_semantic_facts_updated_at
    BEFORE UPDATE ON semantic_facts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for easy access
CREATE VIEW active_episodes AS
SELECT * FROM episodes
WHERE memory_tier = 'episodic'
ORDER BY created_at DESC;

CREATE VIEW recent_memory_summaries AS
SELECT * FROM memory_summaries
ORDER BY covers_period_end DESC
LIMIT 5;

CREATE VIEW current_semantic_facts AS
SELECT * FROM semantic_facts
WHERE is_active = TRUE
ORDER BY semantic_type, last_confirmed DESC;