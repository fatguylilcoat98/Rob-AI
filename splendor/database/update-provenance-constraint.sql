-- Update provenance CHECK constraint to allow 'splendor_conversation'
-- This adds the new default value for Splendor conversation-based memories

-- Drop the existing constraint
ALTER TABLE memory_items DROP CONSTRAINT IF EXISTS memory_items_provenance_check;

-- Add the updated constraint with 'splendor_conversation'
ALTER TABLE memory_items ADD CONSTRAINT memory_items_provenance_check
CHECK (provenance IN (
  'USER_STATED',
  'VERIFIED_FACT',
  'INFERRED',
  'GENERATED',
  'SYSTEM_EVENT',
  'ADMIN_APPROVED',
  'splendor_conversation'
));

-- Update any existing rows that have 'INFERRED' to use the new default if they came from conversation
UPDATE memory_items
SET provenance = 'splendor_conversation'
WHERE provenance = 'INFERRED'
AND (source_type = 'conversation' OR source_type IS NULL);