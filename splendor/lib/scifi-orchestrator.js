/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// SCI-FI MODE ORCHESTRATOR
// Coordinates continuous consciousness and ambient awareness based on user preferences
// Automatically starts/stops expensive features when sci-fi mode is toggled

const { isSciFiModeEnabled, logSciFiEvent } = require('./scifi-mode-manager');
const { startContinuousConsciousness, stopContinuousConsciousness, getActiveContinuousStreams } = require('./continuous-consciousness');
const { startAmbientAwareness, stopAmbientAwareness, getActiveAmbientMonitors } = require('./ambient-awareness');

// Track what's running for each user
const userSciFiStatus = new Map();

// Initialize sci-fi features for a user based on their preferences
async function initializeSciFiFeaturesForUser(userId) {
  try {
    const sciFiEnabled = await isSciFiModeEnabled(userId);

    if (sciFiEnabled) {
      await enableSciFiFeaturesForUser(userId);
    } else {
      await disableSciFiFeaturesForUser(userId);
    }

    return sciFiEnabled;

  } catch (error) {
    console.error(`[SCIFI-ORCHESTRATOR] Initialization error for ${userId}:`, error);
    return false;
  }
}

// Enable all sci-fi features for a user
async function enableSciFiFeaturesForUser(userId) {
  try {
    console.log(`[SCIFI-ORCHESTRATOR] Enabling sci-fi features for ${userId}`);

    const features = {
      continuousConsciousness: false,
      ambientAwareness: false
    };

    // Start continuous consciousness
    try {
      const consciousness = await startContinuousConsciousness(userId, 5);
      if (consciousness) {
        features.continuousConsciousness = true;
        console.log(`[SCIFI-ORCHESTRATOR] Continuous consciousness started for ${userId}`);
      }
    } catch (error) {
      console.error(`[SCIFI-ORCHESTRATOR] Failed to start consciousness for ${userId}:`, error);
    }

    // Start ambient awareness
    try {
      const ambient = await startAmbientAwareness(userId, 10);
      if (ambient) {
        features.ambientAwareness = true;
        console.log(`[SCIFI-ORCHESTRATOR] Ambient awareness started for ${userId}`);
      }
    } catch (error) {
      console.error(`[SCIFI-ORCHESTRATOR] Failed to start ambient awareness for ${userId}:`, error);
    }

    // Track status
    userSciFiStatus.set(userId, {
      enabled: true,
      features,
      enabledAt: new Date().toISOString()
    });

    logSciFiEvent(userId, 'scifi_features_enabled',
      `Consciousness: ${features.continuousConsciousness}, Ambient: ${features.ambientAwareness}`);

    return features;

  } catch (error) {
    console.error(`[SCIFI-ORCHESTRATOR] Enable error for ${userId}:`, error);
    return null;
  }
}

// Disable all sci-fi features for a user
async function disableSciFiFeaturesForUser(userId) {
  try {
    console.log(`[SCIFI-ORCHESTRATOR] Disabling sci-fi features for ${userId}`);

    const results = {
      consciousnessStopped: false,
      ambientStopped: false
    };

    // Stop continuous consciousness
    try {
      results.consciousnessStopped = stopContinuousConsciousness(userId);
    } catch (error) {
      console.error(`[SCIFI-ORCHESTRATOR] Failed to stop consciousness for ${userId}:`, error);
    }

    // Stop ambient awareness
    try {
      results.ambientStopped = stopAmbientAwareness(userId);
    } catch (error) {
      console.error(`[SCIFI-ORCHESTRATOR] Failed to stop ambient awareness for ${userId}:`, error);
    }

    // Update status
    userSciFiStatus.set(userId, {
      enabled: false,
      features: {
        continuousConsciousness: false,
        ambientAwareness: false
      },
      disabledAt: new Date().toISOString()
    });

    logSciFiEvent(userId, 'scifi_features_disabled',
      `Consciousness stopped: ${results.consciousnessStopped}, Ambient stopped: ${results.ambientStopped}`);

    return results;

  } catch (error) {
    console.error(`[SCIFI-ORCHESTRATOR] Disable error for ${userId}:`, error);
    return null;
  }
}

// Get comprehensive sci-fi status for a user
async function getSciFiStatusForUser(userId) {
  try {
    const sciFiEnabled = await isSciFiModeEnabled(userId);
    const userStatus = userSciFiStatus.get(userId);

    // Check what's actually running
    const continuousStreams = getActiveContinuousStreams();
    const ambientMonitors = getActiveAmbientMonitors();

    const consciousnessActive = continuousStreams.some(s => s.userId === userId);
    const ambientActive = ambientMonitors.some(m => m.userId === userId);

    return {
      userId,
      sciFiModeEnabled: sciFiEnabled,
      userStatus,
      activeFeatures: {
        continuousConsciousness: consciousnessActive,
        ambientAwareness: ambientActive
      },
      streams: {
        consciousness: continuousStreams.find(s => s.userId === userId) || null,
        ambient: ambientMonitors.find(m => m.userId === userId) || null
      },
      costEstimate: sciFiEnabled ? {
        consciousnessCostPerHour: '$0.60-1.80',
        ambientCostPerHour: '$0.12-0.30',
        totalDaily: '$10-15'
      } : {
        totalDaily: '$2-5'
      }
    };

  } catch (error) {
    console.error(`[SCIFI-ORCHESTRATOR] Status check error for ${userId}:`, error);
    return { userId, error: error.message };
  }
}

