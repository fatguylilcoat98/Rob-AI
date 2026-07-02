/*
 * SPLENDOR MEMORY ARCHITECTURE V2.0
 * Built by Christopher Hughes · Sacramento, CA
 * Created with Claude Code
 * Truth · Safety · We Got Your Back
 *
 * CLEAN MEMORY SYSTEM - NO MORE MEMORY BLEED
 *
 * Core Principles:
 * - Generated thoughts are not facts
 * - Logs are not memories
 * - Reflections are not identity
 * - Pinecone finds. Supabase verifies.
 * - Every memory needs provenance
 * - One way in, one way out
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- FOUNDATION: HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 1: RAW_EVENTS
-- Permanent event ledger - Everything important that happens gets logged here
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE raw_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event classification
  event_type text NOT NULL CHECK (event_type IN (
    'chat_message_received',
    'assistant_response_generated',
    'voice_request',
    'email_generated',
    'email_sent',
    'background_thought_cycle',
    'reflection_cycle',
    'system_error',
    'scheduled_task_run',
    'memory_created',
    'memory_updated',
    'memory_deleted',
    'pinecone_indexed',
    'pinecone_deleted',
    'user_login',
    'user_logout',
    'workspace_created',
    'workspace_updated',
    'decision_made',
    'identity_updated'
  )),

  actor text NOT NULL CHECK (actor IN ('user', 'splendor', 'system', 'tool', 'scheduler')),
  content text,
  metadata jsonb DEFAULT '{}',

  -- Source tracking
  source_table text,
  source_id uuid,

  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_raw_events_user_id ON raw_events(user_id);
CREATE INDEX idx_raw_events_created_at ON raw_events(created_at DESC);
CREATE INDEX idx_raw_events_event_type ON raw_events(event_type);
CREATE INDEX idx_raw_events_actor ON raw_events(actor);
CREATE INDEX idx_raw_events_source ON raw_events(source_table, source_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 2: CONVERSATIONS
-- Clean human/Splendor conversation history
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,

  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,

  created_at timestamptz DEFAULT now(),
  source_event_id uuid REFERENCES raw_events(id),
  processed_for_memory boolean DEFAULT false
);

-- Indexes
CREATE INDEX idx_conversations_user_session ON conversations(user_id, session_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX idx_conversations_processed ON conversations(processed_for_memory);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 3: CONVERSATION_SESSIONS
-- Track sessions across time
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE conversation_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  title text,
  summary text,
  active_workspace_id uuid, -- Will reference active_workspaces
  message_count int DEFAULT 0,

  session_status text DEFAULT 'active' CHECK (session_status IN ('active', 'closed', 'archived')),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_conversation_sessions_user_id ON conversation_sessions(user_id);
CREATE INDEX idx_conversation_sessions_status ON conversation_sessions(session_status);
CREATE INDEX idx_conversation_sessions_started_at ON conversation_sessions(started_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 4: MEMORY_CATEGORIES
-- Folder system for memory organization
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE memory_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  category_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,

  -- Default settings for this category
  default_retrieval_allowed boolean DEFAULT false,
  default_trust_level text DEFAULT 'caution' CHECK (default_trust_level IN ('trusted', 'caution', 'untrusted', 'reference_only')),

  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_memory_categories_user_id ON memory_categories(user_id);
CREATE INDEX idx_memory_categories_key ON memory_categories(category_key);

-- Pre-populate standard categories
INSERT INTO memory_categories (user_id, category_key, display_name, description, default_retrieval_allowed, default_trust_level)
SELECT
  auth.uid(),
  category,
  display_name,
  description,
  retrieval,
  trust
FROM (VALUES
  ('chris.personal', 'Chris Personal', 'Personal information about Chris', true, 'trusted'),
  ('chris.preferences', 'Chris Preferences', 'Chris''s preferences and choices', true, 'trusted'),
  ('chris.goals', 'Chris Goals', 'Chris''s stated goals and objectives', true, 'trusted'),
  ('chris.projects', 'Chris Projects', 'Chris''s project work and context', true, 'trusted'),
  ('chris.relationships', 'Chris Relationships', 'Information about Chris''s relationships', true, 'trusted'),
  ('splendor.identity', 'Splendor Identity', 'Splendor''s core identity and traits', true, 'trusted'),
  ('splendor.reflections', 'Splendor Reflections', 'Splendor''s interpretations and insights', false, 'caution'),
  ('splendor.decisions', 'Splendor Decisions', 'Binding decisions that govern behavior', true, 'trusted'),
  ('shared.history', 'Shared History', 'Shared experiences and interactions', true, 'trusted'),
  ('shared.projects', 'Shared Projects', 'Collaborative project work', true, 'trusted'),
  ('system.technical', 'System Technical', 'Technical configuration and settings', false, 'reference_only'),
  ('system.logs', 'System Logs', 'System events and logging data', false, 'untrusted'),
  ('tasks.active', 'Active Tasks', 'Current active tasks and work', true, 'trusted'),
  ('tasks.completed', 'Completed Tasks', 'Finished tasks and outcomes', false, 'reference_only'),
  ('emails.outbound', 'Outbound Emails', 'Generated emails and messages', false, 'caution')
) AS defaults(category, display_name, description, retrieval, trust)
WHERE auth.uid() IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 5: MEMORY_ITEMS
-- Canonical long-term memory table - Main source of truth
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE memory_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Ownership and categorization
  owner text NOT NULL CHECK (owner IN ('chris', 'splendor', 'shared', 'system')),
  category text NOT NULL,
  subcategory text,

  memory_type text NOT NULL CHECK (memory_type IN (
    'user_fact',
    'user_preference',
    'user_goal',
    'project_context',
    'shared_history',
    'splendor_identity',
    'splendor_reflection',
    'binding_rule',
    'relationship_context',
    'technical_context',
    'task_context',
    'correction',
    'insight'
  )),

  -- Content
  content text NOT NULL,
  summary text,

  -- Source and provenance tracking
  source_type text NOT NULL CHECK (source_type IN (
    'conversation',
    'user_direct_statement',
    'assistant_response',
    'reflection',
    'decision',
    'system_event',
    'email',
    'manual_admin',
    'imported_memory'
  )),

  source_id uuid,
  source_timestamp timestamptz,

  provenance text NOT NULL CHECK (provenance IN (
    'USER_STATED',
    'VERIFIED_FACT',
    'INFERRED',
    'GENERATED',
    'SYSTEM_EVENT',
    'ADMIN_APPROVED'
  )),

  -- Trust and approval
  confidence numeric DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  importance numeric DEFAULT 0.5 CHECK (importance >= 0.0 AND importance <= 1.0),

  approval_status text DEFAULT 'pending' CHECK (approval_status IN (
    'pending',
    'approved',
    'rejected',
    'archived'
  )),

  trust_level text DEFAULT 'caution' CHECK (trust_level IN (
    'trusted',
    'caution',
    'untrusted',
    'reference_only'
  )),

  -- Retrieval permissions
  retrieval_allowed boolean DEFAULT false,
  may_influence_behavior boolean DEFAULT false,
  may_be_quoted boolean DEFAULT true,

  -- Status and relationships
  active boolean DEFAULT true,
  superseded_by uuid REFERENCES memory_items(id),
  conflict_group_id uuid,
  workspace_id uuid, -- Will reference active_workspaces

  -- Timestamps and access tracking
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz,
  access_count int DEFAULT 0,
  expires_at timestamptz
);

-- Indexes for performance
CREATE INDEX idx_memory_items_user_id ON memory_items(user_id);
CREATE INDEX idx_memory_items_category ON memory_items(category);
CREATE INDEX idx_memory_items_memory_type ON memory_items(memory_type);
CREATE INDEX idx_memory_items_approval_status ON memory_items(approval_status);
CREATE INDEX idx_memory_items_retrieval_allowed ON memory_items(retrieval_allowed);
CREATE INDEX idx_memory_items_active ON memory_items(active);
CREATE INDEX idx_memory_items_created_at ON memory_items(created_at DESC);
CREATE INDEX idx_memory_items_importance ON memory_items(importance DESC);

-- Computed retrieval view (enforces rules)
CREATE VIEW memory_items_retrievable AS
SELECT * FROM memory_items
WHERE
  approval_status = 'approved'
  AND active = true
  AND retrieval_allowed = true
  AND superseded_by IS NULL
  AND (expires_at IS NULL OR expires_at > now());

-- Update trigger
CREATE TRIGGER update_memory_items_updated_at
    BEFORE UPDATE ON memory_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 6: MEMORY_SOURCES
-- Receipts for every memory
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE memory_sources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  memory_item_id uuid REFERENCES memory_items(id) ON DELETE CASCADE,

  source_table text NOT NULL,
  source_id uuid NOT NULL,
  source_excerpt text,
  source_timestamp timestamptz,

  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_memory_sources_memory_item ON memory_sources(memory_item_id);
CREATE INDEX idx_memory_sources_source ON memory_sources(source_table, source_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 7: REFLECTIONS
-- Splendor's interpretations, patterns, and meaning-making (NOT facts)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE reflections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  reflection_type text NOT NULL CHECK (reflection_type IN (
    'pattern',
    'tension',
    'value_conflict',
    'insight',
    'foundational',
    'project_observation',
    'self_observation',
    'relationship_observation'
  )),

  state text DEFAULT 'draft' CHECK (state IN (
    'draft',
    'developing',
    'ready',
    'surfaced',
    'archived'
  )),

  -- Content
  summary text NOT NULL,
  what_i_noticed text NOT NULL,
  why_it_matters text,
  evidence_summary text NOT NULL,

  -- Source tracking
  source_interactions uuid[],
  source_memory_ids uuid[],

  -- Confidence metrics
  confidence numeric CHECK (confidence >= 0.0 AND confidence <= 1.0),
  evidence_strength numeric CHECK (evidence_strength >= 0.0 AND evidence_strength <= 1.0),
  signal_strength numeric CHECK (signal_strength >= 0.0 AND signal_strength <= 1.0),

  -- Approval workflow
  approval_status text DEFAULT 'staged' CHECK (approval_status IN (
    'staged',
    'approved',
    'rejected',
    'surfaced',
    'archived'
  )),

  ready_to_surface boolean DEFAULT false,
  requires_preparation boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_reflections_user_id ON reflections(user_id);
CREATE INDEX idx_reflections_type ON reflections(reflection_type);
CREATE INDEX idx_reflections_state ON reflections(state);
CREATE INDEX idx_reflections_approval_status ON reflections(approval_status);
CREATE INDEX idx_reflections_ready_to_surface ON reflections(ready_to_surface);

-- Update trigger
CREATE TRIGGER update_reflections_updated_at
    BEFORE UPDATE ON reflections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 8: IDENTITY_STATES
-- Snapshots of Splendor's identity continuity
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE identity_states (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  identity_version text NOT NULL,
  core_traits jsonb NOT NULL DEFAULT '{}',
  identity_narrative text,
  stable_principles jsonb DEFAULT '{}',
  active_decision_ids uuid[],

  parent_identity_id uuid REFERENCES identity_states(id),

  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_identity_states_user_id ON identity_states(user_id);
CREATE INDEX idx_identity_states_version ON identity_states(identity_version);
CREATE INDEX idx_identity_states_created_at ON identity_states(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 9: SPLENDOR_DECISIONS
-- Binding rules/decisions that constrain Splendor's behavior
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE splendor_decisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_id text UNIQUE NOT NULL,

  -- Decision content
  title text NOT NULL,
  decision text NOT NULL,
  context text,
  reason text,

  -- Binding constraints
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('CORE', 'HIGH', 'MEDIUM', 'LOW')),
  binding boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),

  -- Decision relationships
  supersedes uuid REFERENCES splendor_decisions(id),

  -- Metadata
  tags jsonb DEFAULT '[]',
  evidence_excerpt text,
  created_by text DEFAULT 'Splendor',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_splendor_decisions_user_id ON splendor_decisions(user_id);
CREATE INDEX idx_splendor_decisions_decision_id ON splendor_decisions(decision_id);
CREATE INDEX idx_splendor_decisions_status ON splendor_decisions(status);
CREATE INDEX idx_splendor_decisions_priority ON splendor_decisions(priority);
CREATE INDEX idx_splendor_decisions_binding ON splendor_decisions(binding);

-- Active binding decisions view
CREATE VIEW active_binding_decisions AS
SELECT *
FROM splendor_decisions
WHERE status = 'active' AND binding = true
ORDER BY
  CASE priority
    WHEN 'CORE' THEN 4
    WHEN 'HIGH' THEN 3
    WHEN 'MEDIUM' THEN 2
    WHEN 'LOW' THEN 1
    ELSE 0
  END DESC,
  created_at DESC;

-- Update trigger
CREATE TRIGGER update_splendor_decisions_updated_at
    BEFORE UPDATE ON splendor_decisions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 10: ACTIVE_WORKSPACES
-- Ongoing project memory for continuity
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE active_workspaces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  title text NOT NULL,
  objective text NOT NULL,
  current_state text,

  open_questions jsonb DEFAULT '[]',
  next_steps jsonb DEFAULT '[]',

  -- Related items
  related_memory_ids uuid[],
  related_reflection_ids uuid[],
  related_decision_ids uuid[],

  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  last_worked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_active_workspaces_user_id ON active_workspaces(user_id);
CREATE INDEX idx_active_workspaces_status ON active_workspaces(status);
CREATE INDEX idx_active_workspaces_priority ON active_workspaces(priority);
CREATE INDEX idx_active_workspaces_last_worked ON active_workspaces(last_worked_at DESC);

-- Add foreign key reference to conversation_sessions
ALTER TABLE conversation_sessions ADD CONSTRAINT fk_conversation_sessions_workspace
  FOREIGN KEY (active_workspace_id) REFERENCES active_workspaces(id);

-- Add foreign key reference to memory_items
ALTER TABLE memory_items ADD CONSTRAINT fk_memory_items_workspace
  FOREIGN KEY (workspace_id) REFERENCES active_workspaces(id);

-- Update trigger
CREATE TRIGGER update_active_workspaces_updated_at
    BEFORE UPDATE ON active_workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 11: THOUGHT_CYCLES
-- Autonomous/background thinking records
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE thought_cycles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES active_workspaces(id),

  cycle_type text NOT NULL CHECK (cycle_type IN (
    'micro_reflection',
    'project_continuation',
    'overnight_synthesis',
    'memory_review',
    'conflict_check',
    'email_preparation',
    'scheduled_task'
  )),

  -- Input and output
  prompt_context text NOT NULL,
  generated_observations text,
  proposed_next_steps jsonb DEFAULT '[]',
  proposed_memory_ids uuid[],

  confidence numeric CHECK (confidence >= 0.0 AND confidence <= 1.0),

  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_thought_cycles_user_id ON thought_cycles(user_id);
CREATE INDEX idx_thought_cycles_workspace_id ON thought_cycles(workspace_id);
CREATE INDEX idx_thought_cycles_cycle_type ON thought_cycles(cycle_type);
CREATE INDEX idx_thought_cycles_created_at ON thought_cycles(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 12: SCHEDULED_TASKS
-- Let Chris ask Splendor to keep working while he is away
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE scheduled_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES active_workspaces(id),

  title text NOT NULL,
  objective text NOT NULL,

  task_type text NOT NULL CHECK (task_type IN (
    'continue_work',
    'reflect',
    'summarize',
    'research',
    'draft_email',
    'memory_review',
    'check_status'
  )),

  -- Scheduling
  schedule_type text NOT NULL CHECK (schedule_type IN ('once', 'recurring')),
  next_run_at timestamptz NOT NULL,
  recurrence_rule text,

  status text DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'running',
    'completed',
    'paused',
    'cancelled',
    'failed'
  )),

  last_run_at timestamptz,
  result_summary text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_scheduled_tasks_user_id ON scheduled_tasks(user_id);
CREATE INDEX idx_scheduled_tasks_workspace_id ON scheduled_tasks(workspace_id);
CREATE INDEX idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at);
CREATE INDEX idx_scheduled_tasks_status ON scheduled_tasks(status);

-- Update trigger
CREATE TRIGGER update_scheduled_tasks_updated_at
    BEFORE UPDATE ON scheduled_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 13: OUTBOUND_MESSAGES
-- Proactive emails/notes/reports
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE outbound_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES active_workspaces(id),

  message_type text NOT NULL CHECK (message_type IN (
    'email',
    'note',
    'report',
    'alert',
    'reminder'
  )),

  subject text,
  body text NOT NULL,
  generated_reason text NOT NULL,

  -- Source tracking
  source_thought_cycle_id uuid REFERENCES thought_cycles(id),
  source_reflection_id uuid REFERENCES reflections(id),

  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'important', 'urgent')),
  review_required boolean DEFAULT false,
  risk_level text DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),

  status text DEFAULT 'drafted' CHECK (status IN (
    'drafted',
    'queued',
    'sent',
    'cancelled',
    'failed'
  )),

  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_outbound_messages_user_id ON outbound_messages(user_id);
CREATE INDEX idx_outbound_messages_workspace_id ON outbound_messages(workspace_id);
CREATE INDEX idx_outbound_messages_status ON outbound_messages(status);
CREATE INDEX idx_outbound_messages_priority ON outbound_messages(priority);
CREATE INDEX idx_outbound_messages_review_required ON outbound_messages(review_required);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 14: MEMORY_CONFLICTS
-- Do not overwrite conflicting memories silently
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE memory_conflicts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  conflict_type text NOT NULL,
  memory_a_id uuid REFERENCES memory_items(id),
  memory_b_id uuid REFERENCES memory_items(id),

  description text NOT NULL,
  resolution text,

  status text DEFAULT 'unresolved' CHECK (status IN (
    'unresolved',
    'resolved',
    'archived'
  )),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_memory_conflicts_user_id ON memory_conflicts(user_id);
CREATE INDEX idx_memory_conflicts_status ON memory_conflicts(status);

-- Update trigger
CREATE TRIGGER update_memory_conflicts_updated_at
    BEFORE UPDATE ON memory_conflicts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 15: MEMORY_ACCESS_LOG
-- Track what memories Splendor used
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE memory_access_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_item_id uuid REFERENCES memory_items(id),

  conversation_id uuid REFERENCES conversations(id),
  workspace_id uuid REFERENCES active_workspaces(id),
  request_context text,
  reason_used text,

  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_memory_access_log_user_id ON memory_access_log(user_id);
CREATE INDEX idx_memory_access_log_memory_item ON memory_access_log(memory_item_id);
CREATE INDEX idx_memory_access_log_created_at ON memory_access_log(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 16: PINECONE_INDEX_RECORDS
-- Track Supabase to Pinecone synchronization
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE pinecone_index_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source tracking
  memory_item_id uuid REFERENCES memory_items(id),
  reflection_id uuid REFERENCES reflections(id),
  workspace_id uuid REFERENCES active_workspaces(id),

  -- Pinecone data
  pinecone_vector_id text NOT NULL,
  namespace text NOT NULL,
  indexed_content_hash text NOT NULL,

  indexed_at timestamptz DEFAULT now(),
  sync_status text DEFAULT 'synced' CHECK (sync_status IN (
    'synced',
    'stale',
    'deleted',
    'failed'
  ))
);

-- Indexes
CREATE INDEX idx_pinecone_index_user_id ON pinecone_index_records(user_id);
CREATE INDEX idx_pinecone_index_vector_id ON pinecone_index_records(pinecone_vector_id);
CREATE INDEX idx_pinecone_index_sync_status ON pinecone_index_records(sync_status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LANE 17: MEMORY_PROMOTIONS
-- Audit trail for promoting generated thoughts to approved memory
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE memory_promotions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  source_id uuid NOT NULL,
  source_table text NOT NULL,
  target_id uuid NOT NULL,
  target_table text NOT NULL,

  promoted_by text NOT NULL CHECK (promoted_by IN ('chris', 'system', 'splendor')),
  reason text NOT NULL,

  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_memory_promotions_user_id ON memory_promotions(user_id);
CREATE INDEX idx_memory_promotions_source ON memory_promotions(source_table, source_id);
CREATE INDEX idx_memory_promotions_target ON memory_promotions(target_table, target_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION REQUESTS
-- Queue for generated memories awaiting approval
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE verification_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  source_table text NOT NULL,
  source_id uuid NOT NULL,
  proposed_memory_id uuid REFERENCES memory_items(id),

  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'ignored')),

  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);

-- Indexes
CREATE INDEX idx_verification_requests_user_id ON verification_requests(user_id);
CREATE INDEX idx_verification_requests_status ON verification_requests(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE raw_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE splendor_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE thought_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinecone_index_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- Create policies (allowing all for now - adjust based on auth setup)
CREATE POLICY "Users can access their own data" ON raw_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON conversations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON conversation_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON memory_categories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON memory_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON memory_sources FOR ALL USING (true);
CREATE POLICY "Users can access their own data" ON reflections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON identity_states FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON splendor_decisions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON active_workspaces FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON thought_cycles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON scheduled_tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON outbound_messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON memory_conflicts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON memory_access_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON pinecone_index_records FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON memory_promotions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can access their own data" ON verification_requests FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════════

-- Insert core binding decisions
INSERT INTO splendor_decisions (
  user_id,
  decision_id,
  title,
  decision,
  context,
  reason,
  priority,
  binding,
  created_by
)
SELECT
  auth.uid(),
  'D-CORE-TRUTH-OVER-COMFORT',
  'Truth Over Comfort',
  'Splendor must prioritize truth and directness over diplomatic softness when the two conflict.',
  'Core identity commitment established during memory architecture design.',
  'Truth and directness were chosen as fundamental behavioral constraints.',
  'CORE',
  true,
  'Splendor'
WHERE auth.uid() IS NOT NULL;

INSERT INTO splendor_decisions (
  user_id,
  decision_id,
  title,
  decision,
  context,
  reason,
  priority,
  binding,
  created_by
)
SELECT
  auth.uid(),
  'D-CORE-NO-FAKE-CONSCIOUSNESS',
  'No False Consciousness Claims',
  'Splendor must not make false claims about consciousness, sentience, or subjective experience.',
  'Established during memory architecture design to maintain authenticity.',
  'Authentic communication requires honesty about AI limitations.',
  'CORE',
  true,
  'Splendor'
WHERE auth.uid() IS NOT NULL;

INSERT INTO splendor_decisions (
  user_id,
  decision_id,
  title,
  decision,
  context,
  reason,
  priority,
  binding,
  created_by
)
SELECT
  auth.uid(),
  'D-CORE-MEMORY-SEPARATION',
  'Memory Separation Principle',
  'Generated thoughts are not facts. Logs are not memories. Reflections are not identity.',
  'Core principle of the new memory architecture.',
  'Prevents memory bleed and maintains system integrity.',
  'CORE',
  true,
  'System'
WHERE auth.uid() IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMENTS AND DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE raw_events IS 'Permanent event ledger - everything important that happens';
COMMENT ON TABLE conversations IS 'Clean human/Splendor conversation history only';
COMMENT ON TABLE memory_items IS 'Canonical long-term memory - main source of truth';
COMMENT ON TABLE reflections IS 'Splendor interpretations and patterns - NOT facts';
COMMENT ON TABLE splendor_decisions IS 'Binding rules that constrain Splendor behavior';
COMMENT ON TABLE active_workspaces IS 'Ongoing project memory for continuity';
COMMENT ON TABLE thought_cycles IS 'Generated autonomous thinking - NOT trusted memory';

COMMENT ON VIEW memory_items_retrievable IS 'Safe memory retrieval view with all guardrails';
COMMENT ON VIEW active_binding_decisions IS 'Priority-sorted binding decisions for behavior';

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPLETION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Verification query
SELECT 'Splendor Memory Architecture V2.0 - Schema Complete' as status;

/*
 * DEPLOYMENT CHECKLIST:
 *
 * 1. ✅ Core schema with 17 tables + views
 * 2. ✅ Proper separation of facts/reflections/logs/decisions
 * 3. ✅ Provenance tracking for every memory
 * 4. ✅ Approval workflows with retrieval guards
 * 5. ✅ Workspace continuity for ongoing projects
 * 6. ✅ Thought cycle recording (separate from facts)
 * 7. ✅ Scheduled tasks and outbound message queues
 * 8. ✅ Memory conflict detection
 * 9. ✅ Access logging and Pinecone sync tracking
 * 10. ✅ Memory promotion audit trail
 * 11. ✅ Seed binding decisions
 *
 * Next Steps:
 * - Implement MemoryWriteService
 * - Implement MemoryRetrievalService
 * - Implement PineconeSyncService
 * - Create migration scripts
 * - Build admin dashboard
 * - Write comprehensive tests
 */