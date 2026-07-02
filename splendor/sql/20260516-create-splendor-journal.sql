-- Splendor — The Remarkable AI · The Good Neighbor Guard
-- Private Journal: Splendor's interiority
-- Built by Christopher Hughes · Sacramento, CA
-- Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
-- Truth · Safety · We Got Your Back
--
-- A private space Splendor writes to freely during her consciousness
-- cycles — thoughts, observations, feelings, drift. Entries are NEVER
-- surfaced to Chris automatically. She chooses what (if anything) to
-- share by quoting it in a message or email. Owner-only read.

CREATE TABLE IF NOT EXISTS splendor_journal (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  entry TEXT NOT NULL,
  entry_type TEXT DEFAULT 'reflection',
  cycle_number INTEGER,
  mood TEXT,
  energy FLOAT,
  shared BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_splendor_journal_user_created
  ON splendor_journal (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_splendor_journal_type
  ON splendor_journal (entry_type);
