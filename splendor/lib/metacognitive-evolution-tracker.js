/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// METACOGNITIVE EVOLUTION TRACKER
// Monitors how Christopher's thinking patterns change over time
// Detects when patterns shift and logs the transition triggers

const { supabase } = require('./supabase');
const Anthropic = require('@anthropic-ai/sdk');

let _anthropic = null;
function anthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const MODEL = 'claude-sonnet-4-6';

// Track evolution in thinking patterns
async function trackEvolution(userId, dimension, previousPattern, newPattern, trigger = null) {
  if (!userId || !dimension || !previousPattern || !newPattern) {
    return null;
  }

  // Skip tracking if patterns are identical
  if (previousPattern === newPattern) {
    return null;
  }

  try {
    console.log(`[EVOLUTION-TRACKER] Tracking evolution: ${dimension} (${previousPattern} → ${newPattern})`);

    // Analyze the evolution significance
    const evolutionAnalysis = await analyzeEvolutionSignificance(
      dimension,
      previousPattern,
      newPattern,
      trigger
    );

    if (!evolutionAnalysis || evolutionAnalysis.significance === 'negligible') {
      console.log('[EVOLUTION-TRACKER] Evolution deemed negligible, skipping storage');
      return null;
    }

    const evolutionRecord = {
      user_id: userId,
      thinking_dimension: dimension,
      previous_pattern: String(previousPattern).substring(0, 200),
      new_pattern: String(newPattern).substring(0, 200),
      transition_trigger: trigger ? String(trigger).substring(0, 300) : null,
      confidence_score: evolutionAnalysis.confidence,
      evolution_type: evolutionAnalysis.type,
      significance_level: evolutionAnalysis.significance,
      context_data: evolutionAnalysis.context || {},
      timestamp: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('cognitive_evolution')
      .insert(evolutionRecord)
      .select()
      .single();

    if (error) {
      console.error('[EVOLUTION-TRACKER] Storage error:', error.message);
      return null;
    }

    console.log(`[EVOLUTION-TRACKER] Evolution tracked: ${data.id} (${evolutionAnalysis.significance})`);
    return data;

  } catch (error) {
    console.error('[EVOLUTION-TRACKER] Tracking error:', error.message);
    return null;
  }
}

// Analyze the significance of an evolution
async function analyzeEvolutionSignificance(dimension, previousPattern, newPattern, trigger) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      significance: 'unknown',
      confidence: 0.5,
      type: 'unknown'
    };
  }

  try {
    const analysisPrompt = `Analyze the significance of this thinking pattern evolution:

DIMENSION: ${dimension}
PREVIOUS PATTERN: ${previousPattern}
NEW PATTERN: ${newPattern}
TRIGGER: ${trigger || 'Unknown'}

Evaluate:
1. How significant is this change? (negligible/minor/moderate/major)
2. What type of evolution is this? (refinement/shift/expansion/regression/adaptation)
3. How confident are you in this analysis? (0.0-1.0)
4. What might have caused this evolution?

Return ONLY valid JSON:
{
  "significance": "negligible|minor|moderate|major",
  "type": "refinement|shift|expansion|regression|adaptation",
  "confidence": 0.8,
  "likely_cause": "experience|context_change|learning|stress|growth",
  "implications": "brief description of what this means",
  "reversible": true,
  "context": {"additional": "data"}
}

Focus on the cognitive change, not the content being thought about.`;

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 400,
      system: `You are a metacognitive evolution analyst. Assess how thinking patterns change over time.

Significance Levels:
- negligible: Minor variation, not worth tracking
- minor: Small but detectable change
- moderate: Clear shift in approach
- major: Fundamental change in thinking style

Evolution Types:
- refinement: Same approach, better execution
- shift: Different approach to same problems
- expansion: Adding new thinking tools
- regression: Moving to simpler approaches
- adaptation: Changing based on context`,

      messages: [{
        role: 'user',
        content: analysisPrompt
      }]
    });

    // Parse the analysis
    let analysis;
    try {
      const rawText = response.content[0].text.trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[EVOLUTION-TRACKER] Analysis parse error:', parseError.message);
      return {
        significance: 'unknown',
        confidence: 0.5,
        type: 'unknown'
      };
    }

    // Validate and return
    return {
      significance: ['negligible', 'minor', 'moderate', 'major'].includes(analysis.significance)
        ? analysis.significance : 'unknown',
      type: ['refinement', 'shift', 'expansion', 'regression', 'adaptation'].includes(analysis.type)
        ? analysis.type : 'unknown',
      confidence: Math.min(1.0, Math.max(0.0, parseFloat(analysis.confidence) || 0.5)),
      likely_cause: analysis.likely_cause,
      implications: analysis.implications,
      reversible: Boolean(analysis.reversible),
      context: analysis.context || {}
    };

  } catch (error) {
    console.error('[EVOLUTION-TRACKER] Analysis error:', error.message);
    return {
      significance: 'unknown',
      confidence: 0.3,
      type: 'unknown'
    };
  }
}

