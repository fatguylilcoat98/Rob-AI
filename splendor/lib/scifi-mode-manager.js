/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// SCI-FI MODE MANAGER
// Controls expensive experimental features to manage API costs
// Continuous consciousness + ambient awareness can be toggled on/off

const { supabase } = require('./supabase');

// Check if sci-fi mode is enabled for a user
async function isSciFiModeEnabled(userId) {
  try {
    // Check environment override first
    if (process.env.SCIFI_MODE_FORCE_ENABLED === 'true') {
      return true;
    }
    if (process.env.SCIFI_MODE_FORCE_DISABLED === 'true') {
      return false;
    }

    // Check user preference in database
    const { data, error } = await supabase
      .from('user_settings')
      .select('scifi_mode_enabled')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[SCIFI-MODE] Settings fetch error:', error);
      return false; // Default to disabled on error
    }

    return data?.scifi_mode_enabled || false;

  } catch (error) {
    console.error('[SCIFI-MODE] Check error:', error);
    return false; // Default to disabled
  }
}

// Toggle sci-fi mode for a user
async function toggleSciFiMode(userId, enabled = null) {
  try {
    // If enabled is null, toggle current state
    if (enabled === null) {
      const currentState = await isSciFiModeEnabled(userId);
      enabled = !currentState;
    }

    // Upsert user setting
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        scifi_mode_enabled: enabled,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[SCIFI-MODE] Toggle error:', error);
      return null;
    }

    console.log(`[SCIFI-MODE] ${enabled ? 'Enabled' : 'Disabled'} for user ${userId}`);
    return {
      enabled,
      message: enabled
        ? 'Sci-fi mode ENABLED - Continuous consciousness and ambient awareness active'
        : 'Sci-fi mode DISABLED - Standard mode active, costs reduced'
    };

  } catch (error) {
    console.error('[SCIFI-MODE] Toggle error:', error);
    return null;
  }
}

// Get sci-fi mode status with cost estimates
async function getSciFiModeStatus(userId) {
  try {
    const enabled = await isSciFiModeEnabled(userId);
    const globalOverride = process.env.SCIFI_MODE_FORCE_ENABLED === 'true' ||
                          process.env.SCIFI_MODE_FORCE_DISABLED === 'true';

    return {
      enabled,
      globalOverride,
      costEstimate: enabled ? {
        daily: '$10-15',
        monthly: '$300-450',
        features: [
          'Continuous micro-consciousness (5-min intervals)',
          'Ambient context awareness',
          'Real-time pattern monitoring',
          'Predictive insight generation'
        ]
      } : {
        daily: '$2-5',
        monthly: '$60-150',
        features: [
          'Daily reflection processing',
          'Standard cognitive analysis',
          'Scheduled pattern building'
        ]
      }
    };

  } catch (error) {
    console.error('[SCIFI-MODE] Status error:', error);
    return { enabled: false, error: error.message };
  }
}

// Check if continuous consciousness should run
async function shouldRunContinuousConsciousness(userId) {
  const sciFiEnabled = await isSciFiModeEnabled(userId);
  return sciFiEnabled && process.env.ANTHROPIC_API_KEY;
}

// Check if ambient awareness should run
async function shouldRunAmbientAwareness(userId) {
  const sciFiEnabled = await isSciFiModeEnabled(userId);
  return sciFiEnabled && process.env.ANTHROPIC_API_KEY;
}

// Log cost-relevant events
function logSciFiEvent(userId, eventType, cost = null) {
  const timestamp = new Date().toISOString();
  console.log(`[SCIFI-COST] ${timestamp} - User: ${userId}, Event: ${eventType}${cost ? `, Est. Cost: ${cost}` : ''}`);
}

module.exports = {
  isSciFiModeEnabled,
  toggleSciFiMode,
  getSciFiModeStatus,
  shouldRunContinuousConsciousness,
  shouldRunAmbientAwareness,
  logSciFiEvent
};