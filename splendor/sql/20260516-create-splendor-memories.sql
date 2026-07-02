-- =============================================================================
-- Splendor — The Remarkable AI · The Good Neighbor Guard
-- Migration: splendor_memories (Hippocampus persistence)
-- =============================================================================
-- The only brain region that persists state is the Hippocampus. All other
-- regions are stateless or in-memory. Run once in the Supabase SQL editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS splendor_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  turn_number INTEGER,
  content TEXT,
  tags TEXT[],
  importance_score FLOAT DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_splendor_memories_user
  ON splendor_memories(user_id);

CREATE INDEX IF NOT EXISTS idx_splendor_memories_importance
  ON splendor_memories(importance_score DESC);
