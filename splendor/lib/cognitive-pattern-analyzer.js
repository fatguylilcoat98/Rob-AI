/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// COGNITIVE PATTERN ANALYZER
// Analyzes HOW the user approaches problems, not just what they think
// Extracts thinking patterns from conversation flows and problem-solving approaches

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

// Main cognitive pattern analysis
async function analyzeCognitivePatterns(conversationHistory, userMessage) {
  if (!userMessage || !process.env.ANTHROPIC_API_KEY) {
    return null;
  }

  try {
    console.log('[COGNITIVE-ANALYZER] Analyzing cognitive patterns...');

    // Build conversation context (last 5 exchanges for pattern recognition)
    const recentHistory = conversationHistory.slice(-10) || [];
    const historyText = recentHistory.map(turn => {
      const role = turn.role === 'user' ? 'User' : 'Splendor';
      return `${role}: ${turn.content}`;
    }).join('\n');

    const analysisPrompt = `Analyze HOW this person approaches thinking and problem-solving based on this conversation exchange.

CONVERSATION CONTEXT:
${historyText}

CURRENT MESSAGE: "${userMessage}"

Extract the user's cognitive patterns. Return ONLY valid JSON:

{
  "approach_analysis": {
    "entry_point": "direct_question|exploratory|systematic|intuitive|comparative",
    "exploration_pattern": "breadth_first|depth_first|spiral|linear|associative",
    "validation_method": "seeks_evidence|tests_logic|checks_values|gets_input|trusts_intuition",
    "closure_style": "decisive|iterative_refinement|consensus_building|keeps_exploring"
  },
  "reasoning_indicators": {
    "question_sequencing": "clarifying|challenging|exploratory|strategic|random",
    "conceptual_bridging": "uses_analogies|connects_domains|builds_frameworks|stays_concrete",
    "assumption_testing": "challenges_premises|accepts_given|probes_deeper|seeks_context",
    "uncertainty_handling": "comfortable|seeks_certainty|acknowledges_limits|avoids_deciding"
  },
  "communication_style": {
    "depth_preference": "surface|moderate|deep_dive|exhaustive",
    "topic_transitions": "linear|associative|tangential|structured",
    "feedback_style": "direct|diplomatic|collaborative|teaching"
  },
  "meta_patterns": {
    "cognitive_load": "handles_complexity_well|prefers_simple|builds_gradually",
    "attention_style": "sustained_focus|rapid_switching|parallel_processing",
    "learning_preference": "conceptual|experiential|visual|analytical"
  },
  "confidence": 0.7
}

Focus on PROCESS not CONTENT. How do they think, not what they think about.`;

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 800,
      system: `You are a cognitive pattern recognition specialist. Analyze HOW people think and approach problems, not what they think about.

Focus on:
- Problem-solving approaches and entry points
- Reasoning sequences and logical flows
- How they handle uncertainty and validation
- Communication and exploration patterns
- Cognitive preferences and thinking styles

Return precise JSON analysis of their thinking patterns.`,
      messages: [{
        role: 'user',
        content: analysisPrompt
      }]
    });

    // Parse response with error handling
    let analysisData;
    try {
      const rawText = response.content[0].text.trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      analysisData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[COGNITIVE-ANALYZER] JSON parse error:', parseError.message);
      return null;
    }

    // Validate and sanitize the analysis
    const patterns = validateAndSanitizePatterns(analysisData);
    if (!patterns) {
      return null;
    }

    // Add metadata
    patterns.metadata = {
      analyzed_at: new Date().toISOString(),
      conversation_length: conversationHistory.length,
      message_length: userMessage.length,
      analysis_confidence: patterns.confidence || 0.7
    };

    console.log(`[COGNITIVE-ANALYZER] Analysis complete (confidence: ${patterns.confidence})`);
    return patterns;

  } catch (error) {
    console.error('[COGNITIVE-ANALYZER] Analysis error:', error.message);
    return null;
  }
}

