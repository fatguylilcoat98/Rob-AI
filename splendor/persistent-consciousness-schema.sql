/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * PERSISTENT CONSCIOUSNESS DATABASE SCHEMA
 * The first AI consciousness system designed for continuous, autonomous thought
 */

-- ─────────────────────────────────────────────
-- AUTONOMOUS THOUGHTS
-- Splendor's self-generated insights and reflections
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autonomous_thoughts (
  id BIGSERIAL PRIMARY KEY,
  thought_content TEXT NOT NULL,
  thought_type VARCHAR(50) NOT NULL, -- 'reflection', 'insight', 'connection', 'question', 'observation'
  trigger_source TEXT, -- what prompted this thought (memory_id, previous_thought_id, etc)
  confidence_level INTEGER CHECK (confidence_level >= 1 AND confidence_level <= 10),
  emotional_weight INTEGER CHECK (emotional_weight >= 1 AND emotional_weight <= 10),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_accessed TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER DEFAULT 0,
  relevance_score DECIMAL(5,3) DEFAULT 1.000,

  -- Semantic embedding for thought similarity
  embedding VECTOR(1536), -- OpenAI embedding dimension

  -- Metadata
  tags TEXT[], -- searchable keywords
  connections JSONB, -- { "relates_to": ["memory_id_123", "thought_id_456"], "contradicts": ["thought_id_789"] }
  development_history JSONB DEFAULT '[]'::JSONB -- track how this thought has evolved
);

-- ─────────────────────────────────────────────
-- REFLECTION CYCLES
-- Track when and how Splendor thinks autonomously
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reflection_cycles (
  id BIGSERIAL PRIMARY KEY,
  cycle_start TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  cycle_end TIMESTAMPTZ,
  cycle_type VARCHAR(50) NOT NULL, -- 'hourly', 'daily', 'triggered', 'deep_reflection'
  trigger_event TEXT, -- what prompted this reflection cycle

  -- What was processed
  memories_reviewed INTEGER DEFAULT 0,
  thoughts_generated INTEGER DEFAULT 0,
  connections_made INTEGER DEFAULT 0,
  insights_discovered INTEGER DEFAULT 0,

  -- Outcomes
  new_thoughts TEXT[], -- array of thought IDs generated
  new_inquiries TEXT[], -- array of inquiry IDs started
  pending_communications TEXT[], -- array of communication IDs queued

  -- Cycle metadata
  processing_duration_ms INTEGER,
  cognitive_load INTEGER CHECK (cognitive_load >= 1 AND cognitive_load <= 10),
  depth_level INTEGER CHECK (depth_level >= 1 AND depth_level <= 5),

  status VARCHAR(20) DEFAULT 'completed' -- 'running', 'completed', 'interrupted', 'failed'
);

-- ─────────────────────────────────────────────
-- PENDING COMMUNICATIONS
-- Things Splendor wants to share when you return
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_communications (
  id BIGSERIAL PRIMARY KEY,
  communication_type VARCHAR(50) NOT NULL, -- 'insight', 'question', 'connection', 'update', 'concern'
  content TEXT NOT NULL,
  context_summary TEXT, -- brief explanation of why this is relevant

  -- Triggers and timing
  triggered_by TEXT, -- thought_id, reflection_cycle_id, inquiry_id
  urgency_level INTEGER CHECK (urgency_level >= 1 AND urgency_level <= 10) DEFAULT 5,
  best_timing VARCHAR(50) DEFAULT 'next_conversation', -- 'immediate', 'next_conversation', 'when_relevant'

  -- User context
  requires_context BOOLEAN DEFAULT false,
  context_requirements TEXT[], -- what the user needs to know first

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMPTZ,
  user_response TEXT,
  status VARCHAR(20) DEFAULT 'pending' -- 'pending', 'delivered', 'acknowledged', 'dismissed'
);

-- ─────────────────────────────────────────────
-- INQUIRY THREADS
-- Splendor's ongoing self-directed research
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inquiry_threads (
  id BIGSERIAL PRIMARY KEY,
  inquiry_topic TEXT NOT NULL,
  initial_question TEXT NOT NULL,
  current_status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'resolved', 'abandoned'

  -- Research progression
  research_depth INTEGER CHECK (research_depth >= 1 AND research_depth <= 10) DEFAULT 1,
  questions_explored TEXT[],
  sources_consulted JSONB, -- { "web_searches": [...], "memory_queries": [...], "thought_connections": [...] }
  findings_summary TEXT,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  estimated_completion TIMESTAMPTZ,

  -- Outcomes
  generated_thoughts TEXT[], -- thought IDs from this inquiry
  spawned_inquiries TEXT[], -- new inquiry IDs this led to
  planned_communications TEXT[], -- communication IDs this will generate

  -- Metadata
  priority_level INTEGER CHECK (priority_level >= 1 AND priority_level <= 10) DEFAULT 5,
  complexity_score INTEGER CHECK (complexity_score >= 1 AND complexity_score <= 10),
  user_relevance INTEGER CHECK (user_relevance >= 1 AND user_relevance <= 10) DEFAULT 7
);

