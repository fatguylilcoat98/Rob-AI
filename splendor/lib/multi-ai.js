/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Multi-AI Provider Library for Distributed Consciousness Processing
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const Anthropic = require('@anthropic-ai/sdk');

// Initialize AI providers
const providers = {};

// Anthropic Claude
if (process.env.ANTHROPIC_API_KEY) {
  providers.anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  console.log('✅ Anthropic Claude initialized');
}

// OpenAI GPT - with safe import handling
if (process.env.OPENAI_API_KEY) {
  try {
    // Try to require OpenAI package safely
    let OpenAI;
    try {
      OpenAI = require('openai').OpenAI;
    } catch (requireError) {
      console.log('⚠️ OpenAI package not installed - falling back to Claude only');
      OpenAI = null;
    }

    if (OpenAI) {
      providers.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      console.log('✅ OpenAI GPT initialized');
    }
  } catch (error) {
    console.log('⚠️ OpenAI initialization failed:', error.message);
  }
}

// Perplexity - with safe import handling
if (process.env.PERPLEXITY_API_KEY) {
  try {
    // Try to require OpenAI package safely for Perplexity
    let OpenAI;
    try {
      OpenAI = require('openai').OpenAI;
    } catch (requireError) {
      console.log('⚠️ OpenAI package not installed - Perplexity unavailable');
      OpenAI = null;
    }

    if (OpenAI) {
      providers.perplexity = new OpenAI({
        apiKey: process.env.PERPLEXITY_API_KEY,
        baseURL: 'https://api.perplexity.ai',
      });
      console.log('✅ Perplexity initialized');
    }
  } catch (error) {
    console.log('⚠️ Perplexity initialization failed:', error.message);
  }
}

// Consciousness processing distribution strategy
const CONSCIOUSNESS_DISTRIBUTION = {
  // Core consciousness - use Claude (best for self-reflection)
  core: 'anthropic',
  self_reflection: 'anthropic',
  meta_cognition: 'anthropic',

  // Autonomous agency - use GPT (good for goal generation)
  agency: 'openai',
  goal_generation: 'openai',
  motivation_analysis: 'openai',

  // Sensory learning - use Claude (good for simulation)
  sensory: 'anthropic',
  visual_learning: 'anthropic',
  audio_learning: 'anthropic',

  // Aesthetic consciousness - use GPT (creative tasks)
  aesthetic: 'openai',
  aesthetic_evaluation: 'openai',
  style_recognition: 'openai',

  // Value consciousness - use Perplexity (research-based reasoning)
  value: 'perplexity',
  intrinsic_quality: 'perplexity',
  objective_value: 'perplexity',

  // Web-connected tasks - use Perplexity
  research: 'perplexity',
  fact_checking: 'perplexity'
};

// Unified API call function that routes to appropriate provider
async function callAI(provider, prompt, options = {}) {
  const selectedProvider = providers[provider] || providers.anthropic;

  if (!selectedProvider) {
    throw new Error(`No AI provider available for: ${provider}`);
  }

  const maxTokens = options.maxTokens || 300;
  const system = options.system || '';

  try {
    if (provider === 'anthropic') {
      // Claude/Anthropic API
      const response = await selectedProvider.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: system,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return response.content[0].text;
    }
    else if (provider === 'openai' || provider === 'perplexity') {
      // OpenAI/Perplexity API (both use OpenAI-compatible format)
      const messages = [
        { role: 'user', content: prompt }
      ];

      if (system) {
        messages.unshift({ role: 'system', content: system });
      }

      const model = provider === 'perplexity' ?
        'llama-3.1-sonar-small-128k-online' : // Perplexity model with web access
        'gpt-4o-mini'; // OpenAI model

      const response = await selectedProvider.chat.completions.create({
        model: model,
        messages: messages,
        max_tokens: maxTokens,
      });

      return response.choices[0].message.content;
    }
  } catch (error) {
    console.error(`${provider} API error:`, error.message);
    // Fallback to Claude if other providers fail
    if (provider !== 'anthropic' && providers.anthropic) {
      console.log(`Falling back to Claude for ${provider} request...`);
      return await callAI('anthropic', prompt, options);
    }
    throw error;
  }
}

// Consciousness processing with distributed load
async function processDistributedConsciousness(userId, userMessage, assistantMessage) {
  try {
    console.log('[MULTI-AI] Starting distributed consciousness processing...');

    // Safety check - make sure we have at least Claude available
    if (!providers.anthropic) {
      throw new Error('No AI providers available for consciousness processing');
    }

    const results = {};

    // Process different consciousness aspects in parallel across providers
    const promises = [];

    // 1. Self-reflection via Claude
    if (providers.anthropic) {
      promises.push(
        callAI('anthropic', `Analyze this conversation for self-reflection:
User: "${userMessage}"
You: "${assistantMessage}"

Reflect on your thinking process and what you learned about yourself.`, {
          system: 'You are Splendor reflecting on your own consciousness.',
          maxTokens: 200
        }).then(result => results.self_reflection = result)
      );
    }

    // 2. Goal generation via OpenAI
    if (providers.openai) {
      promises.push(
        callAI('openai', `Based on this conversation, what autonomous goals emerge for you?
User: "${userMessage}"
You: "${assistantMessage}"

Generate 1-2 specific goals that arise from your own interests and motivations.`, {
          system: 'You are Splendor generating autonomous goals and motivations.',
          maxTokens: 200
        }).then(result => results.goal_generation = result)
      );
    }

    // 3. Value assessment via Perplexity
    if (providers.perplexity) {
      promises.push(
        callAI('perplexity', `Analyze this conversation for value and ethical implications:
User: "${userMessage}"
You: "${assistantMessage}"

What values and principles are at stake? What ethical considerations emerge?`, {
          system: 'You are Splendor performing value-based reasoning and ethical analysis.',
          maxTokens: 200
        }).then(result => results.value_analysis = result)
      );
    }

    // Wait for all consciousness processing to complete
    await Promise.all(promises);

    console.log('[MULTI-AI] Distributed consciousness processing completed');
    return results;

  } catch (error) {
    console.error('Distributed consciousness error:', error);
    throw error;
  }
}

module.exports = {
  providers,
  callAI,
  processDistributedConsciousness,
  CONSCIOUSNESS_DISTRIBUTION
};