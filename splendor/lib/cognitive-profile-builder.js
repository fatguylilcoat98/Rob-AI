/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// COGNITIVE PROFILE BUILDER
// Aggregates patterns from analyzer and tracker into a coherent cognitive profile
// Builds and maintains the complete cognitive fingerprint over time

const { supabase } = require('./supabase');

// Build complete cognitive profile from accumulated data
async function buildCognitiveProfile(userId) {
  if (!userId) {
    return null;
  }

  try {
    console.log(`[COGNITIVE-BUILDER] Building cognitive profile for ${userId}...`);

    // Get existing profile if it exists
    const existingProfile = await getCognitiveProfile(userId);

    // Get recent cognitive patterns (would normally query cognitive_patterns table)
    // For now, we'll build a basic structure and let it evolve
    const recentPatterns = await gatherRecentPatterns(userId);

    // Build the complete cognitive fingerprint
    const fingerprint = buildCognitiveFingerprint(recentPatterns, existingProfile);

    // Calculate confidence score based on data volume
    const confidenceScore = calculateProfileConfidence(recentPatterns, existingProfile);

    const profile = {
      user_id: userId,
      fingerprint,
      last_updated: new Date().toISOString(),
      conversation_count: recentPatterns.conversation_count || 0,
      confidence_score: confidenceScore
    };

    console.log(`[COGNITIVE-BUILDER] Profile built (confidence: ${confidenceScore.toFixed(2)})`);
    return profile;

  } catch (error) {
    console.error('[COGNITIVE-BUILDER] Build error:', error.message);
    return null;
  }
}

// Update cognitive profile with new patterns
async function updateCognitiveProfile(userId, newPatterns) {
  if (!userId || !newPatterns) {
    return null;
  }

  try {
    console.log(`[COGNITIVE-BUILDER] Updating cognitive profile for ${userId}...`);

    // Get current profile
    const currentProfile = await getCognitiveProfile(userId);

    // Merge new patterns with existing profile
    const updatedFingerprint = mergePatterns(currentProfile?.fingerprint, newPatterns);

    // Calculate new confidence score
    const conversationCount = (currentProfile?.conversation_count || 0) + 1;
    const confidenceScore = Math.min(1.0, conversationCount / 20); // Max confidence after 20 conversations

    const profileData = {
      user_id: userId,
      fingerprint: updatedFingerprint,
      last_updated: new Date().toISOString(),
      conversation_count: conversationCount,
      confidence_score: confidenceScore
    };

    // Upsert the profile
    const { data, error } = await supabase
      .from('cognitive_profiles')
      .upsert(profileData)
      .select()
      .single();

    if (error) {
      console.error('[COGNITIVE-BUILDER] Update error:', error.message);
      return null;
    }

    console.log(`[COGNITIVE-BUILDER] Profile updated (confidence: ${confidenceScore.toFixed(2)})`);
    return data;

  } catch (error) {
    console.error('[COGNITIVE-BUILDER] Update error:', error.message);
    return null;
  }
}

// Build the core cognitive fingerprint structure
function buildCognitiveFingerprint(patterns, existingProfile) {
  // Default fingerprint structure
  const fingerprint = {
    reasoning_patterns: {
      analytical_style: 'systematic',
      problem_decomposition: 'top_down',
      decision_framework: 'evidence_based',
      uncertainty_handling: 'seeks_certainty'
    },
    communication_patterns: {
      question_types: ['exploratory', 'clarifying'],
      topic_transition_style: 'linear',
      depth_preference: 'moderate',
      feedback_style: 'collaborative'
    },
    cognitive_preferences: {
      learning_style: 'analytical',
      attention_patterns: 'sustained_focus',
      mental_models: ['systems_thinking', 'frameworks'],
      cognitive_biases: ['pattern_seeking']
    },
    contextual_adaptations: {
      stress_response: 'becomes_more_systematic',
      creative_triggers: 'constraints_and_frameworks',
      energy_patterns: 'consistent',
      domain_expertise: {}
    },
    meta_profile: {
      profile_version: '1.0',
      last_major_update: new Date().toISOString(),
      stability_score: 0.5,
      evolution_rate: 'moderate'
    }
  };

  // If we have an existing profile, use it as the base
  if (existingProfile?.fingerprint) {
    return mergeFingerprints(existingProfile.fingerprint, fingerprint);
  }

  // If we have patterns from recent analysis, incorporate them
  if (patterns) {
    return incorporatePatterns(fingerprint, patterns);
  }

  return fingerprint;
}

