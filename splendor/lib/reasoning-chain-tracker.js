/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// REASONING CHAIN TRACKER
// Maps logical flows and decision processes in real time
// Tracks HOW decisions are reached, not just WHAT decisions are made

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('./supabase');

let _anthropic = null;
function anthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const MODEL = 'claude-sonnet-4-6';

// Track reasoning chain for a single message exchange
async function trackReasoningChain(userMessage, context = {}, previousChains = []) {
  if (!userMessage || !process.env.ANTHROPIC_API_KEY) {
    return null;
  }

  try {
    console.log('[REASONING-TRACKER] Tracking reasoning chain...');

    // Build context from previous reasoning chains
    const chainHistory = previousChains.slice(-3).map(chain => {
      return `Previous: ${chain.reasoning_type} → ${chain.logical_structure}`;
    }).join('\n');

    const reasoningPrompt = `Analyze the reasoning process in this message. Focus on HOW the person is thinking through the problem.

MESSAGE: "${userMessage}"

CONTEXT: ${JSON.stringify(context)}

RECENT REASONING HISTORY:
${chainHistory || 'None'}

Extract the reasoning chain. Return ONLY valid JSON:

{
  "reasoning_analysis": {
    "reasoning_type": "logical|intuitive|analogical|empirical|deductive|inductive|abductive",
    "logical_structure": "linear|branching|circular|hierarchical|network|emergent",
    "evidence_handling": "seeks_facts|relies_experience|trusts_authority|tests_hypotheses|synthesizes_sources",
    "assumption_awareness": "explicit|implicit|unexamined|challenges_own|accepts_given"
  },
  "decision_framework": {
    "decision_criteria": ["accuracy", "efficiency", "values_alignment", "risk_level", "other"],
    "evaluation_method": "pros_cons|scoring|gut_check|consensus|comparison|elimination",
    "uncertainty_response": "gather_more_data|proceed_cautiously|delay_decision|accept_uncertainty|seek_advice",
    "commitment_level": "tentative|confident|absolute|conditional"
  },
  "cognitive_tools": {
    "mental_models_used": ["systems_thinking", "first_principles", "precedent_based", "analogical", "other"],
    "problem_decomposition": "breaks_down|tackles_whole|identifies_core|explores_edges",
    "pattern_recognition": "seeks_patterns|accepts_uniqueness|compares_cases|builds_categories",
    "validation_approach": "self_check|external_validation|logical_proof|empirical_test|peer_review"
  },
  "meta_cognition": {
    "awareness_of_thinking": "high|medium|low",
    "strategy_adjustment": "adapts_approach|sticks_to_method|experiments_freely",
    "bias_recognition": "acknowledges_bias|assumes_objectivity|actively_counters",
    "confidence_calibration": "well_calibrated|overconfident|underconfident|variable"
  },
  "reasoning_confidence": 0.8
}

Focus on the PROCESS of thinking, not the content being thought about.`;

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: `You are a reasoning process analyst. Map HOW people think through problems and make decisions.

Analyze:
- Logical structures and reasoning patterns
- Decision-making frameworks and criteria
- How they handle evidence and uncertainty
- Metacognitive awareness and adaptation
- Problem-solving tools and approaches

Return detailed JSON analysis of their reasoning process.`,
      messages: [{
        role: 'user',
        content: reasoningPrompt
      }]
    });

    // Parse and validate response
    let reasoningData;
    try {
      const rawText = response.content[0].text.trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      reasoningData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[REASONING-TRACKER] JSON parse error:', parseError.message);
      return null;
    }

    // Validate and structure the reasoning chain
    const reasoningChain = validateReasoningChain(reasoningData, userMessage, context);
    if (!reasoningChain) {
      return null;
    }

    console.log(`[REASONING-TRACKER] Chain tracked (confidence: ${reasoningChain.reasoning_confidence})`);
    return reasoningChain;

  } catch (error) {
    console.error('[REASONING-TRACKER] Tracking error:', error.message);
    return null;
  }
}

