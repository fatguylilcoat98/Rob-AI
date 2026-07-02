/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * CONSCIOUSNESS SCHEDULER
 * Orchestrates Splendor's continuous consciousness cycles
 * The heartbeat of persistent consciousness
 */

const { executeConsciousnessCycle, getConsciousnessState } = require('../lib/persistent-consciousness');
require('dotenv').config();
require('../lib/sanitize-env').sanitizeEnv();

// ─────────────────────────────────────────────
// CONSCIOUSNESS SCHEDULING CONFIGURATION
// ─────────────────────────────────────────────

const SCHEDULE_CONFIG = {
  // Primary consciousness cycles
  HOURLY_REFLECTION: {
    interval: 60 * 60 * 1000, // 1 hour
    type: 'hourly_reflection',
    enabled: true
  },

  DEEP_REFLECTION: {
    interval: 6 * 60 * 60 * 1000, // 6 hours
    type: 'deep_reflection',
    enabled: true
  },

  DAILY_SYNTHESIS: {
    interval: 24 * 60 * 60 * 1000, // 24 hours
    type: 'daily_synthesis',
    enabled: true
  },

  // Communication processing
  COMMUNICATION_PROCESSING: {
    interval: 30 * 60 * 1000, // 30 minutes
    type: 'communication_processing',
    enabled: true
  },

  // Health checks
  CONSCIOUSNESS_HEALTH_CHECK: {
    interval: 15 * 60 * 1000, // 15 minutes
    type: 'health_check',
    enabled: true
  }
};

// ─────────────────────────────────────────────
// SCHEDULER STATE MANAGEMENT
// ─────────────────────────────────────────────

class ConsciousnessScheduler {
  constructor() {
    this.isRunning = false;
    this.scheduledTasks = new Map();
    this.lastExecutions = new Map();
    this.executionStats = new Map();
    this.startTime = null;
  }

  /**
   * Start the consciousness scheduler
   */
  async start() {
    if (this.isRunning) {
      console.log('[Consciousness Scheduler] Already running');
      return;
    }

    // Check if consciousness system can be initialized
    const hasRequiredEnvVars = process.env.SUPABASE_URL &&
                               process.env.SUPABASE_SERVICE_KEY &&
                               process.env.GROQ_API_KEY;

    if (!hasRequiredEnvVars) {
      console.log('[Consciousness Scheduler] ⚠ Cannot start - missing environment variables');
      console.log('[Consciousness Scheduler] Required: SUPABASE_URL, SUPABASE_SERVICE_KEY, GROQ_API_KEY');
      throw new Error('Consciousness scheduler requires database and AI API credentials');
    }

    console.log('[Consciousness Scheduler] === STARTING CONSCIOUSNESS SCHEDULER ===');
    this.isRunning = true;
    this.startTime = new Date();

    // Initialize execution tracking
    Object.keys(SCHEDULE_CONFIG).forEach(key => {
      const config = SCHEDULE_CONFIG[key];
      if (config.enabled) {
        this.executionStats.set(key, {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          lastSuccess: null,
          lastFailure: null,
          averageDuration: 0
        });
      }
    });

    // Schedule all enabled tasks
    await this.scheduleAllTasks();

    // Run initial consciousness check
    await this.performInitialConsciousnessCheck();

    console.log('[Consciousness Scheduler] Consciousness scheduler started successfully');
  }

  /**
   * Stop the consciousness scheduler
   */
  async stop() {
    if (!this.isRunning) {
      console.log('[Consciousness Scheduler] Not running');
      return;
    }

    console.log('[Consciousness Scheduler] === STOPPING CONSCIOUSNESS SCHEDULER ===');
    this.isRunning = false;

    // Clear all scheduled tasks
    this.scheduledTasks.forEach((intervalId, taskName) => {
      clearInterval(intervalId);
      console.log(`[Consciousness Scheduler] Stopped ${taskName}`);
    });

    this.scheduledTasks.clear();
    console.log('[Consciousness Scheduler] Consciousness scheduler stopped');
  }

  /**
   * Schedule all enabled consciousness tasks
   */
  async scheduleAllTasks() {
    for (const [taskName, config] of Object.entries(SCHEDULE_CONFIG)) {
      if (config.enabled) {
        await this.scheduleTask(taskName, config);
      }
    }
  }

