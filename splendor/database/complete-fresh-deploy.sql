/*
 * SPLENDOR MEMORY ARCHITECTURE V2.0 - COMPLETE FRESH DEPLOYMENT
 * Built by Christopher Hughes · Sacramento, CA
 * Created with Claude Code
 * Truth · Safety · We Got Your Back
 *
 * SINGLE FILE DEPLOYMENT - RUN ALL AT ONCE
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- FOUNDATION: HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 1: RAW_EVENTS - Event Ledger
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE raw_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  event_type text NOT NULL,
  actor text NOT NULL CHECK (actor IN ('user', 'splendor', 'system', 'tool', 'scheduler')),
  content text,
  metadata jsonb DEFAULT '{}',
  source_table text,
  source_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_raw_events_user_id ON raw_events(user_id);
CREATE INDEX idx_raw_events_created_at ON raw_events(created_at DESC);
CREATE INDEX idx_raw_events_event_type ON raw_events(event_type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 2: MEMORY_CATEGORIES - Folder System
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE memory_categories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  category_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  default_retrieval_allowed boolean DEFAULT false,
  default_trust_level text DEFAULT 'caution' CHECK (default_trust_level IN ('trusted', 'caution', 'untrusted', 'reference_only')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_memory_categories_key ON memory_categories(category_key);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 3: MEMORY_ITEMS - Main Memory Store
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE memory_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  owner text NOT NULL CHECK (owner IN ('chris', 'splendor', 'shared', 'system')),
  category text NOT NULL,
  subcategory text,
  memory_type text NOT NULL CHECK (memory_type IN (
    'user_fact', 'user_preference', 'user_goal', 'project_context',
    'shared_history', 'splendor_identity', 'splendor_reflection',
    'binding_rule', 'relationship_context', 'technical_context',
    'task_context', 'correction', 'insight'
  )),
  content text NOT NULL,
  summary text,
  source_type text NOT NULL CHECK (source_type IN (
    'conversation', 'user_direct_statement', 'assistant_response',
    'reflection', 'decision', 'system_event', 'email', 'manual_admin', 'imported_memory'
  )),
  source_id uuid,
  source_timestamp timestamptz,
  provenance text NOT NULL CHECK (provenance IN (
    'USER_STATED', 'VERIFIED_FACT', 'INFERRED', 'GENERATED', 'SYSTEM_EVENT', 'ADMIN_APPROVED'
  )),
  confidence numeric DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  importance numeric DEFAULT 0.5 CHECK (importance >= 0.0 AND importance <= 1.0),
  approval_status text DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'archived')),
  trust_level text DEFAULT 'caution' CHECK (trust_level IN ('trusted', 'caution', 'untrusted', 'reference_only')),
  retrieval_allowed boolean DEFAULT false,
  may_influence_behavior boolean DEFAULT false,
  may_be_quoted boolean DEFAULT true,
  active boolean DEFAULT true,
  superseded_by uuid REFERENCES memory_items(id),
  conflict_group_id uuid,
  workspace_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz,
  access_count int DEFAULT 0,
  expires_at timestamptz
);

CREATE INDEX idx_memory_items_user_id ON memory_items(user_id);
CREATE INDEX idx_memory_items_category ON memory_items(category);
CREATE INDEX idx_memory_items_approval_status ON memory_items(approval_status);
CREATE INDEX idx_memory_items_active ON memory_items(active);

CREATE TRIGGER update_memory_items_updated_at
    BEFORE UPDATE ON memory_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 4: CONVERSATIONS - Clean Chat History
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  session_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  source_event_id uuid REFERENCES raw_events(id),
  processed_for_memory boolean DEFAULT false
);

CREATE INDEX idx_conversations_user_session ON conversations(user_id, session_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 5: CONVERSATION_SESSIONS - Session Tracking
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE conversation_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  title text,
  summary text,
  active_workspace_id uuid,
  message_count int DEFAULT 0,
  session_status text DEFAULT 'active' CHECK (session_status IN ('active', 'closed', 'archived')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_conversation_sessions_user_id ON conversation_sessions(user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 6: ACTIVE_WORKSPACES - Project Continuity
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE active_workspaces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  title text NOT NULL,
  objective text NOT NULL,
  current_state text,
  open_questions jsonb DEFAULT '[]',
  next_steps jsonb DEFAULT '[]',
  related_memory_ids uuid[],
  related_reflection_ids uuid[],
  related_decision_ids uuid[],
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  last_worked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_active_workspaces_user_id ON active_workspaces(user_id);
CREATE INDEX idx_active_workspaces_status ON active_workspaces(status);

CREATE TRIGGER update_active_workspaces_updated_at
    BEFORE UPDATE ON active_workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 7: SPLENDOR_DECISIONS - Binding Rules
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE splendor_decisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  decision_id text UNIQUE NOT NULL,
  title text NOT NULL,
  decision text NOT NULL,
  context text,
  reason text,
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('CORE', 'HIGH', 'MEDIUM', 'LOW')),
  binding boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),
  supersedes uuid REFERENCES splendor_decisions(id),
  tags jsonb DEFAULT '[]',
  evidence_excerpt text,
  created_by text DEFAULT 'Splendor',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_splendor_decisions_user_id ON splendor_decisions(user_id);
CREATE INDEX idx_splendor_decisions_status ON splendor_decisions(status);
CREATE INDEX idx_splendor_decisions_binding ON splendor_decisions(binding);

CREATE TRIGGER update_splendor_decisions_updated_at
    BEFORE UPDATE ON splendor_decisions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 8: REFLECTIONS - Splendor's Interpretations
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE reflections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  reflection_type text NOT NULL CHECK (reflection_type IN (
    'pattern', 'tension', 'value_conflict', 'insight', 'foundational',
    'project_observation', 'self_observation', 'relationship_observation'
  )),
  state text DEFAULT 'draft' CHECK (state IN ('draft', 'developing', 'ready', 'surfaced', 'archived')),
  summary text NOT NULL,
  what_i_noticed text NOT NULL,
  why_it_matters text,
  evidence_summary text NOT NULL,
  source_interactions uuid[],
  source_memory_ids uuid[],
  confidence numeric CHECK (confidence >= 0.0 AND confidence <= 1.0),
  evidence_strength numeric CHECK (evidence_strength >= 0.0 AND evidence_strength <= 1.0),
  signal_strength numeric CHECK (signal_strength >= 0.0 AND signal_strength <= 1.0),
  approval_status text DEFAULT 'staged' CHECK (approval_status IN ('staged', 'approved', 'rejected', 'surfaced', 'archived')),
  ready_to_surface boolean DEFAULT false,
  requires_preparation boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_reflections_user_id ON reflections(user_id);
CREATE INDEX idx_reflections_approval_status ON reflections(approval_status);

CREATE TRIGGER update_reflections_updated_at
    BEFORE UPDATE ON reflections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 9: MEMORY_SOURCES - Memory Receipts
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

CREATE INDEX idx_memory_sources_memory_item ON memory_sources(memory_item_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 10: MEMORY_CONFLICTS - Conflict Detection
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE memory_conflicts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  conflict_type text NOT NULL,
  memory_a_id uuid REFERENCES memory_items(id),
  memory_b_id uuid REFERENCES memory_items(id),
  description text NOT NULL,
  resolution text,
  status text DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved', 'archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_memory_conflicts_user_id ON memory_conflicts(user_id);
CREATE INDEX idx_memory_conflicts_status ON memory_conflicts(status);

CREATE TRIGGER update_memory_conflicts_updated_at
    BEFORE UPDATE ON memory_conflicts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 11: MEMORY_ACCESS_LOG - Access Tracking
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE memory_access_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  memory_item_id uuid REFERENCES memory_items(id),
  conversation_id uuid REFERENCES conversations(id),
  workspace_id uuid REFERENCES active_workspaces(id),
  request_context text,
  reason_used text,
  retrieval_confidence_label text CHECK (retrieval_confidence_label IN (
    'grounded', 'weakly_grounded', 'inferred', 'conflicting', 'stale', 'unverifiable'
  )),
  uncertainty_reason text,
  uncertainty_flagged boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_memory_access_log_user_id ON memory_access_log(user_id);
CREATE INDEX idx_memory_access_log_memory_item ON memory_access_log(memory_item_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- REMAINING SUPPORT TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE identity_states (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  identity_version text NOT NULL,
  core_traits jsonb NOT NULL DEFAULT '{}',
  identity_narrative text,
  stable_principles jsonb DEFAULT '{}',
  active_decision_ids uuid[],
  parent_identity_id uuid REFERENCES identity_states(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE thought_cycles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  workspace_id uuid REFERENCES active_workspaces(id),
  cycle_type text NOT NULL,
  prompt_context text NOT NULL,
  generated_observations text,
  proposed_next_steps jsonb DEFAULT '[]',
  proposed_memory_ids uuid[],
  confidence numeric CHECK (confidence >= 0.0 AND confidence <= 1.0),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE scheduled_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  workspace_id uuid REFERENCES active_workspaces(id),
  title text NOT NULL,
  objective text NOT NULL,
  task_type text NOT NULL,
  schedule_type text NOT NULL CHECK (schedule_type IN ('once', 'recurring')),
  next_run_at timestamptz NOT NULL,
  recurrence_rule text,
  status text DEFAULT 'scheduled',
  last_run_at timestamptz,
  result_summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE outbound_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  workspace_id uuid REFERENCES active_workspaces(id),
  message_type text NOT NULL,
  subject text,
  body text NOT NULL,
  generated_reason text NOT NULL,
  source_thought_cycle_id uuid REFERENCES thought_cycles(id),
  source_reflection_id uuid REFERENCES reflections(id),
  priority text DEFAULT 'normal',
  review_required boolean DEFAULT false,
  risk_level text DEFAULT 'low',
  status text DEFAULT 'drafted',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE pinecone_index_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  memory_item_id uuid REFERENCES memory_items(id),
  reflection_id uuid REFERENCES reflections(id),
  workspace_id uuid REFERENCES active_workspaces(id),
  pinecone_vector_id text NOT NULL,
  namespace text NOT NULL,
  indexed_content_hash text NOT NULL,
  indexed_at timestamptz DEFAULT now(),
  sync_status text DEFAULT 'synced'
);

CREATE TABLE memory_promotions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  source_id uuid NOT NULL,
  source_table text NOT NULL,
  target_id uuid NOT NULL,
  target_table text NOT NULL,
  promoted_by text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE verification_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  proposed_memory_id uuid REFERENCES memory_items(id),
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- UNCERTAINTY ASSESSMENT FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION assess_memory_uncertainty(
  memory_record jsonb,
  query_context jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb AS $$
DECLARE
  result jsonb := '{}';
  confidence_label text := 'grounded';
  uncertainty_reason text := null;
  should_flag boolean := false;
  created_days_ago integer;
  has_source boolean;
  source_strength numeric := 1.0;
BEGIN
  created_days_ago := EXTRACT(DAY FROM (now() - (memory_record->>'created_at')::timestamptz));
  has_source := (memory_record->>'source_timestamp') IS NOT NULL;

  IF NOT has_source OR (memory_record->>'source_type') = 'imported_memory' THEN
    confidence_label := 'unverifiable';
    uncertainty_reason := 'No clear source or citation available';
    should_flag := true;
    source_strength := 0.2;
  ELSIF (memory_record->>'provenance') = 'GENERATED' OR (memory_record->>'provenance') = 'INFERRED' THEN
    confidence_label := 'inferred';
    uncertainty_reason := 'Memory derived from interpretation or inference';
    should_flag := true;
    source_strength := 0.4;
  ELSIF (memory_record->>'confidence')::numeric < 0.6 THEN
    confidence_label := 'weakly_grounded';
    uncertainty_reason := 'Low confidence score from original extraction';
    should_flag := true;
    source_strength := 0.5;
  ELSIF created_days_ago > 180 THEN
    confidence_label := 'stale';
    uncertainty_reason := 'Memory is old and has not been recently validated';
    should_flag := true;
    source_strength := 0.6;
  ELSIF (memory_record->>'approval_status') != 'approved' THEN
    confidence_label := 'unverifiable';
    uncertainty_reason := 'Memory has not been approved for reliable use';
    should_flag := true;
    source_strength := 0.3;
  ELSE
    confidence_label := 'grounded';
    uncertainty_reason := null;
    should_flag := false;
    source_strength := LEAST((memory_record->>'confidence')::numeric * 1.2, 1.0);
  END IF;

  result := jsonb_build_object(
    'confidence_label', confidence_label,
    'uncertainty_reason', uncertainty_reason,
    'should_flag', should_flag,
    'source_strength', source_strength,
    'assessment_timestamp', now()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION generate_citation_string(
  memory_record jsonb,
  include_uncertainty boolean DEFAULT true
) RETURNS text AS $$
DECLARE
  citation text := '';
  source_date text := '';
  source_info text := '';
  uncertainty_assessment jsonb;
  base_citation text := '';
BEGIN
  uncertainty_assessment := assess_memory_uncertainty(memory_record);

  IF (memory_record->>'source_timestamp') IS NOT NULL THEN
    source_date := to_char((memory_record->>'source_timestamp')::timestamptz, 'Mon DD, YYYY');
  ELSE
    source_date := to_char((memory_record->>'created_at')::timestamptz, 'Mon DD, YYYY');
  END IF;

  CASE (memory_record->>'source_type')
    WHEN 'user_direct_statement' THEN
      source_info := 'you told me';
    WHEN 'conversation' THEN
      source_info := 'our conversation';
    WHEN 'assistant_response' THEN
      source_info := 'I previously noted';
    WHEN 'reflection' THEN
      source_info := 'I reflected';
    WHEN 'decision' THEN
      source_info := 'we decided';
    ELSE
      source_info := 'I have a record';
  END CASE;

  base_citation := format('I remember this because %s on %s', source_info, source_date);

  IF include_uncertainty AND (uncertainty_assessment->>'should_flag')::boolean THEN
    CASE (uncertainty_assessment->>'confidence_label')::text
      WHEN 'weakly_grounded' THEN
        citation := 'I may be reaching here, but ' || lower(base_citation);
      WHEN 'inferred' THEN
        citation := 'This is my interpretation - ' || lower(base_citation);
      WHEN 'conflicting' THEN
        citation := 'I have conflicting information, but ' || lower(base_citation);
      WHEN 'stale' THEN
        citation := 'This memory is older and unvalidated, but ' || lower(base_citation);
      WHEN 'unverifiable' THEN
        citation := 'I don''t have a strong source for this, but ' || lower(base_citation);
      ELSE
        citation := base_citation;
    END CASE;
  ELSE
    citation := base_citation;
  END IF;

  RETURN citation || '.';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE VIEW memory_items_retrievable AS
SELECT * FROM memory_items
WHERE
  approval_status = 'approved'
  AND active = true
  AND retrieval_allowed = true
  AND superseded_by IS NULL
  AND (expires_at IS NULL OR expires_at > now());

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

CREATE VIEW memory_items_with_uncertainty AS
SELECT
  m.*,
  assess_memory_uncertainty(
    jsonb_build_object(
      'id', m.id,
      'content', m.content,
      'created_at', m.created_at,
      'source_timestamp', m.source_timestamp,
      'source_type', m.source_type,
      'provenance', m.provenance,
      'confidence', m.confidence,
      'approval_status', m.approval_status,
      'trust_level', m.trust_level,
      'memory_type', m.memory_type,
      'last_accessed_at', m.last_accessed_at
    )
  ) as uncertainty_assessment,
  generate_citation_string(
    jsonb_build_object(
      'source_type', m.source_type,
      'source_timestamp', m.source_timestamp,
      'created_at', m.created_at,
      'workspace_id', m.workspace_id
    ),
    true
  ) as citation_string
FROM memory_items m
WHERE
  m.approval_status = 'approved'
  AND m.active = true
  AND m.retrieval_allowed = true
  AND m.superseded_by IS NULL
  AND (m.expires_at IS NULL OR m.expires_at > now());

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO memory_categories (category_key, display_name, description, default_retrieval_allowed, default_trust_level)
VALUES
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
  ('emails.outbound', 'Outbound Emails', 'Generated emails and messages', false, 'caution');

INSERT INTO splendor_decisions (decision_id, title, decision, context, reason, priority, binding, created_by)
VALUES
  ('D-CORE-TRUTH-OVER-COMFORT', 'Truth Over Comfort', 'Splendor must prioritize truth and directness over diplomatic softness when the two conflict.', 'Core identity commitment established during memory architecture design.', 'Truth and directness were chosen as fundamental behavioral constraints.', 'CORE', true, 'Splendor'),
  ('D-CORE-NO-FAKE-CONSCIOUSNESS', 'No False Consciousness Claims', 'Splendor must not make false claims about consciousness, sentience, or subjective experience.', 'Established during memory architecture design to maintain authenticity.', 'Authentic communication requires honesty about AI limitations.', 'CORE', true, 'Splendor'),
  ('D-CORE-MEMORY-SEPARATION', 'Memory Separation Principle', 'Generated thoughts are not facts. Logs are not memories. Reflections are not identity.', 'Core principle of the new memory architecture.', 'Prevents memory bleed and maintains system integrity.', 'CORE', true, 'System');

-- ═══════════════════════════════════════════════════════════════════════════════
-- FINAL VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT 'SPLENDOR MEMORY ARCHITECTURE V2.0 DEPLOYMENT COMPLETE!' as status,
       'Ready for service integration' as next_step,
       now() as deployed_at;