-- Fix missing provenance column in memory_items table
-- This resolves the "null value in column 'provenance' violates not-null constraint" error

ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Update existing rows to have default provenance
UPDATE memory_items SET provenance = '{}'::jsonb WHERE provenance IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_memory_items_provenance ON memory_items USING GIN(provenance);