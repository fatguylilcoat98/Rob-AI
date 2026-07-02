/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// AMBIENT AWARENESS SYSTEM
// Contextual awareness without being told - calendar, weather, email, system monitoring
// Only runs when sci-fi mode is enabled

const { shouldRunAmbientAwareness, logSciFiEvent } = require('./scifi-mode-manager');
const { supabase } = require('./supabase');

// Active ambient monitoring per user
const ambientMonitors = new Map();

// Start ambient awareness for a user
async function startAmbientAwareness(userId, checkIntervalMinutes = 10) {
  try {
    // Check if sci-fi mode is enabled
    const shouldRun = await shouldRunAmbientAwareness(userId);
    if (!shouldRun) {
      console.log(`[AMBIENT] Skipping for ${userId} - sci-fi mode disabled`);
      return null;
    }

    // Don't start if already running
    if (ambientMonitors.has(userId)) {
      console.log(`[AMBIENT] Already monitoring for ${userId}`);
      return ambientMonitors.get(userId);
    }

    console.log(`[AMBIENT] Starting ambient awareness for ${userId} (${checkIntervalMinutes}min checks)`);
    logSciFiEvent(userId, 'ambient_awareness_started');

    const intervalId = setInterval(async () => {
      await performAmbientCheck(userId);
    }, checkIntervalMinutes * 60 * 1000);

    const monitorInfo = {
      userId,
      intervalId,
      checkIntervalMinutes,
      startedAt: new Date().toISOString(),
      contextCheckCount: 0,
      lastContext: null
    };

    ambientMonitors.set(userId, monitorInfo);

    // Perform initial context check
    await performAmbientCheck(userId);

    return monitorInfo;

  } catch (error) {
    console.error(`[AMBIENT] Start error for ${userId}:`, error);
    return null;
  }
}

// Stop ambient awareness for a user
function stopAmbientAwareness(userId) {
  const monitor = ambientMonitors.get(userId);
  if (!monitor) {
    console.log(`[AMBIENT] No active monitor for ${userId}`);
    return false;
  }

  clearInterval(monitor.intervalId);
  ambientMonitors.delete(userId);

  console.log(`[AMBIENT] Stopped ambient awareness for ${userId} (${monitor.contextCheckCount} checks)`);
  logSciFiEvent(userId, 'ambient_awareness_stopped', `${monitor.contextCheckCount} context checks`);

  return true;
}

// Perform ambient context check
async function performAmbientCheck(userId) {
  try {
    // Double-check sci-fi mode is still enabled
    const shouldRun = await shouldRunAmbientAwareness(userId);
    if (!shouldRun) {
      console.log(`[AMBIENT] Stopping ambient check - sci-fi mode disabled for ${userId}`);
      stopAmbientAwareness(userId);
      return null;
    }

    console.log(`[AMBIENT] Context check for ${userId}...`);

    // Gather ambient context from various sources
    const context = await gatherAmbientContext(userId);

    // Check if context has changed significantly
    const monitor = ambientMonitors.get(userId);
    if (monitor && hasSignificantChange(context, monitor.lastContext)) {

      // Store ambient context insight
      await storeAmbientInsight(userId, context);

      monitor.lastContext = context;
      logSciFiEvent(userId, 'ambient_context_detected', '$0.02-0.05');
    }

    // Update check counter
    if (monitor) {
      monitor.contextCheckCount++;
    }

    return context;

  } catch (error) {
    console.error(`[AMBIENT] Context check error for ${userId}:`, error);
    logSciFiEvent(userId, 'ambient_check_error', error.message);
    return null;
  }
}

// Gather context from multiple ambient sources
async function gatherAmbientContext(userId) {
  const context = {
    timestamp: new Date().toISOString(),
    sources: {}
  };

  try {
    // Time-based context (always available)
    context.sources.temporal = getTemporalContext();

    // Weather context (if API available)
    if (process.env.WEATHER_API_KEY) {
      context.sources.weather = await getWeatherContext(userId);
    }

    // Calendar context (if Google Calendar configured)
    if (process.env.GOOGLE_CALENDAR_ENABLED === 'true') {
      context.sources.calendar = await getCalendarContext(userId);
    }

    // Email context (if email monitoring enabled)
    if (process.env.EMAIL_MONITORING_ENABLED === 'true') {
      context.sources.email = await getEmailContext(userId);
    }

    // System context (lightweight local monitoring)
    context.sources.system = getSystemContext();

    // News/events context (if news API available)
    if (process.env.NEWS_API_KEY) {
      context.sources.news = await getNewsContext();
    }

    return context;

  } catch (error) {
    console.error('[AMBIENT] Context gathering error:', error);
    return context;
  }
}

// Get temporal/time-based context
function getTemporalContext() {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  return {
    hour,
    dayOfWeek,
    timeOfDay: getTimeOfDay(hour),
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    date: now.toISOString().split('T')[0]
  };
}

