/*
 * ADD USERS TABLE FOR AUTHENTICATION
 * Adds user management to the enhanced memory system
 */

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username text UNIQUE NOT NULL CHECK (length(username) >= 3),
  display_name text NOT NULL CHECK (length(display_name) >= 1),
  password_hash text NOT NULL,
  email text,
  created_at timestamptz DEFAULT now(),
  last_active timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  active boolean DEFAULT true,
  preferences jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT username_lowercase CHECK (username = lower(username))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);

-- RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (auth.uid()::text = id::text OR auth.role() = 'service_role');

-- Users can update their own data
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (auth.uid()::text = id::text OR auth.role() = 'service_role');

-- Service role can insert (for signup)
CREATE POLICY users_insert_service ON users
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Service role can delete (admin functions)
CREATE POLICY users_delete_service ON users
  FOR DELETE
  USING (auth.role() = 'service_role');

-- Update trigger for updated_at
CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create a default admin user (for testing)
INSERT INTO users (username, display_name, password_hash, active)
VALUES (
  'admin',
  'Administrator',
  '$2b$12$LQv3c1yqBwEHxPiue4YVdu4jJg.jJNVVQ8Jg4.jJNVVQ8Jg4.jJNV', -- password: admin123
  true
) ON CONFLICT (username) DO NOTHING;

-- Create test user (for development)
INSERT INTO users (username, display_name, password_hash, active)
VALUES (
  'testuser',
  'Test User',
  '$2b$12$LQv3c1yqBwEHxPiue4YVdu4kJg.kJNVVQ8Jg4.kJNVVQ8Jg4.kJNV', -- password: test123
  true
) ON CONFLICT (username) DO NOTHING;

-- Function to get user by username (helper for auth)
CREATE OR REPLACE FUNCTION get_user_by_username(username_param text)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  password_hash text,
  email text,
  created_at timestamptz,
  last_active timestamptz,
  active boolean,
  preferences jsonb
)
SECURITY DEFINER
LANGUAGE sql
AS $$
  SELECT
    u.id,
    u.username,
    u.display_name,
    u.password_hash,
    u.email,
    u.created_at,
    u.last_active,
    u.active,
    u.preferences
  FROM users u
  WHERE u.username = lower(username_param)
  AND u.active = true;
$$;

-- Function to create user (helper for signup)
CREATE OR REPLACE FUNCTION create_user(
  username_param text,
  display_name_param text,
  password_hash_param text,
  email_param text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  email text,
  created_at timestamptz
)
SECURITY DEFINER
LANGUAGE sql
AS $$
  INSERT INTO users (username, display_name, password_hash, email)
  VALUES (
    lower(username_param),
    display_name_param,
    password_hash_param,
    email_param
  )
  RETURNING
    users.id,
    users.username,
    users.display_name,
    users.email,
    users.created_at;
$$;

-- Grant necessary permissions
GRANT SELECT ON users TO anon, authenticated;
GRANT INSERT ON users TO anon, authenticated;
GRANT UPDATE ON users TO authenticated;

-- Grant execution permissions on functions
GRANT EXECUTE ON FUNCTION get_user_by_username TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_user TO anon, authenticated;