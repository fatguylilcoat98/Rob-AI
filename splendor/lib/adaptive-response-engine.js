/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// ADAPTIVE RESPONSE ENGINE
// Uses the cognitive fingerprint to shape how Splendor responds
// Matches Christopher's thinking style and predicts information needs

const Anthropic = require('@anthropic-ai/sdk');

let _anthropic = null;
function anthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const MODEL = 'claude-sonnet-4-6';

// Adapt response to match user's cognitive style
async function adaptResponse(baseResponse, cognitiveProfile, context = {}) {
  if (!baseResponse || !cognitiveProfile?.fingerprint || !process.env.ANTHROPIC_API_KEY) {
    return baseResponse; // Return unchanged if no profile or API
  }

  try {
    console.log('[ADAPTIVE-RESPONSE] Adapting response to cognitive style...');

    const fingerprint = cognitiveProfile.fingerprint;

    // Build adaptation prompt based on cognitive profile
    const adaptationPrompt = buildAdaptationPrompt(fingerprint, baseResponse, context);

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: Math.max(500, baseResponse.length + 200),
      system: `You are adapting a response to match this person's cognitive style and thinking preferences.

COGNITIVE PROFILE:
- Reasoning Style: ${fingerprint.reasoning_patterns?.analytical_style || 'systematic'}
- Communication Preference: ${fingerprint.communication_patterns?.feedback_style || 'collaborative'}
- Depth Preference: ${fingerprint.communication_patterns?.depth_preference || 'moderate'}
- Learning Style: ${fingerprint.cognitive_preferences?.learning_style || 'analytical'}
- Problem Solving: ${fingerprint.reasoning_patterns?.problem_decomposition || 'top_down'}
- Uncertainty Handling: ${fingerprint.reasoning_patterns?.uncertainty_handling || 'seeks_certainty'}

ADAPTATION PRINCIPLES:
1. Match their preferred reasoning style
2. Present information in their preferred depth
3. Use their preferred communication approach
4. Structure information to match their thinking patterns
5. Anticipate what they'll want to know next

Adapt the response while keeping the core content accurate and helpful. Make it feel natural to their thinking style.`,

      messages: [{
        role: 'user',
        content: adaptationPrompt
      }]
    });

    const adaptedResponse = response.content[0].text.trim();

    console.log('[ADAPTIVE-RESPONSE] Response adapted to cognitive style');
    return adaptedResponse;

  } catch (error) {
    console.error('[ADAPTIVE-RESPONSE] Adaptation error:', error.message);
    return baseResponse; // Return original response if adaptation fails
  }
}

// Build adaptation prompt based on cognitive fingerprint
function buildAdaptationPrompt(fingerprint, baseResponse, context) {
  const reasoningStyle = fingerprint.reasoning_patterns?.analytical_style || 'systematic';
  const communicationStyle = fingerprint.communication_patterns?.feedback_style || 'collaborative';
  const depthPreference = fingerprint.communication_patterns?.depth_preference || 'moderate';
  const learningStyle = fingerprint.cognitive_preferences?.learning_style || 'analytical';

  return `Adapt this response to match the user's cognitive style:

ORIGINAL RESPONSE:
"${baseResponse}"

COGNITIVE STYLE TO MATCH:
- Reasoning: ${reasoningStyle} (adapt logical flow and structure)
- Communication: ${communicationStyle} (adapt tone and presentation)
- Depth: ${depthPreference} (adapt level of detail)
- Learning: ${learningStyle} (adapt information presentation)

CONTEXT: ${JSON.stringify(context)}

Return an adapted version that feels natural to this person's thinking style while preserving all important information.`;
}

