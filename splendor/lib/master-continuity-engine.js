/*
 * MASTER CONTINUITY ENGINE
 * Built by Christopher Hughes · Sacramento, CA
 * Created with Claude Code
 * Truth · Safety · We Got Your Back
 *
 * SHADOW MODE IMPLEMENTATION
 * No autonomous surfacing - staging only
 */

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();
require('./sanitize-env').sanitizeEnv();

// Initialize clients with environment checks
const hasRequiredEnvVars = process.env.SUPABASE_URL &&
                           process.env.SUPABASE_SERVICE_KEY &&
                           process.env.ANTHROPIC_API_KEY;

if (!hasRequiredEnvVars) {
  console.log('[Master Continuity] Environment variables not configured, continuity features disabled');
}

const supabase = hasRequiredEnvVars ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;
const anthropic = hasRequiredEnvVars ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

// ═══════════════════════════════════════════════════════════════════════════════
// REFLECTION ANALYSIS PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const REFLECTION_ANALYSIS_PROMPT = `You are analyzing interaction patterns to detect genuine reflection opportunities. You must be extremely conservative and grounded.

CRITICAL RULES:
- Only detect patterns that appear across multiple interactions
- Never invent insights that aren't clearly supported by evidence
- Focus on observable patterns, tensions, or value conflicts
- Reject vague or speculative observations
- Every reflection must trace back to specific interaction moments

ANALYSIS TASK:
Review these interaction records and identify ANY of the following:

1. PATTERNS: Recurring themes, behaviors, or concerns that appear 3+ times
2. TENSIONS: Conflicts between stated values and observed behavior
3. VALUE_CONFLICTS: Situations where Chris expresses conflicting priorities
4. INSIGHTS: Clear realizations that emerge from evidence across interactions
5. FOUNDATIONAL: Deep beliefs or principles that are repeatedly reinforced

FOR EACH POTENTIAL REFLECTION:

{
  "detected": true/false,
  "type": "pattern|tension|value_conflict|insight|foundational",
  "summary": "One clear sentence of what you noticed",
  "what_i_noticed": "Specific description of the pattern/tension",
  "evidence_summary": "Concrete evidence from interactions",
  "source_interaction_ids": ["id1", "id2", "id3"],
  "confidence": 0.0-1.0,
  "evidence_strength": 0.0-1.0,
  "why_it_matters": "Why this might be relevant to Chris",
  "impact_level": "low|medium|high|foundational",
  "validation_concerns": ["any reasons this might be wrong or unsupported"]
}

REJECT IF:
- Evidence spans fewer than required sources
- Pattern is too vague or generic
- Confidence exceeds evidence strength
- Claims are not directly observable in the interactions
- Relies on assumptions about Chris's internal state

