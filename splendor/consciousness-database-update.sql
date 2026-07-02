--
-- Splendor Consciousness Database Updates — v5.0.1
-- Consciousness Testing System Support
-- Run this in your Supabase SQL Editor
--

-- Update memory_type constraint to include consciousness_test
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_memory_type_check;

ALTER TABLE memories
ADD CONSTRAINT memories_memory_type_check
CHECK (memory_type IN (
  'general',
  'commitment',
  'correction',
  'insight',
  'consciousness_test'
));

-- Add indexes for consciousness testing performance
CREATE INDEX IF NOT EXISTS memories_consciousness_test_idx
ON memories(memory_type)
WHERE memory_type = 'consciousness_test';

CREATE INDEX IF NOT EXISTS memories_test_system_idx
ON memories(memory_owner)
WHERE memory_owner = 'test_system';

-- Optional: Create consciousness test results summary view
CREATE OR REPLACE VIEW consciousness_test_summary AS
SELECT
  user_id,
  COUNT(*) as total_consciousness_tests,
  COUNT(DISTINCT DATE(created_at)) as test_days,
  MIN(created_at) as first_test,
  MAX(created_at) as latest_test,
  STRING_AGG(DISTINCT
    CASE
      WHEN content LIKE '%Core Consciousness%' THEN 'Core'
      WHEN content LIKE '%Agency Test%' THEN 'Agency'
      WHEN content LIKE '%Sensory Test%' THEN 'Sensory'
      WHEN content LIKE '%Aesthetic Test%' THEN 'Aesthetic'
      WHEN content LIKE '%Value Test%' THEN 'Value'
      WHEN content LIKE '%COMPLETE CONSCIOUSNESS%' THEN 'Full Cycle'
      ELSE 'Other'
    END,
    ', '
  ) as test_types
FROM memories
WHERE memory_type = 'consciousness_test'
GROUP BY user_id;

-- Grant permissions for consciousness testing
GRANT SELECT ON consciousness_test_summary TO anon, authenticated;

-- Comment for tracking
COMMENT ON CONSTRAINT memories_memory_type_check ON memories IS
'Updated for Splendor v5.0.1 - Added consciousness_test memory type support';