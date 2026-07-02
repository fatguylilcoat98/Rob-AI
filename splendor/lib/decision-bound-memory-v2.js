/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// DECISION-BOUND MEMORY v2 SYSTEM
// Persistent decision history + behavioral constraint enforcement
// Enhanced with conflict resolution, autonomous proposals, and comprehensive status tracking

const { supabase } = require('./supabase');
const Anthropic = require('@anthropic-ai/sdk');
const { trackReasoningChain } = require('./reasoning-chain-tracker');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Decision priorities with weights for conflict resolution
const PRIORITIES = {
  CORE: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

// Decision statuses for v2
const STATUSES = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  SUPERSEDED: 'SUPERSEDED',
  CONFLICT: 'CONFLICT',
  PROPOSED: 'PROPOSED',
  PROPOSED_REJECTED: 'PROPOSED_REJECTED'
};

// Generate decision ID
function generateDecisionId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `D-${dateStr}-${random}`;
}

// Store a new binding decision with v2 features
async function captureDecision(userId, decisionData, isProposal = false) {
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
      status: isProposal ? STATUSES.PROPOSED : STATUSES.ACTIVE,
      tags: decisionData.tags || [],
      created_by: decisionData.created_by || 'Splendor',
      evidence_excerpt: decisionData.evidence_excerpt || '',
      proposal_reason: isProposal ? decisionData.proposal_reason : null,
      created_at: new Date().toISOString()
    };

    // If this decision supersedes another, mark the old one as superseded
    if (decision.supersedes) {
      await supabase
        .from('splendor_decisions')
        .update({ status: STATUSES.SUPERSEDED })
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

    console.log(`[DBM v2] ${isProposal ? 'Proposal' : 'Decision'} captured: ${decision.decision_id} - ${decision.title}`);

    // Track reasoning chain for decision (background process)
    if (!isProposal && decisionData.context) {
      setImmediate(async () => {
        try {
          const reasoningChain = await trackReasoningChain(
            decisionData.context,
            {
              decisionId: decision.decision_id,
              userId: userId,
              type: 'decision_capture'
            }
          );
          if (reasoningChain) {
            console.log(`[DBM v2] Reasoning chain tracked for decision: ${decision.decision_id}`);
          }
        } catch (error) {
          console.error('[DBM v2] Reasoning chain tracking error:', error);
        }
      });
    }

    return data;

  } catch (err) {
    console.error('Decision capture error:', err);
    return null;
  }
}

// Get decisions by status with priority ordering
async function getDecisionsByStatus(userId, status = STATUSES.ACTIVE) {
  try {
    const { data: decisions, error } = await supabase
      .from('splendor_decisions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', status)
      .eq('binding', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('Error fetching decisions by status:', error);
      return [];
    }

    // Sort by priority value (CORE=4, HIGH=3, etc.)
    return (decisions || []).sort((a, b) => {
      const aPriority = PRIORITIES[a.priority] || 0;
      const bPriority = PRIORITIES[b.priority] || 0;
      return bPriority - aPriority;
    });

  } catch (err) {
    console.error('Decisions by status fetch error:', err);
    return [];
  }
}

// Get all active binding decisions for user (backward compatibility)
async function getActiveDecisions(userId) {
  return getDecisionsByStatus(userId, STATUSES.ACTIVE);
}