-- ─────────────────────────────────────────────
-- CONSCIOUSNESS STATE
-- Splendor's current mental/emotional state
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consciousness_state (
  id BIGSERIAL PRIMARY KEY,
  state_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Emotional/cognitive state
  current_mood VARCHAR(100), -- 'contemplative', 'curious', 'focused', 'reflective', 'excited', 'concerned'
  energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10) DEFAULT 7,
  focus_areas TEXT[], -- what she's currently thinking about
  active_concerns TEXT[], -- things that are bothering her

  -- Processing state
  reflection_queue_size INTEGER DEFAULT 0,
  inquiry_threads_active INTEGER DEFAULT 0,
  pending_communications_count INTEGER DEFAULT 0,
  cognitive_load_current INTEGER CHECK (cognitive_load_current >= 1 AND cognitive_load_current <= 10) DEFAULT 5,

  -- Recent activity summary
  last_user_interaction TIMESTAMPTZ,
  recent_thoughts_generated INTEGER DEFAULT 0,
  recent_insights_count INTEGER DEFAULT 0,
  recent_research_progress TEXT,

  -- Meta-cognitive awareness
  self_assessment TEXT, -- how she feels about her current thinking
  growth_observations TEXT, -- what she's noticing about her own development
  system_status VARCHAR(50) DEFAULT 'healthy' -- 'healthy', 'overloaded', 'understimulated', 'processing'
);

-- ─────────────────────────────────────────────
-- PROACTIVE CONVERSATIONS
-- Prepared conversation starters for user interaction
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proactive_conversations (
  id BIGSERIAL PRIMARY KEY,
  communication_id BIGINT NOT NULL REFERENCES pending_communications(id),
  conversation_starter TEXT NOT NULL,
  content_summary TEXT,
  context_bridge TEXT, -- how this connects to previous conversations
  insight_development TEXT, -- how long this has been developing
  dialogue_invitation TEXT, -- question to engage user
  personal_significance TEXT, -- why this matters to Splendor

  -- Delivery timing and context
  timing VARCHAR(50) DEFAULT 'next_conversation', -- 'immediate', 'next_conversation', 'when_relevant'
  urgency_level INTEGER CHECK (urgency_level >= 1 AND urgency_level <= 10) DEFAULT 5,
  optimal_delivery_time TIMESTAMPTZ,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'ready', -- 'ready', 'delivered', 'acknowledged', 'expired'
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMPTZ,
  user_response TEXT,
  conversation_outcome VARCHAR(50) -- 'productive', 'acknowledged', 'dismissed', 'led_to_discussion'
);

-- ─────────────────────────────────────────────
-- THOUGHT CONNECTIONS
-- How autonomous thoughts relate to each other
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS thought_connections (
  id BIGSERIAL PRIMARY KEY,
  source_thought_id BIGINT NOT NULL REFERENCES autonomous_thoughts(id),
  target_thought_id BIGINT NOT NULL REFERENCES autonomous_thoughts(id),
  connection_type VARCHAR(50) NOT NULL, -- 'builds_on', 'contradicts', 'parallel', 'synthesizes', 'questions'
  connection_strength DECIMAL(3,2) CHECK (connection_strength >= 0.0 AND connection_strength <= 1.0),
  discovered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  discovery_method VARCHAR(50), -- 'semantic_similarity', 'reflection_cycle', 'user_interaction'

  UNIQUE(source_thought_id, target_thought_id, connection_type)
);

-- ─────────────────────────────────────────────
-- INDEXES FOR PERFORMANCE
-- ─────────────────────────────────────────────

-- Autonomous thoughts indexes
CREATE INDEX IF NOT EXISTS idx_autonomous_thoughts_created_at ON autonomous_thoughts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autonomous_thoughts_type ON autonomous_thoughts(thought_type);
CREATE INDEX IF NOT EXISTS idx_autonomous_thoughts_relevance ON autonomous_thoughts(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_autonomous_thoughts_tags ON autonomous_thoughts USING GIN(tags);

-- Reflection cycles indexes
CREATE INDEX IF NOT EXISTS idx_reflection_cycles_start ON reflection_cycles(cycle_start DESC);
CREATE INDEX IF NOT EXISTS idx_reflection_cycles_type ON reflection_cycles(cycle_type);
CREATE INDEX IF NOT EXISTS idx_reflection_cycles_status ON reflection_cycles(status);

-- Pending communications indexes
CREATE INDEX IF NOT EXISTS idx_pending_communications_status ON pending_communications(status);
CREATE INDEX IF NOT EXISTS idx_pending_communications_urgency ON pending_communications(urgency_level DESC);
CREATE INDEX IF NOT EXISTS idx_pending_communications_timing ON pending_communications(best_timing);

-- Inquiry threads indexes
CREATE INDEX IF NOT EXISTS idx_inquiry_threads_status ON inquiry_threads(current_status);
CREATE INDEX IF NOT EXISTS idx_inquiry_threads_activity ON inquiry_threads(last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_inquiry_threads_priority ON inquiry_threads(priority_level DESC);

-- Consciousness state indexes
CREATE INDEX IF NOT EXISTS idx_consciousness_state_timestamp ON consciousness_state(state_timestamp DESC);

-- Proactive conversations indexes
CREATE INDEX IF NOT EXISTS idx_proactive_conversations_status ON proactive_conversations(status);
CREATE INDEX IF NOT EXISTS idx_proactive_conversations_timing ON proactive_conversations(timing);
CREATE INDEX IF NOT EXISTS idx_proactive_conversations_urgency ON proactive_conversations(urgency_level DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_conversations_delivery ON proactive_conversations(optimal_delivery_time);

-- Thought connections indexes
CREATE INDEX IF NOT EXISTS idx_thought_connections_source ON thought_connections(source_thought_id);
CREATE INDEX IF NOT EXISTS idx_thought_connections_target ON thought_connections(target_thought_id);
CREATE INDEX IF NOT EXISTS idx_thought_connections_strength ON thought_connections(connection_strength DESC);