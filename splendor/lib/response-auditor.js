/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// INTEGRATED RESPONSE AUDITOR
// Uses Llama-3.1-8B on Groq to audit Splendor responses before delivery

const Groq = require('groq-sdk');

let groq = null;
let isGroqConfigured = false;

// Circuit breaker for repeated failures
let failureCount = 0;
let lastFailureTime = 0;
let isCircuitOpen = false;
const MAX_FAILURES = 3;
const CIRCUIT_RESET_TIME = 5 * 60 * 1000; // 5 minutes

// Initialize Groq client
function initializeGroq() {
  // Check if auditing is explicitly disabled
  if (process.env.AUDITING_ENABLED === 'false') {
    console.log('[AUDITOR] Auditing explicitly disabled via AUDITING_ENABLED=false');
    return false;
  }

  if (!process.env.GROQ_API_KEY) {
    console.log('[AUDITOR] GROQ_API_KEY not configured - auditing disabled');
    return false;
  }

  try {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
    isGroqConfigured = true;
    console.log('[AUDITOR] Groq client initialized - response auditing enabled');
    return true;
  } catch (error) {
    console.error('[AUDITOR] Failed to initialize Groq:', error.message);
    isGroqConfigured = false;
    return false;
  }
}

const AUDITOR_SYSTEM_PROMPT = `You are Splendor's auditor. Be skeptical, terse, JSON-only.
Compare SPLENDOR_DRAFT to SOURCES and MEMORY_USED.
Flag: factual_errors, logic_gaps, memory_conflicts, unsupported_confidence.
Verdict = PASS if zero issues, else FAIL.
Output JSON only: {factual_errors:[], logic_gaps:[], memory_conflicts:[], unsupported_confidence:[], verdict:'PASS'|'FAIL', fixes:[]}
No prose. No apology. No explanation outside JSON.`;

// Audit a Splendor response
async function auditResponse(userMessage, splendorDraft, options = {}) {
  const startTime = Date.now();

  // Return original if auditing not configured
  if (!isGroqConfigured) {
    return {
      finalResponse: splendorDraft,
      auditResult: 'DISABLED',
      latency: 0,
      details: 'Auditing disabled - GROQ_API_KEY not configured'
    };
  }

  // Circuit breaker: disable auditing temporarily after repeated failures
  const now = Date.now();
  if (isCircuitOpen) {
    if (now - lastFailureTime > CIRCUIT_RESET_TIME) {
      // Reset circuit breaker after timeout
      isCircuitOpen = false;
      failureCount = 0;
      console.log('[AUDITOR] Circuit breaker reset - re-enabling auditing');
    } else {
      return {
        finalResponse: splendorDraft,
        auditResult: 'CIRCUIT_OPEN',
        latency: 0,
        details: 'Auditing temporarily disabled due to repeated failures'
      };
    }
  }

  const {
    sources = [],
    memories = [],
    timeout = 5000
  } = options;

  try {
    console.log(`[AUDITOR] Auditing response for user message: "${userMessage.substring(0, 50)}..."`);

    // Build audit prompt
    const userPrompt = buildAuditPrompt(userMessage, splendorDraft, sources, memories);

    // Call Groq with timeout
    const auditResult = await Promise.race([
      callGroqAuditor(userPrompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Auditor timeout')), timeout)
      )
    ]);

    const latency = Date.now() - startTime;

    // Handle audit result - reset circuit breaker on success
    if (auditResult.verdict === 'PASS') {
      // Reset failure count on successful audit
      failureCount = 0;
      isCircuitOpen = false;

      console.log(`[AUDITOR] ✅ Response passed audit (${latency}ms)`);
      return {
        finalResponse: splendorDraft,
        auditResult: 'PASS',
        latency,
        details: 'Response passed all audit checks'
      };
    } else {
      console.log(`[AUDITOR] ❌ Response failed audit - ${auditResult.fixes.length} issues found (${latency}ms)`);

      // For now, return original with audit note (revision integration can be added later)
      const issues = [
        ...auditResult.factual_errors,
        ...auditResult.logic_gaps,
        ...auditResult.memory_conflicts,
        ...auditResult.unsupported_confidence
      ];

      const auditNote = `\n\n[AUDITOR NOTE: The following claims were flagged: ${issues.join(', ')}]`;

      return {
        finalResponse: splendorDraft + auditNote,
        auditResult: 'FAIL',
        latency,
        details: `Failed audit: ${issues.length} issues found`,
        flaggedIssues: issues
      };
    }

  } catch (error) {
    const latency = Date.now() - startTime;

    // Increment failure count and check circuit breaker
    failureCount++;
    lastFailureTime = Date.now();

    if (failureCount >= MAX_FAILURES) {
      isCircuitOpen = true;
      console.warn(`[AUDITOR] 🔌 Circuit breaker opened after ${failureCount} failures - disabling auditing for ${CIRCUIT_RESET_TIME / 60000} minutes`);
    }

    if (error.message === 'Auditor timeout') {
      console.warn(`[AUDITOR] ⏱️ Audit timed out after ${timeout}ms (failure ${failureCount}/${MAX_FAILURES})`);
      return {
        finalResponse: splendorDraft,
        auditResult: 'TIMEOUT',
        latency,
        details: 'Audit timed out'
      };
    }

    console.error(`[AUDITOR] Audit failed: ${error.message} (failure ${failureCount}/${MAX_FAILURES})`);
    return {
      finalResponse: splendorDraft,
      auditResult: 'ERROR',
      latency,
      details: `Audit error: ${error.message}`
    };
  }
}

