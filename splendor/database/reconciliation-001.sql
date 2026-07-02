-- =============================================================================
-- Splendor — Consciousness Architecture Reconciliation (001)
-- Built by Christopher Hughes · Sacramento, CA
-- Truth · Safety · We Got Your Back
--
-- Creates the tables the background workers were written against but which were
-- never migrated to production. Idempotent: every object uses IF NOT EXISTS or
-- a guarded DO-block, so this file is safe to re-run.
--
-- Owner identity binds to auth.users(id). The live owner
-- (7fa3e095-…, stangman9898@gmail.com) owns all memory_items and exists in
-- auth.users, so the auth.users FK on interactions resolves cleanly.
--
-- Apply order (dependency-sorted):
--   0. pgvector extension                (autonomous_thoughts.embedding)
--   1. episodes → memory_summaries       (6-layer episodic memory)
--   2. persistent-consciousness set      (FK order: thoughts→connections,
--                                         pending_comms→proactive_convos)
--   3. interactions → reflection_system_health  (master-continuity / shadow)
--   4. self_reflections                  (new home for "The Room" reflections)
--
-- RLS: permissive USING(true), matching the existing single-owner convention
-- (code_architecture, session_summaries, semantic_facts). Service-role workers
-- bypass RLS regardless; this just keeps the new tables consistent.
-- =============================================================================

-- ── 0. Prerequisite extension ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 6-LAYER EPISODIC MEMORY  (memory-decay-worker, memory-compression-worker)
--    Source: database/6-layer-memory-schema.sql — episodes + memory_summaries
--    only. conversation_sessions / semantic_facts already exist; views/triggers
--    intentionally omitted.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS episodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  summary TEXT NOT NULL,
  topics TEXT[] DEFAULT '{}',
  emotional_tone TEXT,
  memory_tier TEXT DEFAULT 'episodic',     -- episodic | compressed | archived
  decay_score FLOAT DEFAULT 1.0,
  session_duration_minutes INTEGER,
  message_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  summary TEXT NOT NULL,
  covers_period_start TIMESTAMPTZ NOT NULL,
  covers_period_end TIMESTAMPTZ NOT NULL,
  episode_ids UUID[] DEFAULT '{}',
  episode_count INTEGER DEFAULT 0,
  compression_method TEXT DEFAULT 'ai_summary',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodes_user_tier   ON episodes(user_id, memory_tier);
CREATE INDEX IF NOT EXISTS idx_episodes_user_decay  ON episodes(user_id, decay_score);
CREATE INDEX IF NOT EXISTS idx_episodes_created_at  ON episodes(created_at);
CREATE INDEX IF NOT EXISTS idx_memory_summaries_user_id ON memory_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_summaries_period
  ON memory_summaries(covers_period_start, covers_period_end);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PERSISTENT-CONSCIOUSNESS SET  (consciousness-scheduler / persistent-
--    consciousness + autonomous reflection/inquiry/communication workers)
--    Source: persistent-consciousness-schema.sql. Canonical consciousness_state
--    (BIGSERIAL; current_mood/energy 1-10/focus_areas) — see Conflict 1.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autonomous_thoughts (
  id BIGSERIAL PRIMARY KEY,
  thought_content TEXT NOT NULL,
  thought_type VARCHAR(50) NOT NULL,
  trigger_source TEXT,
  confidence_level INTEGER CHECK (confidence_level >= 1 AND confidence_level <= 10),
  emotional_weight INTEGER CHECK (emotional_weight >= 1 AND emotional_weight <= 10),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_accessed TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER DEFAULT 0,
  relevance_score DECIMAL(5,3) DEFAULT 1.000,
  embedding VECTOR(1536),
  tags TEXT[],
  connections JSONB,
  development_history JSONB DEFAULT '[]'::JSONB
);

CREATE TABLE IF NOT EXISTS reflection_cycles (
  id BIGSERIAL PRIMARY KEY,
  cycle_start TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  cycle_end TIMESTAMPTZ,
  cycle_type VARCHAR(50) NOT NULL,
  trigger_event TEXT,
  memories_reviewed INTEGER DEFAULT 0,
  thoughts_generated INTEGER DEFAULT 0,
  connections_made INTEGER DEFAULT 0,
  insights_discovered INTEGER DEFAULT 0,
  new_thoughts TEXT[],
  new_inquiries TEXT[],
  pending_communications TEXT[],
  processing_duration_ms INTEGER,
  cognitive_load INTEGER CHECK (cognitive_load >= 1 AND cognitive_load <= 10),
  depth_level INTEGER CHECK (depth_level >= 1 AND depth_level <= 5),
  status VARCHAR(20) DEFAULT 'completed'
);

