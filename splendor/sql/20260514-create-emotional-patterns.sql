-- Splendor — The Good Neighbor Guard
-- Continuity Core: emotional_patterns table
-- Built by Christopher Hughes · Sacramento, CA
-- Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
-- Truth · Safety · We Got Your Back
--
-- Captures the tone/energy/clarity signature of each turn so the
-- Cognitive Archaeology panel can render a timeline showing how
-- Chris's state varies across sessions. NOT fake emotions — only
-- observations drawn from actual conversation data.

CREATE TABLE IF NOT EXISTS emotional_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  session_date TIMESTAMP DEFAULT now(),
  tone TEXT,
  energy_level TEXT,
  clarity_score FLOAT,
  dominant_theme TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_emotional_patterns_user_date
  ON emotional_patterns (user_id, session_date DESC);