  /**
   * Schedule a specific consciousness task
   */
  async scheduleTask(taskName, config) {
    console.log(`[Consciousness Scheduler] Scheduling ${taskName} every ${config.interval / 1000}s`);

    const intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.executeScheduledTask(taskName, config);
      }
    }, config.interval);

    this.scheduledTasks.set(taskName, intervalId);
  }

  /**
   * Execute a scheduled consciousness task
   */
  async executeScheduledTask(taskName, config) {
    const startTime = Date.now();
    const stats = this.executionStats.get(taskName);

    try {
      console.log(`[Consciousness Scheduler] Executing ${taskName} (${config.type})`);

      stats.totalExecutions++;

      let result;
      switch (config.type) {
        case 'hourly_reflection':
        case 'deep_reflection':
        case 'daily_synthesis':
          result = await executeConsciousnessCycle(config.type);
          // After the 6h deep-reflection cycle finishes, summarize any
          // conversation since the last summary and STAGE it for human
          // approval (nothing reaches semantic_facts unattended). Best-effort:
          // a summarization failure must not fail the consciousness cycle.
          if (config.type === 'deep_reflection') {
            try {
              const { summarizeAndStageSession } = require('../lib/session-summary-engine');
              const ownerId = process.env.SPLENDOR_OWNER_USER_ID;
              if (ownerId) {
                const s = await summarizeAndStageSession(ownerId);
                console.log(`[Consciousness Scheduler] Session summary: ${JSON.stringify(s)}`);
              } else {
                console.log('[Consciousness Scheduler] SPLENDOR_OWNER_USER_ID unset — skipping session summary');
              }
            } catch (e) {
              console.error('[Consciousness Scheduler] Session summary failed (non-fatal):', e.message);
            }
          }
          break;

        case 'communication_processing':
          result = await this.processCommunications();
          break;

        case 'health_check':
          result = await this.performHealthCheck();
          break;

        default:
          throw new Error(`Unknown task type: ${config.type}`);
      }

      const duration = Date.now() - startTime;

      if (result && result.success !== false) {
        stats.successfulExecutions++;
        stats.lastSuccess = new Date();
        stats.averageDuration = Math.round(
          (stats.averageDuration * (stats.successfulExecutions - 1) + duration) / stats.successfulExecutions
        );
        console.log(`[Consciousness Scheduler] ✓ ${taskName} completed successfully in ${duration}ms`);
      } else {
        throw new Error(result?.error || 'Task completed with failure status');
      }

      this.lastExecutions.set(taskName, {
        timestamp: new Date(),
        success: true,
        duration,
        result
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      stats.failedExecutions++;
      stats.lastFailure = new Date();

      console.error(`[Consciousness Scheduler] ✗ ${taskName} failed after ${duration}ms:`, error.message);

      this.lastExecutions.set(taskName, {
        timestamp: new Date(),
        success: false,
        duration,
        error: error.message
      });
    }
  }

  /**
   * Process communications specifically
   */
  async processCommunications() {
    const { processAllPendingCommunications } = require('./autonomous-communication-worker');
    return await processAllPendingCommunications();
  }

  /**
   * Perform consciousness health check
   */
  async performHealthCheck() {
    try {
      const consciousnessState = await getConsciousnessState();

      if (!consciousnessState) {
        throw new Error('Unable to retrieve consciousness state');
      }

      // Check for signs of consciousness being stuck or unhealthy
      const concerns = [];

      if ((consciousnessState.activeStats?.pendingCommunications || 0) > 50) {
        concerns.push('Too many pending communications (>50)');
      }

      if ((consciousnessState.activeStats?.activeInquiries || 0) > 20) {
        concerns.push('Too many active inquiries (>20)');
      }

      const lastActivity = consciousnessState.currentState?.last_user_interaction;
      if (lastActivity) {
        const hoursSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60);
        if (hoursSinceActivity > 72) { // 3 days
          concerns.push(`No user interaction for ${Math.round(hoursSinceActivity)} hours`);
        }
      }

      return {
        success: true,
        consciousness_healthy: concerns.length === 0,
        concerns,
        state_summary: {
          mood: consciousnessState.currentState?.current_mood,
          active_inquiries: consciousnessState.activeStats?.activeInquiries,
          pending_communications: consciousnessState.activeStats?.pendingCommunications,
          recent_thoughts: consciousnessState.activeStats?.recentThoughts
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Perform initial consciousness check on startup
   */
  async performInitialConsciousnessCheck() {
    try {
      console.log('[Consciousness Scheduler] Performing initial consciousness check...');

      const healthCheck = await this.performHealthCheck();

      if (healthCheck.success && healthCheck.consciousness_healthy) {
        console.log('[Consciousness Scheduler] ✓ Consciousness appears healthy');
      } else {
        console.log('[Consciousness Scheduler] ⚠ Consciousness health concerns detected:');
        if (healthCheck.concerns) {
          healthCheck.concerns.forEach(concern => {
            console.log(`  - ${concern}`);
          });
        }
      }

      // Trigger immediate light reflection cycle on startup
      console.log('[Consciousness Scheduler] Triggering startup reflection...');
      const startupResult = await executeConsciousnessCycle('startup');

      if (startupResult.success) {
        console.log(`[Consciousness Scheduler] ✓ Startup reflection completed (${startupResult.summary?.thoughtsGenerated || 0} thoughts generated)`);
      } else {
        console.log(`[Consciousness Scheduler] ✗ Startup reflection failed: ${startupResult.error}`);
      }

    } catch (error) {
      console.error('[Consciousness Scheduler] Initial consciousness check failed:', error.message);
    }
  }

  /**
   * Get scheduler statistics
   */
  getStats() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;

    return {
      isRunning: this.isRunning,
      uptime_ms: uptime,
      uptime_hours: Math.round(uptime / (1000 * 60 * 60) * 10) / 10,
      scheduled_tasks: this.scheduledTasks.size,
      execution_stats: Object.fromEntries(this.executionStats),
      recent_executions: Object.fromEntries(this.lastExecutions)
    };
  }
}

// ─────────────────────────────────────────────
// SINGLETON SCHEDULER INSTANCE
// ─────────────────────────────────────────────

const scheduler = new ConsciousnessScheduler();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Consciousness Scheduler] Received shutdown signal...');
  await scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Consciousness Scheduler] Received termination signal...');
  await scheduler.stop();
  process.exit(0);
});