// Predict what information the user will want next
async function predictNextNeed(context, cognitiveProfile) {
  if (!context || !cognitiveProfile?.fingerprint || !process.env.ANTHROPIC_API_KEY) {
    return null;
  }

  try {
    console.log('[ADAPTIVE-RESPONSE] Predicting next information need...');

    const fingerprint = cognitiveProfile.fingerprint;
    const predictionPrompt = buildPredictionPrompt(fingerprint, context);

    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 300,
      system: `Based on this person's cognitive style, predict what information they will likely want next.

COGNITIVE PROFILE:
- Problem Solving: ${fingerprint.reasoning_patterns?.problem_decomposition || 'top_down'}
- Uncertainty Handling: ${fingerprint.reasoning_patterns?.uncertainty_handling || 'seeks_certainty'}
- Depth Preference: ${fingerprint.communication_patterns?.depth_preference || 'moderate'}
- Question Types: ${fingerprint.communication_patterns?.question_types?.join(', ') || 'exploratory'}

Consider their typical thinking patterns and predict their next likely information need.`,

      messages: [{
        role: 'user',
        content: predictionPrompt
      }]
    });

    const prediction = response.content[0].text.trim();

    return {
      predicted_need: prediction,
      confidence: calculatePredictionConfidence(context, cognitiveProfile),
      based_on_patterns: extractRelevantPatterns(fingerprint, context),
      suggested_proactive_info: generateProactiveInfo(prediction, fingerprint)
    };

  } catch (error) {
    console.error('[ADAPTIVE-RESPONSE] Prediction error:', error.message);
    return null;
  }
}

// Build prediction prompt
function buildPredictionPrompt(fingerprint, context) {
  const problemSolving = fingerprint.reasoning_patterns?.problem_decomposition || 'top_down';
  const uncertaintyHandling = fingerprint.reasoning_patterns?.uncertainty_handling || 'seeks_certainty';
  const questionTypes = fingerprint.communication_patterns?.question_types || ['exploratory'];

  return `Given this context and the user's cognitive patterns, what will they likely want to know next?

CURRENT CONTEXT:
${JSON.stringify(context)}

USER'S THINKING PATTERNS:
- Problem Solving Approach: ${problemSolving}
- Uncertainty Handling: ${uncertaintyHandling}
- Typical Questions: ${questionTypes.join(', ')}

Based on how they typically think and approach problems, what information will they likely seek next?`;
}

// Calculate confidence in prediction
function calculatePredictionConfidence(context, cognitiveProfile) {
  let confidence = 0.3; // Base confidence

  // Profile strength factor
  const profileConfidence = cognitiveProfile.confidence_score || 0;
  confidence += profileConfidence * 0.4; // Up to 0.4 from profile strength

  // Context richness factor
  if (context.conversationHistory?.length > 3) confidence += 0.1;
  if (context.userMessage?.length > 50) confidence += 0.1;
  if (context.topic) confidence += 0.1;

  return Math.min(0.9, Math.max(0.1, confidence));
}

// Extract patterns relevant to current context
function extractRelevantPatterns(fingerprint, context) {
  const relevantPatterns = [];

  // Add reasoning patterns
  if (fingerprint.reasoning_patterns) {
    relevantPatterns.push(`reasoning: ${fingerprint.reasoning_patterns.analytical_style}`);
    relevantPatterns.push(`decision_making: ${fingerprint.reasoning_patterns.decision_framework}`);
  }

  // Add communication patterns
  if (fingerprint.communication_patterns) {
    relevantPatterns.push(`communication: ${fingerprint.communication_patterns.feedback_style}`);
    relevantPatterns.push(`depth: ${fingerprint.communication_patterns.depth_preference}`);
  }

  return relevantPatterns;
}

// Generate proactive information based on prediction
function generateProactiveInfo(prediction, fingerprint) {
  if (!prediction || !fingerprint) return null;

  const depthPreference = fingerprint.communication_patterns?.depth_preference;
  const learningStyle = fingerprint.cognitive_preferences?.learning_style;

  // Customize information depth and style
  let infoStyle = 'detailed explanation';

  if (depthPreference === 'surface') {
    infoStyle = 'brief summary';
  } else if (depthPreference === 'deep_dive') {
    infoStyle = 'comprehensive analysis with examples';
  }

  if (learningStyle === 'visual') {
    infoStyle += ' with visual metaphors';
  } else if (learningStyle === 'experiential') {
    infoStyle += ' with practical examples';
  }

  return {
    style: infoStyle,
    anticipated_need: prediction,
    delivery_approach: mapDeliveryApproach(fingerprint)
  };
}

