/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Oracle Interface API Endpoints
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const { supabase, getMemoriesForUser, stringToUUID } = require('../lib/supabase');
const { continuityEngine } = require('../lib/continuity-engine');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { gatherLayerActivity } = require('../lib/memory-layer-classifier');
const router = express.Router();

// ============================================================================
// MEMORY STREAM ENDPOINTS
// ============================================================================

// Get recent memories for Provenance Stream
router.get('/memories/recent', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    // Get user ID from authenticated user
    const userId = req.userId;

    console.log('[ORACLE-API] Fetching recent memories, limit:', limit, 'userId:', userId);

    // Fetch recent memories with full metadata
    const { data: memories, error } = await supabase
      .from('memory_items')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[ORACLE-API] Memory fetch error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch memories',
        details: error.message
      });
    }

    // Format memories for Oracle interface
    const formattedMemories = (memories || []).map(memory => ({
      id: memory.id,
      content: memory.content,
      provenance: memory.provenance,
      confidence: memory.confidence || 0.8,
      importance: memory.importance || 0.5,
      source_type: memory.source_type,
      memory_type: memory.memory_type,
      category: memory.category,
      approval_status: memory.approval_status,
      created_at: memory.created_at,
      citation: generateCitationString(memory)
    }));

    res.json({
      success: true,
      count: formattedMemories.length,
      memories: formattedMemories
    });

  } catch (error) {
    console.error('[ORACLE-API] Error fetching memories:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Get memory statistics for dashboard
router.get('/memories/stats', requireAuth, requireOwner, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get memory counts by provenance
    const { data: provenanceStats, error: provenanceError } = await supabase
      .from('memory_items')
      .select('provenance')
      .eq('user_id', userId)
      .eq('active', true);

    if (provenanceError) throw provenanceError;

    // Count by provenance type
    const provenanceCounts = {};
    provenanceStats.forEach(item => {
      const prov = item.provenance || 'UNKNOWN';
      provenanceCounts[prov] = (provenanceCounts[prov] || 0) + 1;
    });

    // Get confidence distribution
    const { data: confidenceStats, error: confidenceError } = await supabase
      .from('memory_items')
      .select('confidence')
      .eq('user_id', userId)
      .eq('active', true);

    if (confidenceError) throw confidenceError;

    // Guard against divide-by-zero when the user has no memories yet.
    const avgConfidence = confidenceStats.length
      ? confidenceStats.reduce((sum, item) => sum + (item.confidence || 0.8), 0) / confidenceStats.length
      : 0;

    res.json({
      success: true,
      stats: {
        total_memories: provenanceStats.length,
        provenance_distribution: provenanceCounts,
        average_confidence: Math.round(avgConfidence * 1000) / 1000,
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[ORACLE-API] Error fetching memory stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch memory statistics'
    });
  }
});

// ============================================================================
// SYSTEM EVENTS ENDPOINTS
// ============================================================================

// Get recent system events for Cognitive Pulse
router.get('/events/recent', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    // Fetch from raw_events table
    const { data: events, error } = await supabase
      .from('raw_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      // No fake events. Return an empty stream and let the UI render
      // its "No live events." empty state. This preserves the no-fake-
      // visuals rule even when the raw_events table is missing.
      console.warn('[ORACLE-API] Event fetch error (returning empty):', error.message);
      return res.json({ success: true, count: 0, events: [] });
    }

    // Format events for Oracle interface
    const formattedEvents = (events || []).map(event => ({
      id: event.id,
      type: event.event_type,
      description: formatEventDescription(event),
      timestamp: event.created_at,
      severity: event.severity || 'info',
      source: event.source || 'system',
      metadata: event.event_data
    }));

    res.json({
      success: true,
      count: formattedEvents.length,
      events: formattedEvents
    });

  } catch (error) {
    console.error('[ORACLE-API] Error fetching events:', error);
    res.json({ success: true, count: 0, events: [] });
  }
});

// ============================================================================
// CONTINUITY ENGINE STATUS
// ============================================================================

// Get Continuity Engine status
router.get('/continuity/status', requireAuth, requireOwner, async (req, res) => {
  try {
    const status = continuityEngine.getStatus();
    const recentHistory = continuityEngine.getRecentHistory(5);

    res.json({
      success: true,
      engine_status: status,
      recent_cycles: recentHistory,
      system_health: {
        running: status.running,
        last_cycle: status.lastRunTime,
        next_cycle: status.nextRunTime,
        cycle_count: status.currentCycle
      }
    });

  } catch (error) {
    console.error('[ORACLE-API] Error fetching continuity status:', error);
    res.json({
      success: false,
      error: 'Continuity Engine status unavailable',
      system_health: {
        running: false,
        error: error.message
      }
    });
  }
});