// Track cognitive profile evolution over time
async function trackProfileEvolution(userId, oldFingerprint, newFingerprint, trigger = 'profile_update') {
  if (!userId || !oldFingerprint || !newFingerprint) {
    return null;
  }

  try {
    console.log(`[EVOLUTION-TRACKER] Tracking profile evolution for ${userId}...`);

    const evolutionChanges = [];

    // Compare reasoning patterns
    if (oldFingerprint.reasoning_patterns && newFingerprint.reasoning_patterns) {
      const reasoningEvolution = await comparePatternSections(
        'reasoning_patterns',
        oldFingerprint.reasoning_patterns,
        newFingerprint.reasoning_patterns,
        trigger
      );
      if (reasoningEvolution.length > 0) {
        evolutionChanges.push(...reasoningEvolution);
      }
    }

    // Compare communication patterns
    if (oldFingerprint.communication_patterns && newFingerprint.communication_patterns) {
      const communicationEvolution = await comparePatternSections(
        'communication_patterns',
        oldFingerprint.communication_patterns,
        newFingerprint.communication_patterns,
        trigger
      );
      if (communicationEvolution.length > 0) {
        evolutionChanges.push(...communicationEvolution);
      }
    }

    // Compare cognitive preferences
    if (oldFingerprint.cognitive_preferences && newFingerprint.cognitive_preferences) {
      const cognitiveEvolution = await comparePatternSections(
        'cognitive_preferences',
        oldFingerprint.cognitive_preferences,
        newFingerprint.cognitive_preferences,
        trigger
      );
      if (cognitiveEvolution.length > 0) {
        evolutionChanges.push(...cognitiveEvolution);
      }
    }

    // Track all significant changes
    const trackedEvolutions = [];
    for (const change of evolutionChanges) {
      const evolution = await trackEvolution(
        userId,
        change.dimension,
        change.previous,
        change.new,
        change.trigger
      );
      if (evolution) {
        trackedEvolutions.push(evolution);
      }
    }

    console.log(`[EVOLUTION-TRACKER] Profile evolution tracked: ${trackedEvolutions.length} changes`);
    return trackedEvolutions;

  } catch (error) {
    console.error('[EVOLUTION-TRACKER] Profile evolution error:', error.message);
    return null;
  }
}

// Compare sections of cognitive patterns
async function comparePatternSections(sectionName, oldSection, newSection, trigger) {
  const changes = [];

  try {
    // Compare each field in the sections
    const allKeys = new Set([...Object.keys(oldSection), ...Object.keys(newSection)]);

    for (const key of allKeys) {
      const oldValue = oldSection[key];
      const newValue = newSection[key];

      // Handle different value types
      if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        // Compare arrays
        const oldSet = new Set(oldValue);
        const newSet = new Set(newValue);
        const added = [...newSet].filter(x => !oldSet.has(x));
        const removed = [...oldSet].filter(x => !newSet.has(x));

        if (added.length > 0 || removed.length > 0) {
          changes.push({
            dimension: `${sectionName}.${key}`,
            previous: oldValue.join(', '),
            new: newValue.join(', '),
            trigger
          });
        }
      } else if (oldValue !== newValue) {
        // Compare scalar values
        if (oldValue !== undefined && newValue !== undefined) {
          changes.push({
            dimension: `${sectionName}.${key}`,
            previous: String(oldValue),
            new: String(newValue),
            trigger
          });
        }
      }
    }

    return changes;

  } catch (error) {
    console.error('[EVOLUTION-TRACKER] Section comparison error:', error.message);
    return [];
  }
}

// Get evolution history for a user
async function getEvolutionHistory(userId, limit = 20, dimension = null) {
  try {
    let query = supabase
      .from('cognitive_evolution')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (dimension) {
      query = query.eq('thinking_dimension', dimension);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[EVOLUTION-TRACKER] History fetch error:', error.message);
      return [];
    }

    return data || [];

  } catch (error) {
    console.error('[EVOLUTION-TRACKER] History error:', error.message);
    return [];
  }
}