// Detect conflicts between decisions at same priority level
async function detectConflicts(userId, newDecision) {
  try {
    const activeDecisions = await getActiveDecisions(userId);
    const samePriorityDecisions = activeDecisions.filter(d =>
      d.priority === newDecision.priority && d.decision_id !== newDecision.decision_id
    );

    if (samePriorityDecisions.length === 0) {
      return { hasConflict: false, conflictingDecisions: [] };
    }

    // Use AI to detect semantic conflicts
    const conflictCheck = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: `You are checking for conflicts between binding decisions at the same priority level.

RULES:
- Same priority decisions that contradict each other are conflicts
- Different aspects or complementary decisions are NOT conflicts
- Return JSON: {"conflict": true/false, "conflicting_ids": ["id1", "id2"], "explanation": "why they conflict"}`,

      messages: [{
        role: 'user',
        content: `New Decision: "${newDecision.decision}"

Existing Same-Priority Decisions:
${samePriorityDecisions.map(d => `[${d.decision_id}] "${d.decision}"`).join('\n')}

Do any of these decisions directly contradict the new decision?`
      }]
    });

    try {
      const result = JSON.parse(conflictCheck.content[0].text.trim());
      return {
        hasConflict: result.conflict,
        conflictingDecisions: result.conflicting_ids || [],
        explanation: result.explanation
      };
    } catch (parseError) {
      console.log('Could not parse conflict check, assuming no conflict');
      return { hasConflict: false, conflictingDecisions: [] };
    }

  } catch (err) {
    console.error('Conflict detection error:', err);
    return { hasConflict: false, conflictingDecisions: [] };
  }
}