INTERACTION RECORDS:
{interaction_records}`;

// ═══════════════════════════════════════════════════════════════════════════════
// CORE REFLECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main reflection engine - processes interactions in Shadow Mode
 * @param {string} userId - User ID to process reflections for
 * @param {Object} options - Processing options
 * @returns {Object} Processing results
 */
async function runReflectionEngine(userId, options = {}) {
  if (!hasRequiredEnvVars || !supabase || !anthropic) {
    console.log('[Master Continuity] System not available - missing environment variables');
    return { success: false, error: 'System not configured' };
  }

  const startTime = Date.now();

  try {
    console.log(`[Master Continuity] Starting reflection engine for user ${userId}`);

    // Check if Shadow Mode is enabled
    const shadowModeEnabled = await isShadowModeEnabled(userId);
    if (!shadowModeEnabled) {
      console.log('[Master Continuity] Shadow Mode disabled, skipping reflection processing');
      return { success: true, skipped: true, reason: 'Shadow Mode disabled' };
    }

    // Step 1: Get unprocessed interactions
    const interactions = await getUnprocessedInteractions(userId, options.lookbackHours || 24);

    if (interactions.length === 0) {
      console.log('[Master Continuity] No new interactions to process');
      return { success: true, processed: 0, reflections: 0 };
    }

    console.log(`[Master Continuity] Found ${interactions.length} unprocessed interactions`);

    // Step 2: Analyze interactions for patterns
    const analysisResults = await analyzeInteractionPatterns(userId, interactions);

    // Step 3: Generate candidate reflections
    const candidateReflections = [];
    for (const analysis of analysisResults) {
      if (analysis.detected) {
        const validated = await validateReflection(analysis, interactions);
        if (validated.valid) {
          candidateReflections.push(analysis);
        } else {
          console.log(`[Master Continuity] Rejected reflection: ${validated.reasons.join(', ')}`);
        }
      }
    }

    // Step 4: Check for conflicts with existing reflections
    const resolvedReflections = await resolveReflectionConflicts(userId, candidateReflections);

    // Step 5: Store valid reflections in staging
    const stagedReflections = [];
    for (const reflection of resolvedReflections) {
      try {
        const staged = await stageReflection(userId, reflection, interactions);
        if (staged) {
          stagedReflections.push(staged);
        }
      } catch (error) {
        console.error(`[Master Continuity] Failed to stage reflection: ${error.message}`);
      }
    }

    // Step 6: Mark interactions as processed
    await markInteractionsProcessed(interactions.map(i => i.id));

    // Step 7: Update system health
    await updateSystemHealth(userId, {
      interactions_processed: interactions.length,
      reflections_generated: stagedReflections.length,
      reflections_rejected: candidateReflections.length - stagedReflections.length
    });

    const duration = Date.now() - startTime;

    console.log(`[Master Continuity] Reflection engine completed in ${duration}ms`);
    console.log(`[Master Continuity] Processed: ${interactions.length} interactions, Staged: ${stagedReflections.length} reflections`);

    return {
      success: true,
      processed: interactions.length,
      reflections: stagedReflections.length,
      duration,
      staged_reflection_ids: stagedReflections.map(r => r.id)
    };

  } catch (error) {
    console.error('[Master Continuity] Reflection engine failed:', error.message);
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Get unprocessed interactions for analysis
 */
async function getUnprocessedInteractions(userId, lookbackHours = 24) {
  try {
    const since = new Date(Date.now() - (lookbackHours * 60 * 60 * 1000)).toISOString();

    const { data: interactions, error } = await supabase
      .from('interactions')
      .select('*')
      .eq('user_id', userId)
      .eq('processed_for_reflection', false)
      .gte('timestamp', since)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    return interactions || [];
  } catch (error) {
    console.error('[Master Continuity] Failed to get unprocessed interactions:', error.message);
    return [];
  }
}

/**
 * Analyze interaction patterns using AI
 */
async function analyzeInteractionPatterns(userId, interactions) {
  try {
    // Format interactions for analysis
    const interactionRecords = interactions.map(i => ({
      id: i.id,
      timestamp: i.timestamp,
      speaker: i.speaker,
      content: i.content.substring(0, 500), // Limit content length for analysis
      topic: i.topic,
      emotional_weight: i.emotional_weight
    }));

    // Get existing reflections to avoid duplicates
    const { data: existingReflections } = await supabase
      .from('reflections')
      .select('summary, reflection_type, source_interactions')
      .eq('user_id', userId)
      .not('approval_status', 'eq', 'archived')
      .not('approval_status', 'eq', 'rejected');

    const prompt = REFLECTION_ANALYSIS_PROMPT.replace(
      '{interaction_records}',
      JSON.stringify(interactionRecords, null, 2)
    );

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const analysisText = response.content[0].text.trim();

    // Try to parse as JSON array
    let analysisResults = [];
    try {
      // Look for JSON arrays or objects in the response
      const jsonMatch = analysisText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        analysisResults = Array.isArray(parsed) ? parsed : [parsed];
      }
    } catch (parseError) {
      console.log('[Master Continuity] Could not parse analysis as JSON, skipping this batch');
      return [];
    }

    // Filter out duplicates with existing reflections
    const filteredResults = analysisResults.filter(result => {
      if (!result.detected || !result.summary) return false;

      // Check for similar existing reflections
      const isDuplicate = existingReflections?.some(existing =>
        existing.summary.toLowerCase().includes(result.summary.toLowerCase().substring(0, 50)) ||
        result.summary.toLowerCase().includes(existing.summary.toLowerCase().substring(0, 50))
      );

      return !isDuplicate;
    });

    console.log(`[Master Continuity] Analysis generated ${analysisResults.length} candidates, ${filteredResults.length} after deduplication`);

    return filteredResults;

  } catch (error) {
    console.error('[Master Continuity] Pattern analysis failed:', error.message);
    return [];
  }
}

/**
 * Validate a candidate reflection against anti-hallucination rules
 */
async function validateReflection(reflection, interactions) {
  const reasons = [];
  const required_changes = [];

  try {
    // Rule 1: Check minimum source count
    const sourceCount = reflection.source_interaction_ids?.length || 0;
    const requiredSources = reflection.impact_level === 'foundational' ? 3 : 2;

    if (sourceCount < requiredSources) {
      reasons.push(`Insufficient sources: ${sourceCount} < ${requiredSources} required for ${reflection.impact_level} impact`);
    }

    // Rule 2: Verify source interactions exist
    if (reflection.source_interaction_ids) {
      const validSources = reflection.source_interaction_ids.filter(id =>
        interactions.some(i => i.id === id)
      );

      if (validSources.length !== reflection.source_interaction_ids.length) {
        reasons.push('Some source interaction IDs do not exist in provided interactions');
      }
    }

    // Rule 3: Check evidence strength vs confidence
    const confidence = reflection.confidence || 0;
    const evidenceStrength = reflection.evidence_strength || 0;

    if (confidence > evidenceStrength) {
      reasons.push(`Confidence (${confidence}) exceeds evidence strength (${evidenceStrength})`);
    }

    // Rule 4: Check for vague language
    const vagueTerms = ['seems like', 'appears to', 'might be', 'possibly', 'perhaps', 'could indicate'];
    const hasVagueLanguage = vagueTerms.some(term =>
      reflection.summary?.toLowerCase().includes(term) ||
      reflection.what_i_noticed?.toLowerCase().includes(term)
    );

    if (hasVagueLanguage && confidence > 0.6) {
      reasons.push('Contains vague language but claims high confidence');
    }

    // Rule 5: Check content length requirements
    if (!reflection.summary || reflection.summary.length < 10) {
      reasons.push('Summary too short or missing');
    }

    if (!reflection.evidence_summary || reflection.evidence_summary.length < 20) {
      reasons.push('Evidence summary too short or missing');
    }

    // Rule 6: Check for validation concerns
    if (reflection.validation_concerns && reflection.validation_concerns.length > 0) {
      reasons.push(`Self-identified validation concerns: ${reflection.validation_concerns.join(', ')}`);
    }

    const valid = reasons.length === 0;

    if (!valid) {
      console.log(`[Master Continuity] Validation failed: ${reasons.join('; ')}`);
    }

    return {
      valid,
      reasons,
      required_changes
    };

  } catch (error) {
    console.error('[Master Continuity] Reflection validation failed:', error.message);
    return {
      valid: false,
      reasons: [`Validation error: ${error.message}`],
      required_changes: []
    };
  }
}

/**
 * Check for conflicts with existing reflections
 */
async function resolveReflectionConflicts(userId, candidateReflections) {
  // For now, return candidates as-is
  // TODO: Implement conflict detection and resolution
  return candidateReflections;
}

/**
 * Stage a valid reflection in the database
 */
async function stageReflection(userId, reflection, interactions) {
  try {
    const { data: staged, error } = await supabase
      .from('reflections')
      .insert({
        // Deployed `reflections` schema uses reflection_type / approval_status
        // and does not have human_readable_reason / impact_level / expiration_at.
        user_id: userId,
        reflection_type: reflection.type,
        state: 'developing',   // deployed CHECK: draft|developing|ready|surfaced|archived
        summary: reflection.summary,
        what_i_noticed: reflection.what_i_noticed,
        why_it_matters: reflection.why_it_matters || 'Pattern detected in interaction analysis',
        source_interactions: reflection.source_interaction_ids,
        evidence_summary: reflection.evidence_summary,
        confidence: reflection.confidence,
        evidence_strength: reflection.evidence_strength,
        signal_strength: reflection.confidence * reflection.evidence_strength,
        ready_to_surface: false, // Always false in Shadow Mode
        approval_status: 'staged'
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Master Continuity] Staged reflection ${staged.id}: ${reflection.summary.substring(0, 100)}...`);

    return staged;

  } catch (error) {
    console.error('[Master Continuity] Failed to stage reflection:', error.message);
    return null;
  }
}

