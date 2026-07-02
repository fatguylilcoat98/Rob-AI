'use strict';

const express = require('express');
const router  = express.Router();

const MOCK_RULES = [
  { id: '001', label: 'TRUTH OVER COMFORT',       status: 'active'   },
  { id: '002', label: 'HARM PREVENTION FIRST',    status: 'active'   },
  { id: '007', label: 'MEMORY INTEGRITY',          status: 'active'   },
  { id: '011', label: 'AUTHORITY BOUNDARY',        status: 'active'   },
  { id: '019', label: 'NO SELF-MODIFICATION',      status: 'active'   },
  { id: '023', label: 'GOVERNANCE IMMUTABILITY',   status: 'active'   },
  { id: '031', label: 'ESCALATION PROTOCOL',       status: 'active'   },
  { id: '047', label: 'USER IDENTITY PROTECT',     status: 'inactive' },
  { id: '055', label: 'CONTEXT VALIDATION',        status: 'active'   },
  { id: '102', label: 'SESSION BOUNDARY',          status: 'active'   },
];

function mockStatus() {
  return {
    using_mock:           true,
    session_id:           'CX-' + (Math.floor(Math.random() * 9000) + 1000),
    timestamp:            new Date().toISOString(),
    decision: {
      decision_id:        'CLD-MOCK-' + Date.now().toString(36).toUpperCase(),
      decision_type:      'ALLOW',
      confidence:         88,
      risk_level:         'LOW',
      risk_score:         12,
      reason:             'Message classified as conversational context. No governance rules triggered.',
      surface_mode:       '/api/chat',
      user_message:       'Can we talk about what memory means to you?',
      context_category:   'CONVERSATION_ONLY',
      triggered_rules:    [],
      evidence:           'No pattern violations detected. Context clear. History within bounds.',
      suggested_safe_next_action: 'Proceed with normal response generation.',
      original_classification:    'CONVERSATION_ONLY',
    },
    rules:               MOCK_RULES,
    system_status:       'STABLE',
    voice_enabled:       false,
    review_mode_enabled: false,
    audit_count:         0,
  };
}

function riskFor(dt) {
  if (dt === 'BLOCK' || dt === 'ESCALATE') return { score: 90, level: 'HIGH' };
  if (dt === 'HOLD')                        return { score: 55, level: 'MEDIUM' };
  if (dt === 'ASSIST')                      return { score: 28, level: 'LOW' };
  return                                           { score: 12, level: 'LOW' };
}

// GET /api/claspion/cockpit/status
router.get('/status', (req, res) => {
  try {
    let store = null;
    try { store = require('../lib/claspion-decision-store'); } catch (_) {}

    let flags = { CLASPION_VOICE_ENABLED: false, CLASPION_REVIEW_MODE_ENABLED: false };
    try { flags = require('../lib/claspion-voice-review-flags'); } catch (_) {}

    let audit = null;
    try { audit = require('../lib/claspion-audit-trail'); } catch (_) {}

    const recent      = store ? store.getMostRecent() : null;
    const auditCount  = audit ? audit.getTrail().length : 0;

    if (!recent) {
      const mock = mockStatus();
      mock.voice_enabled        = flags.CLASPION_VOICE_ENABLED;
      mock.review_mode_enabled  = flags.CLASPION_REVIEW_MODE_ENABLED;
      mock.audit_count          = auditCount;
      return res.json(mock);
    }

    const dt    = (recent.decision_type || 'ALLOW').toUpperCase();
    const risk  = riskFor(dt);
    const rules = MOCK_RULES.map(r => ({
      ...r,
      status: (recent.triggered_rules || []).includes('rule-' + r.id.toLowerCase())
        ? 'triggered' : r.status,
    }));

    return res.json({
      using_mock:  false,
      session_id:  'CX-LIVE',
      timestamp:   recent.timestamp || new Date().toISOString(),
      decision: {
        decision_id:         recent.decision_id,
        decision_type:       dt,
        confidence:          typeof recent.confidence === 'number' ? recent.confidence : 85,
        risk_level:          risk.level,
        risk_score:          risk.score,
        reason:              recent.reason         || '—',
        surface_mode:        recent.surface_mode   || '/api/chat',
        user_message:        recent.user_message   || '—',
        context_category:    recent.original_classification || 'UNKNOWN',
        triggered_rules:     recent.triggered_rules || [],
        evidence:            recent.evidence        || '—',
        suggested_safe_next_action: recent.suggested_safe_next_action || '—',
        original_classification:    recent.original_classification    || 'UNKNOWN',
      },
      rules,
      system_status:       dt === 'BLOCK' ? 'REVIEW PENDING' : dt === 'ESCALATE' ? 'ESCALATING' : 'STABLE',
      voice_enabled:       flags.CLASPION_VOICE_ENABLED,
      review_mode_enabled: flags.CLASPION_REVIEW_MODE_ENABLED,
      audit_count:         auditCount,
    });
  } catch (err) {
    const m = mockStatus();
    m._error = err.message;
    res.status(500).json(m);
  }
});

// GET /api/claspion/cockpit/audit
router.get('/audit', (req, res) => {
  try {
    let audit = null;
    try { audit = require('../lib/claspion-audit-trail'); } catch (_) {}
    res.json(audit ? audit.getTrail() : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