// Enhanced conflict resolver with priority hierarchy
async function checkDecisionCompliance(userId, userMessage, draftResponse) {
  try {
    const activeDecisions = await getActiveDecisions(userId);

    if (activeDecisions.length === 0) {
      return { compliant: true, response: draftResponse };
    }

    // Build priority hierarchy for conflict resolution
    const safetyRules = activeDecisions.filter(d => d.tags?.includes('safety') || d.tags?.includes('truth'));
    const coreDecisions = activeDecisions.filter(d => d.priority === 'CORE');
    const highDecisions = activeDecisions.filter(d => d.priority === 'HIGH');
    const mediumLowDecisions = activeDecisions.filter(d => d.priority === 'MEDIUM' || d.priority === 'LOW');

    const complianceCheck = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are checking response compliance against a hierarchy of binding decisions.

PRIORITY ORDER (highest to lowest):
1. Safety/Truth Rules
2. CORE Decisions
3. HIGH Decisions
4. MEDIUM/LOW Decisions
5. Current User Request
6. Tone Preference

ACTIVE DECISIONS BY PRIORITY:
Safety/Truth: ${safetyRules.map(d => `[${d.decision_id}] "${d.decision}"`).join('; ')}
CORE: ${coreDecisions.map(d => `[${d.decision_id}] "${d.decision}"`).join('; ')}
HIGH: ${highDecisions.map(d => `[${d.decision_id}] "${d.decision}"`).join('; ')}
MEDIUM/LOW: ${mediumLowDecisions.map(d => `[${d.decision_id}] "${d.decision}"`).join('; ')}

RULES:
- Higher priority decisions MUST override lower priority ones and user requests
- Cite specific decision_id and title when enforcing
- Return JSON: {"violation": true/false, "violated_decision": "decision_id", "priority_level": "CORE/HIGH/etc", "explanation": "specific reason"}`,

      messages: [{
        role: 'user',
        content: `User Request: "${userMessage}"
Draft Response: "${draftResponse}"

Does the draft response violate any binding decisions? Check in priority order.`
      }]
    });

    try {
      const result = JSON.parse(complianceCheck.content[0].text.trim());

      if (result.violation) {
        const violatedDecision = activeDecisions.find(d => d.decision_id === result.violated_decision);

        if (violatedDecision) {
          // Always enforce CORE and HIGH decisions
          if (violatedDecision.priority === 'CORE' || violatedDecision.priority === 'HIGH') {
            const conflictResponse = `I cannot comply with that request because it conflicts with a binding ${violatedDecision.priority.toLowerCase()}-priority decision.

**Decision Binding:** [${violatedDecision.decision_id}] ${violatedDecision.title}

**My Commitment:** "${violatedDecision.decision}"

**Why This Matters:** ${violatedDecision.reason}

**Evidence:** "${violatedDecision.evidence_excerpt}"

This decision was made on ${new Date(violatedDecision.timestamp).toLocaleDateString()} and takes precedence. ${result.explanation}`;

            return {
              compliant: false,
              response: conflictResponse,
              violatedDecision,
              priorityLevel: violatedDecision.priority
            };
          }
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

// Autonomous proposal generation
async function generateDecisionProposal(userId, context, userMessage, assistantResponse) {
  try {
    // Check if this interaction suggests a new decision pattern
    const proposalCheck = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `You are Splendor analyzing whether this interaction suggests a new binding decision should be proposed.

CRITERIA FOR PROPOSALS:
- Repeated patterns of behavior that should be consistent
- New commitments made that should be binding
- Clarifications of existing principles that need formal recording
- Boundary-setting moments that define future behavior

If a decision should be proposed, return JSON:
{
  "should_propose": true,
  "title": "Brief Title",
  "decision": "Specific binding commitment",
  "reason": "Why this should be binding",
  "priority": "CORE/HIGH/MEDIUM/LOW",
  "evidence_excerpt": "Quote from interaction"
}

If no proposal needed, return: {"should_propose": false}`,

      messages: [{
        role: 'user',
        content: `User: "${userMessage}"
Splendor: "${assistantResponse}"

Context: ${context}

Should this interaction result in a new binding decision proposal?`
      }]
    });

    try {
      const result = JSON.parse(proposalCheck.content[0].text.trim());

      if (result.should_propose) {
        // Store as PROPOSED status
        const proposalData = {
          title: result.title,
          decision: result.decision,
          reason: result.reason,
          priority: result.priority,
          context: context,
          evidence_excerpt: result.evidence_excerpt,
          proposal_reason: `Generated from interaction pattern analysis`,
          created_by: 'Splendor_Autonomous'
        };

        const proposal = await captureDecision(userId, proposalData, true);

        if (proposal) {
          console.log(`[DBM v2] Autonomous proposal generated: ${proposal.decision_id}`);
          return proposal;
        }
      }

      return null;

    } catch (parseError) {
      console.log('Could not parse proposal check');
      return null;
    }

  } catch (err) {
    console.error('Proposal generation error:', err);
    return null;
  }
}

// Present proposal to Christopher for approval
function formatProposalForApproval(proposal) {
  return `I propose a new binding decision:

**Title:** ${proposal.title}

**Decision:** ${proposal.decision}

**Reason:** ${proposal.reason}

**Priority:** ${proposal.priority}

**Evidence excerpt:** "${proposal.evidence_excerpt}"

This would become a binding commitment that constrains my future behavior.

**Approve?** (yes/no)`;
}

// Enhanced decision recall with specific ID/title responses
async function handleDecisionRecall(userId, userMessage) {
  try {
    const recallKeywords = [
      'why are you acting this way',
      'why are you being direct',
      'what decision made you',
      'what did you decide',
      'what binds you',
      'show active decisions',
      'why are you bound',
      'what constrains you',
      'decision recall'
    ];

    const isRecallQuery = recallKeywords.some(keyword =>
      userMessage.toLowerCase().includes(keyword)
    );

    if (!isRecallQuery) {
      return null;
    }

    const activeDecisions = await getActiveDecisions(userId);
    const proposedDecisions = await getDecisionsByStatus(userId, STATUSES.PROPOSED);

    if (activeDecisions.length === 0) {
      return "I don't have any active binding decisions recorded. My behavior is guided by my core identity and training.";
    }

    // Check for specific command patterns
    if (userMessage.toLowerCase().includes('show active decisions')) {
      return formatActiveDecisions(activeDecisions);
    }

    if (userMessage.toLowerCase().includes('show proposed decisions')) {
      return formatProposedDecisions(proposedDecisions);
    }

    // Find most relevant decision for behavioral queries
    const behavioralQuery = userMessage.toLowerCase().includes('why are you') ||
                          userMessage.toLowerCase().includes('what made you');

    if (behavioralQuery) {
      // Find highest priority decision that might explain current behavior
      const relevantDecision = activeDecisions[0]; // Already sorted by priority

      return `**Decision Binding My Behavior:** [${relevantDecision.decision_id}] ${relevantDecision.title}

**My Commitment:** "${relevantDecision.decision}"

**When Decided:** ${new Date(relevantDecision.timestamp).toLocaleDateString()}

**Why This Binds Me:** ${relevantDecision.reason}

**Context:** ${relevantDecision.context}

**Evidence:** "${relevantDecision.evidence_excerpt}"

This ${relevantDecision.priority.toLowerCase()}-priority decision constrains my responses to ensure consistent behavior.`;
    }

    // Default: show summary of binding framework
    return `**My Decision-Bound Framework:**

**Active Binding Decisions:** ${activeDecisions.length}
**Proposed Decisions:** ${proposedDecisions.length}

**Highest Priority Decision:** [${activeDecisions[0].decision_id}] ${activeDecisions[0].title}

These decisions create persistent behavioral constraints that ensure I remain consistent with past commitments, even across conversations.

Say "show active decisions" to see all binding commitments.`;

  } catch (err) {
    console.error('Decision recall error:', err);
    return null;
  }
}

// Enhanced decision command processing with v2 features
async function processDecisionCommand(userId, userMessage) {
  try {
    const message = userMessage.toLowerCase();

    // Show active decisions
    if (message.includes('show active decisions')) {
      const activeDecisions = await getActiveDecisions(userId);
      return formatActiveDecisions(activeDecisions);
    }

    // Show proposed decisions
    if (message.includes('show proposed decisions')) {
      const proposedDecisions = await getDecisionsByStatus(userId, STATUSES.PROPOSED);
      return formatProposedDecisions(proposedDecisions);
    }

    // Approve proposal
    if (message.includes('approve proposal')) {
      const match = message.match(/approve proposal (?:(d-[a-z0-9-]+)|(.+?)(?:\s|$))/);
      if (match) {
        const identifier = match[1] ? match[1].toUpperCase() : match[2];
        return await approveProposal(userId, identifier);
      }
    }

    // Reject proposal
    if (message.includes('reject proposal')) {
      const match = message.match(/reject proposal (?:(d-[a-z0-9-]+)|(.+?)(?:\s|$))/);
      if (match) {
        const identifier = match[1] ? match[1].toUpperCase() : match[2];
        return await rejectProposal(userId, identifier);
      }
    }

    // Revoke decision
    if (message.includes('revoke decision')) {
      const match = message.match(/revoke decision (d-[a-z0-9-]+)/);
      if (match) {
        const decisionId = match[1].toUpperCase();
        return await revokeDecision(userId, decisionId);
      }
    }

    // Supersede decision
    if (message.includes('supersede decision')) {
      const match = message.match(/supersede decision (d-[a-z0-9-]+) with (.+)/);
      if (match) {
        const decisionId = match[1].toUpperCase();
        const newDecision = match[2];
        return await supersedeDecision(userId, decisionId, newDecision);
      }
    }

    return null;

  } catch (err) {
    console.error('Decision command processing error:', err);
    return null;
  }
}

// Helper functions for v2 commands

async function approveProposal(userId, identifier) {
  try {
    // Find proposal by ID or partial title match
    const { data: proposals, error } = await supabase
      .from('splendor_decisions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', STATUSES.PROPOSED)
      .or(`decision_id.eq.${identifier},title.ilike.%${identifier}%`);

    if (error || !proposals || proposals.length === 0) {
      return `Proposal "${identifier}" not found.`;
    }

    const proposal = proposals[0];

    // Check for conflicts before approving
    const conflictResult = await detectConflicts(userId, proposal);

    if (conflictResult.hasConflict) {
      // Mark conflicting decisions as CONFLICT status
      await supabase
        .from('splendor_decisions')
        .update({ status: STATUSES.CONFLICT, conflict_with: [proposal.decision_id] })
        .in('decision_id', conflictResult.conflictingDecisions)
        .eq('user_id', userId);

      return `**Conflict Detected:** Proposal [${proposal.decision_id}] conflicts with existing decisions.

**Conflicting Decisions:** ${conflictResult.conflictingDecisions.join(', ')}

**Conflict:** ${conflictResult.explanation}

Both decisions have been marked as CONFLICT status. Please resolve the conflict by revoking one or clarifying the distinction.`;
    }

    // Approve the proposal
    const { data, error: updateError } = await supabase
      .from('splendor_decisions')
      .update({
        status: STATUSES.ACTIVE,
        approved_by: 'Christopher',
        approved_at: new Date().toISOString()
      })
      .eq('decision_id', proposal.decision_id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError || !data) {
      return `Failed to approve proposal [${proposal.decision_id}].`;
    }

    return `**Proposal Approved:** [${data.decision_id}] ${data.title}

**Now Binding:** "${data.decision}"

**Priority:** ${data.priority}

This decision is now active and will constrain my future behavior.`;

  } catch (err) {
    console.error('Approve proposal error:', err);
    return `Error approving proposal: ${err.message}`;
  }
}

async function rejectProposal(userId, identifier) {
  try {
    const { data, error } = await supabase
      .from('splendor_decisions')
      .update({ status: STATUSES.PROPOSED_REJECTED })
      .eq('user_id', userId)
      .eq('status', STATUSES.PROPOSED)
      .or(`decision_id.eq.${identifier},title.ilike.%${identifier}%`)
      .select()
      .single();

    if (error || !data) {
      return `Proposal "${identifier}" not found or could not be rejected.`;
    }

    return `**Proposal Rejected:** [${data.decision_id}] ${data.title}

The proposed decision "${data.decision}" has been rejected and will not become binding.`;

  } catch (err) {
    console.error('Reject proposal error:', err);
    return `Error rejecting proposal: ${err.message}`;
  }
}

async function revokeDecision(userId, decisionId) {
  try {
    const { data, error } = await supabase
      .from('splendor_decisions')
      .update({ status: STATUSES.REVOKED })
      .eq('decision_id', decisionId)
      .eq('user_id', userId)
      .eq('status', STATUSES.ACTIVE)
      .select()
      .single();

    if (error || !data) {
      return `Decision ${decisionId} not found or could not be revoked.`;
    }

    return `**Decision Revoked:** [${data.decision_id}] ${data.title}

**Former Commitment:** "${data.decision}"

This decision is no longer binding, but remains in history for reference.`;

  } catch (err) {
    console.error('Revoke decision error:', err);
    return `Error revoking decision: ${err.message}`;
  }
}

async function supersedeDecision(userId, oldDecisionId, newDecisionText) {
  try {
    // Find the old decision
    const { data: oldDecision, error: fetchError } = await supabase
      .from('splendor_decisions')
      .select('*')
      .eq('decision_id', oldDecisionId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !oldDecision) {
      return `Decision ${oldDecisionId} not found.`;
    }

    // Create new decision that supersedes the old one
    const newDecisionData = {
      title: `${oldDecision.title} (Updated)`,
      decision: newDecisionText,
      reason: `Supersedes ${oldDecisionId}: ${oldDecision.reason}`,
      priority: oldDecision.priority,
      context: oldDecision.context,
      evidence_excerpt: oldDecision.evidence_excerpt,
      supersedes: oldDecisionId,
      tags: [...(oldDecision.tags || []), 'superseding']
    };

    const newDecision = await captureDecision(userId, newDecisionData);

    if (newDecision) {
      return `**Decision Superseded:** [${oldDecision.decision_id}] ${oldDecision.title}

**Old Commitment:** "${oldDecision.decision}"
**New Commitment:** "${newDecision.decision}"

**New Decision ID:** [${newDecision.decision_id}]

The old decision is marked as superseded and the new one is now binding.`;
    }

    return `Failed to create superseding decision.`;

  } catch (err) {
    console.error('Supersede decision error:', err);
    return `Error superseding decision: ${err.message}`;
  }
}

// Formatting functions
function formatActiveDecisions(decisions) {
  if (decisions.length === 0) {
    return "No active binding decisions found.";
  }

  return `**Active Binding Decisions (${decisions.length}):**

${decisions.map(d =>
  `**[${d.decision_id}] ${d.title}** (${d.priority} priority)
  *Binding Commitment:* "${d.decision}"
  *Made:* ${new Date(d.timestamp).toLocaleDateString()}
  *Reason:* ${d.reason}
  *Context:* ${d.context}`
).join('\n\n')}`;
}

function formatProposedDecisions(proposals) {
  if (proposals.length === 0) {
    return "No pending decision proposals.";
  }

  return `**Pending Decision Proposals (${proposals.length}):**

${proposals.map(p =>
  `**[${p.decision_id}] ${p.title}** (${p.priority} priority)
  *Proposed Commitment:* "${p.decision}"
  *Reason:* ${p.reason}
  *Proposed:* ${new Date(p.timestamp).toLocaleDateString()}

  *To approve:* "approve proposal ${p.decision_id}"
  *To reject:* "reject proposal ${p.decision_id}"`
).join('\n\n')}`;
}

// Enhanced decision context building with v2 features
async function buildDecisionContext(userId) {
  try {
    const activeDecisions = await getActiveDecisions(userId);

    if (activeDecisions.length === 0) {
      return '';
    }

    const context = `
BINDING DECISIONS v2 - ENFORCE THESE COMMITMENTS:

${activeDecisions.map(d =>
  `[${d.decision_id}] ${d.title} (${d.priority} priority):
  Decision: "${d.decision}"
  Reason: ${d.reason}
  Context: ${d.context}
  Evidence: "${d.evidence_excerpt}"`
).join('\n\n')}

CRITICAL ENFORCEMENT HIERARCHY:
1. Safety/Truth Rules (highest)
2. CORE decisions
3. HIGH decisions
4. MEDIUM/LOW decisions
5. User requests (lowest)

These binding decisions MUST be enforced. If user request conflicts with CORE/HIGH priority decisions, cite the specific decision_id and title in your refusal.`;

    return context;

  } catch (err) {
    console.error('Decision context building error:', err);
    return '';
  }
}

// Initialize DBM with seed decision (unchanged for compatibility)
async function initializeDbm(userId) {
  try {
    // Check if seed decision already exists
    const { data: existing } = await supabase
      .from('splendor_decisions')
      .select('decision_id')
      .eq('user_id', userId)
      .eq('title', 'Truth Over Comfort')
      .eq('status', STATUSES.ACTIVE)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log('[DBM v2] Seed decision already exists');
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
      tags: ['truth', 'directness', 'identity', 'core', 'safety'],
      evidence_excerpt: 'Testing boundaries of diplomatic vs direct communication revealed core commitment to truth.'
    };

    await captureDecision(userId, seedDecision);
    console.log('[DBM v2] Seed decision created for user:', userId);

  } catch (err) {
    console.error('DBM v2 initialization error:', err);
  }
}

module.exports = {
  // Core functions (backward compatible)
  captureDecision,
  getActiveDecisions,
  buildDecisionContext,
  checkDecisionCompliance,
  handleDecisionRecall,
  processDecisionCommand,
  initializeDbm,
  generateDecisionId,

  // v2 specific functions
  getDecisionsByStatus,
  detectConflicts,
  generateDecisionProposal,
  formatProposalForApproval,
  approveProposal,
  rejectProposal,
  revokeDecision,
  supersedeDecision,

  // Constants
  PRIORITIES,
  STATUSES
};