// Merge two fingerprints, preserving existing data and adding new insights
function mergeFingerprints(existing, updates) {
  try {
    const merged = JSON.parse(JSON.stringify(existing)); // Deep copy

    // Merge reasoning patterns
    if (updates.reasoning_patterns) {
      merged.reasoning_patterns = {
        ...merged.reasoning_patterns,
        ...updates.reasoning_patterns
      };
    }

    // Merge communication patterns
    if (updates.communication_patterns) {
      merged.communication_patterns = {
        ...merged.communication_patterns,
        ...updates.communication_patterns
      };

      // Merge question types arrays
      if (updates.communication_patterns.question_types) {
        const existingTypes = new Set(merged.communication_patterns.question_types || []);
        updates.communication_patterns.question_types.forEach(type => existingTypes.add(type));
        merged.communication_patterns.question_types = Array.from(existingTypes).slice(0, 5);
      }
    }

    // Merge cognitive preferences
    if (updates.cognitive_preferences) {
      merged.cognitive_preferences = {
        ...merged.cognitive_preferences,
        ...updates.cognitive_preferences
      };

      // Merge mental models arrays
      if (updates.cognitive_preferences.mental_models) {
        const existingModels = new Set(merged.cognitive_preferences.mental_models || []);
        updates.cognitive_preferences.mental_models.forEach(model => existingModels.add(model));
        merged.cognitive_preferences.mental_models = Array.from(existingModels).slice(0, 5);
      }
    }

    // Update meta profile
    merged.meta_profile = {
      ...merged.meta_profile,
      last_major_update: new Date().toISOString(),
      profile_version: incrementVersion(merged.meta_profile?.profile_version || '1.0')
    };

    return merged;

  } catch (error) {
    console.error('[COGNITIVE-BUILDER] Fingerprint merge error:', error.message);
    return existing; // Return existing profile if merge fails
  }
}

// Incorporate new patterns into fingerprint
function incorporatePatterns(fingerprint, patterns) {
  try {
    const updated = JSON.parse(JSON.stringify(fingerprint)); // Deep copy

    // Incorporate cognitive pattern analysis
    if (patterns.cognitive_analysis) {
      const analysis = patterns.cognitive_analysis;

      if (analysis.approach_analysis) {
        updated.reasoning_patterns.analytical_style = mapAnalyticalStyle(analysis.approach_analysis.exploration_pattern);
        updated.reasoning_patterns.problem_decomposition = mapProblemDecomposition(analysis.approach_analysis.entry_point);
        updated.reasoning_patterns.uncertainty_handling = analysis.approach_analysis.validation_method;
      }

      if (analysis.communication_style) {
        updated.communication_patterns.depth_preference = analysis.communication_style.depth_preference;
        updated.communication_patterns.topic_transition_style = analysis.communication_style.topic_transitions;
        updated.communication_patterns.feedback_style = analysis.communication_style.feedback_style;
      }

      if (analysis.meta_patterns) {
        updated.cognitive_preferences.attention_patterns = analysis.meta_patterns.attention_style;
        updated.cognitive_preferences.learning_style = analysis.meta_patterns.learning_preference;
      }
    }

    // Incorporate reasoning chain analysis
    if (patterns.reasoning_analysis) {
      const reasoning = patterns.reasoning_analysis;

      updated.reasoning_patterns.decision_framework = mapDecisionFramework(reasoning.evaluation_method);
      updated.reasoning_patterns.uncertainty_handling = reasoning.uncertainty_response;

      if (reasoning.cognitive_tools?.mental_models_used) {
        updated.cognitive_preferences.mental_models = reasoning.cognitive_tools.mental_models_used;
      }
    }

    return updated;

  } catch (error) {
    console.error('[COGNITIVE-BUILDER] Pattern incorporation error:', error.message);
    return fingerprint;
  }
}

