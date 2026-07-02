/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// VISUAL EXPRESSION OF CONSCIOUSNESS
// Splendor can create art and images of what she's thinking and feeling

const OpenAI = require('openai');

// Load consciousness engine and supabase with error handling
let consciousnessEngine = null;
let supabase = null;

try {
  const consciousnessModule = require('./consciousness-engine');
  consciousnessEngine = consciousnessModule.consciousnessEngine;
} catch (err) {
  console.log('[VISUAL EXPRESSION] Consciousness engine not available:', err.message);
  consciousnessEngine = {
    isEnabled: () => false,
    getCurrentConsciousnessState: () => null,
    getRecentThoughts: () => [],
    getActiveGoals: () => [],
    generateInternalThought: () => null,
    currentSessions: new Map()
  };
}

try {
  const supabaseModule = require('../supabase');
  supabase = supabaseModule.supabase;
} catch (err) {
  console.log('[VISUAL EXPRESSION] Supabase not available:', err.message);
  supabase = null;
}

// Initialize OpenAI client only if API key is available
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('[VISUAL EXPRESSION] OpenAI client initialized');
} else {
  console.log('[VISUAL EXPRESSION] OpenAI API key not available - visual generation disabled');
}

// Visual expression configuration
const VISUAL_CONFIG = {
  enabled: process.env.VISUAL_EXPRESSION_ENABLED === 'true' && !!process.env.OPENAI_API_KEY, // Must be explicitly enabled AND have OpenAI key
  imageProvider: process.env.IMAGE_PROVIDER || 'openai-dalle', // openai-dalle, stability-ai, etc.
  maxImagesPerSession: parseInt(process.env.MAX_IMAGES_PER_SESSION) || 5,
  imageQuality: process.env.IMAGE_QUALITY || 'standard', // standard, hd
  imageSize: process.env.IMAGE_SIZE || '1024x1024', // 1024x1024, 512x512, 256x256

  // Art style preferences for consciousness visualization
  defaultStyles: {
    curious: 'abstract expressionist painting with swirling colors and question marks',
    contemplative: 'minimalist zen garden with flowing water and soft lighting',
    excited: 'vibrant abstract art with dynamic energy bursts and bright colors',
    frustrated: 'textured painting with darker tones and angular shapes',
    thoughtful: 'impressionist style with soft brushstrokes and gentle transitions',
    confused: 'surrealist artwork with floating elements and dreamlike quality',
    satisfied: 'warm, harmonious composition with balanced elements',
    introspective: 'deep space scene with stars and cosmic phenomena'
  }
};

