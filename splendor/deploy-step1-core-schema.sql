-- STEP 1: DEPLOY CORE HELPER FUNCTIONS
-- Copy this section first

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verify this executes successfully before proceeding to Step 2