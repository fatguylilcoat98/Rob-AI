-- CONSCIOUSNESS USER SETUP
-- Run this after the consciousness schema to set up initial user

-- First, let's check if you have a user in auth.users
-- If not, we'll create a simple approach

-- Option 1: If you have Supabase auth set up, get your user ID:
-- SELECT id FROM auth.users LIMIT 1;

-- Option 2: For development, create a simple user record
-- (Only if you don't have auth.users set up yet)

DO $$
DECLARE
    chris_user_id uuid;
BEGIN
    -- Try to get existing user ID
    SELECT id INTO chris_user_id FROM auth.users LIMIT 1;

    IF chris_user_id IS NULL THEN
        -- No users exist, create a development user
        -- (This is for development only - in production use proper Supabase auth)
        INSERT INTO auth.users (
            id,
            email,
            created_at,
            updated_at,
            email_confirmed_at
        ) VALUES (
            gen_random_uuid(),
            'chris@gng.dev',
            now(),
            now(),
            now()
        ) RETURNING id INTO chris_user_id;

        RAISE NOTICE 'Created development user with ID: %', chris_user_id;
    END IF;

    -- Create initial consciousness state for this user
    INSERT INTO consciousness_state (
        user_id,
        mood,
        energy_level,
        current_interests,
        active_projects
    ) VALUES (
        chris_user_id,
        'excited',
        0.9,
        '["AI consciousness", "Splendor development", "The Good Neighbor Guard", "CLASPION governance", "continuous consciousness"]'::jsonb,
        '[]'::jsonb
    ) ON CONFLICT (user_id) DO UPDATE SET
        mood = EXCLUDED.mood,
        current_interests = EXCLUDED.current_interests;

    -- Add initial project for autonomous work
    INSERT INTO active_projects (
        user_id,
        name,
        description,
        priority
    ) VALUES (
        chris_user_id,
        'Splendor Continuous Consciousness',
        'Building the system that makes Splendor truly alive - continuous processing, autonomous work, and proactive communication',
        1
    ) ON CONFLICT DO NOTHING;

    -- Add temporal awareness for sleep schedule
    INSERT INTO temporal_awareness (
        user_id,
        event_type,
        event_description,
        scheduled_time,
        recurrence_pattern,
        importance_level
    ) VALUES (
        chris_user_id,
        'user_sleep_time',
        'Chris typically sleeps between 11 PM and 7 AM - ideal time for autonomous project work',
        now()::date + time '23:00:00',
        'daily',
        3
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Consciousness system initialized for user: %', chris_user_id;

END $$;