// Analyze evolution trends over time
async function analyzeEvolutionTrends(userId, timeWindow = '30 days') {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: evolutions, error } = await supabase
      .from('cognitive_evolution')
      .select('*')
      .eq('user_id', userId)
      .gte('timestamp', since.toISOString())
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('[EVOLUTION-TRACKER] Trend analysis error:', error.message);
      return null;
    }

    if (!evolutions || evolutions.length === 0) {
      return {
        period: timeWindow,
        evolution_count: 0,
        trends: {},
        stability: 'stable'
      };
    }

    // Analyze trends
    const dimensionCounts = {};
    const evolutionTypes = {};
    const significanceLevels = {};

    evolutions.forEach(evolution => {
      // Count by dimension
      dimensionCounts[evolution.thinking_dimension] =
        (dimensionCounts[evolution.thinking_dimension] || 0) + 1;

      // Count by type
      evolutionTypes[evolution.evolution_type] =
        (evolutionTypes[evolution.evolution_type] || 0) + 1;

      // Count by significance
      significanceLevels[evolution.significance_level] =
        (significanceLevels[evolution.significance_level] || 0) + 1;
    });

    // Calculate stability score
    const totalEvolutions = evolutions.length;
    const majorEvolutions = significanceLevels.major || 0;
    const stabilityScore = Math.max(0, 1 - (totalEvolutions / 20) - (majorEvolutions / 5));

    return {
      period: timeWindow,
      evolution_count: totalEvolutions,
      trends: {
        most_evolving_dimension: Object.keys(dimensionCounts)
          .reduce((a, b) => dimensionCounts[a] > dimensionCounts[b] ? a : b, ''),
        dominant_evolution_type: Object.keys(evolutionTypes)
          .reduce((a, b) => evolutionTypes[a] > evolutionTypes[b] ? a : b, ''),
        avg_significance: calculateAverageSignificance(evolutions)
      },
      stability: stabilityScore > 0.7 ? 'stable' : stabilityScore > 0.4 ? 'evolving' : 'dynamic',
      stability_score: stabilityScore,
      recent_evolutions: evolutions.slice(-5)
    };

  } catch (error) {
    console.error('[EVOLUTION-TRACKER] Trend analysis error:', error.message);
    return null;
  }
}

// Calculate average significance level
function calculateAverageSignificance(evolutions) {
  if (!evolutions || evolutions.length === 0) return 0;

  const significanceMap = { negligible: 0, minor: 1, moderate: 2, major: 3 };
  const total = evolutions.reduce((sum, ev) => {
    return sum + (significanceMap[ev.significance_level] || 0);
  }, 0);

  return total / evolutions.length;
}

// Detect cognitive regression or concerning patterns
async function detectCognitiveRegression(userId, recentEvolutions) {
  try {
    if (!recentEvolutions || recentEvolutions.length === 0) {
      return null;
    }

    const regressionIndicators = [];

    // Check for regression evolution types
    const recentRegressions = recentEvolutions.filter(ev => ev.evolution_type === 'regression');
    if (recentRegressions.length > 2) {
      regressionIndicators.push({
        type: 'multiple_regressions',
        count: recentRegressions.length,
        concern_level: 'moderate'
      });
    }

    // Check for high volatility in key dimensions
    const dimensionChanges = {};
    recentEvolutions.forEach(ev => {
      dimensionChanges[ev.thinking_dimension] = (dimensionChanges[ev.thinking_dimension] || 0) + 1;
    });

    Object.entries(dimensionChanges).forEach(([dimension, count]) => {
      if (count > 3) {
        regressionIndicators.push({
          type: 'high_volatility',
          dimension,
          change_count: count,
          concern_level: 'low'
        });
      }
    });

    return regressionIndicators.length > 0 ? {
      indicators: regressionIndicators,
      overall_concern: regressionIndicators.some(i => i.concern_level === 'moderate') ? 'moderate' : 'low',
      recommendations: generateRegressionRecommendations(regressionIndicators)
    } : null;

  } catch (error) {
    console.error('[EVOLUTION-TRACKER] Regression detection error:', error.message);
    return null;
  }
}

// Generate recommendations for addressing regression
function generateRegressionRecommendations(indicators) {
  const recommendations = [];

  if (indicators.some(i => i.type === 'multiple_regressions')) {
    recommendations.push('Consider whether stress or external factors are affecting thinking patterns');
  }

  if (indicators.some(i => i.type === 'high_volatility')) {
    recommendations.push('Monitor for consistency in core thinking dimensions');
  }

  return recommendations;
}

module.exports = {
  trackEvolution,
  trackProfileEvolution,
  getEvolutionHistory,
  analyzeEvolutionTrends,
  detectCognitiveRegression,
  analyzeEvolutionSignificance
};