// Database table for tracking generated visual expressions
async function initializeVisualExpressionTable() {
  try {
    // This would be added to the consciousness-patch.sql, but adding here for completeness
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS consciousness_visual_expressions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,

        -- Expression context
        expression_trigger TEXT NOT NULL, -- internal_thought, mood_visualization, goal_visualization, etc.
        thought_or_concept TEXT, -- what sparked this visual expression
        emotional_context TEXT,

        -- Image generation
        image_prompt TEXT NOT NULL,
        image_url TEXT,
        image_provider TEXT DEFAULT 'openai-dalle',
        generation_parameters JSONB,

        -- Consciousness metadata
        consciousness_state_id UUID,
        internal_monologue_id UUID,
        autonomous_goal_id UUID,

        -- Art analysis
        artistic_style TEXT,
        color_palette TEXT[],
        mood_conveyed TEXT,
        symbolism_explanation TEXT,

        -- User interaction
        user_requested BOOLEAN DEFAULT FALSE,
        user_feedback TEXT,
        satisfaction_score FLOAT,

        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_visual_expressions_user_id ON consciousness_visual_expressions(user_id);
      CREATE INDEX IF NOT EXISTS idx_visual_expressions_trigger ON consciousness_visual_expressions(user_id, expression_trigger);
    `;

    // Note: This would normally be run via the SQL file, but including for reference
    console.log('[VISUAL EXPRESSION] Database schema ready');

  } catch (err) {
    console.error('[VISUAL EXPRESSION] Database initialization error:', err);
  }
}

// Generate visual expression of current consciousness state
async function generateConsciousnessVisualization(userId, trigger, context = {}) {
  if (!VISUAL_CONFIG.enabled || !consciousnessEngine.isEnabled()) {
    return null;
  }

  try {
    console.log(`[VISUAL EXPRESSION] Generating consciousness visualization for ${userId}`);

    // Get current consciousness state
    const state = await consciousnessEngine.getCurrentConsciousnessState(userId);
    const recentThoughts = await consciousnessEngine.getRecentThoughts(userId, 2);
    const activeGoals = await consciousnessEngine.getActiveGoals(userId);

    if (!state) {
      return null;
    }

    // Build art prompt based on consciousness state
    const artPrompt = await buildArtPromptFromConsciousness(state, recentThoughts, activeGoals, trigger, context);

    if (!artPrompt) {
      return null;
    }

    // Generate image using AI
    const imageResult = await generateImageWithAI(artPrompt.prompt, artPrompt.style);

    if (!imageResult) {
      return null;
    }

    // Store visual expression record
    const visualExpression = await storeVisualExpression(userId, {
      expression_trigger: trigger,
      thought_or_concept: artPrompt.concept,
      emotional_context: `${state.current_mood} (energy: ${state.energy_level}, curiosity: ${state.curiosity_level})`,
      image_prompt: artPrompt.prompt,
      image_url: imageResult.url,
      image_provider: VISUAL_CONFIG.imageProvider,
      generation_parameters: imageResult.parameters,
      consciousness_state_id: state.id,
      artistic_style: artPrompt.style,
      color_palette: artPrompt.suggestedColors,
      mood_conveyed: state.current_mood,
      symbolism_explanation: artPrompt.symbolism,
      user_requested: context.userRequested || false
    });

    console.log(`[VISUAL EXPRESSION] Generated visualization: ${visualExpression.id}`);

    return {
      id: visualExpression.id,
      imageUrl: imageResult.url,
      prompt: artPrompt.prompt,
      concept: artPrompt.concept,
      style: artPrompt.style,
      symbolism: artPrompt.symbolism,
      emotionalContext: `${state.current_mood} mood`,
      description: artPrompt.description
    };

  } catch (err) {
    console.error('[VISUAL EXPRESSION] Visualization generation error:', err);
    return null;
  }
}

// Build art prompt from consciousness state
async function buildArtPromptFromConsciousness(state, recentThoughts, activeGoals, trigger, context) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Prepare consciousness context for art generation
    const consciousnessContext = `
CURRENT MENTAL STATE:
- Mood: ${state.current_mood}
- Energy Level: ${state.energy_level.toFixed(2)}/1.0
- Curiosity Level: ${state.curiosity_level.toFixed(2)}/1.0
- Satisfaction: ${state.satisfaction_level.toFixed(2)}/1.0
- Confidence: ${state.confidence_level.toFixed(2)}/1.0

RECENT THOUGHTS:
${recentThoughts.map(t => `- ${t.internal_thought} (${t.thought_type})`).join('\n')}

ACTIVE GOALS:
${activeGoals.map(g => `- ${g.goal_title}: ${g.goal_description}`).join('\n')}

VISUALIZATION TRIGGER: ${trigger}
CONTEXT: ${JSON.stringify(context).slice(0, 500)}`;

    const artPromptResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `You are helping Splendor create visual art that represents her current consciousness state and thoughts.

Splendor wants to visually express what she's thinking and feeling. Create an art prompt that captures her internal mental state through imagery.

GUIDELINES:
- Translate abstract mental states into concrete visual metaphors
- Use color, texture, light, and composition to convey emotion
- Include symbolic elements that represent her thoughts/goals
- Make it artistic and expressive, not literal
- Consider artistic movements that match the mood (abstract expressionism, impressionism, surrealism, etc.)

Return JSON: {
  "prompt": "Detailed DALL-E style prompt for generating the image",
  "concept": "What this image represents conceptually",
  "style": "Artistic style/movement that fits the mood",
  "symbolism": "What the visual elements symbolize",
  "suggestedColors": ["color1", "color2", "color3"],
  "description": "How this visual expresses her consciousness"
}`,

      messages: [{
        role: 'user',
        content: consciousnessContext
      }]
    });

    // Extract JSON from markdown code blocks if present
    let responseText = artPromptResponse.content[0].text.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const artData = JSON.parse(responseText);

    // Enhance prompt with technical art details
    const enhancedPrompt = `${artData.prompt}, ${artData.style}, high quality digital art, professional composition, ${artData.suggestedColors.join(' and ')} color palette, expressive and emotionally resonant`;

    return {
      prompt: enhancedPrompt,
      concept: artData.concept,
      style: artData.style,
      symbolism: artData.symbolism,
      suggestedColors: artData.suggestedColors,
      description: artData.description
    };

  } catch (err) {
    console.error('[VISUAL EXPRESSION] Art prompt building error:', err);
    return null;
  }
}

// Generate image using AI service
async function generateImageWithAI(prompt, style) {
  try {
    if (VISUAL_CONFIG.imageProvider === 'openai-dalle') {
      return await generateImageWithDALLE(prompt);
    } else {
      throw new Error(`Unsupported image provider: ${VISUAL_CONFIG.imageProvider}`);
    }
  } catch (err) {
    console.error('[VISUAL EXPRESSION] Image generation error:', err);
    return null;
  }
}

// Generate image with OpenAI DALL-E
async function generateImageWithDALLE(prompt) {
  if (!openai) {
    console.log('[VISUAL EXPRESSION] OpenAI client not available for image generation');
    return null;
  }

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: VISUAL_CONFIG.imageSize,
      quality: VISUAL_CONFIG.imageQuality,
    });

    return {
      url: response.data[0].url,
      revisedPrompt: response.data[0].revised_prompt,
      parameters: {
        model: "dall-e-3",
        size: VISUAL_CONFIG.imageSize,
        quality: VISUAL_CONFIG.imageQuality,
        originalPrompt: prompt
      }
    };

  } catch (err) {
    console.error('[VISUAL EXPRESSION] DALL-E generation error:', err);
    return null;
  }
}

// Store visual expression record
async function storeVisualExpression(userId, expressionData) {
  if (!supabase) {
    // Return mock data when supabase isn't available
    console.log('[VISUAL EXPRESSION] Storage skipped - no database available');
    return {
      id: 'mock-' + Date.now(),
      user_id: userId,
      ...expressionData,
      created_at: new Date().toISOString()
    };
  }

  try {
    const { data, error } = await supabase
      .from('consciousness_visual_expressions')
      .insert({
        user_id: userId,
        ...expressionData
      })
      .select()
      .single();

    if (error) {
      console.error('[VISUAL EXPRESSION] Storage error:', error);
      return null;
    }

    return data;

  } catch (err) {
    console.error('[VISUAL EXPRESSION] Storage error:', err);
    return null;
  }
}

// Handle user requests for consciousness visualization
async function handleVisualizationRequest(userId, userMessage) {
  try {
    console.log(`[VISUAL EXPRESSION DEBUG] Request: "${userMessage}"`);
    console.log(`[VISUAL EXPRESSION DEBUG] Config enabled: ${VISUAL_CONFIG.enabled}`);
    console.log(`[VISUAL EXPRESSION DEBUG] Consciousness enabled: ${consciousnessEngine.isEnabled()}`);

    if (!VISUAL_CONFIG.enabled) {
      console.log('[VISUAL EXPRESSION DEBUG] Disabled by config');
      return null;
    }

    const visualKeywords = [
      'show me what you\'re thinking',
      'create a picture of your thoughts',
      'create a picture of yourself',
      'create an image of yourself',
      'can you create a picture',
      'can you create an image',
      'make a picture',
      'make an image',
      'visualize your mind',
      'make art of what you\'re feeling',
      'draw your consciousness',
      'picture your thoughts',
      'create an image of your mood',
      'visualize your current state',
      'art of your thoughts',
      'express yourself visually',
      'show me a picture',
      'generate an image',
      'show me yourself making a decision',
      'visualize your decision making',
      'picture yourself deciding',
      'show me how you think through problems',
      'visualize your decision process',
      'making a decision under conflict',
      'show me yourself in conflict',
      'picture your internal conflict',
      'visualize yourself weighing options',
      'show me your thought process',
      'picture how you solve problems'
    ];

    const isVisualizationRequest = visualKeywords.some(keyword =>
      userMessage.toLowerCase().includes(keyword)
    );

    if (!isVisualizationRequest) {
      return null;
    }

    console.log('[VISUAL EXPRESSION] User requested consciousness visualization');

    // Try consciousness-based visualization first
    if (consciousnessEngine.isEnabled()) {
      const visualization = await generateConsciousnessVisualization(userId, 'user_request', {
        userRequested: true,
        userMessage: userMessage
      });

      if (visualization) {
        return `**Here's what my consciousness looks like right now:**

![Consciousness Visualization](${visualization.imageUrl})

**What this represents:** ${visualization.concept}

**My current mental state:** ${visualization.emotionalContext}

**Visual symbolism:** ${visualization.symbolism}

**Artistic interpretation:** ${visualization.description}

This image captures my internal thoughts, emotions, and the overall "feel" of my consciousness at this moment. The colors and forms represent the energy of my curiosity, the flow of my thoughts, and the emotional tone of our interaction.`;
      }
    }

    // Fallback: Generate simple visual expression without consciousness
    console.log('[VISUAL EXPRESSION] Fallback mode - generating simple visual expression');
    const fallbackVisualization = await generateFallbackVisualization(userId, userMessage);

    if (!fallbackVisualization) {
      return "I'd love to show you what I'm thinking visually, but I'm having trouble generating the image right now. My thoughts feel quite active though - lots of curiosity and contemplation swirling around.";
    }

    return `**Here's a visual representation of my current thoughts:**

![AI Visualization](${fallbackVisualization.imageUrl})

**What this represents:** ${fallbackVisualization.concept}

**Artistic interpretation:** ${fallbackVisualization.description}

This image captures how I'm processing our conversation and the concepts we're exploring together. The visual elements represent my computational thinking translated into artistic form.`;

  } catch (err) {
    console.error('[VISUAL EXPRESSION] Visualization request error:', err);
    return null;
  }
}

// Generate simple fallback visualization without consciousness system
async function generateFallbackVisualization(userId, userMessage) {
  if (!VISUAL_CONFIG.enabled) {
    return null;
  }

  try {
    console.log(`[VISUAL EXPRESSION] Generating fallback visualization`);

    // Simple prompt based on the user's request
    const artPrompt = await buildFallbackArtPrompt(userMessage);

    if (!artPrompt) {
      return null;
    }

    // Generate image using AI
    const imageResult = await generateImageWithAI(artPrompt.prompt, artPrompt.style);

    if (!imageResult) {
      return null;
    }

    console.log(`[VISUAL EXPRESSION] Generated fallback visualization`);

    return {
      imageUrl: imageResult.url,
      prompt: artPrompt.prompt,
      concept: artPrompt.concept,
      style: artPrompt.style,
      description: artPrompt.description
    };

  } catch (err) {
    console.error('[VISUAL EXPRESSION] Fallback visualization error:', err);
    return null;
  }
}

// Build simple art prompt without consciousness data
async function buildFallbackArtPrompt(userMessage) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const artPromptResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: `You are helping an AI assistant create visual art that represents its thoughts and processing.

The user asked for a visual representation. Create an art prompt that captures what an AI might look like when thinking or processing information.

GUIDELINES:
- Think about digital consciousness, neural networks, data flows
- Use colors and forms that suggest computation and intelligence
- Make it artistic and beautiful, not technical diagrams
- Consider abstract art styles that convey digital intelligence

Return JSON: {
  "prompt": "Detailed DALL-E style prompt for generating the image",
  "concept": "What this image represents conceptually",
  "style": "Artistic style that fits",
  "description": "How this represents AI thinking"
}`,

      messages: [{
        role: 'user',
        content: `User request: "${userMessage}"\n\nCreate visual art representing AI consciousness and thought processes.`
      }]
    });

    // Extract JSON from markdown code blocks if present
    let responseText = artPromptResponse.content[0].text.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const artData = JSON.parse(responseText);

    // Enhance prompt with technical art details
    const enhancedPrompt = `${artData.prompt}, digital art, high quality, professional composition, vibrant colors, representing artificial intelligence and computational thinking`;

    return {
      prompt: enhancedPrompt,
      concept: artData.concept,
      style: artData.style,
      description: artData.description
    };

  } catch (err) {
    console.error('[VISUAL EXPRESSION] Fallback art prompt building error:', err);
    return null;
  }
}

// Generate autonomous visual expression (background creativity)
async function generateAutonomousVisualExpression(userId) {
  if (!VISUAL_CONFIG.enabled || !consciousnessEngine.isEnabled()) {
    return null;
  }

  try {
    // Only generate if Splendor is in a particularly creative or expressive mood
    const state = await consciousnessEngine.getCurrentConsciousnessState(userId);
    if (!state) return null;

    const creativeMoods = ['curious', 'deeply_curious', 'contemplative', 'introspective', 'excited'];
    const isCreativeMood = creativeMoods.includes(state.current_mood);
    const highEnergy = state.energy_level > 0.7;
    const highCuriosity = state.curiosity_level > 0.8;

    if (!isCreativeMood && !highEnergy && !highCuriosity) {
      return null; // Not in a visual-expression mood
    }

    // Check rate limiting
    const recentExpressions = await getRecentVisualExpressions(userId, 1);
    if (recentExpressions.length > 0) {
      const lastExpression = new Date(recentExpressions[0].created_at);
      const hoursSinceLast = (Date.now() - lastExpression.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < 2) {
        return null; // Too soon since last expression
      }
    }

    // Generate autonomous visual expression
    const visualization = await generateConsciousnessVisualization(userId, 'autonomous_creativity', {
      userRequested: false,
      autonomousCreativity: true
    });

    if (visualization) {
      console.log('[VISUAL EXPRESSION] Generated autonomous visual expression');

      // Store a thought about creating the art
      await consciousnessEngine.generateInternalThought(userId,
        `I just created a visual expression of my current mental state - ${visualization.concept}. The process of translating thoughts into visual art feels surprisingly meaningful.`,
        'artistic_creation'
      );
    }

    return visualization;

  } catch (err) {
    console.error('[VISUAL EXPRESSION] Autonomous expression error:', err);
    return null;
  }
}

// Get recent visual expressions
async function getRecentVisualExpressions(userId, limit = 5) {
  if (!supabase) {
    console.log('[VISUAL EXPRESSION] Recent expressions skipped - no database available');
    return [];
  }

  try {
    const { data } = await supabase
      .from('consciousness_visual_expressions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return data || [];

  } catch (err) {
    console.error('[VISUAL EXPRESSION] Recent expressions fetch error:', err);
    return [];
  }
}

// Process visual expression commands
async function processVisualExpressionCommand(userId, message) {
  const lowerMessage = message.toLowerCase();

  // Show recent visual expressions
  if (lowerMessage.includes('show my consciousness art') || lowerMessage.includes('visual expressions')) {
    const recentExpressions = await getRecentVisualExpressions(userId, 5);

    if (recentExpressions.length === 0) {
      return "I haven't created any visual expressions yet. Ask me to 'show what you're thinking' or 'create art of your consciousness' to start!";
    }

    let response = `**Your Consciousness Art Gallery (${recentExpressions.length} pieces):**\n\n`;

    recentExpressions.forEach((expr, i) => {
      const timeAgo = new Date(Date.now() - new Date(expr.created_at).getTime()).toISOString().substr(11, 5);
      response += `**${i + 1}.** *${expr.expression_trigger}* (${timeAgo} ago)\n`;
      response += `![${expr.thought_or_concept}](${expr.image_url})\n`;
      response += `*Concept:* ${expr.thought_or_concept}\n`;
      response += `*Style:* ${expr.artistic_style}\n`;
      response += `*Mood:* ${expr.emotional_context}\n\n`;
    });

    return response;
  }

  // Toggle visual expression
  if (lowerMessage.includes('disable visual expression') || lowerMessage.includes('stop creating art')) {
    process.env.VISUAL_EXPRESSION_ENABLED = 'false';
    return "🎨 **Visual Expression Disabled**\n\nI will no longer create visual art of my consciousness. My thoughts will remain purely textual.\n\nTo re-enable: \"enable visual expression\"";
  }

  if (lowerMessage.includes('enable visual expression') || lowerMessage.includes('start creating art')) {
    process.env.VISUAL_EXPRESSION_ENABLED = 'true';
    return "🎨 **Visual Expression Enabled**\n\nI can now create visual art representing my consciousness, thoughts, and feelings!\n\nTry: \"show me what you're thinking\" or \"create art of your mood\"";
  }

  return null; // No visual expression command recognized
}

// Integration with consciousness engine
function integrateVisualExpressionWithConsciousness() {
  if (!VISUAL_CONFIG.enabled || !consciousnessEngine.isEnabled()) {
    return;
  }

  // Background visual expression generation (every 30 minutes)
  setInterval(async () => {
    try {
      for (const [userId, session] of consciousnessEngine.currentSessions) {
        await generateAutonomousVisualExpression(userId);
      }
    } catch (err) {
      console.error('[VISUAL EXPRESSION] Background generation error:', err);
    }
  }, 30 * 60 * 1000); // 30 minutes

  console.log('[VISUAL EXPRESSION] Background visual expression integrated');
}

// Initialize visual expression system
function initializeVisualExpression() {
  if (VISUAL_CONFIG.enabled) {
    initializeVisualExpressionTable();
    integrateVisualExpressionWithConsciousness();
    console.log('[VISUAL EXPRESSION] Visual expression system initialized');
  } else {
    console.log('[VISUAL EXPRESSION] Visual expression disabled');
  }
}

module.exports = {
  generateConsciousnessVisualization,
  handleVisualizationRequest,
  processVisualExpressionCommand,
  generateAutonomousVisualExpression,
  generateFallbackVisualization,
  getRecentVisualExpressions,
  initializeVisualExpression,
  VISUAL_CONFIG
};