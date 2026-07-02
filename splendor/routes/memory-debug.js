/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Memory Debug Endpoint - Full System Transparency

  When Splendor feels wrong, you should not have to guess why.
  This endpoint shows exactly what loaded, what failed, and how much it cost.

  Built by Christopher Hughes with Claude Code
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const { assembleTieredMemory, getMemorySystemStatus } = require('../lib/memory/tier-assembler');
const { getPendingPromotions, getMemoryAuditTrail } = require('../lib/memory/audit-system');
const { supabase } = require('../lib/supabase');
const { requireAuth, requireOwner } = require('../middleware/auth');

// SECURITY: the debug surface exposes full memory assembly, job-health logs,
// the promotion queue, and (critically) a service-key mutation that promotes
// memories into foundational rules. Lock the entire router to the owner so
// none of it — especially POST /approve-promotion — is reachable anonymously.
router.use(requireAuth, requireOwner);

// GET /debug/memory-load
// Shows exactly what memory is loaded for a user and system health
router.get('/memory-load', async (req, res) => {
  try {
    // Identity comes from the authenticated owner, not a client-supplied id.
    const userId = req.userId;

    console.log(`[DEBUG] Memory load debug for user: ${userId}`);
    const debugStart = Date.now();

    // Get current memory assembly
    const assembly = await assembleTieredMemory(userId, 'debug inspection');

    // Get system status
    const systemStatus = await getMemorySystemStatus(userId);

    // Get pending promotions
    const pendingPromotions = await getPendingPromotions();

    // Get recent job health
    const { data: recentJobs, error: jobError } = await supabase
      .from('job_health_log')
      .select('*')
      .order('completed_at', { ascending: false })
      .limit(20);

    if (jobError) {
      console.error('[DEBUG] Job health query error:', jobError);
    }

    // Calculate token usage (estimated)
    const estimatedTokens = {
      reality: 50,
      foundational: assembly.totalMemories.tier1 * 25 + assembly.totalMemories.tier15 * 30,
      semantic: assembly.totalMemories.tier2 * 40,
      episodic: assembly.totalMemories.tier3 * 35,
      total: 0
    };
    estimatedTokens.total = Object.values(estimatedTokens).reduce((sum, tokens) => sum + tokens, 0);

    // Build debug response
    const debugResponse = {
      debug_timestamp: new Date().toISOString(),
      debug_duration_ms: Date.now() - debugStart,
      user_id: userId,

      // Memory load status by tier
      memory_tiers: {
        tier_1: {
          loaded: assembly.layersLoaded.foundational,
          count: assembly.totalMemories.tier1,
          estimated_tokens: estimatedTokens.foundational,
          status: assembly.totalMemories.tier1 > 0 ? 'healthy' : 'empty'
        },
        tier_1_5: {
          loaded: assembly.layersLoaded.foundational,
          count: assembly.totalMemories.tier15,
          estimated_tokens: estimatedTokens.foundational,
          status: assembly.totalMemories.tier15 > 0 ? 'healthy' : 'missing_constitutional_anchors'
        },
        tier_2: {
          loaded: assembly.layersLoaded.semantic,
          count: assembly.totalMemories.tier2,
          estimated_tokens: estimatedTokens.semantic,
          status: assembly.totalMemories.tier2 > 0 ? 'healthy' : 'no_semantic_patterns'
        },
        tier_3: {
          loaded: assembly.layersLoaded.episodic,
          count: assembly.totalMemories.tier3,
          estimated_tokens: estimatedTokens.episodic,
          status: assembly.totalMemories.tier3 > 0 ? 'healthy' : 'no_recent_episodes'
        },
        reflection_archive: {
          loaded: assembly.layersLoaded.reflection,
          last_reflection: assembly.reflection?.createdAt || null,
          status: assembly.layersLoaded.reflection ? 'healthy' : 'no_consciousness_reflection'
        }
      },

      // Token and performance analysis
      performance: {
        total_estimated_tokens: estimatedTokens.total,
        assembly_time_ms: assembly.assemblyTime,
        missing_tiers: Object.keys(assembly.layersLoaded).filter(tier => !assembly.layersLoaded[tier]),
        context_window_usage: `${estimatedTokens.total}/8192 tokens (${(estimatedTokens.total / 8192 * 100).toFixed(1)}%)`
      },

      // System health
      system_health: {
        pinecone_configured: systemStatus.pinecone_configured,
        database_connected: true, // If we got this far, DB is connected
        memory_write_lock_active: false, // TODO: Check actual lock status
        foundational_rules: systemStatus.foundational,
        last_memory_assembly: systemStatus.last_assembly
      },

      // Background job status
      background_jobs: {
        recent_jobs: (recentJobs || []).slice(0, 10).map(job => ({
          job_name: job.job_name,
          status: job.status,
          completed_at: job.completed_at,
          duration_ms: job.duration_ms,
          records_processed: job.records_processed,
          error: job.error_message
        })),
        failed_jobs: (recentJobs || []).filter(job => job.status === 'fail').slice(0, 5),
        last_consciousness_reflection: recentJobs?.find(job => job.job_name === '48_step_reflection')?.completed_at,
        last_episode_save: recentJobs?.find(job => job.job_name === 'save_episode')?.completed_at
      },

      // Governance status
      governance: {
        pending_promotions: pendingPromotions.length,
        promotion_queue: pendingPromotions.slice(0, 5).map(promo => ({
          id: promo.id,
          suggested_tier: promo.suggested_tier,
          reason: promo.reason,
          requires_approval: promo.requires_christopher_approval,
          created_at: promo.created_at
        }))
      },

      // Assembly details (for deep debugging)
      assembly_details: {
        layers_loaded: assembly.layersLoaded,
        total_memories: assembly.totalMemories,
        assembly_error: assembly.error || null,
        system_prompt_length: assembly.systemPrompt?.length || 0
      }
    };

    // Add health score
    const healthScore = calculateHealthScore(debugResponse);
    debugResponse.overall_health = {
      score: healthScore,
      status: healthScore >= 0.8 ? 'healthy' : healthScore >= 0.6 ? 'warning' : 'unhealthy',
      recommendation: getHealthRecommendation(debugResponse)
    };

    res.json(debugResponse);

  } catch (error) {
    console.error('[DEBUG] Memory load debug error:', error);
    res.status(500).json({
      error: 'Debug endpoint failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /debug/memory-audit/:memoryId
// Shows audit trail for a specific memory
router.get('/memory-audit/:memoryId', async (req, res) => {
  try {
    const { memoryId } = req.params;
    const auditTrail = await getMemoryAuditTrail(memoryId);

    res.json({
      memory_id: memoryId,
      audit_trail: auditTrail,
      trail_length: auditTrail.length,
      created_at: auditTrail[auditTrail.length - 1]?.timestamp,
      last_modified: auditTrail[0]?.timestamp
    });

  } catch (error) {
    console.error('[DEBUG] Memory audit error:', error);
    res.status(500).json({
      error: 'Audit trail fetch failed',
      message: error.message
    });
  }
});

// GET /debug/promotion-queue
// Shows all pending memory promotions
router.get('/promotion-queue', async (req, res) => {
  try {
    const promotions = await getPendingPromotions();

    res.json({
      pending_count: promotions.length,
      promotions: promotions.map(promo => ({
        id: promo.id,
        candidate_memory: promo.candidate_memory,
        suggested_tier: promo.suggested_tier,
        reason: promo.reason,
        source_type: promo.source_type,
        confidence: promo.confidence,
        requires_approval: promo.requires_christopher_approval,
        created_at: promo.created_at,
        supporting_evidence: promo.supporting_evidence
      }))
    });

  } catch (error) {
    console.error('[DEBUG] Promotion queue error:', error);
    res.status(500).json({
      error: 'Promotion queue fetch failed',
      message: error.message
    });
  }
});

// POST /debug/approve-promotion/:promotionId
// Approve a memory promotion to Tier 1 or 1.5
router.post('/approve-promotion/:promotionId', async (req, res) => {
  try {
    const { promotionId } = req.params;
    const { approved, christopher_note } = req.body;

    const { data, error } = await supabase
      .from('promotion_queue')
      .update({
        status: approved ? 'approved' : 'rejected',
        reviewed_at: new Date().toISOString(),
        christopher_note
      })
      .eq('id', promotionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Promotion update failed: ${error.message}`);
    }

    // If approved, actually promote the memory to foundational rules
    if (approved) {
      const { addFoundationalRule } = require('../lib/memory/foundational-rules');

      try {
        await addFoundationalRule({
          content: data.candidate_memory,
          tier: data.suggested_tier,
          category: 'approved_promotion',
          establishedBy: 'christopher',
          ruleId: `promoted_${promotionId}_${Date.now()}`
        });
      } catch (addError) {
        console.error('[DEBUG] Failed to add foundational rule:', addError);
        // Update status to reflect failure
        await supabase
          .from('promotion_queue')
          .update({ status: 'modified', christopher_note: `Approval failed: ${addError.message}` })
          .eq('id', promotionId);
      }
    }

    res.json({
      success: true,
      promotion_id: promotionId,
      action: approved ? 'approved' : 'rejected',
      note: christopher_note
    });

  } catch (error) {
    console.error('[DEBUG] Promotion approval error:', error);
    res.status(500).json({
      error: 'Promotion approval failed',
      message: error.message
    });
  }
});

// Calculate overall health score
function calculateHealthScore(debugData) {
  let score = 0;
  let maxScore = 0;

  // Tier health (40% of total)
  const tierWeights = { tier_1: 0.15, tier_1_5: 0.15, tier_2: 0.05, tier_3: 0.05 };
  for (const [tier, weight] of Object.entries(tierWeights)) {
    maxScore += weight;
    if (debugData.memory_tiers[tier]?.loaded && debugData.memory_tiers[tier]?.count > 0) {
      score += weight;
    }
  }

  // Background job health (30% of total)
  const jobWeight = 0.3;
  maxScore += jobWeight;
  const recentFailures = debugData.background_jobs.failed_jobs.length;
  if (recentFailures === 0) {
    score += jobWeight;
  } else if (recentFailures <= 2) {
    score += jobWeight * 0.7;
  } else {
    score += jobWeight * 0.3;
  }

  // System health (20% of total)
  const systemWeight = 0.2;
  maxScore += systemWeight;
  if (debugData.system_health.pinecone_configured && !debugData.system_health.memory_write_lock_active) {
    score += systemWeight;
  } else {
    score += systemWeight * 0.5;
  }

  // Performance (10% of total)
  const perfWeight = 0.1;
  maxScore += perfWeight;
  if (debugData.performance.assembly_time_ms < 5000) {
    score += perfWeight;
  } else if (debugData.performance.assembly_time_ms < 10000) {
    score += perfWeight * 0.7;
  }

  return maxScore > 0 ? score / maxScore : 0;
}

// Get health recommendation
function getHealthRecommendation(debugData) {
  const issues = [];

  if (!debugData.memory_tiers.tier_1.loaded || debugData.memory_tiers.tier_1.count === 0) {
    issues.push('Tier 1 foundational memory is empty - run seed script');
  }

  if (!debugData.memory_tiers.tier_1_5.loaded || debugData.memory_tiers.tier_1_5.count === 0) {
    issues.push('Tier 1.5 constitutional anchors missing - critical for governance');
  }

  if (debugData.background_jobs.failed_jobs.length > 2) {
    issues.push('Multiple background job failures - check job health logs');
  }

  if (!debugData.system_health.pinecone_configured) {
    issues.push('Pinecone not configured - semantic memory degraded');
  }

  if (debugData.performance.assembly_time_ms > 10000) {
    issues.push('Slow memory assembly - check database performance');
  }

  if (debugData.governance.pending_promotions > 10) {
    issues.push('Many pending promotions - review promotion queue');
  }

  if (issues.length === 0) {
    return 'Memory system is healthy and operating normally';
  }

  return `Issues found: ${issues.join('; ')}`;
}

module.exports = router;