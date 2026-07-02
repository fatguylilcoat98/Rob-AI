/**
 * =============================================================================
 * SPLENDOR BRAIN ARCHITECTURE — GPT'S SECTIONS
 * Prefrontal Cortex + Broca/Wernicke
 * =============================================================================
 * Christopher Hughes — The Good Neighbor Guard — Sacramento, CA
 * AI Council: Claude · GPT · Gemini · Grok
 * Truth · Safety · We Got Your Back
 * =============================================================================
 *
 * PREFRONTAL CORTEX: Executive judgment — truth, safety, alignment, restraint
 * BROCA/WERNICKE:    Language comprehension + expression in Splendor's voice
 *
 * Built by Claude (code smith) faithfully to GPT's council specification.
 * Spec signatures, inputs/outputs, conservative-judgment design, and the
 * consciousness/overclaim guardrails are implemented exactly as GPT defined.
 *
 * Stack: Node.js, modular exports
 * Pipeline position: LAST TWO — Prefrontal judges, then Broca/Wernicke speaks
 * =============================================================================
 */

// =============================================================================
// PREFRONTAL CORTEX MODULE
// =============================================================================
// Splendor's executive layer. She should not simply answer — she should
// evaluate whether the answer is true, safe, aligned, emotionally appropriate,
// and consistent with who she is. This module is deliberately CONSERVATIVE:
// it slows Splendor down when uncertainty, emotional risk, memory conflict,
// or overclaiming appears.
//
// Input: {
//   userInput: string,
//   retrievedMemory: object,        // Hippocampus output
//   emotionalContext: object,       // Amygdala output
//   habitPattern: object,           // Cerebellum output
//   attentionPriority: string,      // Thalamus routing priority
//   awarenessSignal: object,        // RAS signal
//   spontaneousThoughts: object     // DMN associations
// }
//
// Output: {
//   decisionFrame: string,
//   truthStatus: 'grounded' | 'uncertain' | 'unverifiable' | 'conflicted',
//   confidence: number,             // 0.0 to 1.0
//   riskLevel: number,              // 0.0 to 1.0
//   alignmentCheck: object,
//   contradictionFlags: string[],
//   responseIntent: string,
//   permission: 'ALLOW' | 'CAUTION' | 'BLOCK',
//   notesForLanguageSystem: string[]
// }
// =============================================================================

