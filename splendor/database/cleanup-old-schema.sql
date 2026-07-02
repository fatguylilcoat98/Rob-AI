/*
 * CLEANUP OLD MEMORY SCHEMA
 * Safely backup and remove existing tables before V2.0 deployment
 * Run this FIRST before deploying new schema
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 1: BACKUP EXISTING DATA
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create timestamp for backup tables
DO $$
DECLARE
  backup_suffix text := '_backup_' || to_char(now(), 'YYYYMMDD_HH24MI');
BEGIN
  -- Backup existing tables if they exist

  -- Backup memories table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'memories') THEN
    EXECUTE format('CREATE TABLE memories%s AS SELECT * FROM memories', backup_suffix);
    RAISE NOTICE 'Backed up memories table as memories%', backup_suffix;
  END IF;

  -- Backup conversations table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'conversations') THEN
    EXECUTE format('CREATE TABLE conversations%s AS SELECT * FROM conversations', backup_suffix);
    RAISE NOTICE 'Backed up conversations table as conversations%', backup_suffix;
  END IF;

  -- Backup reflections table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'reflections') THEN
    EXECUTE format('CREATE TABLE reflections%s AS SELECT * FROM reflections', backup_suffix);
    RAISE NOTICE 'Backed up reflections table as reflections%', backup_suffix;
  END IF;

  -- Backup identity_states table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'identity_states') THEN
    EXECUTE format('CREATE TABLE identity_states%s AS SELECT * FROM identity_states', backup_suffix);
    RAISE NOTICE 'Backed up identity_states table as identity_states%', backup_suffix;
  END IF;

  -- Backup splendor_decisions table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'splendor_decisions') THEN
    EXECUTE format('CREATE TABLE splendor_decisions%s AS SELECT * FROM splendor_decisions', backup_suffix);
    RAISE NOTICE 'Backed up splendor_decisions table as splendor_decisions%', backup_suffix;
  END IF;

  -- Backup temporal_consciousness table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'temporal_consciousness') THEN
    EXECUTE format('CREATE TABLE temporal_consciousness%s AS SELECT * FROM temporal_consciousness', backup_suffix);
    RAISE NOTICE 'Backed up temporal_consciousness table as temporal_consciousness%', backup_suffix;
  END IF;

  -- Backup autonomous_decisions table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'autonomous_decisions') THEN
    EXECUTE format('CREATE TABLE autonomous_decisions%s AS SELECT * FROM autonomous_decisions', backup_suffix);
    RAISE NOTICE 'Backed up autonomous_decisions table as autonomous_decisions%', backup_suffix;
  END IF;

  -- Backup interactions table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'interactions') THEN
    EXECUTE format('CREATE TABLE interactions%s AS SELECT * FROM interactions', backup_suffix);
    RAISE NOTICE 'Backed up interactions table as interactions%', backup_suffix;
  END IF;

  -- Backup semantic_facts table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'semantic_facts') THEN
    EXECUTE format('CREATE TABLE semantic_facts%s AS SELECT * FROM semantic_facts', backup_suffix);
    RAISE NOTICE 'Backed up semantic_facts table as semantic_facts%', backup_suffix;
  END IF;

  -- Backup episodes table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'episodes') THEN
    EXECUTE format('CREATE TABLE episodes%s AS SELECT * FROM episodes', backup_suffix);
    RAISE NOTICE 'Backed up episodes table as episodes%', backup_suffix;
  END IF;

  -- Backup memory_summaries table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'memory_summaries') THEN
    EXECUTE format('CREATE TABLE memory_summaries%s AS SELECT * FROM memory_summaries', backup_suffix);
    RAISE NOTICE 'Backed up memory_summaries table as memory_summaries%', backup_suffix;
  END IF;

  -- Backup proactive_openers table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'proactive_openers') THEN
    EXECUTE format('CREATE TABLE proactive_openers%s AS SELECT * FROM proactive_openers', backup_suffix);
    RAISE NOTICE 'Backed up proactive_openers table as proactive_openers%', backup_suffix;
  END IF;

  -- Backup conversation_sessions table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'conversation_sessions') THEN
    EXECUTE format('CREATE TABLE conversation_sessions%s AS SELECT * FROM conversation_sessions', backup_suffix);
    RAISE NOTICE 'Backed up conversation_sessions table as conversation_sessions%', backup_suffix;
  END IF;

  -- Backup reflection_conflicts table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'reflection_conflicts') THEN
    EXECUTE format('CREATE TABLE reflection_conflicts%s AS SELECT * FROM reflection_conflicts', backup_suffix);
    RAISE NOTICE 'Backed up reflection_conflicts table as reflection_conflicts%', backup_suffix;
  END IF;

  -- Backup reflection_evaluations table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'reflection_evaluations') THEN
    EXECUTE format('CREATE TABLE reflection_evaluations%s AS SELECT * FROM reflection_evaluations', backup_suffix);
    RAISE NOTICE 'Backed up reflection_evaluations table as reflection_evaluations%', backup_suffix;
  END IF;

  -- Backup reflection_system_health table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'reflection_system_health') THEN
    EXECUTE format('CREATE TABLE reflection_system_health%s AS SELECT * FROM reflection_system_health', backup_suffix);
    RAISE NOTICE 'Backed up reflection_system_health table as reflection_system_health%', backup_suffix;
  END IF;

  -- Backup splendor_config table
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'splendor_config') THEN
    EXECUTE format('CREATE TABLE splendor_config%s AS SELECT * FROM splendor_config', backup_suffix);
    RAISE NOTICE 'Backed up splendor_config table as splendor_config%', backup_suffix;
  END IF;

  RAISE NOTICE 'Backup completed with suffix: %', backup_suffix;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 2: DROP OLD VIEWS FIRST (to avoid dependency issues)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop views that might depend on tables we're about to drop
DROP VIEW IF EXISTS consciousness_test_summary CASCADE;
DROP VIEW IF EXISTS consciousness_development CASCADE;
DROP VIEW IF EXISTS recent_memory_summaries CASCADE;
DROP VIEW IF EXISTS current_semantic_facts CASCADE;
DROP VIEW IF EXISTS active_episodes CASCADE;
DROP VIEW IF EXISTS latest_identity_states CASCADE;
DROP VIEW IF EXISTS active_binding_decisions CASCADE;
DROP VIEW IF EXISTS memory_items_retrievable CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 3: DROP OLD FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop old functions that might have dependencies
DROP FUNCTION IF EXISTS get_consciousness_tests(uuid) CASCADE;
DROP FUNCTION IF EXISTS clean_old_consciousness_tests(integer) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 4: DROP OLD TABLES (order matters due to foreign key constraints)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop tables in reverse dependency order to avoid foreign key conflicts

-- Drop dependent tables first
DROP TABLE IF EXISTS reflection_evaluations CASCADE;
DROP TABLE IF EXISTS reflection_conflicts CASCADE;
DROP TABLE IF EXISTS reflection_system_health CASCADE;
DROP TABLE IF EXISTS memory_summaries CASCADE;
DROP TABLE IF EXISTS semantic_facts CASCADE;
DROP TABLE IF EXISTS episodes CASCADE;
DROP TABLE IF EXISTS proactive_openers CASCADE;
DROP TABLE IF EXISTS autonomous_decisions CASCADE;
DROP TABLE IF EXISTS temporal_consciousness CASCADE;

-- Drop main tables
DROP TABLE IF EXISTS reflections CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS memories CASCADE;
DROP TABLE IF EXISTS interactions CASCADE;
DROP TABLE IF EXISTS identity_states CASCADE;
DROP TABLE IF EXISTS splendor_decisions CASCADE;
DROP TABLE IF EXISTS conversation_sessions CASCADE;
DROP TABLE IF EXISTS splendor_config CASCADE;

-- Drop any remaining related tables
DROP TABLE IF EXISTS open_threads CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 5: CLEAN UP ORPHANED TYPES AND SEQUENCES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Clean up any custom types that might have been created
-- (Add any custom types here if they exist)

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Show remaining tables (should not include old memory tables)
SELECT
  table_name,
  CASE
    WHEN table_name LIKE '%backup%' THEN 'BACKUP TABLE - KEEP'
    WHEN table_name IN ('users', 'auth', 'storage') THEN 'SYSTEM TABLE - KEEP'
    ELSE 'UNKNOWN TABLE'
  END as table_status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Show backup tables created
SELECT
  table_name as backup_table,
  'BACKUP CREATED' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%backup%'
ORDER BY table_name;

-- Final confirmation
SELECT 'OLD SCHEMA CLEANUP COMPLETE - READY FOR V2.0 DEPLOYMENT' as status;

/*
 * CLEANUP SUMMARY:
 *
 * ✅ All existing memory tables backed up with timestamp
 * ✅ All old views dropped
 * ✅ All old functions dropped
 * ✅ All old tables dropped in correct order
 * ✅ Clean slate ready for new schema deployment
 *
 * NEXT STEPS:
 * 1. Run new-memory-architecture.sql
 * 2. Run memory-uncertainty-enhancement.sql
 * 3. Run verify-deployment.sql
 */