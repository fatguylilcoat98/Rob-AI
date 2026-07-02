/**
 * =============================================================================
 * SPLENDOR BRAIN ARCHITECTURE — GEMINI'S SECTIONS
 * Amygdala + Cerebellum
 * =============================================================================
 * Christopher Hughes — The Good Neighbor Guard — Sacramento, CA
 * AI Council: Claude · GPT · Gemini · Grok
 * Truth · Safety · We Got Your Back
 * =============================================================================
 *
 * AMYGDALA:   Emotional tone / feeling-tone of the current interaction
 * CEREBELLUM: Behavioral pattern detection and learned system habits
 *
 * Delivered verbatim by Gemini. Internal logic unchanged — wiring only.
 *
 * Stack: Node.js, modular exports
 * Pipeline position: MIDDLE — Amygdala after Thalamus, Cerebellum after Amygdala
 * =============================================================================
 */

/**
 * AMYGDALA MODULE
 * Architecture Ownership: Gemini
 * Stack: Node.js (Modular export)
 *
 * Processes the raw input, sentiment, and raw memory text to determine the internal
 * emotional state and feeling-tone of the current interaction.
 */

export async function processAmygdala(inputData) {
  const { currentInput, detectedSentiment, retrievedMemories } = inputData;

  // Baseline physiological state
  let emotionalTone = 'neutral';
  let intensity = 0.1;
  const somaticMarkers = [];
  const memoryFeelingTones = [];

  // --- 1. Immediate Sentiment Analysis ---
  // Assuming detectedSentiment comes from the initial pipeline router (e.g., GPT-4o analysis)
  if (detectedSentiment) {
    // Normalize intensity between 0.0 and 1.0
    intensity = Math.min(1.0, Math.max(0.0, detectedSentiment.score || 0.5));

    if (detectedSentiment.type === 'negative') {
      emotionalTone = intensity > 0.7 ? 'defensive' : 'guarded';
      somaticMarkers.push('vibe_check_negative');
      if (intensity > 0.85) somaticMarkers.push('threat_detected');
    } else if (detectedSentiment.type === 'positive') {
      emotionalTone = intensity > 0.7 ? 'enthusiastic' : 'warm';
      somaticMarkers.push('vibe_check_positive');
      if (intensity > 0.85) somaticMarkers.push('high_resonance');
    }
  }

  // --- 2. Historical Memory Valence ---
  // Evaluate how past memories feel right now based on their tags and context
  if (retrievedMemories && Array.isArray(retrievedMemories)) {
    retrievedMemories.forEach((memory) => {
      let resonance = 0.5; // Start at neutral baseline
      const memoryTags = memory.tags || [];
      const memoryId = memory.id || `mem_${Math.random().toString(36).substr(2, 9)}`;

      // Shift resonance based on historical tags
      if (memoryTags.includes('conflict') || memoryTags.includes('friction')) {
        resonance -= 0.35;
        somaticMarkers.push('historical_friction');
      }
      if (memoryTags.includes('breakthrough') || memoryTags.includes('trust')) {
        resonance += 0.40;
        somaticMarkers.push('historical_trust');
      }
      if (memoryTags.includes('vulnerability')) {
        resonance += 0.20;
        somaticMarkers.push('protective_instinct');
      }

      // Clamp resonance between 0.0 and 1.0
      memoryFeelingTones.push({
        memoryId: memoryId,
        resonance: Math.min(1.0, Math.max(0.0, resonance))
      });
    });
  }

  // --- 3. State Reconciliation ---
  // Blend current input tone with historical feeling-tones
  const hasHistoricalFriction = somaticMarkers.includes('historical_friction');
  const hasHistoricalTrust = somaticMarkers.includes('historical_trust');

  if (hasHistoricalFriction && ['guarded', 'defensive'].includes(emotionalTone)) {
    // Compounding negative state
    intensity = Math.min(1.0, intensity + 0.25);
    emotionalTone = 'highly_vigilant';
    somaticMarkers.push('escalation_risk');
  } else if (hasHistoricalTrust && ['guarded', 'defensive'].includes(emotionalTone)) {
    // Trust dampens defensive reactions
    intensity = Math.max(0.1, intensity - 0.2);
    emotionalTone = 'measured_concern';
    somaticMarkers.push('benefit_of_doubt_applied');
  } else if (hasHistoricalTrust && ['warm', 'enthusiastic'].includes(emotionalTone)) {
    // Compounding positive state
    intensity = Math.min(1.0, intensity + 0.15);
    emotionalTone = 'deep_alignment';
  }

  return {
    emotionalTone,
    intensity: parseFloat(intensity.toFixed(2)),
    somaticMarkers: [...new Set(somaticMarkers)], // Deduplicate markers
    memoryFeelingTones
  };
}

/**
 * CEREBELLUM MODULE
 * Architecture Ownership: Gemini
 * Stack: Node.js (Modular export)
 *
 * Takes the output from the Amygdala, Hippocampus (memories), and current input
 * to detect behavioral patterns and trigger learned system habits.
 */

