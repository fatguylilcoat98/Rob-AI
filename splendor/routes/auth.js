/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
// Create service client for user management (bypasses RLS)
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key for user operations
);

// User login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ success: false, error: 'Username and password required' });
    }

    // Guest access — controlled entirely by GUEST_PASSWORD env var in Render.
    // Remove the env var to revoke access on the next login attempt.
    const guestPassword = process.env.GUEST_PASSWORD;
    if (guestPassword && username.toLowerCase() === 'guest' && password === guestPassword) {
      return res.json({
        success: true,
        user: {
          id: 'guest',
          username: 'guest',
          display_name: 'Guest',
          email: null,
          role: 'guest',
          active: true,
          created_at: new Date().toISOString()
        }
      });
    }

    // Find user by username
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.toLowerCase())
      .limit(1);

    if (error) {
      console.error('Database error during login:', error);
      return res.json({ success: false, error: 'Login failed. Please try again.' });
    }

    if (!users || users.length === 0) {
      return res.json({ success: false, error: 'Invalid username or password' });
    }

    const user = users[0];

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.json({ success: false, error: 'Invalid username or password' });
    }

    // Return user data (without password)
    const { password_hash, ...userResponse } = user;

    res.json({
      success: true,
      user: userResponse
    });

  } catch (err) {
    console.error('Login error:', err);
    res.json({ success: false, error: 'Login failed. Please try again.' });
  }
});

// User signup
router.post('/signup', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password || !displayName) {
      return res.json({ success: false, error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.json({ success: false, error: 'Password must be at least 6 characters' });
    }

    if (username.length < 3) {
      return res.json({ success: false, error: 'Username must be at least 3 characters' });
    }

    // Check if username already exists
    const { data: existingUsers, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('username', username.toLowerCase())
      .limit(1);

    if (checkError) {
      console.error('Database error during signup check:', checkError);
      return res.json({ success: false, error: 'Signup failed. Please try again.' });
    }

    if (existingUsers && existingUsers.length > 0) {
      return res.json({ success: false, error: 'Username already taken' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        username: username.toLowerCase(),
        display_name: displayName,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Database error during user creation:', insertError);
      return res.json({ success: false, error: 'Account creation failed. Please try again.' });
    }

    // Return user data (without password)
    const { password_hash, ...userResponse } = newUser;

    res.json({
      success: true,
      user: userResponse
    });

  } catch (err) {
    console.error('Signup error:', err);
    res.json({ success: false, error: 'Account creation failed. Please try again.' });
  }
});

module.exports = router;