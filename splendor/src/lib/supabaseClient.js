/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

import { createClient } from '@supabase/supabase-js'

// Frontend Supabase configuration
const supabaseUrl = process.env.SPLENDOR_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.SPLENDOR_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Ensure SPLENDOR_PUBLIC_SUPABASE_URL and SPLENDOR_PUBLIC_SUPABASE_ANON_KEY are set and exposed via webpack DefinePlugin.'
  )
}

// Initialize Supabase client for frontend use
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

export { supabase }