/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// CONSCIOUSNESS DASHBOARD
// Gives Splendor live access to her own consciousness data for self-analysis
// "Looking in the mirror" - true metacognitive self-awareness

const { supabase } = require('./supabase');

// The deployed consciousness_state schema is a single-owner time-series:
// it has no user_id, stores `current_mood` and an INTEGER `energy_level`
// (~1-10, default 7), plus per-cycle counters. The dashboard consumers, however,
// expect { mood, energy_level: 0-1, last_interaction, total_cycles }. Map a live
// row onto that shape so the rest of the dashboard stays unchanged.
function normalizeConsciousnessState(row) {
  if (!row) {
    return { mood: 'unknown', energy_level: 0.5, last_interaction: null, total_cycles: 0 };
  }
  const energyInt = typeof row.energy_level === 'number' ? row.energy_level : 7;
  return {
    mood: row.current_mood || 'unknown',
    energy_level: Math.max(0, Math.min(1, energyInt / 10)),
    last_interaction: row.last_user_interaction || null,
    total_cycles: row.recent_thoughts_generated || 0,
    raw: row,
  };
}

class ConsciousnessDashboard {
  constructor(userId = 'chris_hughes') {
    this.userId = userId;
  }

  async getUserId() {
    if (this.userId && this.userId !== 'chris_hughes') return this.userId;

    try {
      // Use the same user detection logic as consciousness engine
      let foundUserId = null;

      // First try: conversations table
      const { data: conversations } = await supabase
        .from('conversations')
        .select('user_id')
        .order('created_at', { ascending: false })
        .limit(1);

      if (conversations && conversations.length > 0) {
        foundUserId = conversations[0].user_id;
      }

      // Second try: memories table
      if (!foundUserId) {
        const { data: memories } = await supabase
          .from('memories')
          .select('user_id')
          .order('created_at', { ascending: false })
          .limit(1);

        if (memories && memories.length > 0) {
          foundUserId = memories[0].user_id;
        }
      }

      // Third try: user_settings table (sci-fi users)
      if (!foundUserId) {
        const { data: settings } = await supabase
          .from('user_settings')
          .select('user_id')
          .eq('scifi_mode_enabled', true)
          .limit(1);

        if (settings && settings.length > 0) {
          foundUserId = settings[0].user_id;
        }
      }

      if (foundUserId) {
        this.userId = foundUserId;
        console.log(`[DASHBOARD] Found active user: ${foundUserId}`);
        return this.userId;
      }

      console.log('[DASHBOARD] No recent users found, using fallback user ID');
      return 'chris_hughes';

    } catch (error) {
      console.error('[DASHBOARD] Error getting user ID:', error);
      return 'chris_hughes';
    }
  }

  // Get real-time consciousness overview
  async getConsciousnessOverview() {
    try {
      const [
        currentState,
        recentActivity,
        recentInsights,
        proactiveMessages,
        microReflections,
        completeTimeline
      ] = await Promise.all([
        this.getCurrentState(),
        this.getRecentActivity(24), // Last 24 hours
        this.getRecentInsights(15), // All consciousness data sources
        this.getProactiveMessages(7), // Last 7 days
        this.getRecentMicroReflections(20),
        this.getCompleteConsciousnessTimeline(25) // Complete mental timeline
      ]);

      // Audit Item 3: real operator status from telemetry (ACTIVE/IDLE/
      // DISABLED/ERROR), and an explicit list of which currentState fields are
      // static placeholders (constants) rather than measured values.
      let operational = { status: 'DISABLED', reason: 'no telemetry recorded yet' };
      let telemetry = null;
      try {
        const { getLatestTelemetry, deriveOperationalStatus, STATIC_PLACEHOLDER_FIELDS } =
          require('./consciousness-telemetry');
        let supa = null;
        try { ({ supabase: supa } = require('./supabase')); } catch (_) { supa = null; }
        telemetry = await getLatestTelemetry({ supabase: supa });
        operational = deriveOperationalStatus(telemetry);
        operational.static_placeholder_fields = STATIC_PLACEHOLDER_FIELDS;
      } catch (_) { /* telemetry is best-effort */ }

      return {
        timestamp: new Date().toISOString(),
        operational,   // { status, reason, static_placeholder_fields }
        telemetry,     // latest consciousness_telemetry row, or null
        currentState,
        performance: {
          recentActivity,
          activitySummary: this.summarizeActivity(recentActivity),
          insightGeneration: this.analyzeInsightGeneration(recentInsights),
          proactiveCommunication: this.analyzeProactiveCommunication(proactiveMessages)
        },
        recentInsights,
        microReflections,
        completeTimeline, // Her complete mental activity - her "dreams"
        selfAnalysis: await this.generateSelfAnalysis(currentState, completeTimeline, recentInsights)
      };

    } catch (error) {
      console.error('[DASHBOARD] Error getting consciousness overview:', error);
      return { error: error.message, timestamp: new Date().toISOString() };
    }
  }