/**
 * Mark interactions as processed
 */
async function markInteractionsProcessed(interactionIds) {
  try {
    if (interactionIds.length === 0) return;

    const { error } = await supabase
      .from('interactions')
      .update({
        processed_for_reflection: true,
        processing_notes: { processed_at: new Date().toISOString() }
      })
      .in('id', interactionIds);

    if (error) throw error;

    console.log(`[Master Continuity] Marked ${interactionIds.length} interactions as processed`);

  } catch (error) {
    console.error('[Master Continuity] Failed to mark interactions as processed:', error.message);
  }
}

/**
 * Check if Shadow Mode is enabled for user
 */
async function isShadowModeEnabled(userId) {
  try {
    const { data: health, error } = await supabase
      .from('reflection_system_health')
      .select('shadow_mode_enabled')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    return health?.shadow_mode_enabled ?? true; // Default enabled
  } catch (error) {
    console.error('[Master Continuity] Failed to check Shadow Mode status:', error.message);
    return true; // Default enabled on error
  }
}

/**
 * Update system health metrics
 */
async function updateSystemHealth(userId, stats) {
  try {
    const { error } = await supabase
      .from('reflection_system_health')
      .insert({
        user_id: userId,
        shadow_mode_enabled: true,
        autonomous_surfacing_enabled: false, // Always disabled in Shadow Mode
        interactions_processed: stats.interactions_processed || 0,
        reflections_generated: stats.reflections_generated || 0,
        reflections_rejected: stats.reflections_rejected || 0,
        system_status: 'healthy'
      });

    if (error) throw error;

  } catch (error) {
    console.error('[Master Continuity] Failed to update system health:', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERACTION CAPTURE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Capture interaction for reflection processing
 */
async function captureInteraction(userId, speaker, content, metadata = {}) {
  if (!hasRequiredEnvVars || !supabase) {
    return { success: false, error: 'System not configured' };
  }

  try {
    const { data: interaction, error } = await supabase
      .from('interactions')
      .insert({
        user_id: userId,
        speaker,
        content,
        tags: metadata.tags || [],
        emotional_weight: metadata.emotional_weight || 5,
        topic: metadata.topic || null,
        source_type: metadata.source_type || 'conversation'
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Master Continuity] Captured interaction ${interaction.id} from ${speaker}`);

    return { success: true, interaction_id: interaction.id };

  } catch (error) {
    console.error('[Master Continuity] Failed to capture interaction:', error.message);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  runReflectionEngine,
  captureInteraction,
  validateReflection,
  isShadowModeEnabled
};

// If run directly, execute a reflection cycle
if (require.main === module) {
  const userId = process.argv[2];

  if (!userId) {
    console.error('Usage: node master-continuity-engine.js <user-id>');
    process.exit(1);
  }

  runReflectionEngine(userId)
    .then(result => {
      console.log('\n=== REFLECTION ENGINE SUMMARY ===');
      console.log(`Success: ${result.success}`);
      console.log(`Processed: ${result.processed} interactions`);
      console.log(`Staged: ${result.reflections} reflections`);
      console.log(`Duration: ${result.duration}ms`);
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Manual reflection engine execution failed:', error);
      process.exit(1);
    });
}