/*
 * SPLENDOR MEMORY MIGRATION AND RESET SCRIPTS
 * Built by Christopher Hughes · Sacramento, CA
 * Created with Claude Code
 * Truth · Safety · We Got Your Back
 *
 * CRITICAL: This script safely backs up existing data and selectively migrates
 * only approved content into the new memory architecture.
 *
 * WARNING: Generated thoughts, consciousness cycles, and contaminated data
 * are NOT automatically migrated. Manual review required.
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 1: BACKUP EXISTING DATA
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create backup tables with timestamp
DO $$
DECLARE
  backup_suffix text := '_backup_' || to_char(now(), 'YYYYMMDD_HH24MI');
BEGIN
  -- Backup existing memory tables
  EXECUTE format('CREATE TABLE memories%s AS SELECT * FROM memories', backup_suffix);
  EXECUTE format('CREATE TABLE conversations%s AS SELECT * FROM conversations', backup_suffix);
  EXECUTE format('CREATE TABLE reflections%s AS SELECT * FROM reflections', backup_suffix);
  EXECUTE format('CREATE TABLE identity_states%s AS SELECT * FROM identity_states', backup_suffix);
  EXECUTE format('CREATE TABLE splendor_decisions%s AS SELECT * FROM splendor_decisions', backup_suffix);
  EXECUTE format('CREATE TABLE temporal_consciousness%s AS SELECT * FROM temporal_consciousness', backup_suffix);
  EXECUTE format('CREATE TABLE autonomous_decisions%s AS SELECT * FROM autonomous_decisions', backup_suffix);

  -- Also backup any other existing tables
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'interactions') THEN
    EXECUTE format('CREATE TABLE interactions%s AS SELECT * FROM interactions', backup_suffix);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'semantic_facts') THEN
    EXECUTE format('CREATE TABLE semantic_facts%s AS SELECT * FROM semantic_facts', backup_suffix);
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'episodes') THEN
    EXECUTE format('CREATE TABLE episodes%s AS SELECT * FROM episodes', backup_suffix);
  END IF;

  -- Log the backup creation
  RAISE NOTICE 'Backup completed with suffix: %', backup_suffix;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 2: EXPORT PINECONE METADATA
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create export table for Pinecone vector IDs that need to be deleted
CREATE TABLE IF NOT EXISTS pinecone_cleanup_export (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  namespace text,
  vector_id text,
  source_table text,
  source_id uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Export existing Pinecone data for cleanup (if tracking table exists)
INSERT INTO pinecone_cleanup_export (user_id, namespace, vector_id, source_table, source_id, metadata)
SELECT
  user_id,
  namespace,
  pinecone_vector_id,
  COALESCE(
    CASE
      WHEN memory_item_id IS NOT NULL THEN 'memory_items'
      WHEN reflection_id IS NOT NULL THEN 'reflections'
      WHEN workspace_id IS NOT NULL THEN 'active_workspaces'
      ELSE 'unknown'
    END
  ) as source_table,
  COALESCE(memory_item_id, reflection_id, workspace_id) as source_id,
  jsonb_build_object(
    'indexed_at', indexed_at,
    'sync_status', sync_status
  ) as metadata
FROM pinecone_index_records
WHERE sync_status != 'deleted';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 3: ANALYSIS OF EXISTING DATA
-- ═══════════════════════════════════════════════════════════════════════════════

-- Analyze existing memory types for migration planning
CREATE TEMPORARY VIEW migration_analysis AS
WITH memory_analysis AS (
  SELECT
    'memories' as table_name,
    memory_type,
    memory_owner,
    COUNT(*) as record_count,
    COUNT(CASE WHEN memory_type = 'consciousness_test' THEN 1 END) as consciousness_test_count,
    COUNT(CASE WHEN memory_owner = 'test_system' THEN 1 END) as test_system_count
  FROM memories
  GROUP BY memory_type, memory_owner
),
conversations_analysis AS (
  SELECT
    'conversations' as table_name,
    role,
    NULL as memory_owner,
    COUNT(*) as record_count,
    0 as consciousness_test_count,
    0 as test_system_count
  FROM conversations
  GROUP BY role
)
SELECT * FROM memory_analysis
UNION ALL
SELECT * FROM conversations_analysis;

-- Show migration analysis
SELECT
  table_name,
  COALESCE(memory_type, role) as type_or_role,
  memory_owner,
  record_count,
  consciousness_test_count,
  test_system_count,
  CASE
    WHEN table_name = 'memories' AND memory_type = 'consciousness_test' THEN 'ARCHIVE_ONLY'
    WHEN table_name = 'memories' AND memory_owner = 'test_system' THEN 'ARCHIVE_ONLY'
    WHEN table_name = 'memories' AND memory_type = 'general' THEN 'MANUAL_REVIEW'
    WHEN table_name = 'conversations' AND role IN ('user', 'assistant') THEN 'MIGRATE'
    ELSE 'REVIEW_REQUIRED'
  END as migration_strategy
FROM migration_analysis
ORDER BY table_name, record_count DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 4: SAFE MIGRATION OF CLEAN DATA
-- ═══════════════════════════════════════════════════════════════════════════════

-- Migrate clean conversations (actual user/assistant exchanges)
INSERT INTO conversations (
  user_id,
  session_id,
  role,
  content,
  created_at,
  processed_for_memory
)
SELECT
  user_id,
  gen_random_uuid(), -- Generate session IDs
  role,
  content,
  created_at,
  false
FROM conversations_backup_XXXXXX -- Replace with actual backup table name
WHERE role IN ('user', 'assistant')
  AND content IS NOT NULL
  AND length(trim(content)) > 0
  AND content NOT ILIKE '%consciousness test%'
  AND content NOT ILIKE '%background reflection%'
  AND content NOT ILIKE '%thought cycle%';

-- Record migration events
INSERT INTO raw_events (user_id, event_type, actor, content, metadata)
SELECT DISTINCT
  user_id,
  'memory_migrated',
  'system',
  'Clean conversations migrated from old system',
  jsonb_build_object(
    'source_table', 'conversations_backup',
    'migration_date', now(),
    'record_count', (SELECT COUNT(*) FROM conversations WHERE user_id = c.user_id)
  )
FROM conversations c;

-- Migrate clearly user-stated preferences (conservative approach)
INSERT INTO memory_items (
  user_id,
  owner,
  category,
  memory_type,
  content,
  source_type,
  provenance,
  approval_status,
  trust_level,
  retrieval_allowed,
  confidence,
  importance,
  created_at
)
SELECT
  m.user_id,
  'chris',
  'chris.preferences',
  'user_preference',
  m.content,
  'imported_memory',
  'USER_STATED',
  'pending', -- Require manual approval even for user statements
  'caution',
  false, -- Start with retrieval disabled
  0.6,
  0.5,
  m.created_at
FROM memories_backup_XXXXXX m -- Replace with actual backup table name
WHERE m.memory_type = 'general'
  AND m.memory_owner = 'self'
  AND (
    m.content ILIKE 'I prefer%'
    OR m.content ILIKE 'My favorite%'
    OR m.content ILIKE 'I like%'
    OR m.content ILIKE 'I want%'
    OR m.content ILIKE 'My name is%'
    OR m.content ILIKE 'I am%'
  )
  AND m.content NOT ILIKE '%consciousness%'
  AND m.content NOT ILIKE '%test%'
  AND m.content NOT ILIKE '%reflection%'
  AND length(trim(m.content)) > 10
  AND length(trim(m.content)) < 500; -- Reasonable length bounds

-- Create verification requests for migrated memories
INSERT INTO verification_requests (
  user_id,
  source_table,
  source_id,
  proposed_memory_id,
  status
)
SELECT
  mi.user_id,
  'imported_memory',
  mi.id,
  mi.id,
  'pending'
FROM memory_items mi
WHERE mi.source_type = 'imported_memory';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 5: ARCHIVE CONTAMINATED DATA
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create archive tables for consciousness test data
CREATE TABLE consciousness_tests_archive AS
SELECT
  *,
  now() as archived_at,
  'consciousness_test_data' as archive_reason
FROM memories_backup_XXXXXX -- Replace with actual backup table name
WHERE memory_type = 'consciousness_test'
   OR memory_owner = 'test_system'
   OR content ILIKE '%consciousness test%';

-- Archive temporal consciousness data
CREATE TABLE temporal_consciousness_archive AS
SELECT
  *,
  now() as archived_at,
  'temporal_consciousness_generated' as archive_reason
FROM temporal_consciousness_backup_XXXXXX; -- Replace with actual backup table name

-- Archive autonomous decisions (will be manually reviewed for conversion to binding decisions)
CREATE TABLE autonomous_decisions_archive AS
SELECT
  *,
  now() as archived_at,
  'review_for_binding_decisions' as archive_reason
FROM autonomous_decisions_backup_XXXXXX; -- Replace with actual backup table name

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 6: SETUP CLEAN WORKSPACES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create initial workspace for the memory rebuild project
INSERT INTO active_workspaces (
  user_id,
  title,
  objective,
  current_state,
  open_questions,
  next_steps,
  status,
  priority
)
SELECT DISTINCT
  user_id,
  'Splendor Memory Architecture Rebuild',
  'Complete redesign of Splendor''s memory system with proper separation of facts, reflections, logs, and decisions',
  'Migration completed - new schema deployed with clean separation',
  '["Review migrated memories for approval", "Test new memory services", "Configure Pinecone sync"]'::jsonb,
  '["Approve pending memories", "Test retrieval with uncertainty flagging", "Deploy memory services"]'::jsonb,
  'active',
  'high'
FROM conversations
WHERE user_id IS NOT NULL
LIMIT 1; -- Assuming single user for now

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 7: PINECONE CLEANUP PREPARATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Generate Pinecone cleanup script
CREATE OR REPLACE FUNCTION generate_pinecone_cleanup_commands()
RETURNS TABLE(cleanup_command text) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    format('DELETE_NAMESPACE: %s', namespace) as cleanup_command
  FROM pinecone_cleanup_export
  WHERE namespace IS NOT NULL
  UNION ALL
  SELECT
    format('DELETE_VECTOR: namespace=%s vector_id=%s', namespace, vector_id) as cleanup_command
  FROM pinecone_cleanup_export
  WHERE namespace IS NOT NULL AND vector_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Show Pinecone cleanup commands
SELECT cleanup_command FROM generate_pinecone_cleanup_commands();

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 8: VALIDATION AND VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- Validate migration results
WITH migration_summary AS (
  SELECT
    'conversations' as table_name,
    COUNT(*) as migrated_count
  FROM conversations
  UNION ALL
  SELECT
    'memory_items' as table_name,
    COUNT(*) as migrated_count
  FROM memory_items
  WHERE source_type = 'imported_memory'
  UNION ALL
  SELECT
    'verification_requests' as table_name,
    COUNT(*) as migrated_count
  FROM verification_requests
  UNION ALL
  SELECT
    'active_workspaces' as table_name,
    COUNT(*) as migrated_count
  FROM active_workspaces
  UNION ALL
  SELECT
    'archived_consciousness_tests' as table_name,
    COUNT(*) as migrated_count
  FROM consciousness_tests_archive
)
SELECT
  table_name,
  migrated_count,
  CASE
    WHEN table_name = 'conversations' AND migrated_count > 0 THEN '✅ Clean conversations migrated'
    WHEN table_name = 'memory_items' AND migrated_count > 0 THEN '⚠️ Memories pending approval'
    WHEN table_name = 'verification_requests' THEN '📋 Verification queue created'
    WHEN table_name = 'active_workspaces' THEN '🚀 Initial workspace created'
    WHEN table_name = 'archived_consciousness_tests' THEN '📦 Test data archived'
    ELSE '❓ Check required'
  END as status
FROM migration_summary;

-- Check for data integrity
SELECT
  'Data Integrity Check' as check_type,
  CASE
    WHEN EXISTS (SELECT 1 FROM memory_items WHERE approval_status = 'approved' AND retrieval_allowed = true) THEN
      '❌ ERROR: Auto-approved memories detected'
    WHEN EXISTS (SELECT 1 FROM memory_items WHERE source_type = 'imported_memory' AND approval_status != 'pending') THEN
      '❌ ERROR: Imported memory not pending approval'
    WHEN NOT EXISTS (SELECT 1 FROM verification_requests WHERE status = 'pending') THEN
      '⚠️ WARNING: No memories pending verification'
    ELSE
      '✅ PASS: All migrated memories require approval'
  END as result;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 9: DROP OLD TABLES (ONLY AFTER BACKUP VERIFICATION)
-- ═══════════════════════════════════════════════════════════════════════════════

-- WARNING: Only run this after verifying backups are complete and valid
-- UNCOMMENT ONLY WHEN READY TO COMPLETE MIGRATION

/*
-- Drop old memory tables (after backup verification)
DROP TABLE IF EXISTS memories CASCADE;
DROP TABLE IF EXISTS temporal_consciousness CASCADE;
DROP TABLE IF EXISTS autonomous_decisions CASCADE;
DROP TABLE IF EXISTS semantic_facts CASCADE;
DROP TABLE IF EXISTS episodes CASCADE;
DROP TABLE IF EXISTS memory_summaries CASCADE;
DROP TABLE IF EXISTS proactive_openers CASCADE;

-- Drop old views
DROP VIEW IF EXISTS consciousness_test_summary CASCADE;
DROP VIEW IF EXISTS consciousness_development CASCADE;

-- Drop old functions
DROP FUNCTION IF EXISTS get_consciousness_tests(uuid) CASCADE;
DROP FUNCTION IF EXISTS clean_old_consciousness_tests(integer) CASCADE;
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 10: POST-MIGRATION SETUP
-- ═══════════════════════════════════════════════════════════════════════════════

-- Update memory categories for the current user
UPDATE memory_categories
SET user_id = (SELECT id FROM auth.users LIMIT 1)
WHERE user_id IS NULL;

-- Create initial identity state
INSERT INTO identity_states (
  user_id,
  identity_version,
  core_traits,
  identity_narrative,
  stable_principles
)
SELECT
  id,
  'v2.0-post-migration',
  '{"directness": 0.8, "helpfulness": 0.9, "truth_seeking": 0.95}'::jsonb,
  'Splendor with rebuilt memory architecture - clean separation of facts, reflections, and decisions',
  '{"truth_over_comfort": true, "memory_integrity": true, "uncertainty_awareness": true}'::jsonb
FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM identity_states WHERE user_id = auth.users.id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPLETION AND NEXT STEPS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Final migration report
SELECT
  'MIGRATION COMPLETE' as status,
  jsonb_pretty(
    jsonb_build_object(
      'timestamp', now(),
      'conversations_migrated', (SELECT COUNT(*) FROM conversations),
      'memories_pending_approval', (SELECT COUNT(*) FROM memory_items WHERE approval_status = 'pending'),
      'verification_requests_created', (SELECT COUNT(*) FROM verification_requests),
      'workspaces_created', (SELECT COUNT(*) FROM active_workspaces),
      'binding_decisions_active', (SELECT COUNT(*) FROM splendor_decisions WHERE status = 'active'),
      'consciousness_tests_archived', (SELECT COUNT(*) FROM consciousness_tests_archive),
      'backup_tables_created', (
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_name LIKE '%_backup_%'
      )
    )
  ) as migration_summary;

/*
 * MIGRATION CHECKLIST:
 *
 * ✅ 1. Backup all existing tables with timestamp
 * ✅ 2. Export Pinecone metadata for cleanup
 * ✅ 3. Analyze existing data for migration strategy
 * ✅ 4. Migrate clean conversations (user/assistant only)
 * ✅ 5. Migrate conservative user-stated preferences
 * ✅ 6. Create verification requests for all migrated memories
 * ✅ 7. Archive consciousness test data separately
 * ✅ 8. Archive temporal consciousness (generated thoughts)
 * ✅ 9. Archive autonomous decisions for manual review
 * ✅ 10. Create initial workspace for memory project
 * ✅ 11. Generate Pinecone cleanup commands
 * ✅ 12. Validate migration integrity
 * ❌ 13. Drop old tables (manual step after verification)
 * ✅ 14. Setup post-migration identity state
 *
 * REQUIRED MANUAL STEPS:
 * 1. Review and approve migrated memories in verification_requests
 * 2. Execute Pinecone cleanup commands
 * 3. Review autonomous_decisions_archive for binding decision candidates
 * 4. Deploy memory services
 * 5. Test retrieval with uncertainty flagging
 * 6. Drop old tables after verification
 *
 * REMEMBER:
 * - No generated thoughts were auto-migrated
 * - All migrated memories require manual approval
 * - Consciousness test data is safely archived
 * - Pinecone namespaces need manual cleanup
 * - Old tables are backed up with timestamp suffix
 */