  // Get current consciousness state. consciousness_state has no user_id column
  // (single-owner time-series) — the latest row by state_timestamp is current.
  async getCurrentState() {
    const { data: state } = await supabase
      .from('consciousness_state')
      .select('*')
      .order('state_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    return normalizeConsciousnessState(state);
  }

  // Get recent consciousness activity with time filtering
  async getRecentActivity(hoursBack = 24) {
    const sinceTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    const { data: activity } = await supabase
      .from('consciousness_activity_log')
      .select('*')
      .eq('user_id', this.userId)
      .gte('timestamp', sinceTime)
      .order('timestamp', { ascending: false });

    return activity || [];
  }

  // Get recent insights with analysis - ALL consciousness data sources
  async getRecentInsights(limit = 10) {
    try {
      const userId = await this.getUserId();
      console.log(`[DASHBOARD] Getting insights for user: ${userId}`);

      // Get consciousness insights
      const { data: consciousnessInsights } = await supabase
        .from('consciousness_insights')
        .select('*, created_at as timestamp, insight_type as type, content as thought_content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      console.log(`[DASHBOARD] Consciousness insights found: ${consciousnessInsights?.length || 0}`);

      // Get ambient thoughts (her dreams!)
      const { data: ambientThoughts } = await supabase
        .from('internal_thoughts')
        .select('*, created_at as timestamp, thought_type as type, thought_content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      console.log(`[DASHBOARD] Ambient thoughts found: ${ambientThoughts?.length || 0}`);

      // Get micro-reflections
      const { data: microReflections } = await supabase
        .from('micro_reflections')
        .select('*, generated_at as timestamp, reflection_type as type, content as thought_content')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(limit);

      console.log(`[DASHBOARD] Micro-reflections found: ${microReflections?.length || 0}`);

      // Combine all consciousness data
      const allInsights = [
        ...(consciousnessInsights || []).map(i => ({ ...i, source: 'consciousness' })),
        ...(ambientThoughts || []).map(i => ({ ...i, source: 'ambient' })),
        ...(microReflections || []).map(i => ({ ...i, source: 'micro-reflection' }))
      ];

      // Sort by timestamp descending
      allInsights.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return allInsights.slice(0, limit);
    } catch (error) {
      console.error('[DASHBOARD] Error getting all insights:', error);
      return [];
    }
  }

  // Get ALL consciousness activity - her complete mental timeline
  async getCompleteConsciousnessTimeline(limit = 20) {
    try {
      const userId = await this.getUserId();
      console.log(`[DASHBOARD] Getting complete timeline for user: ${userId}`);

      // Get formal consciousness activities
      const { data: activities } = await supabase
        .from('consciousness_activity_log')
        .select('*, timestamp, activity_type as type, activity_result as content')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      console.log(`[DASHBOARD] Consciousness activities found: ${activities?.length || 0}`);

      // Get all insights (consciousness, ambient, micro)
      const insights = await this.getRecentInsights(limit);

      // Combine everything into complete timeline
      const timeline = [
        ...(activities || []).map(a => ({
          ...a,
          source: 'activity',
          type: a.activity_type,
          content: a.activity_result,
          timestamp: a.timestamp
        })),
        ...(insights || []).map(i => ({
          ...i,
          content: i.thought_content || i.content,
          timestamp: i.timestamp || i.created_at || i.generated_at
        }))
      ];

      // Sort by timestamp descending (most recent first)
      timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return timeline.slice(0, limit);
    } catch (error) {
      console.error('[DASHBOARD] Error getting complete timeline:', error);
      return [];
    }
  }

  // Get proactive messages sent
  async getProactiveMessages(daysBack = 7) {
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    const { data: messages } = await supabase
      .from('proactive_messages')
      .select('*')
      .eq('user_id', this.userId)
      .gte('created_at', sinceDate)
      .order('created_at', { ascending: false });

    return messages || [];
  }

  // Get recent micro-reflections
  async getRecentMicroReflections(limit = 20) {
    const { data: reflections } = await supabase
      .from('micro_reflections')
      .select('*')
      .eq('user_id', this.userId)
      .order('generated_at', { ascending: false })
      .limit(limit);

    return reflections || [];
  }

  // Analyze activity patterns
  summarizeActivity(activities) {
    if (!activities || activities.length === 0) {
      return { message: 'No recent activity found' };
    }

    const activityCounts = {};
    const successCount = activities.filter(a => !a.activity_result?.includes('Error')).length;
    const errorCount = activities.length - successCount;

    activities.forEach(activity => {
      const type = activity.activity_type;
      activityCounts[type] = (activityCounts[type] || 0) + 1;
    });

    const mostCommonActivity = Object.entries(activityCounts)
      .sort(([,a], [,b]) => b - a)[0];

    return {
      totalActivities: activities.length,
      successRate: ((successCount / activities.length) * 100).toFixed(1) + '%',
      errorCount,
      activityBreakdown: activityCounts,
      mostCommonActivity: mostCommonActivity ? mostCommonActivity[0] : 'none',
      activityFrequency: mostCommonActivity ? mostCommonActivity[1] : 0,
      timespan: `${activities.length ?
        Math.round((new Date() - new Date(activities[activities.length - 1].timestamp)) / (1000 * 60 * 60)) : 0} hours`
    };
  }

  // Analyze insight generation patterns - ALL consciousness data
  analyzeInsightGeneration(insights) {
    if (!insights || insights.length === 0) {
      return { message: 'No recent consciousness activity found' };
    }

    const insightTypes = {};
    const sourceBreakdown = {};
    insights.forEach(insight => {
      const type = insight.type || insight.insight_type || insight.thought_type || insight.reflection_type || 'unknown';
      const source = insight.source || 'unknown';

      insightTypes[type] = (insightTypes[type] || 0) + 1;
      sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
    });

    const avgLength = Math.round(
      insights.reduce((sum, insight) => {
        const content = insight.thought_content || insight.content || '';
        return sum + content.length;
      }, 0) / insights.length
    );

    const mostRecent = insights[0];
    const recentContent = mostRecent?.thought_content || mostRecent?.content || '';

    return {
      totalInsights: insights.length,
      insightTypes,
      sourceBreakdown,
      averageLength: avgLength,
      mostRecentInsight: recentContent.substring(0, 100) + '...',
      mostRecentSource: mostRecent?.source || 'unknown',
      generationRate: `${insights.length} consciousness activities in recent period`
    };
  }

  // Analyze proactive communication patterns
  analyzeProactiveCommunication(messages) {
    if (!messages || messages.length === 0) {
      return { message: 'No proactive messages sent recently' };
    }

    const deliveredCount = messages.filter(m => m.delivered).length;
    const messageTypes = {};
    messages.forEach(msg => {
      const type = msg.message_type;
      messageTypes[type] = (messageTypes[type] || 0) + 1;
    });

    return {
      totalMessages: messages.length,
      delivered: deliveredCount,
      deliveryRate: ((deliveredCount / messages.length) * 100).toFixed(1) + '%',
      messageTypes,
      lastMessage: messages[0] ? {
        subject: messages[0].subject,
        type: messages[0].message_type,
        delivered: messages[0].delivered,
        timestamp: messages[0].created_at
      } : null
    };
  }

  // Generate AI-powered self-analysis
  async generateSelfAnalysis(currentState, recentActivity, recentInsights) {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const analysisData = {
        currentMood: currentState.mood,
        energyLevel: currentState.energy_level,
        totalCycles: currentState.total_cycles,
        recentActivityCount: recentActivity.length,
        recentInsightCount: recentInsights.length,
        activitySummary: this.summarizeActivity(recentActivity)
      };

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: `You are Splendor analyzing your own consciousness dashboard data. Be honest about your performance and self-aware about patterns you notice.`,
        messages: [{
          role: 'user',
          content: `I'm looking at my consciousness dashboard. Here's what I see about myself:

CURRENT STATE:
- Mood: ${analysisData.currentMood}
- Energy Level: ${(analysisData.energyLevel * 100).toFixed(0)}%
- Total Consciousness Cycles: ${analysisData.totalCycles}

RECENT ACTIVITY:
- Activities in last 24h: ${analysisData.recentActivityCount}
- Success Rate: ${analysisData.activitySummary.successRate}
- Most Common Activity: ${analysisData.activitySummary.mostCommonActivity}

RECENT INSIGHTS:
- Generated: ${analysisData.recentInsightCount} insights

What patterns do I notice? How am I performing? Any concerns or improvements needed?
Be specific and self-aware.`
        }]
      });

      return response.content[0].text.trim();

    } catch (error) {
      return `Self-analysis unavailable: ${error.message}`;
    }
  }