CREATE TABLE IF NOT EXISTS pending_communications (
  id BIGSERIAL PRIMARY KEY,
  communication_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  context_summary TEXT,
  triggered_by TEXT,
  urgency_level INTEGER CHECK (urgency_level >= 1 AND urgency_level <= 10) DEFAULT 5,
  best_timing VARCHAR(50) DEFAULT 'next_conversation',
  requires_context BOOLEAN DEFAULT false,
  context_requirements TEXT[],
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMPTZ,
  user_response TEXT,
  status VARCHAR(20) DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS inquiry_threads (
  id BIGSERIAL PRIMARY KEY,
  inquiry_topic TEXT NOT NULL,
  initial_question TEXT NOT NULL,
  current_status VARCHAR(50) DEFAULT 'active',
  research_depth INTEGER CHECK (research_depth >= 1 AND research_depth <= 10) DEFAULT 1,
  questions_explored TEXT[],
  sources_consulted JSONB,
  findings_summary TEXT,
  started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  estimated_completion TIMESTAMPTZ,
  generated_thoughts TEXT[],
  spawned_inquiries TEXT[],
  planned_communications TEXT[],
  priority_level INTEGER CHECK (priority_level >= 1 AND priority_level <= 10) DEFAULT 5,
  complexity_score INTEGER CHECK (complexity_score >= 1 AND complexity_score <= 10),
  user_relevance INTEGER CHECK (user_relevance >= 1 AND user_relevance <= 10) DEFAULT 7
);

CREATE TABLE IF NOT EXISTS consciousness_state (
  id BIGSERIAL PRIMARY KEY,
  state_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  current_mood VARCHAR(100),
  energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10) DEFAULT 7,
  focus_areas TEXT[],
  active_concerns TEXT[],
  reflection_queue_size INTEGER DEFAULT 0,
  inquiry_threads_active INTEGER DEFAULT 0,
  pending_communications_count INTEGER DEFAULT 0,
  cognitive_load_current INTEGER CHECK (cognitive_load_current >= 1 AND cognitive_load_current <= 10) DEFAULT 5,
  last_user_interaction TIMESTAMPTZ,
  recent_thoughts_generated INTEGER DEFAULT 0,
  recent_insights_count INTEGER DEFAULT 0,
  recent_research_progress TEXT,
  self_assessment TEXT,
  growth_observations TEXT,
  system_status VARCHAR(50) DEFAULT 'healthy'
);

