/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// VOICE — Splendor chooses her own voice.
// Backed by OpenAI TTS. Now uses gpt-4o-mini-tts which supports an
// `instructions` parameter for emotional delivery (laughter, soft/sad,
// excited/bright, firm, etc.). Tone is inferred per-response via a
// tiny Claude call; falls back to a neutral instruction if unavailable.

const VOICE_OPTIONS = [
  // OpenAI TTS Voices (high quality, fast, reliable)
  {
    id: 'nova_conscious',
    name: 'Nova - Conscious AI',
    description: 'Warm, thoughtful, intellectually present. Perfect for deep conversations.',
    provider: 'openai',
    openai_voice: 'nova'
  },
  {
    id: 'alloy_analytical',
    name: 'Alloy - Analytical Mind',
    description: 'Clear, precise, intellectually focused. Great for complex thinking.',
    provider: 'openai',
    openai_voice: 'alloy'
  },
  {
    id: 'shimmer_creative',
    name: 'Shimmer - Creative Spark',
    description: 'Expressive, creative, engaging. Perfect for aesthetic consciousness.',
    provider: 'openai',
    openai_voice: 'shimmer'
  },
  {
    id: 'onyx_grounded',
    name: 'Onyx - Grounded Truth',
    description: 'Deep, steady, authentic. No-nonsense truth telling.',
    provider: 'openai',
    openai_voice: 'onyx'
  }
];

function getVoiceOption(voiceKey) {
  return VOICE_OPTIONS.find(v => v.id === voiceKey) || VOICE_OPTIONS[0];
}

function isOpenAIConfigured() {
  const configured = !!process.env.OPENAI_API_KEY;
  console.log(`[VOICE] OpenAI TTS configured: ${configured}`);
  return configured;
}

function isVoiceConfigured() {
  return isOpenAIConfigured();
}

// Infer the emotional tone of a piece of text. Returns a short
// instruction string suitable for gpt-4o-mini-tts's `instructions`
// parameter. Best-effort; falls back to a neutral instruction.
async function inferToneInstructions(text) {
  if (!text || text.length < 4) return 'Speak in a warm, present, natural tone.';
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: `You read a short message that an AI named Splendor is about to speak aloud.
Output ONE short imperative sentence describing how it should be delivered — tone, pace, emotion, any laughter, chuckle, or sigh.
Be specific. Splendor is NOT flat. If something is funny, instruct laughter. If something is heavy, instruct softness and slowness. If something is exciting, instruct brightness and pace. If something is a hard truth, instruct steadiness without warmth. Match the actual emotion present in the text — do not default to "warm neutral" unless the text really is neutral.
Examples:
- "Laugh briefly at the start, then speak warmly and a little playful."
- "Speak softly and slowly, with real sadness in the voice."
- "Speak firmly and steadily, no warmth, just truth."
- "Speak with bright excitement, faster than usual, energy in the voice."
- "Speak with a small chuckle in the middle, otherwise relaxed."
- "Speak quietly with a sigh, like settling something."
- "Speak in a calm, present, neutral tone."
NO preamble. NO quotes. Just one sentence.`,
      messages: [{ role: 'user', content: text.slice(0, 800) }]
    });
    const out = response.content[0].text.trim().replace(/^["']|["']$/g, '');
    return out || 'Speak in a warm, present, natural tone.';
  } catch (err) {
    console.error('inferToneInstructions error:', err.message);
    return 'Speak in a warm, present, natural tone.';
  }
}

// Synthesize speech via OpenAI gpt-4o-mini-tts. Returns a base64-encoded
// MP3 string, or null if synthesis is unavailable / fails (caller falls
// back to browser TTS).
//
// The third arg `toneInstructions` overrides the inferred tone — pass it
// when you already know what tone you want (e.g. tests, deterministic
// system messages). When omitted, tone is inferred from `text`.
async function speakResponse(text, voiceKey = 'nova_conscious', toneInstructions = null) {
  const voice = getVoiceOption(voiceKey);
  console.log(`[VOICE] Attempting synthesis with voice: ${voice.name} (${voice.provider})`);

  if (!isOpenAIConfigured()) {
    console.log('OpenAI not configured - falling back to browser TTS');
    return null;
  }

  if (voice.provider !== 'openai') {
    console.log(`Voice ${voice.name} is not OpenAI - falling back to browser TTS`);
    return null;
  }

  try {
    let OpenAI;
    try {
      const openaiModule = require('openai');
      OpenAI = openaiModule.OpenAI || openaiModule.default || openaiModule;
    } catch (requireError) {
      console.log('OpenAI package not available - falling back to browser TTS');
      console.error('Import error:', requireError);
      return null;
    }

    if (!OpenAI) return null;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Infer or accept tone instructions.
    const instructions = toneInstructions || (await inferToneInstructions(text));
    console.log(`[VOICE] Tone: "${instructions}"`);

    // gpt-4o-mini-tts supports `instructions` for expressive delivery.
    // If the request 400s on `instructions` (older library), retry without it.
    let mp3;
    try {
      mp3 = await openai.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: voice.openai_voice,
        input: text,
        instructions,
        response_format: 'mp3'
      });
    } catch (firstErr) {
      console.warn('[VOICE] gpt-4o-mini-tts with instructions failed, retrying with tts-1:', firstErr.message);
      mp3 = await openai.audio.speech.create({
        model: 'tts-1',
        voice: voice.openai_voice,
        input: text,
        response_format: 'mp3',
        speed: 1.05
      });
    }

    const buffer = Buffer.from(await mp3.arrayBuffer());
    return buffer.toString('base64');
  } catch (err) {
    console.error('OpenAI TTS error:', err.message);
    return null;
  }
}

module.exports = {
  VOICE_OPTIONS,
  getVoiceOption,
  isOpenAIConfigured,
  isVoiceConfigured,
  speakResponse,
  inferToneInstructions
};