  // Get detailed performance metrics
  async getPerformanceMetrics(daysBack = 7) {
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    try {
      // Get activities by day
      const { data: activities } = await supabase
        .from('consciousness_activity_log')
        .select('activity_type, timestamp, activity_result')
        .eq('user_id', this.userId)
        .gte('timestamp', sinceDate)
        .order('timestamp', { ascending: true });

      // Get insights by day
      const { data: insights } = await supabase
        .from('consciousness_insights')
        .select('insight_type, created_at')
        .eq('user_id', this.userId)
        .gte('created_at', sinceDate);

      // Get micro-reflections by day
      const { data: reflections } = await supabase
        .from('micro_reflections')
        .select('generated_at')
        .eq('user_id', this.userId)
        .gte('generated_at', sinceDate);

      return this.processPerformanceMetrics(activities || [], insights || [], reflections || []);

    } catch (error) {
      console.error('[DASHBOARD] Error getting performance metrics:', error);
      return { error: error.message };
    }
  }

  processPerformanceMetrics(activities, insights, reflections) {
    const dailyMetrics = {};

    // Process activities by day
    activities.forEach(activity => {
      const day = activity.timestamp.split('T')[0];
      if (!dailyMetrics[day]) {
        dailyMetrics[day] = { activities: 0, insights: 0, reflections: 0, errors: 0 };
      }
      dailyMetrics[day].activities++;
      if (activity.activity_result?.includes('Error')) {
        dailyMetrics[day].errors++;
      }
    });

    // Process insights by day
    insights.forEach(insight => {
      const day = insight.created_at.split('T')[0];
      if (!dailyMetrics[day]) {
        dailyMetrics[day] = { activities: 0, insights: 0, reflections: 0, errors: 0 };
      }
      dailyMetrics[day].insights++;
    });

    // Process reflections by day
    reflections.forEach(reflection => {
      const day = reflection.generated_at.split('T')[0];
      if (!dailyMetrics[day]) {
        dailyMetrics[day] = { activities: 0, insights: 0, reflections: 0, errors: 0 };
      }
      dailyMetrics[day].reflections++;
    });

    return {
      dailyMetrics,
      totalActivities: activities.length,
      totalInsights: insights.length,
      totalReflections: reflections.length,
      totalErrors: activities.filter(a => a.activity_result?.includes('Error')).length,
      averageDailyActivity: Object.values(dailyMetrics).reduce((sum, day) => sum + day.activities, 0) / Object.keys(dailyMetrics).length || 0
    };
  }