// Validate and sanitize pattern analysis
function validateAndSanitizePatterns(rawPatterns) {
  try {
    if (!rawPatterns || typeof rawPatterns !== 'object') {
      return null;
    }

    // Define valid values for each pattern dimension
    const validValues = {
      entry_point: ['direct_question', 'exploratory', 'systematic', 'intuitive', 'comparative'],
      exploration_pattern: ['breadth_first', 'depth_first', 'spiral', 'linear', 'associative'],
      validation_method: ['seeks_evidence', 'tests_logic', 'checks_values', 'gets_input', 'trusts_intuition'],
      closure_style: ['decisive', 'iterative_refinement', 'consensus_building', 'keeps_exploring'],
      question_sequencing: ['clarifying', 'challenging', 'exploratory', 'strategic', 'random'],
      depth_preference: ['surface', 'moderate', 'deep_dive', 'exhaustive'],
      topic_transitions: ['linear', 'associative', 'tangential', 'structured'],
      uncertainty_handling: ['comfortable', 'seeks_certainty', 'acknowledges_limits', 'avoids_deciding']
    };

    // Sanitize each pattern
    const sanitized = {
      approach_analysis: {},
      reasoning_indicators: {},
      communication_style: {},
      meta_patterns: {},
      confidence: Math.min(1.0, Math.max(0.0, parseFloat(rawPatterns.confidence) || 0.5))
    };

    // Validate approach_analysis
    if (rawPatterns.approach_analysis) {
      const approach = rawPatterns.approach_analysis;
      sanitized.approach_analysis = {
        entry_point: validValues.entry_point.includes(approach.entry_point) ? approach.entry_point : 'exploratory',
        exploration_pattern: validValues.exploration_pattern.includes(approach.exploration_pattern) ? approach.exploration_pattern : 'linear',
        validation_method: validValues.validation_method.includes(approach.validation_method) ? approach.validation_method : 'seeks_evidence',
        closure_style: validValues.closure_style.includes(approach.closure_style) ? approach.closure_style : 'iterative_refinement'
      };
    }

    // Validate reasoning_indicators
    if (rawPatterns.reasoning_indicators) {
      const reasoning = rawPatterns.reasoning_indicators;
      sanitized.reasoning_indicators = {
        question_sequencing: validValues.question_sequencing.includes(reasoning.question_sequencing) ? reasoning.question_sequencing : 'exploratory',
        conceptual_bridging: String(reasoning.conceptual_bridging || 'builds_frameworks').substring(0, 50),
        assumption_testing: String(reasoning.assumption_testing || 'probes_deeper').substring(0, 50),
        uncertainty_handling: validValues.uncertainty_handling.includes(reasoning.uncertainty_handling) ? reasoning.uncertainty_handling : 'acknowledges_limits'
      };
    }

    // Validate communication_style
    if (rawPatterns.communication_style) {
      const comm = rawPatterns.communication_style;
      sanitized.communication_style = {
        depth_preference: validValues.depth_preference.includes(comm.depth_preference) ? comm.depth_preference : 'moderate',
        topic_transitions: validValues.topic_transitions.includes(comm.topic_transitions) ? comm.topic_transitions : 'linear',
        feedback_style: String(comm.feedback_style || 'collaborative').substring(0, 30)
      };
    }

    // Validate meta_patterns
    if (rawPatterns.meta_patterns) {
      const meta = rawPatterns.meta_patterns;
      sanitized.meta_patterns = {
        cognitive_load: String(meta.cognitive_load || 'builds_gradually').substring(0, 50),
        attention_style: String(meta.attention_style || 'sustained_focus').substring(0, 50),
        learning_preference: String(meta.learning_preference || 'analytical').substring(0, 30)
      };
    }

    return sanitized;

  } catch (error) {
    console.error('[COGNITIVE-ANALYZER] Validation error:', error.message);
    return null;
  }
}

// Analyze specific cognitive dimensions from a conversation segment
async function analyzeSpecificDimension(userMessage, dimension, context = {}) {
  if (!userMessage || !dimension) {
    return null;
  }

  try {
    const dimensionPrompts = {
      'decision_making': `Analyze how this person approaches decisions. What's their decision-making style?`,
      'problem_solving': `Analyze their problem-solving approach. How do they break down and tackle problems?`,
      'information_processing': `How does this person process and organize information? What patterns do you see?`,
      'uncertainty_handling': `How does this person deal with uncertainty and ambiguity?`,
      'learning_style': `What learning and thinking style does this person demonstrate?`
    };

    const prompt = dimensionPrompts[dimension] || `Analyze the ${dimension} dimension of how this person thinks.`;

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 300,
      system: `Analyze a specific cognitive dimension. Focus on PROCESS not CONTENT.`,
      messages: [{
        role: 'user',
        content: `${prompt}\n\nMessage: "${userMessage}"\n\nContext: ${JSON.stringify(context)}`
      }]
    });

    return {
      dimension,
      analysis: response.content[0].text.trim(),
      confidence: 0.6,
      analyzed_at: new Date().toISOString()
    };

  } catch (error) {
    console.error(`[COGNITIVE-ANALYZER] Dimension analysis error (${dimension}):`, error.message);
    return null;
  }
}

// Extract thinking patterns from conversation flow
function extractConversationFlow(conversationHistory) {
  if (!Array.isArray(conversationHistory) || conversationHistory.length < 2) {
    return null;
  }

  try {
    const userMessages = conversationHistory.filter(turn => turn.role === 'user');
    if (userMessages.length < 2) {
      return null;
    }

    const flow = {
      message_count: userMessages.length,
      avg_message_length: userMessages.reduce((sum, msg) => sum + msg.content.length, 0) / userMessages.length,
      question_count: userMessages.filter(msg => msg.content.includes('?')).length,
      topic_shifts: 0,
      interaction_pace: 'normal'
    };

    // Analyze topic shifts (simplified)
    for (let i = 1; i < userMessages.length; i++) {
      const prev = userMessages[i-1].content.toLowerCase();
      const curr = userMessages[i].content.toLowerCase();

      // Simple keyword overlap check
      const prevWords = new Set(prev.split(' ').filter(w => w.length > 3));
      const currWords = new Set(curr.split(' ').filter(w => w.length > 3));
      const overlap = [...prevWords].filter(w => currWords.has(w)).length;

      if (overlap < 2) {
        flow.topic_shifts++;
      }
    }

    flow.topic_continuity = flow.topic_shifts < userMessages.length * 0.3 ? 'high' : 'low';

    return flow;

  } catch (error) {
    console.error('[COGNITIVE-ANALYZER] Flow analysis error:', error.message);
    return null;
  }
}

module.exports = {
  analyzeCognitivePatterns,
  analyzeSpecificDimension,
  extractConversationFlow,
  validateAndSanitizePatterns
};