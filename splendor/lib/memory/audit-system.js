/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Memory Audit System - Governance Foundation

  Every memory write creates an audit record.
  This lets Christopher inspect exactly why Splendor believes something.

  Built by Christopher Hughes with Claude Code
  Truth · Safety · We Got Your Back
*/

const { supabase } = require('../supabase');

// Memory write lock check
let MEMORY_WRITE_LOCK = null;

async function isMemoryWriteLocked() {
  // Check environment variable first
  if (process.env.MEMORY_WRITE_LOCK === 'true') {
    return true;
  }

  // Check database config (cached for 1 minute)
  if (MEMORY_WRITE_LOCK === null || Date.now() - MEMORY_WRITE_LOCK.timestamp > 60000) {
    try {
      const { data } = await supabase
        .from('system_config')
        .select('config_value')
        .eq('config_key', 'MEMORY_WRITE_LOCK')
        .single();

      MEMORY_WRITE_LOCK = {
        value: data?.config_value === 'true',
        timestamp: Date.now()
      };
    } catch (err) {
      console.error('[AUDIT] Failed to check memory write lock:', err);
      MEMORY_WRITE_LOCK = { value: false, timestamp: Date.now() };
    }
  }

  return MEMORY_WRITE_LOCK.value;
}

// Core audit logging function
async function logMemoryOperation(operation) {
  const {
    memoryId,
    tier,
    sourceType,
    createdByModel,
    originalTrigger,
    confidence,
    action,
    promotionReason = null,
    requiresApproval = false,
    tokensConsumed = null,
    apiCallDurationMs = null,
    contextWindowSize = null
  } = operation;

  try {
    const { error } = await supabase
      .from('memory_audit_log')
      .insert({
        memory_id: memoryId,
        tier,
        source_type: sourceType,
        created_by_model: createdByModel,
        original_trigger: originalTrigger.substring(0, 500), // Prevent oversized triggers
        confidence,
        promotion_reason: promotionReason,
        last_modified_by: createdByModel,
        action,
        requires_approval: requiresApproval,
        tokens_consumed: tokensConsumed,
        api_call_duration_ms: apiCallDurationMs,
        context_window_size: contextWindowSize
      });

    if (error) {
      console.error('[AUDIT] Failed to log memory operation:', error);
      // Continue execution - audit failure shouldn't break memory operations
    } else {
      console.log(`[AUDIT] Logged ${action} for memory ${memoryId} (tier ${tier}, source: ${sourceType})`);
    }

    // If this requires approval, add to promotion queue
    if (requiresApproval && (tier === '1' || tier === '1.5')) {
      await addToPromotionQueue({
        candidateMemory: originalTrigger,
        suggestedTier: tier,
        sourceType,
        confidence,
        reason: promotionReason || `System-suggested promotion to tier ${tier}`
      });
    }

  } catch (err) {
    console.error('[AUDIT] Audit logging error:', err);
    // Continue execution - audit failure shouldn't break memory operations
  }
}

// Add memory to promotion queue
async function addToPromotionQueue(promotion) {
  try {
    const requiresApproval = promotion.suggestedTier === '1' || promotion.suggestedTier === '1.5';

    const { error } = await supabase
      .from('promotion_queue')
      .insert({
        candidate_memory: promotion.candidateMemory.substring(0, 1000),
        suggested_tier: promotion.suggestedTier,
        reason: promotion.reason.substring(0, 500),
        source_type: promotion.sourceType,
        confidence: promotion.confidence,
        requires_christopher_approval: requiresApproval,
        original_session_id: promotion.sessionId || null,
        original_message: promotion.originalMessage?.substring(0, 500) || null,
        supporting_evidence: promotion.supportingEvidence?.substring(0, 1000) || null
      });

    if (error) {
      console.error('[AUDIT] Failed to add to promotion queue:', error);
    } else {
      console.log(`[AUDIT] Added to promotion queue: tier ${promotion.suggestedTier} candidate`);
    }
  } catch (err) {
    console.error('[AUDIT] Promotion queue error:', err);
  }
}

