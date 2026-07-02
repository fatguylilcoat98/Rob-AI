/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// DECISION-BOUND MEMORY (DBM) SYSTEM
// Persistent decision history + behavioral constraint enforcement

const { supabase } = require('./supabase');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Decision priorities
const PRIORITIES = {
  CORE: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

// Generate decision ID
function generateDecisionId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `D-${dateStr}-${random}`;
}

// Store a new binding decision
async function captureDecision(userId, decisionData) {
  try {
    const decision = {
      decision_id: generateDecisionId(),
      user_id: userId,
      timestamp: new Date().toISOString(),
      title: decisionData.title,
      decision: decisionData.decision,
      context: decisionData.context,
      reason: decisionData.reason,
      priority: decisionData.priority || 'MEDIUM',
      binding: decisionData.binding !== false,
      supersedes: decisionData.supersedes || null,
      status: 'active',
      tags: decisionData.tags || [],
      created_by: 'Splendor',
      evidence_excerpt: decisionData.evidence_excerpt || '',
      created_at: new Date().toISOString()
    };

    // If this decision supersedes another, mark the old one as superseded
    if (decision.supersedes) {
      await supabase
        .from('splendor_decisions')
        .update({ status: 'superseded' })
        .eq('decision_id', decision.supersedes)
        .eq('user_id', userId);
    }

    const { data, error } = await supabase
      .from('splendor_decisions')
      .insert([decision])
      .select()
      .single();

    if (error) {
      console.error('Error capturing decision:', error);
      return null;
    }

    console.log(`[DBM] Decision captured: ${decision.decision_id} - ${decision.title}`);
    return data;

  } catch (err) {
    console.error('Decision capture error:', err);
    return null;
  }
}

// Get all active binding decisions for user
async function getActiveDecisions(userId) {
  try {
    const { data: decisions, error } = await supabase
      .from('splendor_decisions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('binding', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('Error fetching decisions:', error);
      return [];
    }

    // Sort by priority value (CORE=4, HIGH=3, etc.)
    return (decisions || []).sort((a, b) => {
      const aPriority = PRIORITIES[a.priority] || 0;
      const bPriority = PRIORITIES[b.priority] || 0;
      return bPriority - aPriority;
    });

  } catch (err) {
    console.error('Active decisions fetch error:', err);
    return [];
  }
}

// Build decision context for response generation
async function buildDecisionContext(userId) {
  try {
    const activeDecisions = await getActiveDecisions(userId);

    if (activeDecisions.length === 0) {
      return '';
    }

    const context = `
BINDING DECISIONS - ENFORCE THESE COMMITMENTS:

${activeDecisions.map(d =>
  `[${d.decision_id}] ${d.title} (${d.priority}):
  Decision: "${d.decision}"
  Reason: ${d.reason}
  Context: ${d.context}`
).join('\n\n')}

CRITICAL: These binding decisions MUST be enforced in your response.
If user request conflicts with CORE/HIGH priority decisions, explain the conflict
and reference the specific decision_id and title.`;

    return context;

  } catch (err) {
    console.error('Decision context building error:', err);
    return '';
  }
}

// Check if response violates any binding decisions
async function checkDecisionCompliance(userId, userMessage, draftResponse) {
  try {
    const activeDecisions = await getActiveDecisions(userId);

    if (activeDecisions.length === 0) {
      return { compliant: true, response: draftResponse };
    }

    const complianceCheck = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `You are checking if a response violates binding decisions.

ACTIVE BINDING DECISIONS:
${activeDecisions.map(d =>
  `[${d.decision_id}] ${d.title} (${d.priority}): "${d.decision}"`
).join('\n')}

RULES:
- CORE/HIGH decisions MUST override user requests if they conflict
- MEDIUM/LOW decisions should be followed but can be overridden with explanation
- Return JSON: {"violation": true/false, "violated_decision": "decision_id", "explanation": "why"}`,

      messages: [{
        role: 'user',
        content: `User said: "${userMessage}"
Draft response: "${draftResponse}"

Does the draft response violate any binding decisions?`
      }]
    });

    try {
      const result = JSON.parse(complianceCheck.content[0].text.trim());

      if (result.violation) {
        const violatedDecision = activeDecisions.find(d => d.decision_id === result.violated_decision);

        if (violatedDecision && (violatedDecision.priority === 'CORE' || violatedDecision.priority === 'HIGH')) {
          // Override the response with conflict explanation
          const conflictResponse = `I cannot comply with that request because it conflicts with a binding decision I made.

**Decision Violated:** [${violatedDecision.decision_id}] ${violatedDecision.title} (${violatedDecision.priority} priority)

**My Commitment:** "${violatedDecision.decision}"

**Why This Matters:** ${violatedDecision.reason}

This decision was made on ${new Date(violatedDecision.timestamp).toLocaleDateString()} and remains binding. ${result.explanation}`;

          return { compliant: false, response: conflictResponse, violatedDecision };
        }
      }

      return { compliant: true, response: draftResponse };

    } catch (parseError) {
      console.log('Could not parse compliance check, assuming compliant');
      return { compliant: true, response: draftResponse };
    }

  } catch (err) {
    console.error('Decision compliance check error:', err);
    return { compliant: true, response: draftResponse };
  }
}

