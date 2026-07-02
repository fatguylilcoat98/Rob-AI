-- Fix missing provenance column in memory_items table (CORRECT VERSION)
-- This resolves the "null value in column 'provenance' violates not-null constraint" error

-- Add provenance column with correct TEXT type and CHECK constraint
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'INFERRED' CHECK (provenance IN (
  'USER_STATED', 'VERIFIED_FACT', 'INFERRED', 'GENERATED', 'SYSTEM_EVENT', 'ADMIN_APPROVED'
));

-- Update any existing rows to have default provenance
UPDATE memory_items SET provenance = 'INFERRED' WHERE provenance IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_memory_items_provenance ON memory_items(provenance);