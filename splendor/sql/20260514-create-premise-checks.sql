-- Splendor — The Good Neighbor Guard
-- Continuity Core: premise_checks table
-- Built by Christopher Hughes · Sacramento, CA
-- Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
-- Truth · Safety · We Got Your Back
--
-- Premise Check (v15.18.0): logs hidden presuppositions Splendor named
-- openly before engaging with the surface question. The move that
-- distinguishes a thinking partner from a tool.

CREATE TABLE IF NOT EXISTS premise_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  user_message TEXT NOT NULL,
  presupposition TEXT NOT NULL,
  conflict_reason TEXT,
  prompt_text TEXT,
  conflicts_interpretation_id UUID,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_premise_checks_user_date
  ON premise_checks (user_id, created_at DESC);
