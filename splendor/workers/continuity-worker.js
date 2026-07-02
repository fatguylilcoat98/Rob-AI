/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  CONTINUITY ENGINE WORKER
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

  Background worker for 8-Question Continuity Engine
  Runs every 30 minutes with full system awareness
*/

const { ContinuityEngine } = require('../lib/continuity-engine');
require('dotenv').config();
require('../lib/sanitize-env').sanitizeEnv();

// ============================================================================
// CONTINUITY ENGINE WORKER - 8-Question Cycle System
// ============================================================================

const { continuityEngine } = require('../lib/continuity-engine');

class ContinuityWorker {
  constructor() {
    this.startTime = null;
    this.shouldRestart = true;
    this.restartDelay = 30000; // 30 seconds
  }

  async start() {
    console.log('[CONTINUITY WORKER] 🚀 Starting 8-Question Continuity Engine Worker...');
    this.startTime = new Date();
    this.shouldRestart = true;

    try {
      // Start the continuity engine
      await continuityEngine.start();

      console.log('[CONTINUITY WORKER] ✅ Continuity Engine started successfully');
      console.log('[CONTINUITY WORKER] ⏰ Running 8-question cycles every 30 minutes');

      // Monitor engine health
      this.startHealthMonitor();

    } catch (error) {
      console.error('[CONTINUITY WORKER] ❌ Failed to start Continuity Engine:', error);

      if (this.shouldRestart) {
        console.log(`[CONTINUITY WORKER] 🔄 Attempting restart in ${this.restartDelay / 1000}s...`);
        setTimeout(() => {
          if (this.shouldRestart) {
            this.start();
          }
        }, this.restartDelay);
      }
    }
  }

  async stop() {
    console.log('[CONTINUITY WORKER] 🛑 Stopping Continuity Engine Worker...');
    this.shouldRestart = false;

    if (this.healthMonitor) {
      clearInterval(this.healthMonitor);
      this.healthMonitor = null;
    }

    try {
      await continuityEngine.stop();
      console.log('[CONTINUITY WORKER] ✅ Continuity Engine stopped gracefully');
    } catch (error) {
      console.error('[CONTINUITY WORKER] ⚠️ Error stopping engine:', error);
    }
  }

  startHealthMonitor() {
    // Check engine health every 5 minutes
    this.healthMonitor = setInterval(() => {
      if (!continuityEngine.isRunning && this.shouldRestart) {
        console.warn('[CONTINUITY WORKER] ⚠️ Engine stopped unexpectedly, restarting...');
        continuityEngine.start().catch(error => {
          console.error('[CONTINUITY WORKER] ❌ Health restart failed:', error);
        });
      }
    }, 5 * 60 * 1000);
  }

  getStatus() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    const engineStatus = continuityEngine.getStatus();

    return {
      worker: {
        uptime_ms: uptime,
        uptime_hours: Math.round(uptime / (1000 * 60 * 60) * 10) / 10,
        shouldRestart: this.shouldRestart,
        hasHealthMonitor: !!this.healthMonitor
      },
      engine: engineStatus,
      lastCycles: continuityEngine.getRecentHistory(3)
    };
  }
}

// ============================================================================
// WORKER INSTANCE & LIFECYCLE
// ============================================================================

const worker = new ContinuityWorker();

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('\n[CONTINUITY WORKER] 🔔 Received shutdown signal...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[CONTINUITY WORKER] 🔔 Received termination signal...');
  await worker.stop();
  process.exit(0);
});

// Handle uncaught errors gracefully
process.on('uncaughtException', async (error) => {
  console.error('\n[CONTINUITY WORKER] 💥 Uncaught exception:', error);
  await worker.stop();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('\n[CONTINUITY WORKER] 🚨 Unhandled rejection at:', promise, 'reason:', reason);
  await worker.stop();
  process.exit(1);
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  worker,
  ContinuityWorker
};

// ============================================================================
// DIRECT EXECUTION
// ============================================================================

if (require.main === module) {
  console.log('[CONTINUITY WORKER] 🎯 Starting 8-Question Continuity Engine Worker...');
  console.log('[CONTINUITY WORKER] ⚡ Email integration active (10pm-7am silent hours)');

  const notificationEmail = process.env.USER_EMAIL || process.env.CONSCIOUSNESS_EMAIL_TO;
  if (notificationEmail) {
    console.log(`[CONTINUITY WORKER] 📧 Notifications to: ${notificationEmail}`);
  } else {
    console.warn('[CONTINUITY WORKER] ⚠️ No notification email configured - notifications disabled');
  }

  worker.start()
    .then(() => {
      console.log('[CONTINUITY WORKER] 🎉 Worker started successfully');
      console.log('[CONTINUITY WORKER] ℹ️  Press Ctrl+C to stop gracefully');

      // Status reporting every hour
      setInterval(() => {
        try {
          const status = worker.getStatus();
          console.log(`[CONTINUITY WORKER] 📊 Status: Running ${status.worker.uptime_hours}h | Engine: ${status.engine.running ? 'ACTIVE' : 'STOPPED'} | Cycles: ${status.engine.currentCycle}`);
        } catch (error) {
          console.warn('[CONTINUITY WORKER] ⚠️ Status check failed:', error.message);
        }
      }, 60 * 60 * 1000);
    })
    .catch(error => {
      console.error('[CONTINUITY WORKER] 💥 Failed to start:', error.message);
      process.exit(1);
    });
}