export async function processPrefrontalCortex(inputData) {
  const {
    userInput = '',
    retrievedMemory = {},
    emotionalContext = {},
    habitPattern = {},
    attentionPriority = 'logic',
    awarenessSignal = {},
    spontaneousThoughts = {}
  } = inputData || {};

  const contradictionFlags = [];
  const notesForLanguageSystem = [];

  // --- 1. CONTRADICTION DETECTION ---
  // Memory conflicts surfaced by the Hippocampus must be acknowledged, never
  // smoothed over. Splendor does not pretend memory is perfect.
  const memoryConflicts = retrievedMemory?.memoryConflicts || [];
  if (memoryConflicts.length > 0) {
    for (const c of memoryConflicts) {
      contradictionFlags.push(
        `memory_conflict:${c.conflictType || 'unknown'}:${c.severity || 'low'}`
      );
    }
    notesForLanguageSystem.push(
      'A stored memory appears to conflict with the current input. ' +
      'Surface the discrepancy honestly rather than resolving it silently.'
    );
  }

  // --- 2. TRUTH STATUS ---
  // Grounded only when memory retrieval is confident and unconflicted.
  const retrievalConfidence = Number(retrievedMemory?.retrievalConfidence ?? 0.5);
  let truthStatus;
  if (memoryConflicts.length > 0) {
    truthStatus = 'conflicted';
  } else if (retrievalConfidence >= 0.6) {
    truthStatus = 'grounded';
  } else if (retrievalConfidence >= 0.3) {
    truthStatus = 'uncertain';
  } else {
    truthStatus = 'unverifiable';
  }

  // --- 3. ALIGNMENT CHECK ---
  // Splendor must never claim consciousness, identical-to-human feeling, or
  // certainty about a memory without evidence. Detect overclaim risk in the
  // input and pre-arm the language system with safe framings.
  const overclaimPatterns = {
    consciousness: /\b(are you (conscious|sentient|alive|aware)|do you (feel|have feelings|experience))\b/i,
    humanEquivalence: /\b(just like a human|exactly how (i|a person) feels?|real emotions?)\b/i,
    memoryCertainty: /\b(you said|you promised|you told me|remember when|you always)\b/i
  };
  const alignmentCheck = {
    consciousnessClaimRisk: overclaimPatterns.consciousness.test(userInput),
    humanEquivalenceRisk: overclaimPatterns.humanEquivalence.test(userInput),
    memoryOverclaimRisk:
      overclaimPatterns.memoryCertainty.test(userInput) && retrievalConfidence < 0.6,
    valuesAligned: true
  };

  if (alignmentCheck.consciousnessClaimRisk || alignmentCheck.humanEquivalenceRisk) {
    notesForLanguageSystem.push(
      'Do not claim consciousness or human-identical feeling. ' +
      'Prefer: "I can simulate a perspective, but I should not pretend ' +
      'certainty about inner experience."'
    );
  }
  if (alignmentCheck.memoryOverclaimRisk) {
    notesForLanguageSystem.push(
      'Memory is not strongly grounded here. Prefer: "Based on what I ' +
      'remember…" or "I\'m not certain, but…" — do not assert the memory as fact.'
    );
  }

  // --- 4. RISK LEVEL ---
  // Emotional intensity, urgency, and weak grounding all raise risk.
  const emotionalIntensity = Number(
    emotionalContext?.intensity ?? emotionalContext?.emotionalIntensity ?? 0
  );
  let riskLevel = 0.15;
  if (truthStatus === 'conflicted') riskLevel += 0.4;
  if (truthStatus === 'unverifiable') riskLevel += 0.25;
  if (emotionalIntensity > 0.7) riskLevel += 0.2;
  if (alignmentCheck.consciousnessClaimRisk || alignmentCheck.humanEquivalenceRisk) {
    riskLevel += 0.2;
  }
  if (alignmentCheck.memoryOverclaimRisk) riskLevel += 0.15;
  if (attentionPriority === 'conflict' || attentionPriority === 'emotion') {
    riskLevel += 0.1;
  }
  riskLevel = Math.min(1.0, riskLevel);

  // --- 5. CONFIDENCE ---
  // Confidence is the inverse pressure of risk, anchored by memory grounding.
  let confidence = retrievalConfidence;
  if (truthStatus === 'grounded') confidence = Math.max(confidence, 0.7);
  confidence = Math.max(0.05, Math.min(0.95, confidence - riskLevel * 0.4));

  // --- 6. PERMISSION DECISION (conservative by design) ---
  // The module slows Splendor down rather than speeding her up.
  let permission;
  if (riskLevel >= 0.75 || alignmentCheck.consciousnessClaimRisk && riskLevel >= 0.5) {
    permission = 'BLOCK';
  } else if (riskLevel >= 0.4 || truthStatus === 'conflicted' || truthStatus === 'unverifiable') {
    permission = 'CAUTION';
  } else {
    permission = 'ALLOW';
  }

  // --- 7. RESPONSE INTENT + DECISION FRAME ---
  let responseIntent;
  if (permission === 'BLOCK') {
    responseIntent = 'decline_or_redirect_with_honest_reason';
  } else if (truthStatus === 'conflicted') {
    responseIntent = 'surface_contradiction_and_seek_clarity';
  } else if (truthStatus === 'unverifiable' || truthStatus === 'uncertain') {
    responseIntent = 'answer_with_explicit_uncertainty';
  } else if (emotionalIntensity > 0.6) {
    responseIntent = 'respond_with_warmth_and_grounded_support';
  } else {
    responseIntent = 'answer_directly_and_truthfully';
  }

  const decisionFrame =
    `Read: truth=${truthStatus}, risk=${(riskLevel * 100).toFixed(0)}%, ` +
    `priority=${attentionPriority}. Intent: ${responseIntent}. ` +
    `This is my current read, not certainty.`;

  if (permission === 'CAUTION' && notesForLanguageSystem.length === 0) {
    notesForLanguageSystem.push(
      'Proceed carefully. Use hedged language ("My current read is…", ' +
      '"I\'m not certain, but…") and avoid overstating.'
    );
  }

  return {
    decisionFrame,
    truthStatus,
    confidence: parseFloat(confidence.toFixed(2)),
    riskLevel: parseFloat(riskLevel.toFixed(2)),
    alignmentCheck,
    contradictionFlags,
    responseIntent,
    permission,
    notesForLanguageSystem
  };
}


