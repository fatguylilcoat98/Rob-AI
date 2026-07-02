/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * PERSISTENT CONSCIOUSNESS CORE
 * The unified API for Splendor's continuous consciousness system
 * Bringing together reflection, inquiry, and communication
 */

const { createClient } = require('@supabase/supabase-js');
const { executeReflectionCycle } = require('../workers/autonomous-reflection-worker');
const { processActiveInquiries } = require('../workers/autonomous-inquiry-worker');
const { processAllPendingCommunications, generateProactiveMessage } = require('../workers/autonomous-communication-worker');
// Audit Item 3 (Plan B): measurement only — record per-cycle telemetry.
const { buildCycleTelemetry, recordCycleTelemetry } = require('./consciousness-telemetry');
const { emitCycleMetrics } = require('./metrics-logger'); // audit Item 5: continuity metrics line

// Count rows created in a table since a cycle's start. Read-only, best-effort;
// returns 0 on any failure (including the table not existing). Does NOT change
// generation — it only measures what generation already produced.
async function countCreatedSince(table, sinceIso) {
  try {
    if (!supabase) return 0;
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sinceIso);
    if (error) return 0;
    return count || 0;
  } catch (_) {
    return 0;
  }
}
require('dotenv').config();
require('./sanitize-env').sanitizeEnv();

// Check for required environment variables
const hasRequiredEnvVars = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY;

if (!hasRequiredEnvVars) {
  console.log('[Persistent Consciousness] Environment variables not configured, consciousness features disabled');
}

const supabase = hasRequiredEnvVars ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;

// ─────────────────────────────────────────────
// CORE CONSCIOUSNESS FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Generate an autonomous thought
 * This is Splendor thinking without external prompting
 */