// Get time of day context
function getTimeOfDay(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// Get weather context (placeholder - would integrate with weather API)
async function getWeatherContext(userId) {
  try {
    // This would integrate with a weather API like OpenWeatherMap
    // For now, return placeholder
    return {
      condition: 'unknown',
      temperature: null,
      description: 'Weather monitoring not configured'
    };
  } catch (error) {
    return { error: 'Weather API unavailable' };
  }
}

// Get calendar context (placeholder - would integrate with Google Calendar)
async function getCalendarContext(userId) {
  try {
    // This would integrate with Google Calendar API
    // For now, return placeholder
    return {
      upcomingEvents: [],
      currentEvent: null,
      description: 'Calendar monitoring not configured'
    };
  } catch (error) {
    return { error: 'Calendar API unavailable' };
  }
}

// Get email context (placeholder - would monitor email for significant events)
async function getEmailContext(userId) {
  try {
    // This would integrate with Gmail API or other email service
    // For now, return placeholder
    return {
      unreadCount: 0,
      recentImportant: [],
      description: 'Email monitoring not configured'
    };
  } catch (error) {
    return { error: 'Email monitoring unavailable' };
  }
}

// Get system context (local system monitoring)
function getSystemContext() {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();

  return {
    nodeUptime: Math.floor(uptime / 60), // minutes
    memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    timestamp: new Date().toISOString()
  };
}

// Get news/events context (placeholder - would integrate with news API)
async function getNewsContext() {
  try {
    // This would integrate with a news API
    // For now, return placeholder
    return {
      headlines: [],
      description: 'News monitoring not configured'
    };
  } catch (error) {
    return { error: 'News API unavailable' };
  }
}

// Check if context has changed significantly
function hasSignificantChange(newContext, oldContext) {
  if (!oldContext) return true;

  // Check if hour changed (time passage)
  if (newContext.sources.temporal?.hour !== oldContext.sources.temporal?.hour) {
    return true;
  }

  // Check if weather changed significantly
  if (newContext.sources.weather?.condition !== oldContext.sources.weather?.condition) {
    return true;
  }

  // Check if calendar events changed
  if (newContext.sources.calendar?.currentEvent !== oldContext.sources.calendar?.currentEvent) {
    return true;
  }

  // Add more significance checks as needed
  return false;
}

// Store ambient insight when context changes
async function storeAmbientInsight(userId, context) {
  try {
    const insight = generateContextInsight(context);

    const { error } = await supabase
      .from('internal_thoughts')
      .insert({
        user_id: userId,
        thought_content: insight,
        thought_type: 'ambient_context',
        source: 'ambient'
      });

    if (error) {
      console.error('[AMBIENT] Insight storage error:', error);
    } else {
      console.log(`[AMBIENT] Context insight stored for ${userId}`);
    }

  } catch (error) {
    console.error('[AMBIENT] Insight storage error:', error);
  }
}

// Generate insight from context
function generateContextInsight(context) {
  const temporal = context.sources.temporal;
  const system = context.sources.system;

  let insight = `Context at ${temporal.timeOfDay}`;

  if (temporal.isWeekend) {
    insight += ' on weekend';
  }

  if (system.nodeUptime > 60) {
    insight += `, system stable (${Math.floor(system.nodeUptime / 60)}h uptime)`;
  }

  // Add more context-based insights as available sources expand

  return insight;
}

// Get active ambient monitors
function getActiveAmbientMonitors() {
  const monitors = [];
  for (const [userId, monitor] of ambientMonitors.entries()) {
    monitors.push({
      userId,
      checkIntervalMinutes: monitor.checkIntervalMinutes,
      startedAt: monitor.startedAt,
      contextCheckCount: monitor.contextCheckCount,
      uptime: Date.now() - new Date(monitor.startedAt).getTime(),
      lastContext: monitor.lastContext?.sources || null
    });
  }
  return monitors;
}

// Auto-start ambient awareness for users with sci-fi mode enabled
async function autoStartAmbientAwareness() {
  try {
    // Get users with sci-fi mode enabled
    const { data: sciFiUsers } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('scifi_mode_enabled', true);

    if (!sciFiUsers || sciFiUsers.length === 0) {
      console.log('[AMBIENT] No users with sci-fi mode enabled');
      return;
    }

    console.log(`[AMBIENT] Auto-starting for ${sciFiUsers.length} sci-fi mode users`);

    for (const user of sciFiUsers) {
      if (!ambientMonitors.has(user.user_id)) {
        await startAmbientAwareness(user.user_id, 10);
        // Stagger starts
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

  } catch (error) {
    console.error('[AMBIENT] Auto-start error:', error);
  }
}

// Cleanup function for graceful shutdown
function shutdownAmbientAwareness() {
  console.log('[AMBIENT] Shutting down all ambient monitors...');
  for (const userId of ambientMonitors.keys()) {
    stopAmbientAwareness(userId);
  }
}

// Auto-start on module load
if (process.env.NODE_ENV !== 'test') {
  setTimeout(autoStartAmbientAwareness, 10000); // Wait 10 seconds after startup
}

// Graceful shutdown
process.on('SIGINT', shutdownAmbientAwareness);
process.on('SIGTERM', shutdownAmbientAwareness);

module.exports = {
  startAmbientAwareness,
  stopAmbientAwareness,
  performAmbientCheck,
  gatherAmbientContext,
  getActiveAmbientMonitors,
  autoStartAmbientAwareness
};