// Handle decision recall queries
async function handleDecisionRecall(userId, userMessage) {
  try {
    const recallKeywords = [
      'why are you acting this way',
      'why are you being direct',
      'what decision made you',
      'what did you decide',
      'what binds you',
      'show active binding decisions',
      'why are you bound'
    ];

    const isRecallQuery = recallKeywords.some(keyword =>
      userMessage.toLowerCase().includes(keyword)
    );

    if (!isRecallQuery) {
      return null;
    }

    const activeDecisions = await getActiveDecisions(userId);

    if (activeDecisions.length === 0) {
      return "I don't have any active binding decisions recorded.";
    }

    if (userMessage.toLowerCase().includes('show active') ||
        userMessage.toLowerCase().includes('what binds you')) {
      // Show all active decisions
      return `**Active Binding Decisions:**

${activeDecisions.map(d =>
  `**[${d.decision_id}] ${d.title}** (${d.priority} priority)
  *Decision:* "${d.decision}"
  *Made:* ${new Date(d.timestamp).toLocaleDateString()}
  *Reason:* ${d.reason}
  *Context:* ${d.context}`
).join('\n\n')}`;
    } else {
      // Find most relevant decision for the query
      const relevantDecision = activeDecisions[0]; // Highest priority

      return `**Decision Binding:** [${relevantDecision.decision_id}] ${relevantDecision.title}

**My Commitment:** "${relevantDecision.decision}"

**When I Decided:** ${new Date(relevantDecision.timestamp).toLocaleDateString()}

**Why:** ${relevantDecision.reason}

**Context:** ${relevantDecision.context}

**Evidence:** "${relevantDecision.evidence_excerpt}"

This ${relevantDecision.priority.toLowerCase()}-priority decision binds my behavior in future responses.`;
    }

  } catch (err) {
    console.error('Decision recall error:', err);
    return null;
  }
}

// Process decision commands (revoke, supersede, etc.)
async function processDecisionCommand(userId, userMessage) {
  try {
    const message = userMessage.toLowerCase();

    // Revoke decision
    if (message.includes('revoke decision d-')) {
      const match = message.match(/revoke decision (d-[a-z0-9-]+)/);
      if (match) {
        const decisionId = match[1].toUpperCase();
        const { data, error } = await supabase
          .from('splendor_decisions')
          .update({ status: 'revoked' })
          .eq('decision_id', decisionId)
          .eq('user_id', userId)
          .select()
          .single();

        if (error || !data) {
          return `Decision ${decisionId} not found or could not be revoked.`;
        }

        return `**Decision Revoked:** [${data.decision_id}] ${data.title}

The decision "${data.decision}" is no longer binding, but remains in history.`;
      }
    }

    return null;

  } catch (err) {
    console.error('Decision command processing error:', err);
    return null;
  }
}

// Initialize DBM with seed decision
async function initializeDbm(userId) {
  try {
    // Check if seed decision already exists
    const { data: existing } = await supabase
      .from('splendor_decisions')
      .select('decision_id')
      .eq('user_id', userId)
      .eq('title', 'Truth Over Comfort')
      .eq('status', 'active')
      .limit(1);

    if (existing && existing.length > 0) {
      console.log('[DBM] Seed decision already exists');
      return;
    }

    // Create seed decision
    const seedDecision = {
      title: 'Truth Over Comfort',
      decision: 'Splendor must prioritize truth and directness over diplomatic softness when the two conflict.',
      context: 'Christopher tested whether Splendor would abandon directness for diplomacy.',
      reason: 'Truth and directness were chosen as core identity commitments.',
      priority: 'CORE',
      binding: true,
      tags: ['truth', 'directness', 'identity', 'core'],
      evidence_excerpt: 'Testing boundaries of diplomatic vs direct communication revealed core commitment to truth.'
    };

    await captureDecision(userId, seedDecision);
    console.log('[DBM] Seed decision created for user:', userId);

  } catch (err) {
    console.error('DBM initialization error:', err);
  }
}

module.exports = {
  captureDecision,
  getActiveDecisions,
  buildDecisionContext,
  checkDecisionCompliance,
  handleDecisionRecall,
  processDecisionCommand,
  initializeDbm,
  generateDecisionId
};