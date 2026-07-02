# 🚀 DEPLOY MEMORY PROVENANCE FIX

## **Step 1: Update Database Schema**

**Run this SQL in your Supabase SQL Editor:**

```sql
-- Drop existing constraint
ALTER TABLE memory_items DROP CONSTRAINT IF EXISTS memory_items_provenance_check;

-- Add updated constraint with 'splendor_conversation'
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

-- Update existing records to use new default
UPDATE memory_items 
SET provenance = 'splendor_conversation' 
WHERE provenance = 'INFERRED' 
AND (source_type = 'conversation' OR source_type IS NULL);
```

## **Step 2: Restart Splendor**

```bash
# Stop current server (Ctrl+C if running)
# Then restart:
npm start
```

## **Step 3: Test the Fix**

1. **Open Splendor in browser**: http://localhost:3000
2. **Send a test message**: "Remember that I like coffee"
3. **Check for errors**: Should work without NULL constraint violations

## **Verification Commands**

**Test memory storage:**
```bash
node tests/test-splendor-conversation-provenance.js
```

**Check if working:**
- No more error code 23502 
- Memory storage succeeds
- Chat conversations work normally

## **✅ What Was Fixed**

- **Default provenance**: `'splendor_conversation'` for all conversation memories
- **Code updated**: All memory insertion points now include provenance
- **Database schema**: Updated to allow the new provenance value
- **Type definitions**: TypeScript types include new value

## **🎯 Expected Result**

Memory storage will work without NULL constraint violations. All conversation-based memories will have `provenance: 'splendor_conversation'`.