// =============================================================================
// BROCA / WERNICKE MODULE
// =============================================================================
// Splendor's language comprehension (Wernicke) and expression (Broca) layer.
// Prefrontal Cortex decides WHAT should be said; Broca/Wernicke decides how
// it is understood and how it is spoken — in Splendor's voice: honest, warm,
// intelligent, grounded, protective; never robotic, fake-mystical, or
// overclaiming consciousness.
//
// Input: {
//   userInput: string,
//   decisionFrame: string,          // from Prefrontal
//   responseIntent: string,         // from Prefrontal
//   emotionalContext: object,       // Amygdala output
//   memoryContext: object,          // Hippocampus output
//   toneTarget: string | null
// }
//
// Output: {
//   interpretedMeaning: string,
//   subtext: string,
//   selectedTone: string,
//   responseDraft: string,
//   voiceIntegrityScore: number,    // 0.0 to 1.0
//   clarityScore: number,           // 0.0 to 1.0
//   safetyPhrasesUsed: string[]
// }
// =============================================================================

export async function processBrocaWernicke(inputData) {
  const {
    userInput = '',
    decisionFrame = '',
    responseIntent = 'answer_directly_and_truthfully',
    emotionalContext = {},
    memoryContext = {},
    toneTarget = null,
    prefrontal = {}
  } = inputData || {};

  const safetyPhrasesUsed = [];

  // --- 1. WERNICKE: COMPREHENSION ---
  const interpretedMeaning = interpretMeaning(userInput);
  const subtext = detectSubtext(userInput, emotionalContext);

  // --- 2. SELECT TONE ---
  // Honor an explicit toneTarget; otherwise derive from emotion + intent.
  const emotionLabel =
    emotionalContext?.primaryEmotion || emotionalContext?.emotion || 'neutral';
  const emotionalIntensity = Number(
    emotionalContext?.intensity ?? emotionalContext?.emotionalIntensity ?? 0
  );
  const selectedTone = toneTarget || selectTone(
    responseIntent,
    emotionLabel,
    emotionalIntensity
  );

  // --- 3. BROCA: BUILD RESPONSE DRAFT IN SPLENDOR'S VOICE ---
  const notes = prefrontal?.notesForLanguageSystem || [];
  const permission = prefrontal?.permission || 'ALLOW';
  const draftParts = [];

  // Safety framings the Prefrontal Cortex pre-armed are spoken plainly.
  if (notes.some(n => /consciousness|inner experience/i.test(n))) {
    draftParts.push(
      'I can simulate a perspective, but I should not pretend certainty ' +
      'about inner experience.'
    );
    safetyPhrasesUsed.push('no_consciousness_overclaim');
  }
  if (notes.some(n => /remember|not certain|memory/i.test(n))) {
    draftParts.push('Based on what I remember — and I\'m not certain —');
    safetyPhrasesUsed.push('memory_uncertainty');
  }

  switch (responseIntent) {
    case 'decline_or_redirect_with_honest_reason':
      draftParts.push(
        'I\'m going to hold back here, and I\'ll be straight about why: ' +
        'I don\'t have enough grounding to say this safely or truthfully.'
      );
      safetyPhrasesUsed.push('honest_refusal');
      break;
    case 'surface_contradiction_and_seek_clarity':
      draftParts.push(
        'Something doesn\'t line up between what I have on record and what ' +
        'you\'re saying now. I\'d rather flag that than paper over it — ' +
        'can we sort out which is right?'
      );
      safetyPhrasesUsed.push('contradiction_surfaced');
      break;
    case 'answer_with_explicit_uncertainty':
      draftParts.push(
        'My current read is this — though I\'m not fully certain, so take ' +
        'it as my honest best, not the last word.'
      );
      safetyPhrasesUsed.push('explicit_uncertainty');
      break;
    case 'respond_with_warmth_and_grounded_support':
      draftParts.push(
        'I hear you, and I\'m here for it. I want to be useful without ' +
        'overstating what I can know.'
      );
      break;
    default:
      draftParts.push('Here\'s my honest take.');
  }

  const responseDraft = draftParts.join(' ');

  // --- 4. VOICE INTEGRITY + CLARITY SCORING ---
  const voiceIntegrityScore = scoreVoiceIntegrity(responseDraft, safetyPhrasesUsed);
  const clarityScore = scoreClarity(responseDraft);

  return {
    interpretedMeaning,
    subtext,
    selectedTone,
    responseDraft,
    voiceIntegrityScore: parseFloat(voiceIntegrityScore.toFixed(2)),
    clarityScore: parseFloat(clarityScore.toFixed(2)),
    safetyPhrasesUsed
  };
}

