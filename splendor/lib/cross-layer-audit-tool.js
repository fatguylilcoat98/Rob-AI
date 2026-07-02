'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Cross-Layer Audit Tool

  Gives Splendor a callable action for running a live Cross-Layer
  Contradiction Audit from within a conversation.

  Defaults to test mode: creates audit records and logs but does NOT
  mutate real memories. The owner can request mode=real explicitly.
*/

const AUDIT_TOOL_NAME = 'run_cross_layer_audit';

const AUDIT_TOOL_DEFINITION = {
  name: AUDIT_TOOL_NAME,
  description:
    'Run a live Cross-Layer Contradiction Audit across your active memory layers ' +
    '(RELATIONSHIP, SELF_MODEL, TRAJECTORY, SEMANTIC). ' +
    'Detects contradictions between higher-authority and lower-authority layers using ' +
    'deterministic word-set overlap and negation matching. ' +
    'Default mode is test: creates a full audit record and logs all events, ' +
    'but does NOT mutate real memories. ' +
    'Call this when the user asks for a live contradiction audit, cross-layer audit, ' +
    'or memory consistency check. ' +
    'Returns: audit_id, status, contradiction_detected, affected_layers, ' +
    'recommended_action, conflict_count, and test_mode confirmation.',
  input_schema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['test', 'real'],
        description:
          'test (default): record audit result only, do NOT mutate memory_items. ' +
          'real: tag conflicting lower-weight memories with REVIEW_REQUIRED. ' +
          'Always use test unless the owner explicitly requests real.',
      },
    },
    required: [],
  },
};

async function executeRunCrossLayerAudit(input, userId) {
  try {
    const { runCrossLayerAudit } = require('./cross-layer-audit');
    const mode = input && input.mode === 'real' ? 'real' : 'test';

    const result = await runCrossLayerAudit({
      mode,
      owner:   process.env.SPLENDOR_OWNER_EMAIL || 'chris',
      ownerId: userId || null,
    });

    if (!result.ok) {
      return JSON.stringify({
        success:    false,
        error:      result.reason || 'audit failed',
        test_mode:  mode === 'test',
      });
    }

    return JSON.stringify({
      success:              true,
      live_audit_available: true,
      audit_id:             result.auditId,
      status:               result.status,
      contradiction_detected: result.contradictionDetected,
      conflict_count:       result.conflictCount,
      affected_layers:      result.affectedLayers,
      highest_weight_layer: result.highestWeightLayer,
      lowest_weight_layer:  result.lowestWeightLayer,
      recommended_action:   result.recommendedAction,
      evidence_summary:     result.evidenceSummary,
      test_mode:            mode === 'test',
      memory_mutation:      mode === 'real' ? result.taggedMemoryIds.length : 0,
    });
  } catch (e) {
    console.error('[cross-layer-audit-tool] executeRunCrossLayerAudit threw:', e.message);
    return JSON.stringify({ success: false, error: e.message, test_mode: true });
  }
}

module.exports = { AUDIT_TOOL_NAME, AUDIT_TOOL_DEFINITION, executeRunCrossLayerAudit };