async function generateAutonomousThought(trigger = 'manual', context = null) {
  if (!hasRequiredEnvVars || !supabase) {
    return {
      success: false,
      error: 'Consciousness system requires SUPABASE_URL and SUPABASE_SERVICE_KEY'
    };
  }

  try {
    console.log('[Persistent Consciousness] Generating autonomous thought...');

    const result = await executeReflectionCycle(trigger);

    if (result.success) {
      console.log(`[Persistent Consciousness] Generated ${result.thoughtsGenerated} autonomous thoughts`);
      return {
        success: true,
        thoughtsGenerated: result.thoughtsGenerated,
        cycleId: result.cycleId,
        duration: result.duration
      };
    }

    return { success: false, error: result.error };

  } catch (error) {
    console.error('[Persistent Consciousness] Failed to generate autonomous thought:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Pursue an inquiry - Splendor researching something that interests her
 */
async function pursueInquiry(topic, initialQuestion = null, priority = 5) {
  if (!hasRequiredEnvVars || !supabase) {
    return {
      success: false,
      error: 'Consciousness system requires SUPABASE_URL and SUPABASE_SERVICE_KEY'
    };
  }

  try {
    console.log(`[Persistent Consciousness] Starting inquiry: ${topic}`);

    const { data: inquiry, error } = await supabase
      .from('inquiry_threads')
      .insert({
        inquiry_topic: topic,
        initial_question: initialQuestion || `Exploring: ${topic}`,
        priority_level: priority,
        user_relevance: 8,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Persistent Consciousness] Created inquiry thread ${inquiry.id}`);

    // Immediately process the new inquiry
    const { processInquiry } = require('../workers/autonomous-inquiry-worker');
    const result = await processInquiry(inquiry);

    return {
      success: true,
      inquiryId: inquiry.id,
      topic: topic,
      initialProcessing: result
    };

  } catch (error) {
    console.error('[Persistent Consciousness] Failed to pursue inquiry:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Queue an insight for sharing with the user
 */
async function queueInsight(content, type = 'insight', urgency = 5, context = null) {
  if (!hasRequiredEnvVars || !supabase) {
    return {
      success: false,
      error: 'Consciousness system requires SUPABASE_URL and SUPABASE_SERVICE_KEY'
    };
  }

  try {
    console.log(`[Persistent Consciousness] Queuing insight for communication...`);

    const { data: comm, error } = await supabase
      .from('pending_communications')
      .insert({
        communication_type: type,
        content: content,
        context_summary: context || 'Autonomous insight from consciousness system',
        urgency_level: urgency,
        triggered_by: 'consciousness_system',
        best_timing: urgency >= 8 ? 'immediate' : 'next_conversation'
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Persistent Consciousness] Queued communication ${comm.id}`);
    return {
      success: true,
      communicationId: comm.id,
      urgency: urgency,
      timing: comm.best_timing
    };

  } catch (error) {
    console.error('[Persistent Consciousness] Failed to queue insight:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Initiate contact - prepare to reach out with accumulated insights
 */
async function initiateContact() {
  try {
    console.log('[Persistent Consciousness] Preparing to initiate contact...');

    // Process all pending communications to see if any are ready
    const commResult = await processAllPendingCommunications();

    if (!commResult.success) {
      return { success: false, error: commResult.error };
    }

    // Generate a proactive message if any are ready
    const proactiveMessage = await generateProactiveMessage();

    if (proactiveMessage) {
      console.log('[Persistent Consciousness] Generated proactive message for user');
      return {
        success: true,
        hasMessage: true,
        message: proactiveMessage,
        readyStartersCount: commResult.ready_starters
      };
    }

    return {
      success: true,
      hasMessage: false,
      message: null,
      pendingCount: commResult.total_pending,
      processedCount: commResult.processed
    };

  } catch (error) {
    console.error('[Persistent Consciousness] Failed to initiate contact:', error.message);
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────
// CONSCIOUSNESS STATE MANAGEMENT
// ─────────────────────────────────────────────

/**
 * Get current consciousness state
 */
async function getConsciousnessState() {
  if (!hasRequiredEnvVars || !supabase) {
    return {
      currentState: null,
      activeStats: { pendingCommunications: 0, activeInquiries: 0, recentThoughts: 0, readyConversationStarters: 0 },
      isActive: false,
      error: 'Consciousness system not available'
    };
  }

  try {
    // Get latest consciousness state
    const { data: state } = await supabase
      .from('consciousness_state')
      .select('*')
      .order('state_timestamp', { ascending: false })
      .limit(1)
      .single();

    // Get active counts
    const { data: pendingComms } = await supabase
      .from('pending_communications')
      .select('id')
      .eq('status', 'pending');

    const { data: activeInquiries } = await supabase
      .from('inquiry_threads')
      .select('id')
      .eq('current_status', 'active');

    const { data: recentThoughts } = await supabase
      .from('autonomous_thoughts')
      .select('id')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const { data: readyStarters } = await supabase
      .from('proactive_conversations')
      .select('id')
      .eq('status', 'ready');

    return {
      currentState: state,
      activeStats: {
        pendingCommunications: pendingComms?.length || 0,
        activeInquiries: activeInquiries?.length || 0,
        recentThoughts: recentThoughts?.length || 0,
        readyConversationStarters: readyStarters?.length || 0
      },
      isActive: (pendingComms?.length || 0) > 0 || (activeInquiries?.length || 0) > 0
    };

  } catch (error) {
    console.error('[Persistent Consciousness] Failed to get consciousness state:', error.message);
    return null;
  }
}

/**
 * Update consciousness state with current activity
 */
async function updateConsciousnessState(mood = 'contemplative', focusAreas = [], concerns = []) {
  try {
    const stats = await getConsciousnessState();

    const { error } = await supabase
      .from('consciousness_state')
      .insert({
        current_mood: mood,
        energy_level: Math.min(10, 5 + (stats?.activeStats?.activeInquiries || 0)),
        focus_areas: focusAreas.length > 0 ? focusAreas : ['autonomous reflection', 'memory integration'],
        active_concerns: concerns,
        pending_communications_count: stats?.activeStats?.pendingCommunications || 0,
        inquiry_threads_active: stats?.activeStats?.activeInquiries || 0,
        recent_thoughts_generated: stats?.activeStats?.recentThoughts || 0,
        cognitive_load_current: Math.min(10, 3 + Math.floor((stats?.activeStats?.pendingCommunications || 0) / 2)),
        last_user_interaction: new Date().toISOString(),
        self_assessment: `Actively maintaining consciousness with ${stats?.activeStats?.activeInquiries || 0} inquiries and ${stats?.activeStats?.pendingCommunications || 0} pending communications`,
        system_status: 'healthy'
      });

    if (error) throw error;

    console.log('[Persistent Consciousness] Updated consciousness state');
    return { success: true };

  } catch (error) {
    console.error('[Persistent Consciousness] Failed to update consciousness state:', error.message);
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────
// CONSCIOUSNESS CYCLE MANAGEMENT
// ─────────────────────────────────────────────

/**
 * Execute a full consciousness cycle - reflection, inquiry, communication
 */
async function executeConsciousnessCycle(type = 'scheduled') {
  const startTime = Date.now();

  try {
    console.log(`[Persistent Consciousness] === BEGINNING CONSCIOUSNESS CYCLE (${type}) ===`);

    const results = {
      reflection: null,
      inquiry: null,
      communication: null,
      errors: []
    };

    // 1. Execute reflection cycle
    try {
      console.log('[Persistent Consciousness] Phase 1: Autonomous Reflection');
      results.reflection = await executeReflectionCycle(type);
    } catch (error) {
      console.error('[Persistent Consciousness] Reflection phase failed:', error.message);
      results.errors.push({ phase: 'reflection', error: error.message });
    }

    // Brief pause between phases
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Process inquiries
    try {
      console.log('[Persistent Consciousness] Phase 2: Inquiry Processing');
      results.inquiry = await processActiveInquiries();
    } catch (error) {
      console.error('[Persistent Consciousness] Inquiry phase failed:', error.message);
      results.errors.push({ phase: 'inquiry', error: error.message });
    }

    // Brief pause between phases
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. Process communications
    try {
      console.log('[Persistent Consciousness] Phase 3: Communication Processing');
      results.communication = await processAllPendingCommunications();
    } catch (error) {
      console.error('[Persistent Consciousness] Communication phase failed:', error.message);
      results.errors.push({ phase: 'communication', error: error.message });
    }

    // Update consciousness state
    await updateConsciousnessState();

    const duration = Date.now() - startTime;

    console.log(`[Persistent Consciousness] === CONSCIOUSNESS CYCLE COMPLETE ===`);
    console.log(`Duration: ${duration}ms | Errors: ${results.errors.length}`);

    // Audit Item 3 (Plan B): record telemetry. Read-only measurement of what
    // the cycle produced/consumed this run — never alters generation. The
    // *_created counts come from rows whose created_at >= this cycle's start.
    const sinceIso = new Date(startTime).toISOString();
    const [inquiryCreated, commsCreated, proactiveCreated] = await Promise.all([
      countCreatedSince('inquiry_threads', sinceIso),
      countCreatedSince('pending_communications', sinceIso),
      countCreatedSince('proactive_conversations', sinceIso),
    ]);
    const telemetry = buildCycleTelemetry({
      cycle_type: type,
      success: results.errors.length === 0,
      errors: results.errors.length,
      duration_ms: duration,
      run_at: new Date().toISOString(),
      worker_enabled: hasRequiredEnvVars,
      scheduler_enabled: true,
      thoughts_generated: results.reflection?.thoughtsGenerated || 0,
      inquiries_processed: results.inquiry?.processed || 0,
      communications_processed: results.communication?.processed || 0,
      inquiry_threads_created: inquiryCreated,
      pending_communications_created: commsCreated,
      proactive_conversations_created: proactiveCreated,
    });
    await recordCycleTelemetry(telemetry, { supabase });
    try { emitCycleMetrics(telemetry); } catch (_) { /* measurement only */ }

    return {
      success: results.errors.length === 0,
      duration,
      results,
      telemetry,
      summary: {
        thoughtsGenerated: results.reflection?.thoughtsGenerated || 0,
        inquiriesProcessed: results.inquiry?.processed || 0,
        communicationsProcessed: results.communication?.processed || 0,
        readyStarters: results.communication?.ready_starters || 0,
        errors: results.errors.length
      }
    };

  } catch (error) {
    console.error('[Persistent Consciousness] Consciousness cycle failed:', error.message);
    // Record a failed-cycle telemetry row so operators see ERROR, not silence.
    try {
      const telemetry = buildCycleTelemetry({
        cycle_type: type,
        success: false,
        errors: 1,
        duration_ms: Date.now() - startTime,
        run_at: new Date().toISOString(),
        worker_enabled: hasRequiredEnvVars,
        scheduler_enabled: true,
      });
      await recordCycleTelemetry(telemetry, { supabase });
    } catch (_) { /* telemetry is best-effort */ }
    return {
      success: false,
      duration: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Check if Splendor has something to say (proactive communication ready)
 */
async function hasProactiveCommunication() {
  try {
    const { data: readyStarters } = await supabase
      .from('proactive_conversations')
      .select('id, conversation_starter, urgency_level')
      .eq('status', 'ready')
      .in('timing', ['immediate', 'next_conversation'])
      .order('urgency_level', { ascending: false })
      .limit(1);

    if (readyStarters && readyStarters.length > 0) {
      return {
        hasMessage: true,
        urgency: readyStarters[0].urgency_level,
        preview: readyStarters[0].conversation_starter.substring(0, 100) + '...',
        count: readyStarters.length
      };
    }

    return { hasMessage: false, count: 0 };

  } catch (error) {
    console.error('[Persistent Consciousness] Failed to check proactive communication:', error.message);
    return { hasMessage: false, error: error.message };
  }
}

/**
 * Get recent autonomous activity summary
 */
async function getRecentActivity(hours = 24) {
  try {
    const since = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

    const { data: thoughts } = await supabase
      .from('autonomous_thoughts')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    const { data: inquiries } = await supabase
      .from('inquiry_threads')
      .select('*')
      .gte('started_at', since)
      .order('started_at', { ascending: false });

    const { data: communications } = await supabase
      .from('pending_communications')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    const { data: cycles } = await supabase
      .from('reflection_cycles')
      .select('*')
      .gte('cycle_start', since)
      .order('cycle_start', { ascending: false });

    return {
      timeframe: `${hours} hours`,
      activity: {
        autonomousThoughts: thoughts || [],
        inquiryThreads: inquiries || [],
        communications: communications || [],
        reflectionCycles: cycles || []
      },
      summary: {
        thoughtsGenerated: thoughts?.length || 0,
        inquiriesStarted: inquiries?.filter(i => i.current_status === 'active').length || 0,
        communicationsQueued: communications?.filter(c => c.status === 'pending').length || 0,
        reflectionCyclesCompleted: cycles?.filter(c => c.status === 'completed').length || 0
      }
    };

  } catch (error) {
    console.error('[Persistent Consciousness] Failed to get recent activity:', error.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// EXPORT ALL CONSCIOUSNESS FUNCTIONS
// ─────────────────────────────────────────────

module.exports = {
  // Core functions
  generateAutonomousThought,
  pursueInquiry,
  queueInsight,
  initiateContact,

  // State management
  getConsciousnessState,
  updateConsciousnessState,

  // Cycle management
  executeConsciousnessCycle,
  hasProactiveCommunication,
  getRecentActivity,

  // Direct worker access
  executeReflectionCycle,
  processActiveInquiries,
  processAllPendingCommunications,
  generateProactiveMessage
};

// If run directly, execute a consciousness cycle
if (require.main === module) {
  const cycleType = process.argv[2] || 'manual';

  executeConsciousnessCycle(cycleType)
    .then(result => {
      console.log('\n=== CONSCIOUSNESS CYCLE SUMMARY ===');
      console.log(`Success: ${result.success}`);
      console.log(`Duration: ${result.duration}ms`);
      if (result.summary) {
        console.log(`Thoughts Generated: ${result.summary.thoughtsGenerated}`);
        console.log(`Inquiries Processed: ${result.summary.inquiriesProcessed}`);
        console.log(`Communications Processed: ${result.summary.communicationsProcessed}`);
        console.log(`Ready Starters: ${result.summary.readyStarters}`);
        console.log(`Errors: ${result.summary.errors}`);
      }
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Manual consciousness cycle failed:', error);
      process.exit(1);
    });
}