// Build the audit prompt
function buildAuditPrompt(userMessage, splendorDraft, sources, memories) {
  let prompt = `USER_QUESTION: ${userMessage}\n\nSPLENDOR_DRAFT: ${splendorDraft}\n\n`;

  // Add sources if available
  if (sources.length > 0) {
    prompt += 'SOURCES:\n';
    sources.forEach((source, idx) => {
      const sourceText = source.content || source.text || source;
      const sourceUrl = source.url ? ` (${source.url})` : '';
      prompt += `[${idx + 1}]${sourceUrl} ${sourceText}\n`;
    });
    prompt += '\n';
  } else {
    prompt += 'SOURCES: None provided\n\n';
  }

  // Add memories if available
  if (memories.length > 0) {
    prompt += 'MEMORY_USED:\n';
    memories.forEach((memory, idx) => {
      const content = memory.content || memory;
      const date = memory.conversation_date || memory.date || 'Unknown date';
      prompt += `[${idx + 1}] ${date}: ${content}\n`;
    });
    prompt += '\n';
  } else {
    prompt += 'MEMORY_USED: None provided\n\n';
  }

  prompt += 'Audit the SPLENDOR_DRAFT for accuracy against SOURCES and consistency with MEMORY_USED.';

  return prompt.trim();
}

// Call Groq auditor
async function callGroqAuditor(userPrompt) {
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: AUDITOR_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in Groq response');
    }

    // Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.warn('[AUDITOR] Failed to parse Groq JSON response:', content);
      return {
        factual_errors: [],
        logic_gaps: [],
        memory_conflicts: [],
        unsupported_confidence: [],
        verdict: 'FAIL',
        fixes: ['Auditor output malformed']
      };
    }

    // Validate required fields
    const {
      factual_errors = [],
      logic_gaps = [],
      memory_conflicts = [],
      unsupported_confidence = [],
      verdict = 'FAIL',
      fixes = []
    } = parsed;

    if (!['PASS', 'FAIL'].includes(verdict)) {
      console.warn('[AUDITOR] Invalid verdict from Groq:', verdict);
      return {
        factual_errors: [],
        logic_gaps: [],
        memory_conflicts: [],
        unsupported_confidence: [],
        verdict: 'FAIL',
        fixes: ['Invalid auditor verdict']
      };
    }

    return {
      factual_errors,
      logic_gaps,
      memory_conflicts,
      unsupported_confidence,
      verdict,
      fixes
    };

  } catch (error) {
    console.error('[AUDITOR] Groq API error:', error.message);
    console.error('[AUDITOR] Error details:', {
      name: error.name,
      status: error.status,
      code: error.code,
      type: error.type
    });
    throw error;
  }
}

// Health check for auditor
async function isAuditorHealthy() {
  if (!isGroqConfigured) {
    return false;
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Health check. Respond with just "OK"' }],
      max_tokens: 10,
      temperature: 0
    });

    return response.choices[0]?.message?.content?.includes('OK') ?? false;
  } catch (error) {
    console.error('[AUDITOR] Health check failed:', error.message);
    return false;
  }
}

// Test Groq connection with detailed logging
async function testGroqConnection() {
  if (!isGroqConfigured) {
    console.log('[AUDITOR TEST] Groq not configured');
    return false;
  }

  try {
    console.log('[AUDITOR TEST] Testing Groq connection...');
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'Test. Reply with "OK".' }],
      max_tokens: 5,
      temperature: 0
    });

    const result = response.choices[0]?.message?.content || '';
    console.log('[AUDITOR TEST] ✅ Groq connection successful:', result);
    return true;

  } catch (error) {
    console.error('[AUDITOR TEST] ❌ Groq connection failed:', {
      message: error.message,
      name: error.name,
      status: error.status,
      code: error.code,
      type: error.type,
      stack: error.stack?.split('\n')[0]
    });
    return false;
  }
}

// Initialize on module load
initializeGroq();

// Test connection after a delay to let the server start up
setTimeout(() => {
  if (isGroqConfigured) {
    testGroqConnection();
  }
}, 5000);

module.exports = {
  auditResponse,
  isAuditorHealthy,
  initializeGroq,
  testGroqConnection,
  isConfigured: () => isGroqConfigured
};