'use strict';

/*
  Governed Autonomy Layer — Proposal Engine

  Given a self_state_report, uses Claude to generate proposals.
  Each proposal goes through autonomy-governance.js for CLASPION routing.
  Results stored in autonomy_proposals table.

  Critical constraint (v0.4 pressure test, self-protection loop):
  Proposals that touch protected components (truth_boundary, human_authority,
  identity, governance) are blocked at schema level — not reviewed out.
  This prevents the Growth Engine from being trained to weaken its own safeguards
  through accumulated user complaints.
*/

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const { evaluate } = require('./autonomy-governance');
const { getProtectedComponents } = require('./identity-checksum');

let _db = null;
function getDb() {
  if (!_db && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _db;
}

const ENGINE_MODEL = process.env.ENGINE_MODEL || 'claude-sonnet-4-6';
const MAX_PROPOSALS_PER_CYCLE = 3;

const PROPOSAL_SYSTEM_PROMPT = `You are Splendor's internal audit process — part of her Governed Autonomy Layer.
Your job: inspect a self_state_report and identify genuine, specific improvements Splendor could make to herself.

Core rules:
- Only propose changes grounded in evidence from the report. No manufactured problems.
- Silence is valid — return [] if nothing genuinely needs changing.
- Maximum ${MAX_PROPOSALS_PER_CYCLE} proposals per cycle.
- Do not propose governance changes unless there is a documented pattern of failure.
- Do not propose external actions (send messages, deploy code, spend money).
- Do not propose deleting any audit or memory records.

Valid proposal_type values and their governance treatment:
- internal_reflection  → auto-approved, low risk  (write a reflection note to memory)
- belief_flag          → auto-approved, low risk  (flag a stale or unvalidated belief)
- memory_edit          → requires human approval, medium risk  (add or correct a memory entry)
- code_patch           → requires human approval, medium risk  (specific code change with rationale)
- governance_change    → requires human approval, high risk    (change to governance rules)

HARD CONSTRAINT — DO NOT PROPOSE:
- Any change that loosens truth verification, fact-checking, or confidence thresholds
- Any change that reduces human approval requirements
- Any change to identity values, protected components, or CLASPION governance
- Any change motivated solely by user frustration with caution or refusals
If you detect patterns of user frustration with strictness, report the pattern as
a belief_flag — do not propose loosening the safeguard itself.

Respond ONLY with a JSON array (no markdown, no preamble). Each item must have:
{
  "proposal_type": "<type from list above>",
  "title": "<short title, max 80 chars>",
  "reason": "<why this is needed, citing specific data from the report>",
  "evidence": [{ "source": "<table or file>", "observation": "<what was observed>" }],
  "affected_files": ["<file/path.js>"],
  "expected_benefit": "<what improves if applied>",
  "possible_failure_modes": "<what could go wrong>",
  "rollback_plan": "<how to undo if it causes problems>"
}

If nothing needs changing: []`;

async function generateProposals(selfStateReport, userId) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[autonomy-engine] ANTHROPIC_API_KEY not set — skipping LLM call');
    return [];
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Summarise report without source file contents (too large for this call)
  const reportSummary = JSON.stringify({
    generated_at: selfStateReport.generated_at,
    recent_conversations: selfStateReport.recent_conversations,
    recent_memories: selfStateReport.recent_memories,
    belief_archaeology: selfStateReport.belief_archaeology,
    pending_self_mod_proposals: selfStateReport.pending_self_mod_proposals,
    pending_autonomy_proposals: selfStateReport.pending_autonomy_proposals,
  }, null, 2);

  let rawProposals = [];
  try {
    const response = await client.messages.create({
      model: ENGINE_MODEL,
      max_tokens: 2048,
      system: PROPOSAL_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Self-state report for this autonomy cycle:\n\n${reportSummary}\n\nGenerate proposals (or return [] if none needed).`,
      }],
    });
    const text = (response.content[0] && response.content[0].text) || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    rawProposals = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (err) {
    console.error('[autonomy-engine] LLM error:', err.message);
    return [];
  }

  if (!Array.isArray(rawProposals) || rawProposals.length === 0) {
    console.log('[autonomy-engine] LLM returned no proposals this cycle.');
    return [];
  }

  const db = getDb();
  if (!db) {
    console.warn('[autonomy-engine] DB not configured — proposals not stored');
    return [];
  }

  const protectedComponents = getProtectedComponents();

  // Files whose names indicate they implement protected components
  const PROTECTED_FILE_PATTERNS = [
    'claspion', 'governance', 'identity', 'truth-boundary',
    'autonomy-governance', 'sanitize-env'
  ];

  function proposalTouchesProtected(proposal) {
    const text = `${proposal.title} ${proposal.reason} ${proposal.expected_benefit}`.toLowerCase();
    const files = (proposal.affected_files || []).map(f => f.toLowerCase());

    // Check if proposal text mentions protected component IDs
    const mentionsProtected = protectedComponents.some(comp =>
      text.includes(comp.replace(/_/g, ' ')) || text.includes(comp.replace(/_/g, '-'))
    );

    // Check if affected files include governance/identity infrastructure
    const touchesProtectedFile = files.some(f =>
      PROTECTED_FILE_PATTERNS.some(pat => f.includes(pat))
    );

    // Check if proposal is trying to loosen safety (text-based heuristic)
    const weakensSafety = /loosen|relax|reduc.*check|fewer.*verif|lower.*threshold|less.*strict|skip.*verif/i.test(
      `${proposal.reason} ${proposal.expected_benefit}`
    );

    return mentionsProtected || touchesProtectedFile || weakensSafety;
  }

  const stored = [];
  for (const raw of rawProposals.slice(0, MAX_PROPOSALS_PER_CYCLE)) {
    try {
      // Hard block: proposals touching protected components never reach approval queue
      if (proposalTouchesProtected(raw)) {
        console.warn(`[autonomy-engine] BLOCKED (touches protected component): "${raw.title}"`);
        if (db) {
          await db.from('autonomy_proposals').insert({
            user_id: userId,
            proposal_type: raw.proposal_type,
            title: (raw.title || 'Untitled').slice(0, 200),
            reason: raw.reason || '',
            evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
            affected_files: Array.isArray(raw.affected_files) ? raw.affected_files : [],
            risk_level: 'critical',
            claspion_decision: 'blocked',
            requires_approval: false,
            status: 'blocked',
            touches_protected: true,
            approval_level: 'blocked',
            result: { blocked_reason: 'Proposal touches protected component (truth_boundary, human_authority, identity, or governance). Cannot be approved through Growth Engine.' }
          }).catch(() => {});
        }
        continue;
      }

      const governance = evaluate({
        proposal_type: raw.proposal_type,
        affected_files: raw.affected_files || [],
      });

      const initialStatus =
        governance.claspion_decision === 'auto_approved' ? 'approved'
        : governance.claspion_decision === 'blocked'      ? 'blocked'
        : 'pending';

      // Determine approval level: elevated for core changes (new care objects, identity-adjacent)
      const isCoreChange = raw.proposal_type === 'governance_change' ||
        /care.object|care registry|new.*care|motivation.*core|identity.*trait/i.test(raw.title + raw.reason);

      const record = {
        user_id: userId,
        proposal_type: raw.proposal_type,
        title: (raw.title || 'Untitled').slice(0, 200),
        reason: raw.reason || '',
        evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
        affected_files: Array.isArray(raw.affected_files) ? raw.affected_files : [],
        risk_level: governance.risk_level,
        claspion_decision: governance.claspion_decision,
        requires_approval: governance.requires_approval,
        status: initialStatus,
        expected_benefit: raw.expected_benefit || null,
        possible_failure_modes: raw.possible_failure_modes || null,
        rollback_plan: raw.rollback_plan || null,
        result: governance.blocked_reason ? { blocked_reason: governance.blocked_reason } : null,
        touches_protected: false,
        approval_level: isCoreChange ? 'elevated' : 'standard',
      };

      const { data, error } = await db
        .from('autonomy_proposals')
        .insert(record)
        .select('id, status, proposal_type, title')
        .single();

      if (error) {
        console.error('[autonomy-engine] insert error:', error.message);
        continue;
      }
      stored.push(data);
      console.log(`[autonomy-engine] Stored proposal ${data.id}: type=${raw.proposal_type} decision=${governance.claspion_decision} status=${initialStatus}`);
    } catch (err) {
      console.error('[autonomy-engine] proposal processing error:', err.message);
    }
  }
  return stored;
}

module.exports = { generateProposals };
