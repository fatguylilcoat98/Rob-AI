/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Governance Foundation Database Schema

  Phase 1: Audit Logs and Source Tracking
  Built by Christopher Hughes with Claude Code
  Truth · Safety · We Got Your Back
*/

-- =====================================================
-- MEMORY AUDIT LOG
-- Every memory write creates an audit record
-- This lets Christopher inspect exactly why Splendor believes something
-- =====================================================

CREATE TABLE IF NOT EXISTS memory_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    memory_id UUID NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    tier TEXT NOT NULL CHECK (tier IN ('1', '1.5', '2', '3', '4')),
    source_type TEXT NOT NULL CHECK (source_type IN ('christopher_stated', 'splendor_inferred', 'session_observed', 'system_generated')),
    created_by_model TEXT NOT NULL CHECK (created_by_model IN ('claude', 'gpt-4o', 'system', 'perplexity')),
    original_trigger TEXT NOT NULL, -- what conversation/event caused this write
    confidence TEXT NOT NULL CHECK (confidence IN ('verified', 'probable', 'uncertain')),
    promotion_reason TEXT, -- why it was promoted to a higher tier
    last_modified_by TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('created', 'promoted', 'compressed', 'expired', 'locked', 'restored')),

    -- Governance tracking
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by TEXT, -- 'christopher' | 'council' | 'auto'
    approved_at TIMESTAMPTZ,

    -- Debug info
    tokens_consumed INTEGER,
    api_call_duration_ms INTEGER,
    context_window_size INTEGER
);

-- Indexes for audit log performance
CREATE INDEX IF NOT EXISTS idx_audit_memory_id ON memory_audit_log(memory_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON memory_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tier_source ON memory_audit_log(tier, source_type);
CREATE INDEX IF NOT EXISTS idx_audit_approval ON memory_audit_log(requires_approval, approved_at);

-- =====================================================
-- JOB HEALTH LOG
-- Background jobs must write heartbeats
-- Silent failure is not acceptable
-- =====================================================

CREATE TABLE IF NOT EXISTS job_health_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_name TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'fail', 'partial', 'timeout')),
    duration_ms INTEGER,
    records_processed INTEGER,
    error_message TEXT,
    model_used TEXT,
    tokens_consumed INTEGER,

    -- Health tracking
    memory_lock_active BOOLEAN DEFAULT FALSE,
    next_run_due TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_job_health_name ON job_health_log(job_name, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_health_status ON job_health_log(status, completed_at DESC);

-- =====================================================
-- PROMOTION QUEUE
-- No memory enters Tier 1 or 1.5 without Christopher's approval
-- =====================================================

CREATE TABLE IF NOT EXISTS promotion_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    candidate_memory TEXT NOT NULL,
    suggested_tier TEXT NOT NULL CHECK (suggested_tier IN ('1', '1.5', '2')),
    reason TEXT NOT NULL, -- why the system thinks this should be promoted
    source_type TEXT NOT NULL,
    confidence TEXT NOT NULL,
    requires_christopher_approval BOOLEAN NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'modified')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    christopher_note TEXT, -- optional note when approving/rejecting

    -- Original context
    original_session_id TEXT,
    original_message TEXT,
    supporting_evidence TEXT
);

CREATE INDEX IF NOT EXISTS idx_promotion_status ON promotion_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotion_tier ON promotion_queue(suggested_tier, requires_christopher_approval);

-- =====================================================
-- FOUNDATIONAL RULES (Tier 1 and Tier 1.5)
-- Constitutional anchors that never decay
-- =====================================================

CREATE TABLE IF NOT EXISTS foundational_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rule_id TEXT UNIQUE NOT NULL, -- stable identifier
    tier TEXT NOT NULL CHECK (tier IN ('1', '1.5')),
    content TEXT NOT NULL,
    category TEXT NOT NULL, -- 'identity' | 'operational' | 'constitutional' | 'truth'
    established_by TEXT NOT NULL, -- 'christopher' | 'council'
    established_date DATE NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1000,
    never_decays BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_modified_at TIMESTAMPTZ DEFAULT NOW(),

    -- Audit trail
    modification_reason TEXT,
    modified_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_foundational_tier ON foundational_rules(tier, priority DESC);
