-- Splendor — The Good Neighbor Guard
-- Micro-Experiment Layer — hypothesis → trial → reflection data model
-- Truth · Safety · We Got Your Back

CREATE TABLE IF NOT EXISTS micro_experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  strategy TEXT NOT NULL,
  expected_signal TEXT,
  risk_level TEXT DEFAULT 'low',
  status TEXT DEFAULT 'proposed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'splendor',
  safety_notes TEXT,
  governance_review_status TEXT DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_micro_experiments_user_status ON micro_experiments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_micro_experiments_user_created ON micro_experiments (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS micro_experiment_trials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID REFERENCES micro_experiments(id),
  user_id UUID REFERENCES auth.users(id),
  conversation_id TEXT,
  message_id TEXT,
  strategy_applied TEXT,
  observed_signal TEXT,
  outcome_score FLOAT,
  user_response_summary TEXT,
  splendor_reflection TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_micro_trials_experiment ON micro_experiment_trials (experiment_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_micro_trials_user ON micro_experiment_trials (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS micro_experiment_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID REFERENCES micro_experiments(id),
  user_id UUID REFERENCES auth.users(id),
  conclusion TEXT,
  evidence_summary TEXT,
  keep_strategy BOOLEAN DEFAULT false,
  adjust_strategy BOOLEAN DEFAULT false,
  discard_strategy BOOLEAN DEFAULT false,
  next_hypothesis TEXT,
  reviewed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_micro_reviews_experiment ON micro_experiment_reviews (experiment_id, reviewed_at DESC);