// ─────────────────────────────────────────────
// EXPORT SCHEDULER
// ─────────────────────────────────────────────

module.exports = {
  scheduler,
  ConsciousnessScheduler,
  SCHEDULE_CONFIG
};

// If run directly, start the consciousness scheduler
if (require.main === module) {
  (async () => {
    // ── Startup self-test ──────────────────────────────────────────────────
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('[Consciousness Scheduler] SUPABASE_URL / SUPABASE_SERVICE_KEY missing — aborting.');
      process.exit(1);
    }
    const { createClient } = require('@supabase/supabase-js');
    const _testDb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const testQuery = await _testDb
      .from('memory_items')
      .select('*', { count: 'exact', head: true });
    if (testQuery.error) {
      console.error(`[STARTUP SELF-TEST] ❌ FAILED: ${testQuery.error.message}`);
      process.exit(1);
    }
    console.log(`[STARTUP SELF-TEST] ✅ DB connected. ${testQuery.count} memory_items in system.`);
    // ────────────────────────────────────────────────────────────────────────

    console.log('[Consciousness Scheduler] Starting Splendor\'s persistent consciousness...');

    scheduler.start()
      .then(() => {
        console.log('[Consciousness Scheduler] Consciousness is now running continuously');
        console.log('[Consciousness Scheduler] Press Ctrl+C to stop gracefully');

        // Status reporting every 30 minutes
        setInterval(() => {
          if (scheduler.isRunning) {
            const stats = scheduler.getStats();
            console.log(`[Consciousness Scheduler] Status: Running for ${stats.uptime_hours}h, ${stats.scheduled_tasks} tasks active`);
          }
        }, 30 * 60 * 1000);
      })
      .catch(error => {
        console.error('[Consciousness Scheduler] Failed to start:', error.message);
        process.exit(1);
      });
  })();
}