// Validate and structure reasoning chain data
function validateReasoningChain(rawData, userMessage, context) {
  try {
    if (!rawData || typeof rawData !== 'object') {
      return null;
    }

    // Define valid values
    const validValues = {
      reasoning_type: ['logical', 'intuitive', 'analogical', 'empirical', 'deductive', 'inductive', 'abductive'],
      logical_structure: ['linear', 'branching', 'circular', 'hierarchical', 'network', 'emergent'],
      evidence_handling: ['seeks_facts', 'relies_experience', 'trusts_authority', 'tests_hypotheses', 'synthesizes_sources'],
      evaluation_method: ['pros_cons', 'scoring', 'gut_check', 'consensus', 'comparison', 'elimination'],
      uncertainty_response: ['gather_more_data', 'proceed_cautiously', 'delay_decision', 'accept_uncertainty', 'seek_advice'],
      commitment_level: ['tentative', 'confident', 'absolute', 'conditional']
    };

    // Build validated reasoning chain
    const chain = {
      reasoning_analysis: {
        reasoning_type: validValues.reasoning_type.includes(rawData.reasoning_analysis?.reasoning_type)
          ? rawData.reasoning_analysis.reasoning_type : 'logical',
        logical_structure: validValues.logical_structure.includes(rawData.reasoning_analysis?.logical_structure)
          ? rawData.reasoning_analysis.logical_structure : 'linear',
        evidence_handling: validValues.evidence_handling.includes(rawData.reasoning_analysis?.evidence_handling)
          ? rawData.reasoning_analysis.evidence_handling : 'seeks_facts',
        assumption_awareness: String(rawData.reasoning_analysis?.assumption_awareness || 'implicit').substring(0, 30)
      },
      decision_framework: {
        decision_criteria: Array.isArray(rawData.decision_framework?.decision_criteria)
          ? rawData.decision_framework.decision_criteria.slice(0, 5) : ['accuracy'],
        evaluation_method: validValues.evaluation_method.includes(rawData.decision_framework?.evaluation_method)
          ? rawData.decision_framework.evaluation_method : 'pros_cons',
        uncertainty_response: validValues.uncertainty_response.includes(rawData.decision_framework?.uncertainty_response)
          ? rawData.decision_framework.uncertainty_response : 'gather_more_data',
        commitment_level: validValues.commitment_level.includes(rawData.decision_framework?.commitment_level)
          ? rawData.decision_framework.commitment_level : 'tentative'
      },
      cognitive_tools: {
        mental_models_used: Array.isArray(rawData.cognitive_tools?.mental_models_used)
          ? rawData.cognitive_tools.mental_models_used.slice(0, 5) : ['systems_thinking'],
        problem_decomposition: String(rawData.cognitive_tools?.problem_decomposition || 'breaks_down').substring(0, 30),
        pattern_recognition: String(rawData.cognitive_tools?.pattern_recognition || 'seeks_patterns').substring(0, 30),
        validation_approach: String(rawData.cognitive_tools?.validation_approach || 'self_check').substring(0, 30)
      },
      meta_cognition: {
        awareness_of_thinking: ['high', 'medium', 'low'].includes(rawData.meta_cognition?.awareness_of_thinking)
          ? rawData.meta_cognition.awareness_of_thinking : 'medium',
        strategy_adjustment: String(rawData.meta_cognition?.strategy_adjustment || 'adapts_approach').substring(0, 30),
        bias_recognition: String(rawData.meta_cognition?.bias_recognition || 'assumes_objectivity').substring(0, 30),
        confidence_calibration: String(rawData.meta_cognition?.confidence_calibration || 'well_calibrated').substring(0, 30)
      },
      reasoning_confidence: Math.min(1.0, Math.max(0.0, parseFloat(rawData.reasoning_confidence) || 0.6)),
      metadata: {
        tracked_at: new Date().toISOString(),
        original_message: userMessage.substring(0, 200),
        context_type: context.type || 'general',
        message_complexity: calculateMessageComplexity(userMessage)
      }
    };

    return chain;

  } catch (error) {
    console.error('[REASONING-TRACKER] Validation error:', error.message);
    return null;
  }
}

