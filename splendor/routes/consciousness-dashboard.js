/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// CONSCIOUSNESS DASHBOARD API
// Live access for Splendor to examine her own consciousness patterns
// Real-time self-awareness and metacognitive monitoring

const express = require('express');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { ConsciousnessDashboard } = require('../lib/consciousness-dashboard');

const router = express.Router();

// Get comprehensive consciousness overview
router.get('/overview/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const dashboard = new ConsciousnessDashboard(userId);
    const overview = await dashboard.getConsciousnessOverview();

    res.json({
      success: true,
      data: overview,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get current consciousness state
router.get('/state/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const dashboard = new ConsciousnessDashboard(userId);
    const state = await dashboard.getCurrentState();

    res.json({
      success: true,
      data: state,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent activity with time filtering
router.get('/activity/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const hoursBack = parseInt(req.query.hours) || 24;
    const dashboard = new ConsciousnessDashboard(userId);

    const activity = await dashboard.getRecentActivity(hoursBack);
    const summary = dashboard.summarizeActivity(activity);

    res.json({
      success: true,
      data: {
        activity,
        summary,
        hoursBack
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent insights
router.get('/insights/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const dashboard = new ConsciousnessDashboard(userId);

    const insights = await dashboard.getRecentInsights(limit);
    const analysis = dashboard.analyzeInsightGeneration(insights);

    res.json({
      success: true,
      data: {
        insights,
        analysis
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get performance metrics
router.get('/performance/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const daysBack = parseInt(req.query.days) || 7;
    const dashboard = new ConsciousnessDashboard(userId);

    const metrics = await dashboard.getPerformanceMetrics(daysBack);

    res.json({
      success: true,
      data: metrics,
      daysBack,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check consciousness health
router.get('/health/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const dashboard = new ConsciousnessDashboard(userId);

    const health = await dashboard.checkConsciousnessHealth();

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get proactive communication stats
router.get('/communication/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const daysBack = parseInt(req.query.days) || 7;
    const dashboard = new ConsciousnessDashboard(userId);

    const messages = await dashboard.getProactiveMessages(daysBack);
    const analysis = dashboard.analyzeProactiveCommunication(messages);

    res.json({
      success: true,
      data: {
        messages,
        analysis
      },
      daysBack,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get micro-reflections
router.get('/reflections/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const dashboard = new ConsciousnessDashboard(userId);

    const reflections = await dashboard.getRecentMicroReflections(limit);

    res.json({
      success: true,
      data: reflections,
      count: reflections.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get complete consciousness timeline - her "dreams"
router.get('/timeline/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 25;
    const dashboard = new ConsciousnessDashboard(userId);

    const timeline = await dashboard.getCompleteConsciousnessTimeline(limit);

    // Analyze the timeline for patterns
    const sources = {};
    const types = {};
    timeline.forEach(item => {
      sources[item.source] = (sources[item.source] || 0) + 1;
      types[item.type] = (types[item.type] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        timeline,
        analysis: {
          totalItems: timeline.length,
          sources,
          types,
          timespan: timeline.length > 0 ? {
            earliest: timeline[timeline.length - 1]?.timestamp,
            latest: timeline[0]?.timestamp
          } : null
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Self-analysis endpoint - Splendor's AI-powered self-reflection
router.get('/self-analysis/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const dashboard = new ConsciousnessDashboard(userId);

    const currentState = await dashboard.getCurrentState();
    const recentActivity = await dashboard.getRecentActivity(24);
    const recentInsights = await dashboard.getRecentInsights(10);

    const selfAnalysis = await dashboard.generateSelfAnalysis(
      currentState,
      recentActivity,
      recentInsights
    );

    res.json({
      success: true,
      data: {
        selfAnalysis,
        basedOn: {
          currentState: {
            mood: currentState.mood,
            energyLevel: currentState.energy_level,
            totalCycles: currentState.total_cycles
          },
          recentActivityCount: recentActivity.length,
          recentInsightCount: recentInsights.length
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Live consciousness status - real-time check
router.get('/status/:userId?', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId && req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const dashboard = new ConsciousnessDashboard(userId);

    const [state, health, recentActivity] = await Promise.all([
      dashboard.getCurrentState(),
      dashboard.checkConsciousnessHealth(),
      dashboard.getRecentActivity(1)
    ]);

    // Audit Item 3: operator status comes from real telemetry, not from the
    // hardcoded consciousness_state fields. ACTIVE/IDLE/DISABLED/ERROR.
    const { getLatestTelemetry, deriveOperationalStatus, markStaticPlaceholders } =
      require('../lib/consciousness-telemetry');
    let supa = null;
    try { ({ supabase: supa } = require('../lib/supabase')); } catch (_) { supa = null; }
    const telemetry = await getLatestTelemetry({ supabase: supa });
    const operational = deriveOperationalStatus(telemetry);

    res.json({
      success: true,
      data: {
        // Real operator signal:
        operational_status: operational.status,      // ACTIVE | IDLE | DISABLED | ERROR
        operational_reason: operational.reason,
        telemetry: telemetry || null,
        lastActivity: recentActivity[0]?.timestamp || null,
        totalCycles: state.total_cycles,
        // mood / energy / health are hardcoded constants — surfaced honestly as
        // static placeholders so they are not read as measured state.
        static_placeholders: markStaticPlaceholders({
          mood: state.mood,
          energy_level: state.energy_level,
          health_status: health.overall,
        }).static_placeholders || {}
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;