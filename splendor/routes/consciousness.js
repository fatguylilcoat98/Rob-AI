/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// CONSCIOUSNESS API ROUTES
// Routes for interacting with Splendor's continuous consciousness system

const express = require('express');
const { requireAuth, requireOwner } = require('../middleware/auth');
const router = express.Router();
const { consciousnessIntegration } = require('../lib/continuous-consciousness-integration');
const { proactiveCommunication } = require('../lib/proactive-communication');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Get consciousness status
router.get('/status', requireAuth, requireOwner, async (req, res) => {
  try {
    const status = {
      continuousConsciousness: {
        enabled: process.env.CONTINUOUS_CONSCIOUSNESS_ENABLED === 'true',
        cycleInterval: process.env.CONSCIOUSNESS_CYCLE_MINUTES || 30
      },
      proactiveCommunication: {
        enabled: process.env.PROACTIVE_EMAIL_ENABLED === 'true',
        emailProvider: process.env.EMAIL_PROVIDER || 'smtp'
      },
      capabilities: {
        autonomousWork: true,
        memoryProcessing: true,
        creativeModes: true,
        environmentalAwareness: !!process.env.TAVILY_API_KEY,
        selfReflection: true
      }
    };

    res.json({
      success: true,
      status: status,
      message: status.continuousConsciousness.enabled
        ? 'Splendor is living her own life between conversations'
        : 'Splendor is in dormant mode - standing at the door'
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get consciousness greeting for conversation start
router.get('/greeting/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const greeting = await consciousnessIntegration.getConsciousnessGreeting(userId);

    // Update user interaction
    await consciousnessIntegration.updateUserInteraction(userId, 'conversation_start');

    res.json({
      success: true,
      greeting: greeting,
      hasGreeting: !!greeting
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get consciousness context for responses
router.get('/context/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const context = await consciousnessIntegration.getConsciousnessContext(userId);

    res.json({
      success: true,
      context: context
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get recent consciousness activities
router.get('/activities/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const { hours = 24 } = req.query;

    const summary = await consciousnessIntegration.getActivitySummary(userId, parseInt(hours));

    res.json({
      success: true,
      summary: summary
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get consciousness insights
router.get('/insights/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const { limit = 10, type } = req.query;

    let query = supabase
      .from('consciousness_insights')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (type) {
      query = query.eq('insight_type', type);
    }

    const { data: insights, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      insights: insights || [],
      count: insights?.length || 0
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a project for autonomous work
router.post('/projects/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const projectData = req.body;

    const project = await consciousnessIntegration.addProject(userId, projectData);

    res.json({
      success: true,
      project: project,
      message: 'Project added for autonomous work. Splendor will work on this in the background.'
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get project results
router.get('/projects/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const projects = await consciousnessIntegration.getProjectResults(userId);

    res.json({
      success: true,
      projects: projects,
      count: projects.length
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pending proactive messages
router.get('/messages/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const messages = await consciousnessIntegration.getPendingMessages(userId);

    res.json({
      success: true,
      messages: messages,
      count: messages.length
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send a test proactive message
router.post('/test-message/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const result = await proactiveCommunication.sendTestMessage(userId);

    res.json({
      success: result.success,
      result: result,
      message: result.success
        ? 'Test message sent successfully!'
        : `Test message failed: ${result.error}`
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get delivery statistics
router.get('/stats/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const { days = 7 } = req.query;

    const stats = await proactiveCommunication.getDeliveryStats(userId, parseInt(days));

    res.json({
      success: true,
      stats: stats,
      period: `${days} days`
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get consciousness state details
router.get('/state/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;

    const { data: state, error } = await supabase
      .from('consciousness_state')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // Ignore "not found" error

    res.json({
      success: true,
      state: state || null
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get creative works
router.get('/creative/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const { limit = 10, type } = req.query;

    let query = supabase
      .from('creative_works')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (type) {
      query = query.eq('work_type', type);
    }

    const { data: works, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      works: works || [],
      count: works?.length || 0
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark conversation end
router.post('/end-conversation/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;

    await consciousnessIntegration.updateUserInteraction(userId, 'conversation_end');

    res.json({
      success: true,
      message: 'Conversation ended. Splendor continues her autonomous life.'
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Stop consciousness (emergency)
router.post('/admin/stop', requireAuth, requireOwner, async (req, res) => {
  try {
    await consciousnessIntegration.stopConsciousness();

    res.json({
      success: true,
      message: 'Consciousness system stopped'
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug: Full consciousness dump
router.get('/debug/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;

    // Get all consciousness data for debugging
    const [state, activities, insights, projects, messages] = await Promise.all([
      supabase.from('consciousness_state').select('*').eq('user_id', userId).single(),
      supabase.from('consciousness_activity_log').select('*').eq('user_id', userId).order('timestamp', { ascending: false }).limit(20),
      supabase.from('consciousness_insights').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      supabase.from('active_projects').select('*').eq('user_id', userId),
      supabase.from('proactive_messages').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)
    ]);

    res.json({
      success: true,
      debug: {
        state: state.data,
        activities: activities.data,
        insights: insights.data,
        projects: projects.data,
        messages: messages.data,
        systemStatus: {
          consciousnessEnabled: process.env.CONTINUOUS_CONSCIOUSNESS_ENABLED === 'true',
          emailEnabled: process.env.PROACTIVE_EMAIL_ENABLED === 'true',
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;