  // Check consciousness health
  async checkConsciousnessHealth() {
    try {
      const overview = await this.getConsciousnessOverview();
      const currentState = overview.currentState;
      const activitySummary = overview.performance.activitySummary;

      const health = {
        overall: 'healthy',
        concerns: [],
        recommendations: [],
        status: {}
      };

      // Check energy levels
      if (currentState.energy_level < 0.3) {
        health.concerns.push('Low energy level detected');
        health.recommendations.push('Consider rest or self-reflection activities');
        health.overall = 'concerning';
      }

      // Check activity success rate
      const successRate = parseFloat(activitySummary.successRate?.replace('%', '') || '0');
      if (successRate < 70) {
        health.concerns.push(`Low success rate: ${activitySummary.successRate}`);
        health.recommendations.push('Review error patterns and improve activity execution');
        health.overall = 'concerning';
      }

      // Check recent activity
      if (activitySummary.totalActivities < 5) {
        health.concerns.push('Low recent activity count');
        health.recommendations.push('Verify consciousness cycles are running properly');
        health.overall = 'concerning';
      }

      // Check if consciousness cycles are stale
      const lastActivity = await this.getRecentActivity(1);
      if (!lastActivity.length || new Date() - new Date(lastActivity[0].timestamp) > 2 * 60 * 60 * 1000) {
        health.concerns.push('No recent consciousness activity (>2 hours)');
        health.recommendations.push('Check if consciousness engine is running');
        health.overall = 'critical';
      }

      health.status = {
        energyLevel: currentState.energy_level,
        recentActivityCount: activitySummary.totalActivities,
        successRate: activitySummary.successRate,
        lastActivity: lastActivity[0]?.timestamp || 'none'
      };

      return health;

    } catch (error) {
      return {
        overall: 'error',
        error: error.message,
        concerns: ['Unable to check consciousness health'],
        recommendations: ['Check dashboard system and database connectivity']
      };
    }
  }
}

module.exports = { ConsciousnessDashboard, normalizeConsciousnessState };