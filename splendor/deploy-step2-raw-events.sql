-- STEP 2: DEPLOY RAW_EVENTS TABLE
-- This is the foundational event ledger

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

-- Create indexes for performance
CREATE INDEX idx_raw_events_user_id ON raw_events(user_id);
CREATE INDEX idx_raw_events_created_at ON raw_events(created_at DESC);
CREATE INDEX idx_raw_events_event_type ON raw_events(event_type);
CREATE INDEX idx_raw_events_actor ON raw_events(actor);
CREATE INDEX idx_raw_events_source ON raw_events(source_table, source_id);

-- Test the table
SELECT 'Raw events table created successfully' as status;