// Calculate complexity score for a message
function calculateMessageComplexity(message) {
  if (!message) return 0;

  let complexity = 0;

  // Length factor (longer messages often more complex)
  complexity += Math.min(3, message.length / 100);

  // Question marks (indicate inquiry/exploration)
  complexity += (message.match(/\?/g) || []).length * 0.5;

  // Conditional language (if, then, unless, when)
  const conditionals = (message.match(/\b(if|then|unless|when|because|since|although)\b/gi) || []).length;
  complexity += conditionals * 0.3;

  // Complex conjunctions (however, nevertheless, furthermore)
  const complexConjunctions = (message.match(/\b(however|nevertheless|furthermore|moreover|nonetheless)\b/gi) || []).length;
  complexity += complexConjunctions * 0.5;

  // Multiple clauses (semicolons, complex sentence structures)
  complexity += (message.match(/[;:]/g) || []).length * 0.3;

  return Math.min(10, Math.round(complexity * 10) / 10);
}

// Track decision evolution over time
async function trackDecisionEvolution(userId, decisionId, newReasoning, previousReasoning) {
  try {
    if (!userId || !decisionId || !newReasoning || !previousReasoning) {
      return null;
    }

    const evolutionData = {
      user_id: userId,
      decision_id: decisionId,
      previous_reasoning: previousReasoning,
      new_reasoning: newReasoning,
      evolution_type: classifyEvolution(previousReasoning, newReasoning),
      tracked_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('reasoning_evolution')
      .insert(evolutionData)
      .select()
      .single();

    if (error) {
      console.error('[REASONING-TRACKER] Evolution tracking error:', error.message);
      return null;
    }

    return data;

  } catch (error) {
    console.error('[REASONING-TRACKER] Decision evolution error:', error.message);
    return null;
  }
}

// Classify how reasoning has evolved
function classifyEvolution(previousReasoning, newReasoning) {
  if (!previousReasoning || !newReasoning) {
    return 'unknown';
  }

  try {
    // Simple classification based on reasoning type changes
    const prevType = previousReasoning.reasoning_analysis?.reasoning_type;
    const newType = newReasoning.reasoning_analysis?.reasoning_type;

    if (prevType === newType) {
      return 'refinement';
    }

    const evolutionMap = {
      'logical→intuitive': 'shift_to_intuition',
      'intuitive→logical': 'shift_to_logic',
      'deductive→inductive': 'bottom_up_shift',
      'inductive→deductive': 'top_down_shift'
    };

    const evolutionKey = `${prevType}→${newType}`;
    return evolutionMap[evolutionKey] || 'approach_change';

  } catch (error) {
    return 'unknown';
  }
}

// Aggregate reasoning patterns over time
async function aggregateReasoningPatterns(userId, timeWindow = '7 days') {
  try {
    const since = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();

    // This would normally query a reasoning_chains table
    // For now, return a placeholder structure
    return {
      dominant_reasoning_type: 'logical',
      preferred_logical_structure: 'linear',
      common_decision_criteria: ['accuracy', 'efficiency'],
      uncertainty_response_pattern: 'gather_more_data',
      meta_cognition_level: 'medium',
      evolution_trends: [],
      confidence_trends: 'stable',
      analyzed_period: timeWindow,
      chain_count: 0
    };

  } catch (error) {
    console.error('[REASONING-TRACKER] Aggregation error:', error.message);
    return null;
  }
}

module.exports = {
  trackReasoningChain,
  trackDecisionEvolution,
  aggregateReasoningPatterns,
  validateReasoningChain,
  calculateMessageComplexity
};