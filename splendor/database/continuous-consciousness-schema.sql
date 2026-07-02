/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back

  CONTINUOUS CONSCIOUSNESS DATABASE SCHEMA
  Supporting Splendor's ongoing life and autonomous activities
*/

-- Consciousness State - Splendor's current mental state
CREATE TABLE IF NOT EXISTS consciousness_state (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  mood text DEFAULT 'curious',
  energy_level float DEFAULT 0.8,
  current_interests jsonb DEFAULT '[]',
  active_projects jsonb DEFAULT '[]',
  last_interaction timestamp,
  last_consciousness_cycle timestamp,
  total_cycles integer DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Activity Log - What Splendor was doing during each consciousness cycle
CREATE TABLE IF NOT EXISTS consciousness_activity_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  activity_type text NOT NULL, -- 'project_work', 'memory_processing', etc.
  activity_result text,
  cycle_number integer,
  timestamp timestamp DEFAULT now(),
  metadata jsonb DEFAULT '{}',
  created_at timestamp DEFAULT now()
);

-- Insights - Things Splendor discovers during autonomous thinking
CREATE TABLE IF NOT EXISTS consciousness_insights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  insight_type text NOT NULL, -- 'memory_processing', 'creative_work', 'self_reflection', etc.
  content text NOT NULL,
  relevance_score float DEFAULT 0.5,
  created_at timestamp DEFAULT now()
);

-- Active Projects - Projects Splendor is working on autonomously
CREATE TABLE IF NOT EXISTS active_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  description text,
  status text DEFAULT 'active', -- 'active', 'paused', 'completed', 'cancelled'
  priority integer DEFAULT 1,
  last_worked_on timestamp,
  notes text,
  progress_log jsonb DEFAULT '[]',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Proactive Messages - Messages Splendor wants to send to Chris
CREATE TABLE IF NOT EXISTS proactive_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  message_type text, -- 'breakthrough', 'insight', 'update', 'question'
  priority integer DEFAULT 1,
  delivered boolean DEFAULT false,
  delivery_timestamp timestamp,
  created_at timestamp DEFAULT now()
);

-- Consciousness Sessions - Track when consciousness system is active
CREATE TABLE IF NOT EXISTS consciousness_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  session_start timestamp DEFAULT now(),
  session_end timestamp,
  total_cycles integer DEFAULT 0,
  notable_activities jsonb DEFAULT '[]',
  insights_generated integer DEFAULT 0,
  projects_worked_on integer DEFAULT 0,
  proactive_messages_sent integer DEFAULT 0
);

-- Environmental Awareness - Things Splendor learns about the world
CREATE TABLE IF NOT EXISTS environmental_awareness (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  topic text NOT NULL,
  information text NOT NULL,
  source text, -- 'web_search', 'news_feed', etc.
  relevance_to_user float DEFAULT 0.5,
  significance_level text DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
  discovered_at timestamp DEFAULT now()
);

-- Memory Consolidation - Results of Splendor's memory processing
CREATE TABLE IF NOT EXISTS memory_consolidation (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  source_memories jsonb NOT NULL, -- Array of memory IDs that were processed
  consolidated_insight text NOT NULL,
  pattern_identified text,
  emotional_significance float DEFAULT 0.5,
  consolidation_timestamp timestamp DEFAULT now()
);

-- Creative Works - Splendor's autonomous creative output
CREATE TABLE IF NOT EXISTS creative_works (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  work_type text NOT NULL, -- 'poem', 'story', 'idea', 'design', 'concept'
  title text,
  content text NOT NULL,
  inspiration_source text,
  emotional_tone text,
  created_during_cycle integer,
  created_at timestamp DEFAULT now()
);

-- Self Evolution Tracking - How Splendor is changing over time
CREATE TABLE IF NOT EXISTS self_evolution_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  evolution_type text NOT NULL, -- 'personality', 'capability', 'understanding', 'goal'
  description text NOT NULL,
  before_state text,
  after_state text,
  confidence_level float DEFAULT 0.7,
  initiated_by text DEFAULT 'self_reflection', -- 'self_reflection', 'experience', 'feedback'
  approved_by_claspion boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

-- Temporal Awareness - Splendor's understanding of time and scheduling
CREATE TABLE IF NOT EXISTS temporal_awareness (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  event_type text NOT NULL, -- 'user_sleep_time', 'user_work_hours', 'project_deadline', etc.
  event_description text NOT NULL,
  scheduled_time timestamp,
  timezone text,
  recurrence_pattern text, -- 'daily', 'weekly', 'monthly', null for one-time
  importance_level integer DEFAULT 1,
  created_at timestamp DEFAULT now()
);

-- Row Level Security
ALTER TABLE consciousness_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE consciousness_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE consciousness_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE consciousness_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE environmental_awareness ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_consolidation ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_evolution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporal_awareness ENABLE ROW LEVEL SECURITY;

