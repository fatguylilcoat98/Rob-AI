-- CLEAN CONSCIOUSNESS TABLES
-- Run this FIRST to remove any existing consciousness tables

-- Drop all consciousness tables if they exist
DROP TABLE IF EXISTS consciousness_state CASCADE;
DROP TABLE IF EXISTS consciousness_activity_log CASCADE;
DROP TABLE IF EXISTS consciousness_insights CASCADE;
DROP TABLE IF EXISTS active_projects CASCADE;
DROP TABLE IF EXISTS proactive_messages CASCADE;
DROP TABLE IF EXISTS consciousness_sessions CASCADE;
DROP TABLE IF EXISTS environmental_awareness CASCADE;
DROP TABLE IF EXISTS memory_consolidation CASCADE;
DROP TABLE IF EXISTS creative_works CASCADE;
DROP TABLE IF EXISTS self_evolution_log CASCADE;
DROP TABLE IF EXISTS temporal_awareness CASCADE;
DROP TABLE IF EXISTS pending_notifications CASCADE;

-- Clean up any existing policies that might conflict
DROP POLICY IF EXISTS "Users can access their own consciousness data" ON consciousness_state;
DROP POLICY IF EXISTS "Users can access their own activity logs" ON consciousness_activity_log;
DROP POLICY IF EXISTS "Users can access their own insights" ON consciousness_insights;
DROP POLICY IF EXISTS "Users can access their own projects" ON active_projects;
DROP POLICY IF EXISTS "Users can access their own messages" ON proactive_messages;
DROP POLICY IF EXISTS "Users can access their own sessions" ON consciousness_sessions;
DROP POLICY IF EXISTS "Users can access their own environmental data" ON environmental_awareness;
DROP POLICY IF EXISTS "Users can access their own memory consolidation" ON memory_consolidation;
DROP POLICY IF EXISTS "Users can access their own creative works" ON creative_works;
DROP POLICY IF EXISTS "Users can access their own evolution log" ON self_evolution_log;
DROP POLICY IF EXISTS "Users can access their own temporal awareness" ON temporal_awareness;
DROP POLICY IF EXISTS "Users can access their own notifications" ON pending_notifications;

-- Success message
SELECT 'Consciousness tables cleaned successfully!' as status;