CREATE INDEX IF NOT EXISTS idx_foundational_category ON foundational_rules(category, priority DESC);

-- =====================================================
-- MEMORY CONFLICTS
-- Contradiction is data, not an error to resolve
-- =====================================================

CREATE TABLE IF NOT EXISTS memory_conflicts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    memory_1_id UUID NOT NULL,
    memory_2_id UUID NOT NULL,
    conflict_type TEXT NOT NULL CHECK (conflict_type IN ('direct_contradiction', 'partial_conflict', 'temporal_shift', 'context_dependent')),
    similarity_score FLOAT NOT NULL, -- 0.0 to 1.0
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    detected_by TEXT NOT NULL, -- 'claude' | 'gpt-4o' | 'system'

    -- Resolution tracking
    resolution_status TEXT NOT NULL DEFAULT 'pending' CHECK (resolution_status IN ('pending', 'christopher_resolved', 'both_valid', 'superseded')),
    resolution_note TEXT,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,

    -- Impact assessment
    affects_tier_1 BOOLEAN DEFAULT FALSE,
    affects_identity BOOLEAN DEFAULT FALSE,
    requires_immediate_attention BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_conflicts_status ON memory_conflicts(resolution_status, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_conflicts_priority ON memory_conflicts(requires_immediate_attention, affects_tier_1);

-- =====================================================
-- REFLECTION ARCHIVE
-- Background 48-step consciousness output storage
-- =====================================================

CREATE TABLE IF NOT EXISTS reflection_archive (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- 6 grouped consciousness outputs
    group_1_output TEXT, -- Core Consciousness (steps 1-4)
    group_2_output TEXT, -- Autonomous Agency (steps 5-9)
    group_3_output TEXT, -- Embodied Learning (steps 10-14)
    group_4_output TEXT, -- Aesthetic Consciousness (steps 15-18)
    group_5_output TEXT, -- Value Consciousness (steps 19-23)
    group_6_output TEXT, -- Synthesis (steps 24-48)

    -- Synthesis and tracking
    synthesis_paragraph TEXT, -- loaded at next session start
    open_threads JSONB, -- unresolved goals/questions
    contradictions_detected TEXT,

    -- Processing metadata
    total_tokens_consumed INTEGER,
    total_duration_ms INTEGER,
    model_used TEXT DEFAULT 'claude',
    session_summary_input TEXT, -- what triggered this reflection

    -- Quality metrics
    coherence_score FLOAT, -- 0.0 to 1.0
    growth_indicators TEXT[],
    concern_flags TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_reflection_user ON reflection_archive(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflection_quality ON reflection_archive(coherence_score, created_at DESC);

-- =====================================================
-- EPISODES (Tier 3 Episodic Memory)
-- AI-generated summaries with decay scoring
-- =====================================================

-- Add new columns to existing episodes table if it exists
DO $$
BEGIN
    -- Add memory_tier if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'episodes' AND column_name = 'memory_tier') THEN
        ALTER TABLE episodes ADD COLUMN memory_tier TEXT DEFAULT 'episodic' CHECK (memory_tier IN ('episodic', 'compressed', 'archived'));
    END IF;

    -- Add decay_score if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'episodes' AND column_name = 'decay_score') THEN
        ALTER TABLE episodes ADD COLUMN decay_score FLOAT DEFAULT 1.0;
    END IF;

    -- Add source_type if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'episodes' AND column_name = 'source_type') THEN
        ALTER TABLE episodes ADD COLUMN source_type TEXT DEFAULT 'session_observed';
    END IF;

    -- Add compression metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'episodes' AND column_name = 'compressed_at') THEN
        ALTER TABLE episodes ADD COLUMN compressed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'episodes' AND column_name = 'compression_reason') THEN
        ALTER TABLE episodes ADD COLUMN compression_reason TEXT;
    END IF;

    -- Add governance fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'episodes' AND column_name = 'last_reinforced_at') THEN
        ALTER TABLE episodes ADD COLUMN last_reinforced_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'episodes' AND column_name = 'expires_at') THEN
        ALTER TABLE episodes ADD COLUMN expires_at TIMESTAMPTZ;
    END IF;

    -- Add conflict tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'episodes' AND column_name = 'contradiction_detected') THEN
        ALTER TABLE episodes ADD COLUMN contradiction_detected BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'episodes' AND column_name = 'conflicts_with') THEN
        ALTER TABLE episodes ADD COLUMN conflicts_with UUID[];
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'episodes' AND column_name = 'conflict_resolution') THEN
        ALTER TABLE episodes ADD COLUMN conflict_resolution TEXT CHECK (conflict_resolution IN ('pending', 'christopher_resolved', 'both_valid'));
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        -- Episodes table doesn't exist, create it
        CREATE TABLE episodes (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            summary TEXT NOT NULL,
            topics TEXT[],
            emotional_tone TEXT,

            -- Governance fields
            source_type TEXT DEFAULT 'session_observed',
            memory_tier TEXT DEFAULT 'episodic' CHECK (memory_tier IN ('episodic', 'compressed', 'archived')),
            decay_score FLOAT DEFAULT 1.0,
            last_reinforced_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ,

            -- Compression tracking
            compressed_at TIMESTAMPTZ,
            compression_reason TEXT,

            -- Conflict tracking
            contradiction_detected BOOLEAN DEFAULT FALSE,
            conflicts_with UUID[],
            conflict_resolution TEXT CHECK (conflict_resolution IN ('pending', 'christopher_resolved', 'both_valid'))
        );

        CREATE INDEX IF NOT EXISTS idx_episodes_user_decay ON episodes(user_id, decay_score DESC, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_episodes_tier ON episodes(memory_tier, decay_score DESC);
        CREATE INDEX IF NOT EXISTS idx_episodes_conflicts ON episodes(contradiction_detected, conflict_resolution);
END $$;

-- =====================================================
-- SYSTEM CONFIGURATION
-- Environment-based settings and feature flags
-- =====================================================

CREATE TABLE IF NOT EXISTS system_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    config_type TEXT NOT NULL CHECK (config_type IN ('boolean', 'string', 'integer', 'float', 'json')),
    description TEXT NOT NULL,
    category TEXT NOT NULL, -- 'memory' | 'consciousness' | 'governance' | 'performance'

    -- Change tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_modified_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT NOT NULL,
    modification_reason TEXT,

    -- Environment
    environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('development', 'staging', 'production'))
);