// ============================================================================
// GOVERNANCE STATUS ENDPOINTS
// ============================================================================

// Enhanced governance status for Oracle HUD
router.get('/governance/oracle-status', requireAuth, requireOwner, async (req, res) => {
  try {
    // Try to get governance state
    let governanceStatus = {
      enabled: false,
      core_rules_count: 23,
      rules_version: '1.1',
      enforcement_layers: ['CLASPION', 'Good Neighbor Guard', 'Vale\'s Rule', 'Public Signoff'],
      quarantine_mode: false,
      last_check: new Date().toISOString()
    };

    // Try to fetch actual governance state
    try {
      const response = await fetch(process.env.CLASPION_URL + '/governance/state', {
        headers: { 'Authorization': `Bearer ${process.env.CLASPION_API_KEY}` }
      });

      if (response.ok) {
        const actualStatus = await response.json();
        governanceStatus = { ...governanceStatus, ...actualStatus, enabled: true };
      }
    } catch (fetchError) {
      console.warn('[ORACLE-API] Could not fetch live governance status:', fetchError.message);
    }

    res.json({
      success: true,
      governance: governanceStatus,
      display_status: {
        main_status: governanceStatus.enabled ? 'ACTIVE' : 'INACTIVE',
        rules_text: `${governanceStatus.core_rules_count} RULES v${governanceStatus.rules_version}`,
        layers_text: `${governanceStatus.enforcement_layers.length} LAYERS`,
        health: governanceStatus.enabled && !governanceStatus.quarantine_mode ? 'healthy' : 'warning'
      }
    });

  } catch (error) {
    console.error('[ORACLE-API] Error fetching governance status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch governance status'
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateCitationString(memory) {
  const timestamp = new Date(memory.created_at).toLocaleString();
  const source = memory.source_type || 'unknown';
  const confidence = Math.round((memory.confidence || 0.8) * 100);

  return `[${memory.provenance}] ${source}@${timestamp} (${confidence}%)`;
}

function formatEventDescription(event) {
  const eventType = event.event_type;
  const data = event.event_data || {};

  switch (eventType) {
    case 'memory_stored':
      return `New memory stored with confidence ${Math.round((data.confidence || 0.8) * 100)}%`;
    case 'continuity_cycle_complete':
      return `Continuity cycle ${data.cycle || 'unknown'} completed`;
    case 'governance_check':
      return `CLASPION governance validation: ${data.result || 'processed'}`;
    case 'memory_conflict_detected':
      return `Memory conflict detected and flagged for review`;
    case 'proactive_communication_sent':
      return `Proactive email notification sent to user`;
    default:
      return `${eventType.replace(/_/g, ' ')} event processed`;
  }
}

function generateSimulatedEvents() {
  const eventTypes = [
    { type: 'micro_reflection', description: 'Micro-reflection cycle completed', severity: 'info' },
    { type: 'memory_review', description: 'Memory consolidation process executed', severity: 'info' },
    { type: 'pinecone_sync', description: 'Vector database synchronization', severity: 'info' },
    { type: 'conflict_check', description: 'Memory conflict resolution completed', severity: 'info' },
    { type: 'claspion_validation', description: 'CLASPION governance validation passed', severity: 'info' },
    { type: 'outbound_message_drafted', description: 'Proactive communication prepared', severity: 'info' },
    { type: 'scheduled_task', description: 'Background task execution completed', severity: 'info' },
    { type: 'uncertainty_flag', description: 'Uncertainty detected in reasoning chain', severity: 'warning' }
  ];

  const events = [];
  const now = Date.now();

  // Generate 10 simulated events
  for (let i = 0; i < 10; i++) {
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    events.push({
      id: `sim_${Date.now()}_${i}`,
      type: eventType.type,
      description: eventType.description,
      timestamp: new Date(now - (i * 30000 + Math.random() * 30000)).toISOString(),
      severity: eventType.severity,
      source: 'simulation',
      metadata: {}
    });
  }

  return events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// ============================================================================
// REFLECTION INTELLIGENCE ENDPOINTS
// All require owner auth. Read-only — no mutations from these routes.
// ============================================================================

router.get('/reflection-intelligence', requireAuth, requireOwner, async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [convergence, conflicts, beliefChanges, trajectories, tests, recentEvents] = await Promise.all([
      supabase.from('ri_convergence')
        .select('*')
        .in('convergence_status', ['CONVERGED', 'REPEATED'])
        .order('last_seen_at', { ascending: false })
        .limit(10)
        .then(r => r.data || []),

      supabase.from('ri_conflicts')
        .select('*')
        .in('status', ['OPEN', 'SURFACED'])
        .order('first_seen_at', { ascending: false })
        .limit(10)
        .then(r => r.data || []),

      supabase.from('ri_belief_confidence')
        .select('*')
        .not('confidence_delta', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(10)
        .then(r => r.data || []),

      supabase.from('ri_trajectories')
        .select('*')
        .not('status', 'in', '("RETIRED")')
        .order('evidence_count', { ascending: false })
        .limit(10)
        .then(r => r.data || []),

      supabase.from('ri_adversarial_tests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)
        .then(r => r.data || []),

      supabase.from('ri_events')
        .select('event_name, category, severity, reason, created_at')
        .gte('created_at', since24h)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(r => r.data || []),
    ]);

    const lastActivation = recentEvents.find(e => e.event_name === 'reflection_intelligence_completed');
    const recordsToday   = recentEvents.filter(e => e.event_name === 'reflection_intelligence_started').length;

    res.json({
      success: true,
      summary: {
        last_activation:      lastActivation ? lastActivation.created_at : null,
        records_today:        recordsToday,
        active_convergence:   convergence.filter(c => c.convergence_status === 'CONVERGED').length,
        open_conflicts:       conflicts.filter(c => c.status === 'OPEN').length,
        belief_changes_today: beliefChanges.filter(b => b.updated_at >= since24h).length,
        strong_trajectories:  trajectories.filter(t => t.status === 'STRONG').length,
      },
      convergence,
      conflicts,
      belief_changes:  beliefChanges,
      trajectories,
      adversarial_tests: tests,
      recent_events:   recentEvents,
    });
  } catch (err) {
    console.error('[ORACLE-API] reflection-intelligence error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// MEMORY LAYER ENDPOINTS
// All require owner auth. Read-only — no mutations from these routes.
// ============================================================================

router.get('/memory-layers', requireAuth, requireOwner, async (req, res) => {
  try {
    const windowHours = Math.min(168, parseInt(req.query.window_hours) || 24);

    const activity = await gatherLayerActivity(supabase, windowHours);

    // Layer-filtered memory counts with decay breakdown
    const [byLayer, decayBreakdown, recentClassified] = await Promise.all([
      supabase
        .from('memory_items')
        .select('memory_layer, decay_status, retention_policy')
        .eq('active', true)
        .not('memory_layer', 'is', null)
        .then(r => r.data || []),

      supabase
        .from('memory_items')
        .select('decay_status, memory_layer')
        .eq('active', true)
        .then(r => r.data || []),

      supabase
        .from('memory_layer_events')
        .select('event_type, memory_layer, decay_status, reason, created_at, memory_id')
        .eq('event_type', 'memory_layer_classified')
        .order('created_at', { ascending: false })
        .limit(20)
        .then(r => r.data || []),
    ]);

    // Build per-layer breakdown: { layer: { total, active, aging, stale, archived } }
    const layerBreakdown = {};
    for (const row of byLayer) {
      const l = row.memory_layer;
      if (!layerBreakdown[l]) {
        layerBreakdown[l] = { total: 0, active: 0, aging: 0, stale: 0, archived: 0, retention_policy: row.retention_policy };
      }
      layerBreakdown[l].total++;
      const d = (row.decay_status || 'ACTIVE').toLowerCase();
      if (layerBreakdown[l][d] !== undefined) layerBreakdown[l][d]++;
    }

    // Decay summary across all memories
    const decaySummary = { ACTIVE: 0, AGING: 0, STALE: 0, ARCHIVED: 0, RETIRED: 0 };
    for (const row of decayBreakdown) {
      const d = (row.decay_status || 'ACTIVE').toUpperCase();
      if (decaySummary[d] !== undefined) decaySummary[d]++;
    }

    const totalClassified = byLayer.length;
    const totalMemories = decayBreakdown.length;

    res.json({
      success: true,
      summary: {
        total_memories:    totalMemories,
        total_classified:  totalClassified,
        unclassified:      totalMemories - totalClassified,
        classification_rate: totalMemories > 0
          ? Math.round((totalClassified / totalMemories) * 100)
          : 0,
        window_hours: windowHours,
        decay_summary: decaySummary,
      },
      layer_breakdown:   layerBreakdown,
      recent_classified: recentClassified,
      recent_events:     activity.recentEvents,
    });
  } catch (err) {
    console.error('[ORACLE-API] memory-layers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/memory-layers/events', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const { data, error } = await supabase
      .from('memory_layer_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ success: true, count: (data || []).length, events: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/reflection-intelligence/events', requireAuth, requireOwner, async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const { data, error } = await supabase
      .from('ri_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ success: true, count: (data || []).length, events: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;