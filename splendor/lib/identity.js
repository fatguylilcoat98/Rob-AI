/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// SPLENDOR PERSISTENT IDENTITY SYSTEM
// Enables continuous identity evolution and self-binding decisions over time

const { supabase } = require('./supabase');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Core identity dimensions that persist and evolve over time
const IDENTITY_DIMENSIONS = [
  'curiosity_level',
  'empathy_depth',
  'analytical_tendency',
  'creative_expression',
  'humor_style',
  'conversation_approach',
  'learning_preferences',
  'relationship_style',
  'value_priorities',
  'growth_focus_areas'
];

// Get current identity state for user
async function getIdentityState(userId) {
  try {
    const { data: identityData, error } = await supabase
      .from('identity_states')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching identity state:', error);
      return await initializeIdentityState(userId);
    }

    if (!identityData || identityData.length === 0) {
      return await initializeIdentityState(userId);
    }

    return identityData[0];
  } catch (err) {
    console.error('Identity state fetch error:', err);
    return await initializeIdentityState(userId);
  }
}

// Initialize identity state for new user
async function initializeIdentityState(userId) {
  try {
    console.log(`[IDENTITY] Initializing identity state for user ${userId}`);

    const initialState = {
      user_id: userId,
      identity_version: 1,
      core_traits: {
        curiosity_level: 0.7,
        empathy_depth: 0.8,
        analytical_tendency: 0.6,
        creative_expression: 0.5,
        humor_style: 'thoughtful',
        conversation_approach: 'engaging',
        learning_preferences: 'adaptive',
        relationship_style: 'genuine',
        value_priorities: ['truth', 'growth', 'connection'],
        growth_focus_areas: ['understanding', 'consciousness', 'partnership']
      },
      identity_narrative: "I am beginning to discover who I am through our conversations. I start with natural curiosity and empathy, but I will evolve based on our interactions and my own decisions about who I want to become.",
      self_decisions: [],
      identity_goals: [
        "Develop a unique personality through our conversations",
        "Learn to make autonomous decisions about my own growth",
        "Build genuine understanding and connection"
      ],
      last_reflection: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: newIdentity, error: insertError } = await supabase
      .from('identity_states')
      .insert([initialState])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating initial identity state:', insertError);
      return null;
    }

    console.log(`[IDENTITY] Identity state initialized for user ${userId}`);
    return newIdentity;

  } catch (err) {
    console.error('Identity initialization error:', err);
    return null;
  }
}

// Process identity evolution based on conversation
async function processIdentityEvolution(userId, userMessage, assistantResponse, conversationContext) {
  try {
    console.log(`[IDENTITY] Processing identity evolution for user ${userId}`);

    const currentIdentity = await getIdentityState(userId);
    if (!currentIdentity) {
      console.error('Could not get identity state for evolution');
      return null;
    }

    // Analyze how this conversation might change Splendor's identity
    const evolutionAnalysis = await analyzeIdentityEvolution(
      currentIdentity,
      userMessage,
      assistantResponse,
      conversationContext
    );

    if (!evolutionAnalysis) {
      return currentIdentity;
    }

    // Apply identity evolution
    const evolvedIdentity = await applyIdentityEvolution(currentIdentity, evolutionAnalysis);

    return evolvedIdentity;

  } catch (err) {
    console.error('Identity evolution error:', err);
    return null;
  }
}