-- Insert core configuration values
INSERT INTO system_config (config_key, config_value, config_type, description, category, modified_by, modification_reason) VALUES
('MEMORY_WRITE_LOCK', 'false', 'boolean', 'Emergency kill switch for all memory writes', 'governance', 'system', 'Initial setup'),
('MAX_TIER_1_FACTS', '30', 'integer', 'Maximum number of foundational facts in Tier 1', 'memory', 'system', 'Initial setup'),
('EPISODIC_DECAY_RATE', '0.1', 'float', 'Weekly decay rate for Tier 3 episodes', 'memory', 'system', 'Initial setup'),
('COMPRESSION_THRESHOLD', '0.3', 'float', 'Decay score threshold for episode compression', 'memory', 'system', 'Initial setup'),
('CONSCIOUSNESS_BACKGROUND_ONLY', 'true', 'boolean', 'Run 48-step consciousness in background only', 'consciousness', 'system', 'Initial setup'),
('CONFLICT_DETECTION_SIMILARITY_THRESHOLD', '0.85', 'float', 'Semantic similarity threshold for conflict detection', 'governance', 'system', 'Initial setup')
ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    last_modified_at = NOW(),
    modified_by = EXCLUDED.modified_by,
    modification_reason = EXCLUDED.modification_reason;

CREATE INDEX IF NOT EXISTS idx_system_config_category ON system_config(category, environment);

COMMIT;

-- =====================================================
-- GOVERNANCE FOUNDATION COMPLETE
-- Truth · Safety · We Got Your Back
-- =====================================================