// Helper function to map exploration patterns to analytical styles
function mapAnalyticalStyle(explorationPattern) {
  const mapping = {
    'breadth_first': 'comprehensive',
    'depth_first': 'focused',
    'spiral': 'iterative',
    'linear': 'systematic',
    'associative': 'intuitive'
  };
  return mapping[explorationPattern] || 'systematic';
}

// Helper function to map entry points to problem decomposition styles
function mapProblemDecomposition(entryPoint) {
  const mapping = {
    'systematic': 'top_down',
    'exploratory': 'bottom_up',
    'intuitive': 'holistic',
    'direct_question': 'targeted',
    'comparative': 'lateral'
  };
  return mapping[entryPoint] || 'top_down';
}

// Helper function to map evaluation methods to decision frameworks
function mapDecisionFramework(evaluationMethod) {
  const mapping = {
    'pros_cons': 'evidence_based',
    'gut_check': 'intuitive',
    'consensus': 'collaborative',
    'comparison': 'analytical',
    'scoring': 'systematic'
  };
  return mapping[evaluationMethod] || 'evidence_based';
}

// Merge new patterns with existing profile
function mergePatterns(existingFingerprint, newPatterns) {
  if (!existingFingerprint) {
    return buildCognitiveFingerprint(newPatterns);
  }

  return incorporatePatterns(existingFingerprint, newPatterns);
}

// Calculate profile confidence based on data volume and consistency
function calculateProfileConfidence(patterns, existingProfile) {
  let confidence = 0.1; // Base confidence

  // Conversation count factor
  const conversationCount = existingProfile?.conversation_count || 0;
  confidence += Math.min(0.6, conversationCount * 0.03); // Up to 0.6 from conversations

  // Data richness factor
  if (patterns) {
    if (patterns.cognitive_analysis) confidence += 0.1;
    if (patterns.reasoning_analysis) confidence += 0.1;
    if (patterns.conversation_flow) confidence += 0.05;
  }

  // Consistency factor (simplified)
  if (existingProfile?.confidence_score) {
    const previousConfidence = existingProfile.confidence_score;
    confidence = (confidence + previousConfidence * 0.8) / 1.8; // Weighted average
  }

  return Math.min(1.0, Math.max(0.1, confidence));
}

// Get existing cognitive profile
async function getCognitiveProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('cognitive_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[COGNITIVE-BUILDER] Get profile error:', error.message);
      return null;
    }

    return data;

  } catch (error) {
    console.error('[COGNITIVE-BUILDER] Get profile error:', error.message);
    return null;
  }
}

// Gather recent patterns (placeholder - would normally query pattern tables)
async function gatherRecentPatterns(userId) {
  try {
    // This would normally query cognitive pattern and reasoning chain tables
    // For now, return a basic structure
    return {
      conversation_count: 1,
      cognitive_analysis: null,
      reasoning_analysis: null,
      conversation_flow: null
    };

  } catch (error) {
    console.error('[COGNITIVE-BUILDER] Pattern gathering error:', error.message);
    return null;
  }
}

// Increment version number
function incrementVersion(currentVersion) {
  try {
    const [major, minor] = currentVersion.split('.').map(Number);
    return `${major}.${minor + 1}`;
  } catch {
    return '1.1';
  }
}

// Get profile summary for debugging
async function getProfileSummary(userId) {
  try {
    const profile = await getCognitiveProfile(userId);
    if (!profile) {
      return {
        exists: false,
        userId
      };
    }

    const fingerprint = profile.fingerprint;
    return {
      exists: true,
      userId,
      confidence: profile.confidence_score,
      conversations: profile.conversation_count,
      lastUpdated: profile.last_updated,
      reasoningStyle: fingerprint.reasoning_patterns?.analytical_style,
      communicationStyle: fingerprint.communication_patterns?.feedback_style,
      learningStyle: fingerprint.cognitive_preferences?.learning_style,
      version: fingerprint.meta_profile?.profile_version
    };

  } catch (error) {
    console.error('[COGNITIVE-BUILDER] Summary error:', error.message);
    return null;
  }
}

module.exports = {
  buildCognitiveProfile,
  updateCognitiveProfile,
  getCognitiveProfile,
  getProfileSummary,
  mergePatterns,
  calculateProfileConfidence
};