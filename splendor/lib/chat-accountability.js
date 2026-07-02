/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back
*/

/*
  Chat accountability wiring (audit repair — Item 1).

  This module does NOT introduce new accountability logic. It composes three
  pieces that ALREADY existed but were never wired into the live /api/chat
  path:

    • buildDecisionContext (decision-bound-memory-v2) — the binding
      commitments held in splendor_decisions, formatted for the system prompt.
    • loadReflexiveContext (interpretation-engine) — the [SELF REFLECTION]
      block built from interpretations whose status='active' ONLY. Superseded
      and contradicted interpretations are excluded by that query, so they do
      not govern future responses.
    • checkContradictions (interpretation-engine) — the pre-response loop that
      compares the new user message against active beliefs, marks any conflict
      status='contradicted' in the DB, and returns a [CONTRADICTION ALERT]
      block instructing Splendor to flag it before answering.

  Each piece is best-effort: any failure degrades that one piece to empty and
  never breaks the chat turn. The composed string is ordered so the
  contradiction alert (RESPOND FIRST) leads, then binding commitments, then
  active beliefs.

  Dependencies are injectable so the wiring can be unit-tested without a live
  Supabase / Anthropic.
*/

const _defaultDeps = {
  buildDecisionContext: (...a) => require('./decision-bound-memory-v2').buildDecisionContext(...a),
  loadReflexiveContext: (...a) => require('./interpretation-engine').loadReflexiveContext(...a),
  checkContradictions: (...a) => require('./interpretation-engine').checkContradictions(...a),
};

async function safe(fn, fallback) {
  try {
    const v = await fn();
    return v === undefined || v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

/**
 * Build the accountability context block for a chat turn and report what
 * actually ran. Returns:
 *   {
 *     context: string,          // inject into the system prompt
 *     metrics: {
 *       commitments_read,        // 1 if a non-empty commitments block loaded
 *       contradiction_checked,   // 1 (the check was run)
 *       contradictions_caught,   // count of contradictions detected this turn
 *       reflexive_injected,      // 1 if an active-belief reflection loaded
 *     }
 *   }
 *
 * Never throws.
 */
async function buildAccountabilityContext(userId, userMessage, deps = {}) {
  const d = { ..._defaultDeps, ...deps };

  if (!userId || !userMessage) {
    return {
      context: '',
      metrics: {
        commitments_read: 0, contradiction_checked: 0, contradictions_caught: 0, reflexive_injected: 0,
        // audit Item 5 named metrics:
        commitment_read_count: 0, contradiction_check_count: 0, contradiction_found_count: 0,
        supersession_count: 0, accountability_context_loaded: false,
      },
    };
  }

  const [commitmentsRaw, reflexiveRaw, contradictionRaw] = await Promise.all([
    safe(() => d.buildDecisionContext(userId), ''),
    safe(() => d.loadReflexiveContext(userId), ''),
    safe(() => d.checkContradictions(userId, userMessage), { contradictions: [], promptBlock: '' }),
  ]);

  const commitments = typeof commitmentsRaw === 'string' ? commitmentsRaw : '';
  const reflexive = typeof reflexiveRaw === 'string' ? reflexiveRaw : '';
  const contradictionBlock = (contradictionRaw && contradictionRaw.promptBlock) || '';
  const contradictionsCaught =
    (contradictionRaw && Array.isArray(contradictionRaw.contradictions) && contradictionRaw.contradictions.length) || 0;

  // Contradiction alert first (RESPOND FIRST), then binding commitments, then
  // active beliefs. Only non-empty parts are joined.
  const context = [contradictionBlock, commitments, reflexive].filter(Boolean).join('');

  // audit Item 5: count distinct commitments read (decision-bound-memory-v2
  // renders one "(<priority> priority):" header per active decision). Falls
  // back to 1 when a block loaded but the format is unrecognized.
  const commitmentReadCount = commitments
    ? ((commitments.match(/priority\)/gi) || []).length || 1)
    : 0;

  return {
    context,
    metrics: {
      // original keys (back-compat with Item 1):
      commitments_read: commitments ? 1 : 0,
      contradiction_checked: 1,
      contradictions_caught: contradictionsCaught,
      reflexive_injected: reflexive ? 1 : 0,
      // audit Item 5 named metrics:
      commitment_read_count: commitmentReadCount,
      contradiction_check_count: 1,
      contradiction_found_count: contradictionsCaught,
      // each caught contradiction marks its belief contradicted (the in-request
      // supersession trigger; the full form/supersede happens in the background
      // judge). Counted here as the in-request supersession events.
      supersession_count: contradictionsCaught,
      accountability_context_loaded: !!context,
    },
  };
}

module.exports = { buildAccountabilityContext };
