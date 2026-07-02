/*
  Consciousness Debug Routes
  Temporary debug endpoints to check consciousness data storage
*/

const express = require('express');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Check if Supabase is configured
const hasSupabaseConfig = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY;

// Create stub client methods that return proper promise-like objects
function createStubChain() {
  const stubResult = { data: [], error: { message: 'Supabase not configured' } };
  const stubSingle = { data: null, error: { message: 'Supabase not configured' } };

  return {
    select: () => createStubChain(),
    eq: () => createStubChain(),
    order: () => createStubChain(),
    limit: () => Promise.resolve(stubResult),
    single: () => Promise.resolve(stubSingle)
  };
}

const supabase = hasSupabaseConfig
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : {
      from: () => createStubChain()
    };

// Debug endpoint to check all consciousness tables
router.get('/tables/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;

    // Check all consciousness-related tables
    const [
      consciousnessInsights,
      internalThoughts,
      microReflections,
      consciousnessActivityLog,
      consciousnessState
    ] = await Promise.all([
      // Consciousness insights table
      supabase
        .from('consciousness_insights')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),

      // Internal thoughts (ambient awareness)
      supabase
        .from('internal_thoughts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),

      // Micro reflections
      supabase
        .from('micro_reflections')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(5),

      // Activity log
      supabase
        .from('consciousness_activity_log')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(5),

      // Consciousness state
      supabase
        .from('consciousness_state')
        .select('*')
        .eq('user_id', userId)
        .single()
    ]);

    res.json({
      success: true,
      userId,
      data: {
        consciousnessInsights: consciousnessInsights.data || [],
        internalThoughts: internalThoughts.data || [],
        microReflections: microReflections.data || [],
        consciousnessActivityLog: consciousnessActivityLog.data || [],
        consciousnessState: consciousnessState.data || null
      },
      errors: {
        consciousnessInsights: consciousnessInsights.error?.message,
        internalThoughts: internalThoughts.error?.message,
        microReflections: microReflections.error?.message,
        consciousnessActivityLog: consciousnessActivityLog.error?.message,
        consciousnessState: consciousnessState.error?.message
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});


module.exports = router;