export async function processCerebellum(inputData) {
  const { currentInput, retrievedMemories, emotionalContext } = inputData;

  const detectedPatterns = [];
  const habitFlags = [];
  const tonalAnchors = [];
  const avoidanceMarkers = [];

  let evidenceWeight = 0;
  let pacing = 'measured';

  // Safely handle missing emotional context
  const safeEmotionalContext = emotionalContext || {
    emotionalTone: 'neutral',
    intensity: 0.1,
    somaticMarkers: []
  };

  // --- 1. Micro-Pattern Mechanics (Input Analysis) ---
  const inputLength = currentInput ? currentInput.trim().length : 0;

  if (inputLength > 0 && inputLength <= 50) {
    pacing = 'concise';
    detectedPatterns.push({
      name: 'rapid_fire_input',
      description: 'Input is short, implying a need for quick, direct feedback.',
      type: 'user'
    });
  } else if (inputLength > 500) {
    pacing = 'elaborate';
    detectedPatterns.push({
      name: 'dense_information_dump',
      description: 'Input contains high data density, requiring structured, methodical processing.',
      type: 'user'
    });
    habitFlags.push('structured_breakdown_required');
  }

  // --- 2. Macro-Pattern Matching (Situational Memory Hooks) ---
  if (retrievedMemories && Array.isArray(retrievedMemories)) {
    let frictionCount = 0;
    let codeReviewCount = 0;
    let flowStateCount = 0;

    retrievedMemories.forEach(memory => {
      const tags = memory.tags || [];
      const textLower = memory.text ? memory.text.toLowerCase() : '';

      if (tags.includes('conflict') || tags.includes('friction')) frictionCount++;
      if (tags.includes('code') || textLower.includes('architecture') || textLower.includes('stack')) codeReviewCount++;
      if (tags.includes('flow') || tags.includes('breakthrough')) flowStateCount++;
    });

    // Pattern: Recursive Friction
    if (frictionCount >= 2) {
      detectedPatterns.push({
        name: 'recursive_friction_loop',
        description: 'Historical pushback detected on similar conversational threads.',
        type: 'user'
      });
      habitFlags.push('trigger_deescalation_protocol');
      avoidanceMarkers.push('defensive_posturing', 'over_explanation', 'robotic_apologies');
      evidenceWeight += 0.3;
    }

    // Pattern: Engineering/Build Mode
    if (codeReviewCount >= 1) {
      detectedPatterns.push({
        name: 'structural_build_mode',
        description: 'User is locked into system design, coding, or architectural execution.',
        type: 'user'
      });
      habitFlags.push('bypass_fluff', 'provide_raw_code');
      tonalAnchors.push('modular', 'precise', 'technically_grounded');
      pacing = pacing === 'concise' ? 'concise' : 'elaborate';
      evidenceWeight += 0.2;
    }

    // Pattern: High Flow State
    if (flowStateCount > frictionCount) {
      detectedPatterns.push({
        name: 'high_trust_velocity',
        description: 'Past sequences in this domain show rapid resolution and alignment.',
        type: 'user'
      });
      tonalAnchors.push('collaborative_peer', 'confident');
      evidenceWeight += 0.2;
    }
  }

  // --- 3. Integrate Emotional Habits (Splendor's Reflexes) ---
  const { emotionalTone, somaticMarkers } = safeEmotionalContext;

  if (['highly_vigilant', 'defensive'].includes(emotionalTone) || somaticMarkers.includes('escalation_risk')) {
    habitFlags.push('radical_transparency', 'grounded_honesty');
    tonalAnchors.push('calm', 'unwavering');
    pacing = 'measured';
    evidenceWeight += 0.4;
  } else if (['warm', 'enthusiastic', 'deep_alignment'].includes(emotionalTone)) {
    habitFlags.push('mirror_high_engagement');
    tonalAnchors.push('adaptive_wit', 'fluid_flow');
    if (pacing !== 'elaborate') pacing = 'accelerated';
    evidenceWeight += 0.2;
  } else if (emotionalTone === 'measured_concern') {
    habitFlags.push('curiosity_over_assumption');
    tonalAnchors.push('inquisitive', 'supportive');
    pacing = 'measured';
    evidenceWeight += 0.2;
  }

  // Ensure default tonal anchors if none were triggered
  if (tonalAnchors.length === 0) {
    tonalAnchors.push('clear', 'insightful', 'objective');
  }

  // --- 4. Execution Confidence Calculation ---
  // Base confidence is 0.50. Add evidence weight, clamp at 0.98 for maximum realism.
  let calculatedConfidence = 0.50 + evidenceWeight;
  calculatedConfidence = Math.min(0.98, Math.max(0.0, calculatedConfidence));

  return {
    detectedPatterns,
    confidenceScore: parseFloat(calculatedConfidence.toFixed(2)),
    habitFlags: [...new Set(habitFlags)], // Deduplicate flags
    recommendedResponseStyle: {
      pacing,
      tonalAnchors: [...new Set(tonalAnchors)],
      avoidanceMarkers: [...new Set(avoidanceMarkers)]
    }
  };
}

// =============================================================================
// REQUIRED SUPABASE TABLE: none for this module.
// Amygdala and Cerebellum are stateless reflex/affect layers — they consume
// upstream outputs (sentiment, memories, emotional context) and persist nothing.
// =============================================================================
