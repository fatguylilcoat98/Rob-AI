/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// REALITY CONTEXT SYSTEM
// Provides Splendor with constant awareness of time, date, location, and environmental context
// Anchors all conversations and memories to actual reality

// Reality context state
let realityContext = {
  time: null,
  date: null,
  timezone: null,
  location: null,
  weather: null,
  lastUpdated: null
};

let locationPermissionGranted = false;
let weatherApiKey = null; // Will use environment variable

// Initialize reality context system
async function initializeRealityContext() {
  try {
    console.log('[REALITY] Initializing reality context system...');

    // Start time/date tracking
    updateTimeContext();
    setInterval(updateTimeContext, 1000); // Update every second

    // Request location permission
    await requestLocationAccess();

    // Update weather context
    await updateWeatherContext();
    setInterval(updateWeatherContext, 10 * 60 * 1000); // Update every 10 minutes

    console.log('[REALITY] Reality context system initialized');
    return true;

  } catch (error) {
    console.error('[REALITY] Initialization error:', error);
    return false;
  }
}

// Update time and date context
function updateTimeContext() {
  const now = new Date();

  realityContext.time = {
    hours: now.getHours(),
    minutes: now.getMinutes(),
    seconds: now.getSeconds(),
    formatted12: now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }),
    formatted24: now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }),
    iso: now.toISOString()
  };

  realityContext.date = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    dayOfWeek: now.getDay(),
    dayName: now.toLocaleDateString('en-US', { weekday: 'long' }),
    monthName: now.toLocaleDateString('en-US', { month: 'long' }),
    formatted: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    iso: now.toISOString().split('T')[0]
  };

  realityContext.timezone = {
    name: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offset: -now.getTimezoneOffset(),
    offsetString: formatTimezoneOffset(-now.getTimezoneOffset())
  };

  realityContext.lastUpdated = now.toISOString();

  // Update UI clock
  updateClockDisplay();
}

// Format timezone offset
function formatTimezoneOffset(offsetMinutes) {
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Request location access
async function requestLocationAccess() {
  try {
    if (!navigator.geolocation) {
      console.log('[REALITY] Geolocation not supported');
      return false;
    }

    // Check if we already have permission
    if ('permissions' in navigator) {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (permission.state === 'granted') {
        locationPermissionGranted = true;
        await updateLocationContext();
        return true;
      }
    }

    // Request location
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          locationPermissionGranted = true;
          await updateLocationContext(position);
          resolve(true);
        },
        (error) => {
          console.log('[REALITY] Location permission denied or unavailable:', error.message);
          realityContext.location = {
            available: false,
            error: error.message,
            fallback: 'Location access denied'
          };
          resolve(false);
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    });

  } catch (error) {
    console.error('[REALITY] Location access error:', error);
    return false;
  }
}

// Update location context
async function updateLocationContext(position = null) {
  try {
    if (!locationPermissionGranted) {
      return false;
    }

    if (!position) {
      // Get fresh position
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await updateLocationContext(pos);
            resolve(true);
          },
          (error) => {
            console.error('[REALITY] Location update error:', error);
            resolve(false);
          }
        );
      });
    }

    const { latitude, longitude } = position.coords;

    realityContext.location = {
      available: true,
      coordinates: {
        latitude,
        longitude,
        accuracy: position.coords.accuracy
      },
      timestamp: position.timestamp,
      // Would add reverse geocoding here with a geocoding API
      city: 'Unknown',
      state: 'Unknown',
      country: 'Unknown'
    };

    console.log('[REALITY] Location updated:', realityContext.location);
    return true;

  } catch (error) {
    console.error('[REALITY] Location context update error:', error);
    return false;
  }
}

// Update weather context
async function updateWeatherContext() {
  try {
    if (!realityContext.location?.available) {
      realityContext.weather = {
        available: false,
        error: 'Location required for weather'
      };
      return false;
    }

    // Would integrate with weather API here
    // For now, placeholder
    realityContext.weather = {
      available: false,
      placeholder: true,
      message: 'Weather API not configured'
    };

    return true;

  } catch (error) {
    console.error('[REALITY] Weather context update error:', error);
    realityContext.weather = {
      available: false,
      error: error.message
    };
    return false;
  }
}

// Update clock display in UI
function updateClockDisplay() {
  const clockElement = document.getElementById('realityClock');
  const dateElement = document.getElementById('realityDate');

  if (clockElement && realityContext.time) {
    clockElement.textContent = realityContext.time.formatted12;
  }

  if (dateElement && realityContext.date) {
    dateElement.textContent = realityContext.date.formatted;
  }
}

// Get complete reality context for AI conversations
function getRealityContext() {
  return {
    ...realityContext,
    contextString: buildContextString(),
    timestamp: new Date().toISOString()
  };
}

// Build human-readable context string for AI
function buildContextString() {
  const time = realityContext.time;
  const date = realityContext.date;
  const location = realityContext.location;
  const timezone = realityContext.timezone;

  let context = '';

  if (time && date) {
    context += `Current time: ${time.formatted12} on ${date.formatted}`;

    if (timezone) {
      context += ` (${timezone.name}, UTC${timezone.offsetString})`;
    }
  }

  if (location?.available) {
    context += `. Location: ${location.city}, ${location.state}`;
  } else if (location?.fallback) {
    context += `. Location: ${location.fallback}`;
  }

  // Add time-of-day context
  if (time) {
    const hour = time.hours;
    if (hour >= 5 && hour < 12) {
      context += '. Time of day: Morning';
    } else if (hour >= 12 && hour < 17) {
      context += '. Time of day: Afternoon';
    } else if (hour >= 17 && hour < 21) {
      context += '. Time of day: Evening';
    } else {
      context += '. Time of day: Night';
    }
  }

  return context;
}

// Get reality context for memory storage
function getRealityContextForMemory() {
  return {
    timestamp: realityContext.lastUpdated,
    time: realityContext.time,
    date: realityContext.date,
    timezone: realityContext.timezone,
    location: realityContext.location,
    contextString: buildContextString()
  };
}

// Initialize on module load
if (typeof window !== 'undefined') {
  // Browser environment
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRealityContext);
  } else {
    initializeRealityContext();
  }
}

module.exports = {
  initializeRealityContext,
  getRealityContext,
  getRealityContextForMemory,
  updateTimeContext,
  requestLocationAccess,
  realityContext
};