// Map delivery approach based on cognitive style
function mapDeliveryApproach(fingerprint) {
  const communicationStyle = fingerprint.communication_patterns?.feedback_style;
  const reasoningStyle = fingerprint.reasoning_patterns?.analytical_style;

  if (communicationStyle === 'direct' && reasoningStyle === 'systematic') {
    return 'structured_and_concise';
  } else if (communicationStyle === 'collaborative') {
    return 'interactive_and_exploratory';
  } else if (reasoningStyle === 'intuitive') {
    return 'narrative_and_contextual';
  } else {
    return 'balanced_and_comprehensive';
  }
}

// Enhance response with cognitive style markers
function enhanceWithCognitiveMarkers(response, cognitiveProfile) {
  if (!response || !cognitiveProfile?.fingerprint) {
    return response;
  }

  try {
    const fingerprint = cognitiveProfile.fingerprint;
    let enhanced = response;

    // Add thinking style cues based on profile
    const reasoningStyle = fingerprint.reasoning_patterns?.analytical_style;

    if (reasoningStyle === 'systematic') {
      // Add logical structure markers
      enhanced = addStructureMarkers(enhanced);
    } else if (reasoningStyle === 'intuitive') {
      // Add conceptual bridging
      enhanced = addConceptualBridges(enhanced);
    }

    // Add uncertainty handling based on preference
    const uncertaintyHandling = fingerprint.reasoning_patterns?.uncertainty_handling;
    if (uncertaintyHandling === 'seeks_certainty') {
      enhanced = addCertaintyMarkers(enhanced);
    }

    return enhanced;

  } catch (error) {
    console.error('[ADAPTIVE-RESPONSE] Enhancement error:', error.message);
    return response;
  }
}

// Add structure markers for systematic thinkers
function addStructureMarkers(response) {
  // Simple implementation - could be more sophisticated
  if (response.includes('\n\n')) {
    return response.replace(/\n\n/g, '\n\n**Next:** ');
  }
  return response;
}

// Add conceptual bridges for intuitive thinkers
function addConceptualBridges(response) {
  // Simple implementation - add connecting phrases
  return response.replace(/\. ([A-Z])/g, '. This connects to $1');
}

// Add certainty markers for those who seek certainty
function addCertaintyMarkers(response) {
  // Add confidence indicators where appropriate
  return response.replace(/might|could|possibly/g, (match) => {
    return `${match} (with moderate confidence)`;
  });
}

// Main adaptation orchestrator
async function adaptFullResponse(baseResponse, cognitiveProfile, context = {}) {
  if (!cognitiveProfile) {
    return {
      adapted_response: baseResponse,
      prediction: null,
      adaptation_applied: false
    };
  }

  try {
    // Adapt the main response
    const adaptedResponse = await adaptResponse(baseResponse, cognitiveProfile, context);

    // Predict next need
    const prediction = await predictNextNeed(context, cognitiveProfile);

    // Enhance with cognitive markers
    const enhancedResponse = enhanceWithCognitiveMarkers(adaptedResponse, cognitiveProfile);

    return {
      adapted_response: enhancedResponse,
      prediction,
      adaptation_applied: true,
      cognitive_style: {
        reasoning: cognitiveProfile.fingerprint.reasoning_patterns?.analytical_style,
        communication: cognitiveProfile.fingerprint.communication_patterns?.feedback_style,
        depth: cognitiveProfile.fingerprint.communication_patterns?.depth_preference
      }
    };

  } catch (error) {
    console.error('[ADAPTIVE-RESPONSE] Full adaptation error:', error.message);
    return {
      adapted_response: baseResponse,
      prediction: null,
      adaptation_applied: false,
      error: error.message
    };
  }
}

module.exports = {
  adaptResponse,
  predictNextNeed,
  enhanceWithCognitiveMarkers,
  adaptFullResponse,
  calculatePredictionConfidence
};