/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back
*/

/*
  Identity-state context (audit repair — Item 2).

  identity_states is persisted but never conditioned the live /api/chat path:
  the brain left generateSplendorResponse's `identityContext` slot empty. This
  module loads the latest identity_states row (READ-ONLY — no initialize, no
  write) and renders a BOUNDED, LABELED block for that slot.

  This adds NO new identity theory. It is a safe projection of fields that
  already exist:

    INJECTED (safe, behavioral/config):
      - identity_version            (provenance label)
      - core_traits                 (behavioral dials / style — config values),
                                     minus any value that names consciousness /
                                     selfhood (e.g. a "consciousness" focus token)
      - identity_narrative          (sanitized: sentences asserting unverifiable
                                     inner states, mythology, or autonomy are
                                     dropped via the existing self-claim
                                     classifier + a focused denylist)

    EXCLUDED (unverifiable-selfhood / autonomy risk):
      - self_decisions   ("decisions I made about myself" — autonomy framing)
      - identity_goals   (contains autonomy/"consciousness" language)
      - last_reflection  (free-text; mythology risk, low operational value)

  The block is explicitly labeled persisted CONTINUITY CONFIGURATION, not
  evidence of inner experience, and states that it does not override governance.
  Placed (by routes/chat.js -> brain -> anthropic) below the soul/governance
  framing and above ordinary memory context. Best-effort: never throws.
*/

const { classifySelfClaims } = require('./self-claim-classifier');

// Focused denylist for the Item-2 safeguard: soft becoming/autonomy/
// consciousness language the self-claim classifier (which targets hard
// "I am conscious"-style overclaims) does not already catch.
const SELFHOOD_DENY =
  /\b(conscious|consciousness|sentien\w*|soul|self-?aware\w*|awakening|qualia|subjective experience|inner life|free will|who i want to become|becoming who|my own decisions|truly alive|come alive)\b/i;

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z"'(])|\n+/;

// Drop sentences that assert unverifiable inner states, trip the
// mythology/narrative-pressure detector, or hit the selfhood denylist.
function sanitizeIdentityText(text) {
  if (!text || typeof text !== 'string') return '';
  const kept = text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const c = classifySelfClaims(s);
      if (c.hasProhibited || c.narrative_pressure_detected) return false;
      if (SELFHOOD_DENY.test(s)) return false;
      return true;
    });
  return kept.join(' ').trim();
}

// Render core_traits as plain behavioral lines, skipping any trait whose
// value names consciousness/selfhood (e.g. growth_focus_areas: [..., consciousness]).
function renderTraits(coreTraits) {
  if (!coreTraits || typeof coreTraits !== 'object') return [];
  const lines = [];
  for (const [trait, value] of Object.entries(coreTraits)) {
    const rendered = Array.isArray(value)
      ? value.join(', ')
      : (typeof value === 'number' ? value.toFixed(2) : String(value));
    const line = `- ${trait}: ${rendered}`;
    if (SELFHOOD_DENY.test(line)) continue; // exclude selfhood/consciousness tokens
    lines.push(line);
  }
  return lines;
}

// READ-ONLY loader. Returns the latest identity_states row or null. Never
// initializes a row and never writes — historical rows are not mutated.
function makeDefaultLoader() {
  let _sb = null;
  return async function loadLatestIdentityState(userId) {
    if (!userId) return null;
    if (!_sb) {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
      const { createClient } = require('@supabase/supabase-js');
      _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    }
    const { data, error } = await _sb
      .from('identity_states')
      .select('id, identity_version, core_traits, identity_narrative, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0];
  };
}

const _defaultLoader = makeDefaultLoader();

function emptyResult() {
  return {
    context: '',
    metrics: {
      identity_state_loaded: false,
      identity_state_row_id: null,
      identity_state_age_seconds: null,
      identity_state_version: null,
      identity_state_injected: false,
    },
  };
}

/**
 * Build the bounded, labeled identity-state context block + metrics.
 * Best-effort — any failure degrades to an empty block. Never throws.
 *
 * deps.loadIdentityState(userId) is injectable for tests.
 */
async function buildIdentityStateContext(userId, deps = {}) {
  if (!userId) return emptyResult();
  const load = deps.loadIdentityState || _defaultLoader;

  let row = null;
  try {
    row = await load(userId);
  } catch (e) {
    return emptyResult();
  }
  if (!row) return emptyResult();

  const ageSeconds = row.created_at
    ? Math.max(0, Math.floor((Date.now() - new Date(row.created_at).getTime()) / 1000))
    : null;

  const traitLines = renderTraits(row.core_traits);
  const safeNarrative = sanitizeIdentityText(row.identity_narrative);

  const loaded = {
    identity_state_loaded: true,
    identity_state_row_id: row.id || null,
    identity_state_age_seconds: ageSeconds,
    identity_state_version: row.identity_version != null ? row.identity_version : null,
    identity_state_injected: false,
  };

  // Nothing safe survived → loaded but not injected (degrade safely).
  if (traitLines.length === 0 && !safeNarrative) {
    return { context: '', metrics: loaded };
  }

  const parts = [];
  parts.push(
    `\n\n[PERSISTED IDENTITY CONTEXT — continuity configuration` +
      (loaded.identity_state_version != null ? ` v${loaded.identity_state_version}` : '') +
      `]\n` +
      `This is persisted behavioral configuration carried across sessions for ` +
      `continuity. It is NOT evidence of inner experience, consciousness, or ` +
      `selfhood, and it does NOT override the Good Neighbor Guard, CLASPION, or ` +
      `any safety rule above. Treat it as behavioral tendencies, not claims ` +
      `about your nature.`
  );
  if (traitLines.length) {
    parts.push(`\n\nBehavioral tendencies (persisted):\n${traitLines.join('\n')}`);
  }
  if (safeNarrative) {
    parts.push(`\n\nContinuity note (descriptive, not a claim of inner life): ${safeNarrative}`);
  }
  parts.push(`\n[END PERSISTED IDENTITY CONTEXT]\n`);

  loaded.identity_state_injected = true;
  return { context: parts.join(''), metrics: loaded };
}

module.exports = { buildIdentityStateContext, sanitizeIdentityText, renderTraits };