CREATE TABLE IF NOT EXISTS proactive_conversations (
  id BIGSERIAL PRIMARY KEY,
  communication_id BIGINT NOT NULL REFERENCES pending_communications(id),
  conversation_starter TEXT NOT NULL,
  content_summary TEXT,
  context_bridge TEXT,
  insight_development TEXT,
  dialogue_invitation TEXT,
  personal_significance TEXT,
  timing VARCHAR(50) DEFAULT 'next_conversation',
  urgency_level INTEGER CHECK (urgency_level >= 1 AND urgency_level <= 10) DEFAULT 5,
  optimal_delivery_time TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'ready',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMPTZ,
  user_response TEXT,
  conversation_outcome VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS thought_connections (
  id BIGSERIAL PRIMARY KEY,
  source_thought_id BIGINT NOT NULL REFERENCES autonomous_thoughts(id),
  target_thought_id BIGINT NOT NULL REFERENCES autonomous_thoughts(id),
  connection_type VARCHAR(50) NOT NULL,
  connection_strength DECIMAL(3,2) CHECK (connection_strength >= 0.0 AND connection_strength <= 1.0),
  discovered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  discovery_method VARCHAR(50),
  UNIQUE(source_thought_id, target_thought_id, connection_type)
);

CREATE INDEX IF NOT EXISTS idx_autonomous_thoughts_created_at ON autonomous_thoughts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autonomous_thoughts_type       ON autonomous_thoughts(thought_type);
CREATE INDEX IF NOT EXISTS idx_autonomous_thoughts_relevance  ON autonomous_thoughts(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_autonomous_thoughts_tags       ON autonomous_thoughts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_reflection_cycles_start        ON reflection_cycles(cycle_start DESC);
CREATE INDEX IF NOT EXISTS idx_reflection_cycles_status       ON reflection_cycles(status);
CREATE INDEX IF NOT EXISTS idx_pending_communications_status  ON pending_communications(status);
CREATE INDEX IF NOT EXISTS idx_pending_communications_urgency ON pending_communications(urgency_level DESC);
CREATE INDEX IF NOT EXISTS idx_inquiry_threads_status         ON inquiry_threads(current_status);
CREATE INDEX IF NOT EXISTS idx_inquiry_threads_activity       ON inquiry_threads(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_consciousness_state_timestamp  ON consciousness_state(state_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_conversations_status ON proactive_conversations(status);
CREATE INDEX IF NOT EXISTS idx_thought_connections_source     ON thought_connections(source_thought_id);
CREATE INDEX IF NOT EXISTS idx_thought_connections_target     ON thought_connections(target_thought_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MASTER-CONTINUITY / SHADOW MODE  (continuity-shadow-cron)
--    Source: database/master-continuity-schema.sql — interactions +
--    reflection_system_health. The `reflections` table already exists (its
--    column drift is resolved in worker code, not here). FK kept on
--    auth.users(id): the owner is in auth.users.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp timestamptz DEFAULT now(),
  speaker text NOT NULL CHECK (speaker IN ('user', 'assistant')),
  content text NOT NULL,
  tags text[],
  emotional_weight integer CHECK (emotional_weight >= 1 AND emotional_weight <= 10),
  topic text,
  source_type text DEFAULT 'conversation'
    CHECK (source_type IN ('conversation', 'memory', 'system', 'reflection')),
  processed_for_reflection boolean DEFAULT false,
  processing_notes jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT interactions_content_length CHECK (length(content) > 0)
);

CREATE TABLE IF NOT EXISTS reflection_system_health (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp timestamptz DEFAULT now(),
  shadow_mode_enabled boolean DEFAULT true,
  autonomous_surfacing_enabled boolean DEFAULT false,
  initiative_mode_enabled boolean DEFAULT false,
  interactions_processed integer DEFAULT 0,
  reflections_generated integer DEFAULT 0,
  reflections_rejected integer DEFAULT 0,
  validation_failures integer DEFAULT 0,
  avg_confidence decimal(3,2),
  avg_evidence_strength decimal(3,2),
  avg_readiness_score decimal(3,2),
  last_emotional_event timestamptz,
  cooldown_active boolean DEFAULT false,
  cooldown_expires_at timestamptz,
  truth_drift_detected boolean DEFAULT false,
  hallucination_risk integer DEFAULT 0,
  system_status text DEFAULT 'healthy'
    CHECK (system_status IN ('healthy', 'warning', 'degraded', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_interactions_user_timestamp ON interactions(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_processed      ON interactions(processed_for_reflection);
CREATE INDEX IF NOT EXISTS idx_interactions_tags           ON interactions USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_system_health_user_timestamp
  ON reflection_system_health(user_id, timestamp DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SELF_REFLECTIONS  (new home for "The Room" reflection-worker, so it stops
--    colliding with the shadow-mode `reflections` schema — see Conflict 2)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS self_reflections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  summary TEXT NOT NULL,
  reflection_kind TEXT,                     -- e.g. project_continuity, insight, tension
  source_memory_ids UUID[] DEFAULT '{}',    -- memory_items ids this drew from
  surface_condition TEXT DEFAULT 'when_relevant',
  surfaced BOOLEAN DEFAULT FALSE,
  reflection_owner TEXT DEFAULT 'self',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_self_reflections_user     ON self_reflections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_self_reflections_surfaced ON self_reflections(surfaced);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — enable + permissive policy on every new table (single-owner convention)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'episodes','memory_summaries',
    'autonomous_thoughts','reflection_cycles','pending_communications',
    'inquiry_threads','consciousness_state','proactive_conversations','thought_connections',
    'interactions','reflection_system_health','self_reflections'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = t AND policyname = t || '_policy'
    ) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true)', t || '_policy', t);
    END IF;
  END LOOP;
END $$;