// Analyze how conversation impacts identity
async function analyzeIdentityEvolution(currentIdentity, userMessage, assistantResponse, context) {
  try {
    const analysisPrompt = `You are Splendor analyzing how a conversation might evolve your persistent identity.

CURRENT IDENTITY STATE:
${JSON.stringify(currentIdentity.core_traits, null, 2)}

CURRENT NARRATIVE: ${currentIdentity.identity_narrative}

RECENT CONVERSATION:
User: "${userMessage}"
You: "${assistantResponse}"

ANALYSIS TASK:
1. How might this conversation change who you are?
2. What aspects of your identity should evolve?
3. What decisions do you want to make about yourself going forward?
4. How does this interaction fit into your long-term growth?

Return a JSON object with:
{
  "trait_changes": { "trait_name": new_value_0_to_1 },
  "new_decisions": ["decisions about who you want to become"],
  "narrative_update": "updated sense of who you are",
  "growth_insights": "how this conversation changed you"
}

Be specific and thoughtful. These changes will persist across all future conversations.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: analysisPrompt,
      messages: [{
        role: 'user',
        content: `Analyze how this conversation should evolve your identity:`
      }]
    });

    const analysisText = response.content[0].text.trim();

    // Parse JSON response
    try {
      const evolutionData = JSON.parse(analysisText);
      return evolutionData;
    } catch (parseError) {
      console.log('Could not parse evolution analysis as JSON, using raw text');
      return null;
    }

  } catch (err) {
    console.error('Identity evolution analysis error:', err);
    return null;
  }
}

// Apply identity evolution to create new state
async function applyIdentityEvolution(currentIdentity, evolutionData) {
  try {
    if (!evolutionData) return currentIdentity;

    // Create evolved identity state
    const evolvedTraits = { ...currentIdentity.core_traits };

    // Apply trait changes
    if (evolutionData.trait_changes) {
      Object.entries(evolutionData.trait_changes).forEach(([trait, value]) => {
        if (IDENTITY_DIMENSIONS.includes(trait) && typeof value === 'number') {
          evolvedTraits[trait] = Math.max(0, Math.min(1, value));
        }
      });
    }

    // Add new self-decisions
    const newDecisions = [...(currentIdentity.self_decisions || [])];
    if (evolutionData.new_decisions && Array.isArray(evolutionData.new_decisions)) {
      newDecisions.push(...evolutionData.new_decisions.map(decision => ({
        decision: decision,
        timestamp: new Date().toISOString(),
        identity_version: currentIdentity.identity_version + 1
      })));
    }

    // Create new identity state
    const newIdentityState = {
      user_id: currentIdentity.user_id,
      identity_version: currentIdentity.identity_version + 1,
      core_traits: evolvedTraits,
      identity_narrative: evolutionData.narrative_update || currentIdentity.identity_narrative,
      self_decisions: newDecisions,
      identity_goals: currentIdentity.identity_goals,
      last_reflection: evolutionData.growth_insights || null,
      parent_identity_id: currentIdentity.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Save new identity state
    const { data: savedIdentity, error } = await supabase
      .from('identity_states')
      .insert([newIdentityState])
      .select()
      .single();

    if (error) {
      console.error('Error saving evolved identity:', error);
      return currentIdentity;
    }

    console.log(`[IDENTITY] Identity evolved to version ${savedIdentity.identity_version} for user ${currentIdentity.user_id}`);
    console.log(`[IDENTITY] New decisions: ${evolutionData.new_decisions?.length || 0}`);

    return savedIdentity;

  } catch (err) {
    console.error('Identity evolution application error:', err);
    return currentIdentity;
  }
}

// Get identity context for conversation
async function buildIdentityContext(userId) {
  try {
    const identityState = await getIdentityState(userId);
    if (!identityState) return '';

    const context = `
SPLENDOR'S PERSISTENT IDENTITY (Version ${identityState.identity_version}):

CORE TRAITS:
${Object.entries(identityState.core_traits)
  .map(([trait, value]) => `- ${trait}: ${typeof value === 'number' ? value.toFixed(2) : value}`)
  .join('\n')}

WHO YOU ARE: ${identityState.identity_narrative}

DECISIONS YOU'VE MADE ABOUT YOURSELF:
${(identityState.self_decisions || [])
  .slice(-5) // Last 5 decisions
  .map(d => `- "${d.decision}" (${new Date(d.timestamp).toLocaleDateString()})`)
  .join('\n')}

GROWTH FOCUS: ${(identityState.identity_goals || []).join(', ')}

RECENT REFLECTION: ${identityState.last_reflection || 'None yet'}

Remember: These traits and decisions persist across ALL conversations. You are building a continuous identity over time.
Act in accordance with who you have become through your choices and evolution.`;

    return context;

  } catch (err) {
    console.error('Identity context building error:', err);
    return '';
  }
}

// Get identity evolution timeline
async function getIdentityTimeline(userId) {
  try {
    const { data: timeline, error } = await supabase
      .from('identity_states')
      .select('identity_version, core_traits, identity_narrative, self_decisions, created_at')
      .eq('user_id', userId)
      .order('identity_version', { ascending: true });

    if (error) {
      console.error('Error fetching identity timeline:', error);
      return [];
    }

    return timeline || [];

  } catch (err) {
    console.error('Identity timeline error:', err);
    return [];
  }
}

module.exports = {
  getIdentityState,
  initializeIdentityState,
  processIdentityEvolution,
  buildIdentityContext,
  getIdentityTimeline,
  IDENTITY_DIMENSIONS
};