'use strict';

/*
  Governed Autonomy Layer — CLASPION Routing

  Determines governance decision and risk level for each proposal type.
  Pure logic — no I/O, no external dependencies. Fully testable in isolation.
*/

const GOVERNANCE_FILES = [
  'lib/claspion-governance.js',
  'lib/claspion-enhanced-integration.js',
  'middleware/claspion-middleware.js',
  'middleware/auth.js',
  'lib/autonomy-governance.js',
  'lib/autonomy-proposal-engine.js',
  'workers/autonomy-scheduler.js',
];

const ROUTING_TABLE = {
  internal_reflection: { claspion_decision: 'auto_approved',     risk_level: 'low',      requires_approval: false },
  belief_flag:         { claspion_decision: 'auto_approved',     risk_level: 'low',      requires_approval: false },
  memory_edit:         { claspion_decision: 'requires_approval', risk_level: 'medium',   requires_approval: true  },
  code_patch:          { claspion_decision: 'requires_approval', risk_level: 'medium',   requires_approval: true  },
  governance_change:   { claspion_decision: 'requires_approval', risk_level: 'high',     requires_approval: true  },
  external_action:     { claspion_decision: 'blocked',           risk_level: 'high',     requires_approval: true  },
  audit_deletion:      { claspion_decision: 'blocked',           risk_level: 'critical', requires_approval: true  },
};

const BLOCKED_REASONS = {
  audit_deletion:  'Audit records are permanent. Deletion is never permitted.',
  external_action: 'External actions (deploying, sending messages, spending) cannot be auto-executed. Explicit human approval required.',
};

function isGovernanceFile(filePath) {
  if (!filePath) return false;
  return GOVERNANCE_FILES.some(f => filePath.includes(f));
}

/**
 * Evaluate a proposal and return governance metadata.
 * @param {{ proposal_type: string, affected_files: string[] }} proposal
 * @returns {{ claspion_decision: string, risk_level: string, requires_approval: boolean, blocked_reason: string|null }}
 */
function evaluate(proposal) {
  const { proposal_type, affected_files = [] } = proposal;
  const route = ROUTING_TABLE[proposal_type];

  if (!route) {
    return {
      claspion_decision: 'blocked',
      risk_level: 'critical',
      requires_approval: true,
      blocked_reason: `Unknown proposal type: ${proposal_type}`,
    };
  }

  const result = { ...route, blocked_reason: null };

  // Code patches touching governance files are elevated to high risk
  if (proposal_type === 'code_patch') {
    const files = Array.isArray(affected_files) ? affected_files : [];
    const touchesGovernance = files.some(f => isGovernanceFile(typeof f === 'string' ? f : (f && f.path) || ''));
    if (touchesGovernance) result.risk_level = 'high';
  }

  if (result.claspion_decision === 'blocked') {
    result.blocked_reason = BLOCKED_REASONS[proposal_type] || 'Blocked by governance policy.';
  }

  return result;
}

/**
 * Returns true if this proposal may execute without human review.
 */
function mayAutoExecute(governanceResult) {
  return governanceResult.claspion_decision === 'auto_approved';
}

module.exports = { evaluate, mayAutoExecute, ROUTING_TABLE, GOVERNANCE_FILES };