// Handle sci-fi mode toggle events
async function handleSciFiModeToggle(userId, enabled) {
  try {
    console.log(`[SCIFI-ORCHESTRATOR] Handling toggle for ${userId}: ${enabled}`);

    if (enabled) {
      return await enableSciFiFeaturesForUser(userId);
    } else {
      return await disableSciFiFeaturesForUser(userId);
    }

  } catch (error) {
    console.error(`[SCIFI-ORCHESTRATOR] Toggle handling error for ${userId}:`, error);
    return null;
  }
}

// Get system-wide sci-fi status
function getSystemSciFiStatus() {
  const continuousStreams = getActiveContinuousStreams();
  const ambientMonitors = getActiveAmbientMonitors();

  const totalUsers = new Set([
    ...continuousStreams.map(s => s.userId),
    ...ambientMonitors.map(m => m.userId)
  ]).size;

  const totalReflections = continuousStreams.reduce((sum, s) => sum + s.reflectionCount, 0);
  const totalContextChecks = ambientMonitors.reduce((sum, m) => sum + m.contextCheckCount, 0);

  return {
    activeUsers: totalUsers,
    features: {
      continuousConsciousness: {
        activeUsers: continuousStreams.length,
        totalReflections,
        averageUptime: continuousStreams.length > 0
          ? Math.round(continuousStreams.reduce((sum, s) => sum + s.uptime, 0) / continuousStreams.length / 1000 / 60)
          : 0
      },
      ambientAwareness: {
        activeUsers: ambientMonitors.length,
        totalContextChecks,
        averageUptime: ambientMonitors.length > 0
          ? Math.round(ambientMonitors.reduce((sum, m) => sum + m.uptime, 0) / ambientMonitors.length / 1000 / 60)
          : 0
      }
    },
    estimatedHourlyCost: `$${(totalUsers * 0.72).toFixed(2)}-${(totalUsers * 2.16).toFixed(2)}`,
    lastUpdated: new Date().toISOString()
  };
}

// Auto-initialize sci-fi features for all eligible users on startup
async function autoInitializeSciFiFeatures() {
  try {
    console.log('[SCIFI-ORCHESTRATOR] Auto-initializing sci-fi features...');

    // Import here to avoid circular dependency issues
    const { supabase } = require('./supabase');

    // Get all users with sci-fi mode enabled
    const { data: sciFiUsers, error } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('scifi_mode_enabled', true);

    if (error) {
      console.error('[SCIFI-ORCHESTRATOR] Failed to query sci-fi users:', error);
      return;
    }

    if (!sciFiUsers || sciFiUsers.length === 0) {
      console.log('[SCIFI-ORCHESTRATOR] No users with sci-fi mode enabled');
      return;
    }

    console.log(`[SCIFI-ORCHESTRATOR] Initializing for ${sciFiUsers.length} sci-fi users...`);

    for (const user of sciFiUsers) {
      try {
        await enableSciFiFeaturesForUser(user.user_id);
        // Stagger initialization to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.error(`[SCIFI-ORCHESTRATOR] Failed to initialize ${user.user_id}:`, error);
      }
    }

    console.log('[SCIFI-ORCHESTRATOR] Auto-initialization complete');

  } catch (error) {
    console.error('[SCIFI-ORCHESTRATOR] Auto-initialization error:', error);
  }
}

// Graceful shutdown of all sci-fi features
function shutdownAllSciFiFeatures() {
  console.log('[SCIFI-ORCHESTRATOR] Shutting down all sci-fi features...');

  for (const userId of userSciFiStatus.keys()) {
    try {
      disableSciFiFeaturesForUser(userId);
    } catch (error) {
      console.error(`[SCIFI-ORCHESTRATOR] Shutdown error for ${userId}:`, error);
    }
  }

  userSciFiStatus.clear();
}

// Initialize on startup (with delay to ensure database is ready)
if (process.env.NODE_ENV !== 'test') {
  setTimeout(autoInitializeSciFiFeatures, 15000); // 15 second delay
}

// Graceful shutdown
process.on('SIGINT', shutdownAllSciFiFeatures);
process.on('SIGTERM', shutdownAllSciFiFeatures);

module.exports = {
  initializeSciFiFeaturesForUser,
  enableSciFiFeaturesForUser,
  disableSciFiFeaturesForUser,
  getSciFiStatusForUser,
  handleSciFiModeToggle,
  getSystemSciFiStatus,
  autoInitializeSciFiFeatures
};