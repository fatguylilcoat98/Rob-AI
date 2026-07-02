-- Splendor — The Good Neighbor Guard
-- Flight Recorder — append-only belief/confidence telemetry per brain turn
-- Phases 1-4: AI Flight Recorder, Visual Layer, Evidence Lineage, Cognitive Archaeology
-- Truth · Safety · We Got Your Back

CREATE TABLE IF NOT EXISTS flight_recorder (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,
  turn_number INTEGER,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),

  -- Input snapshot
  message_preview TEXT,

  -- RAS signals
  ras_novelty FLOAT,
  ras_salience FLOAT,
  ras_arousal FLOAT,

  -- Hippocampus
  memory_count INTEGER,
  retrieval_confidence FLOAT,
  memory_conflicts_count INTEGER,
  recall_telemetry JSONB,

  -- Thalamus
  attention_priority TEXT,
  urgency_level FLOAT,
  flagged_signals TEXT[],

  -- Amygdala
  emotional_tone TEXT,
  emotional_intensity FLOAT,
  primary_emotion TEXT,

  -- Cerebellum
  recommended_pacing TEXT,
  tonal_anchors TEXT[],

  -- DMN
  spontaneous_thought TEXT,

  -- Prefrontal (governance output)
  permission TEXT,
  truth_status TEXT,
  risk_level FLOAT,
  confidence FLOAT,
  tone_mode TEXT,
  response_intent TEXT,
  claspion_allowed BOOLEAN,
  gng_valid BOOLEAN,
  relational_pressure_triggered BOOLEAN,

  -- Output
  generated_by TEXT,
  degraded_regions TEXT[],
  micro_experiment_hint TEXT,

  -- Contradiction / belief-shift detection
  contradiction_detected BOOLEAN DEFAULT false,
  contradiction_detail JSONB,

  -- Confidence delta vs previous turn in same session
  confidence_delta FLOAT
);

CREATE INDEX IF NOT EXISTS idx_fr_user_time ON flight_recorder (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fr_session_turn ON flight_recorder (session_id, turn_number ASC);
CREATE INDEX IF NOT EXISTS idx_fr_user_risk ON flight_recorder (user_id, risk_level DESC);
CREATE INDEX IF NOT EXISTS idx_fr_contradiction ON flight_recorder (user_id, contradiction_detected) WHERE contradiction_detected = true;
CREATE INDEX IF NOT EXISTS idx_fr_permission ON flight_recorder (user_id, permission);
