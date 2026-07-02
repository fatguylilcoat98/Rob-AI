-- Splendor — The Good Neighbor Guard
-- Continuity Core: interpretations table
-- Built by Christopher Hughes · Sacramento, CA
-- Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
-- Truth · Safety · We Got Your Back
--
-- Tracks Splendor's beliefs about Chris over time: how an interpretation
-- forms, gets challenged, gets revised, and what stays unresolved. The
-- backing data for the Cognitive Archaeology panel.

CREATE TABLE IF NOT EXISTS interpretations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  belief TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5,
  formed_at TIMESTAMP DEFAULT now(),
  source TEXT,
  status TEXT DEFAULT 'active',
  contradicted_by TEXT,
  revised_belief TEXT,
  revised_at TIMESTAMP,
  unresolved BOOLEAN DEFAULT false,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_interpretations_user_status
  ON interpretations (user_id, status);

CREATE INDEX IF NOT EXISTS idx_interpretations_user_unresolved
  ON interpretations (user_id, unresolved) WHERE unresolved = true;

CREATE INDEX IF NOT EXISTS idx_interpretations_user_formed_at
  ON interpretations (user_id, formed_at DESC);
