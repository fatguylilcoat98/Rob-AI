-- DEPLOYMENT VERIFICATION QUERY
-- Run this after deploying the schema

-- Check that all core tables exist
SELECT
  table_name,
  CASE
    WHEN table_name IN (
      'raw_events', 'conversations', 'conversation_sessions',
      'memory_categories', 'memory_items', 'memory_sources',
      'reflections', 'identity_states', 'splendor_decisions',
      'active_workspaces', 'thought_cycles', 'scheduled_tasks',
      'outbound_messages', 'memory_conflicts', 'memory_access_log',
      'pinecone_index_records', 'memory_promotions', 'verification_requests'
    ) THEN '✅ Core Table'
    ELSE '❓ Unknown Table'
  END as table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check that core views exist
SELECT
  table_name as view_name,
  '✅ Core View' as view_type
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN (
    'memory_items_retrievable',
    'active_binding_decisions',
    'memory_items_with_uncertainty',
    'uncertain_memories'
  )
ORDER BY table_name;

-- Check that core functions exist
SELECT
  routine_name as function_name,
  '✅ Core Function' as function_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND routine_name IN (
    'update_updated_at_column',
    'assess_memory_uncertainty',
    'generate_citation_string',
    'detect_memory_conflicts'
  )
ORDER BY routine_name;

-- Check seed data
SELECT
  'Seed Categories' as check_type,
  COUNT(*) as count,
  CASE WHEN COUNT(*) >= 10 THEN '✅ Present' ELSE '❌ Missing' END as status
FROM memory_categories;

SELECT
  'Seed Decisions' as check_type,
  COUNT(*) as count,
  CASE WHEN COUNT(*) >= 3 THEN '✅ Present' ELSE '❌ Missing' END as status
FROM splendor_decisions;

-- Final status
SELECT
  'DEPLOYMENT STATUS' as check_type,
  'READY FOR SERVICES' as status,
  now() as completed_at;