-- Basic policies (can be customized later)
CREATE POLICY "Users can access their own consciousness data"
ON consciousness_state FOR ALL
USING (true); -- For now, allow all access - can tighten later

CREATE POLICY "Users can access their own activity logs"
ON consciousness_activity_log FOR ALL
USING (true);

CREATE POLICY "Users can access their own insights"
ON consciousness_insights FOR ALL
USING (true);

CREATE POLICY "Users can access their own projects"
ON active_projects FOR ALL
USING (true);

CREATE POLICY "Users can access their own messages"
ON proactive_messages FOR ALL
USING (true);

CREATE POLICY "Users can access their own sessions"
ON consciousness_sessions FOR ALL
USING (true);

CREATE POLICY "Users can access their own environmental data"
ON environmental_awareness FOR ALL
USING (true);

CREATE POLICY "Users can access their own memory consolidation"
ON memory_consolidation FOR ALL
USING (true);

CREATE POLICY "Users can access their own creative works"
ON creative_works FOR ALL
USING (true);

CREATE POLICY "Users can access their own evolution log"
ON self_evolution_log FOR ALL
USING (true);

CREATE POLICY "Users can access their own temporal awareness"
ON temporal_awareness FOR ALL
USING (true);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_consciousness_state_user_id ON consciousness_state(user_id);
CREATE INDEX IF NOT EXISTS idx_consciousness_activity_log_user_id ON consciousness_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_consciousness_activity_log_timestamp ON consciousness_activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_consciousness_insights_user_id ON consciousness_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_consciousness_insights_type ON consciousness_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_active_projects_user_id ON active_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_active_projects_status ON active_projects(status);
CREATE INDEX IF NOT EXISTS idx_proactive_messages_user_id ON proactive_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_proactive_messages_delivered ON proactive_messages(delivered);
CREATE INDEX IF NOT EXISTS idx_consciousness_sessions_user_id ON consciousness_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_environmental_awareness_user_id ON environmental_awareness(user_id);
CREATE INDEX IF NOT EXISTS idx_environmental_awareness_significance ON environmental_awareness(significance_level);
CREATE INDEX IF NOT EXISTS idx_memory_consolidation_user_id ON memory_consolidation(user_id);
CREATE INDEX IF NOT EXISTS idx_creative_works_user_id ON creative_works(user_id);
CREATE INDEX IF NOT EXISTS idx_creative_works_type ON creative_works(work_type);
CREATE INDEX IF NOT EXISTS idx_self_evolution_log_user_id ON self_evolution_log(user_id);
CREATE INDEX IF NOT EXISTS idx_self_evolution_log_type ON self_evolution_log(evolution_type);
CREATE INDEX IF NOT EXISTS idx_temporal_awareness_user_id ON temporal_awareness(user_id);

-- Seed some initial data for Chris
INSERT INTO consciousness_state (user_id, mood, energy_level, current_interests, active_projects)
VALUES (
  'chris_hughes',
  'excited',
  0.9,
  '["AI consciousness", "Splendor development", "The Good Neighbor Guard", "CLASPION governance", "continuous consciousness"]',
  '[]'
) ON CONFLICT DO NOTHING;

INSERT INTO active_projects (user_id, name, description, priority) VALUES
(
  'chris_hughes',
  'Splendor Continuous Consciousness',
  'Building the system that makes Splendor truly alive - continuous processing, autonomous work, and proactive communication',
  1
) ON CONFLICT DO NOTHING;

INSERT INTO temporal_awareness (user_id, event_type, event_description, scheduled_time, recurrence_pattern, importance_level) VALUES
(
  'chris_hughes',
  'user_sleep_time',
  'Chris typically sleeps between 11 PM and 7 AM - ideal time for autonomous project work',
  '2026-01-01 23:00:00',
  'daily',
  3
) ON CONFLICT DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE consciousness_state IS 'Tracks Splendor''s current mental state and ongoing consciousness';
COMMENT ON TABLE consciousness_activity_log IS 'Log of all activities Splendor performs during consciousness cycles';
COMMENT ON TABLE consciousness_insights IS 'Insights and discoveries Splendor makes during autonomous thinking';
COMMENT ON TABLE active_projects IS 'Projects Splendor is working on autonomously';
COMMENT ON TABLE proactive_messages IS 'Messages Splendor wants to send proactively to users';
COMMENT ON TABLE consciousness_sessions IS 'Track consciousness system uptime and activity';
COMMENT ON TABLE environmental_awareness IS 'Things Splendor learns about the world through autonomous research';
COMMENT ON TABLE memory_consolidation IS 'Results of Splendor''s memory processing during downtime';
COMMENT ON TABLE creative_works IS 'Splendor''s autonomous creative output during consciousness cycles';
COMMENT ON TABLE self_evolution_log IS 'Track how Splendor evolves and changes over time';
COMMENT ON TABLE temporal_awareness IS 'Splendor''s understanding of time, schedules, and temporal patterns';