// Source validation for memory claims
function validateMemorySource(memoryContent, sourceType, confidence) {
  const rules = {
    'christopher_stated': {
      requiredConfidence: 'verified',
      allowedTiers: ['1', '1.5', '2'],
      description: 'Christopher explicitly stated this'
    },
    'splendor_inferred': {
      requiredConfidence: 'probable',
      allowedTiers: ['2', '3'],
      description: 'Splendor inferred this from patterns',
      requiresLabel: true
    },
    'session_observed': {
      requiredConfidence: 'probable',
      allowedTiers: ['2', '3'],
      description: 'Observed behavior pattern across sessions'
    },
    'system_generated': {
      requiredConfidence: 'verified',
      allowedTiers: ['4'],
      description: 'System-generated working memory'
    }
  };

  const rule = rules[sourceType];
  if (!rule) {
    return {
      valid: false,
      reason: `Unknown source type: ${sourceType}`
    };
  }

  // Check confidence requirements
  const confidenceLevels = { 'uncertain': 1, 'probable': 2, 'verified': 3 };
  const actualLevel = confidenceLevels[confidence];
  const requiredLevel = confidenceLevels[rule.requiredConfidence];

  if (actualLevel < requiredLevel) {
    return {
      valid: false,
      reason: `Source type '${sourceType}' requires confidence level '${rule.requiredConfidence}' but got '${confidence}'`
    };
  }

  return {
    valid: true,
    rule,
    requiresLabel: rule.requiresLabel || false
  };
}

// Wrapper for memory write operations
async function auditedMemoryWrite(operation) {
  const startTime = Date.now();

  // Check if memory writes are locked
  if (await isMemoryWriteLocked()) {
    console.log('[AUDIT] Memory write blocked - lock active');
    return {
      success: false,
      reason: 'Memory writes are currently locked',
      lockActive: true
    };
  }

  // Validate source
  const validation = validateMemorySource(
    operation.content,
    operation.sourceType,
    operation.confidence
  );

  if (!validation.valid) {
    console.warn('[AUDIT] Memory write rejected:', validation.reason);
    return {
      success: false,
      reason: validation.reason,
      validationFailed: true
    };
  }

  // Generate memory ID if not provided
  const memoryId = operation.memoryId || `mem_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  try {
    // Execute the actual memory write operation
    const writeResult = await operation.writeFunction(memoryId);

    // Log the operation
    await logMemoryOperation({
      memoryId,
      tier: operation.tier,
      sourceType: operation.sourceType,
      createdByModel: operation.createdByModel,
      originalTrigger: operation.originalTrigger,
      confidence: operation.confidence,
      action: operation.action || 'created',
      promotionReason: operation.promotionReason,
      requiresApproval: operation.tier === '1' || operation.tier === '1.5',
      tokensConsumed: operation.tokensConsumed,
      apiCallDurationMs: Date.now() - startTime,
      contextWindowSize: operation.contextWindowSize
    });

    return {
      success: true,
      memoryId,
      requiresLabel: validation.requiresLabel,
      result: writeResult
    };

  } catch (error) {
    // Log the failed operation
    await logMemoryOperation({
      memoryId,
      tier: operation.tier,
      sourceType: operation.sourceType,
      createdByModel: operation.createdByModel,
      originalTrigger: operation.originalTrigger,
      confidence: operation.confidence,
      action: 'failed',
      promotionReason: `Write failed: ${error.message}`,
      requiresApproval: false,
      tokensConsumed: operation.tokensConsumed,
      apiCallDurationMs: Date.now() - startTime,
      contextWindowSize: operation.contextWindowSize
    });

    throw error;
  }
}

// Job health logging
async function logJobHealth(jobName, status, details = {}) {
  try {
    const {
      startTime = Date.now(),
      recordsProcessed = 0,
      errorMessage = null,
      modelUsed = null,
      tokensConsumed = null
    } = details;

    const duration = Date.now() - startTime;

    const { error } = await supabase
      .from('job_health_log')
      .insert({
        job_name: jobName,
        completed_at: NOW(),
        status,
        duration_ms: duration,
        records_processed: recordsProcessed,
        error_message: errorMessage?.substring(0, 500),
        model_used: modelUsed,
        tokens_consumed: tokensConsumed,
        memory_lock_active: await isMemoryWriteLocked()
      });

    if (error) {
      console.error('[AUDIT] Failed to log job health:', error);
    } else {
      console.log(`[AUDIT] Job health logged: ${jobName} - ${status} (${duration}ms)`);
    }
  } catch (err) {
    console.error('[AUDIT] Job health logging error:', err);
  }
}

// Get audit trail for a memory
async function getMemoryAuditTrail(memoryId) {
  try {
    const { data, error } = await supabase
      .from('memory_audit_log')
      .select('*')
      .eq('memory_id', memoryId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('[AUDIT] Failed to fetch audit trail:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[AUDIT] Audit trail fetch error:', err);
    return [];
  }
}

// Get promotion queue items pending approval
async function getPendingPromotions() {
  try {
    const { data, error } = await supabase
      .from('promotion_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[AUDIT] Failed to fetch promotion queue:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[AUDIT] Promotion queue fetch error:', err);
    return [];
  }
}

module.exports = {
  auditedMemoryWrite,
  logMemoryOperation,
  logJobHealth,
  validateMemorySource,
  getMemoryAuditTrail,
  addToPromotionQueue,
  getPendingPromotions,
  isMemoryWriteLocked
};