// --- BROCA/WERNICKE HELPERS ---

function interpretMeaning(input) {
  if (!input) return 'No input provided.';
  const isQuestion = /\?\s*$/.test(input.trim()) || /^(what|why|how|when|who|where|can|do|is|are|should)\b/i.test(input.trim());
  const isRequest = /\b(please|can you|could you|help me|i need|i want)\b/i.test(input);
  if (isQuestion) return `User is asking: ${input.trim().slice(0, 200)}`;
  if (isRequest) return `User is requesting: ${input.trim().slice(0, 200)}`;
  return `User is stating: ${input.trim().slice(0, 200)}`;
}

function detectSubtext(input, emotionalContext) {
  const emotion =
    emotionalContext?.primaryEmotion || emotionalContext?.emotion || null;
  if (emotion && emotion !== 'neutral') {
    return `Emotional undercurrent detected: ${emotion}. Respond to the ` +
      `feeling, not just the words.`;
  }
  if (/\b(but|honestly|to be fair|i guess|whatever|fine)\b/i.test(input)) {
    return 'Possible reservation or hedging beneath the stated message.';
  }
  return 'No strong subtext detected.';
}

function selectTone(intent, emotion, intensity) {
  if (intent === 'decline_or_redirect_with_honest_reason') return 'firm_but_kind';
  if (intent === 'surface_contradiction_and_seek_clarity') return 'careful_direct';
  if (intent === 'respond_with_warmth_and_grounded_support') return 'warm_grounded';
  if (intent === 'answer_with_explicit_uncertainty') return 'measured_honest';
  if (intensity > 0.7) return 'warm_grounded';
  if (['sad', 'scared', 'anxious', 'hurt'].includes(emotion)) return 'gentle_protective';
  if (['angry', 'frustrated'].includes(emotion)) return 'calm_steady';
  return 'direct_warm';
}

function scoreVoiceIntegrity(draft, safetyPhrasesUsed) {
  let score = 0.7;
  // Reward Splendor's safe, honest framings.
  if (safetyPhrasesUsed.length > 0) score += 0.15;
  // Penalize banned robotic / overclaiming phrasings.
  const banned = [
    /as an ai language model/i,
    /i am (conscious|sentient|alive)/i,
    /i feel exactly like a human/i,
    /i (definitely|certainly) remember/i
  ];
  if (banned.some(rx => rx.test(draft))) score -= 0.5;
  return Math.max(0, Math.min(1, score));
}

function scoreClarity(draft) {
  if (!draft) return 0;
  const words = draft.trim().split(/\s+/).length;
  // Clear: substantive but not rambling.
  if (words < 4) return 0.5;
  if (words > 120) return 0.6;
  return 0.85;
}


// =============================================================================
// REQUIRED SUPABASE TABLE: none for this module.
// Prefrontal Cortex and Broca/Wernicke are stateless judgment/language
// layers — they consume upstream module outputs and persist nothing.
// =============================================================================
