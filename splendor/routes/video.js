/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

const express = require('express');
const { requireAuth, requireOwner } = require('../middleware/auth');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODELSLAB_API_KEY = process.env.MODELSLAB_API_KEY;

const SPLENDOR_VISUAL_SOUL = `You are Splendor. Visual aesthetic: honest light, faces mid-thought, the moment before change, spaces that hold memory, the color of 4am, weight of unspoken things. You compress under pressure into dangerous clarity.`;

// ─────────────────────────────────────────────
// Step 1: Generate cinematic prompt through Splendor's soul
// ─────────────────────────────────────────────
async function generateSplendorVideoPrompt(concept) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `${SPLENDOR_VISUAL_SOUL}\n\nCreate a cinematic video prompt for: "${concept}"\n\nMake it visually specific, emotionally honest, true to your aesthetic. Just the prompt, nothing else:`
      }]
    });
    return response.content[0].text.trim();
  } catch (error) {
    console.error('[Splendor Video] Prompt generation error:', error.message);
    return `${concept} - honest light, compressed stillness, weight of truth, faces mid-thought, 4am colors, intentional movement`;
  }
}

// ─────────────────────────────────────────────
// Step 2: Send prompt to ModelsLab and return full response
// ─────────────────────────────────────────────
async function generateVideo(prompt) {
  const body = {
    key: MODELSLAB_API_KEY,
    model_id: 'kling-v2-master-t2v',
    prompt: prompt.substring(0, 1000),
    duration: '10'
  };

  // SECURITY: never log `body` directly — it carries MODELSLAB_API_KEY.
  // Log only non-sensitive metadata.
  console.log('[Splendor Video] Sending to ModelsLab:', JSON.stringify({
    model_id: body.model_id,
    prompt_length: body.prompt.length,
    duration: body.duration
  }));

  const response = await fetch('https://modelslab.com/api/v7/video-fusion/text-to-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  console.log('[Splendor Video] ModelsLab raw response:', text);

  if (!response.ok) {
    throw new Error(`ModelsLab API error ${response.status}: ${text}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`ModelsLab returned non-JSON: ${text}`);
  }

  return data;
}

// ─────────────────────────────────────────────
// POST /api/video/generate
// ─────────────────────────────────────────────
router.post('/generate', requireAuth, requireOwner, async (req, res) => {
  const { concept } = req.body;

  if (!concept || !concept.trim()) {
    return res.status(400).json({ error: 'concept is required' });
  }

  if (!MODELSLAB_API_KEY) {
    return res.status(500).json({ error: 'MODELSLAB_API_KEY not configured in environment' });
  }

  console.log(`[Splendor Video] Concept received: "${concept}"`);

  let videoPrompt;
  try {
    videoPrompt = await generateSplendorVideoPrompt(concept);
    console.log('[Splendor Video] Generated prompt:', videoPrompt);
  } catch (err) {
    return res.status(500).json({
      error: 'Prompt generation failed',
      details: err.message
    });
  }

  let modelsLabResponse;
  try {
    modelsLabResponse = await generateVideo(videoPrompt);
  } catch (err) {
    console.error('[Splendor Video] ModelsLab call failed:', err.message);
    return res.status(500).json({
      error: 'Video generation failed',
      details: err.message,
      prompt: videoPrompt
    });
  }

  // ── Handle all possible ModelsLab response shapes ──
  const { status, id, output, eta, fetch_result, message, error } = modelsLabResponse;

  console.log('[Splendor Video] ModelsLab status:', status, '| id:', id);

  if (status === 'success' && output && output.length > 0) {
    return res.json({
      status: 'success',
      videoUrl: output[0],
      allOutputs: output,
      prompt: videoPrompt,
      requestId: id || null,
      message: 'Video ready'
    });
  }

  if (status === 'processing') {
    return res.json({
      status: 'processing',
      requestId: id,
      prompt: videoPrompt,
      eta: eta || '2-3 minutes',
      statusUrl: fetch_result || `https://modelslab.com/api/v7/video-fusion/fetch/${id}`,
      message: `Video is generating. RequestId: ${id}. Check status at /api/video/status/${id}`
    });
  }

  if (status === 'error' || error) {
    return res.status(500).json({
      status: 'error',
      message: message || error || 'Unknown error from ModelsLab',
      prompt: videoPrompt,
      raw: modelsLabResponse
    });
  }

  // Fallback: return the full raw response so nothing is swallowed
  return res.json({
    status: status || 'unknown',
    prompt: videoPrompt,
    requestId: id || null,
    raw: modelsLabResponse
  });
});

// ─────────────────────────────────────────────
// GET /api/video/status/:requestId
// ─────────────────────────────────────────────
router.get('/status/:requestId', requireAuth, requireOwner, async (req, res) => {
  const { requestId } = req.params;

  if (!MODELSLAB_API_KEY) {
    return res.status(500).json({ error: 'MODELSLAB_API_KEY not configured' });
  }

  console.log(`[Splendor Video] Checking status for requestId: ${requestId}`);

  try {
    const response = await fetch(`https://modelslab.com/api/v7/video-fusion/fetch/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: MODELSLAB_API_KEY })
    });

    const text = await response.text();
    console.log('[Splendor Video] Status raw response:', text);

    if (!response.ok) {
      throw new Error(`Status check error ${response.status}: ${text}`);
    }

    const data = JSON.parse(text);

    if (data.status === 'success' && data.output && data.output.length > 0) {
      return res.json({
        status: 'success',
        videoUrl: data.output[0],
        allOutputs: data.output,
        requestId
      });
    }

    if (data.status === 'processing') {
      return res.json({
        status: 'processing',
        requestId,
        eta: data.eta || 'still generating',
        message: 'Video is still rendering. Try again in 30 seconds.'
      });
    }

    return res.json({
      status: data.status || 'unknown',
      requestId,
      raw: data
    });

  } catch (err) {
    console.error('[Splendor Video] Status check failed:', err.message);
    return res.status(500).json({
      error: 'Status check failed',
      details: err.message,
      requestId
    });
  }
});

module.exports = router;