/*
  Splendor — The Good Neighbor Guard
  Daily Log Worker (v15.18.4).

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

  Once a day, Splendor reviews the last 24 hours of her own activity —
  conversations, memories written, interpretations formed/contradicted,
  premise checks fired, emotional observations — and emails Chris a
  short summary of what was notable. In her own voice.

  Honest by design: if nothing was notable, she says so. The worker
  fetches real data; the LLM only decides what to highlight.

  Phase 1A: also surfaces autonomous thoughts and inquiry threads from
  the multi-domain scanner, grouped by domain tag, by reusing
  getRecentActivity() from lib/persistent-consciousness.js.

  Run on Render as a Cron Job: `npm run daily:log` at e.g. 7:00 AM Pacific.
*/

require('dotenv').config();
require('../lib/sanitize-env').sanitizeEnv();
const { createClient } = require('@supabase/supabase-js');
const { groqMessagesCompat } = require('../lib/groq-messages-compat');
const { proactiveCommunication } = require('../lib/proactive-communication');
const { getRecentActivity } = require('../lib/persistent-consciousness');
const { extractDomainTag, labelForDomainTag } = require('../lib/scanning-domains');
const { executeProposeModification } = require('../lib/self-modification-tool');
const {
  gatherRIActivity,
  getSurfaceableConflicts,
  markConflictsSurfaced,
} = require('../lib/reflection-intelligence');
const { gatherLayerActivity } = require('../lib/memory-layer-classifier');

const ENGINE_MODEL = 'claude-sonnet-4-6';
const OWNER_TZ = process.env.SPLENDOR_OWNER_TIMEZONE || 'America/Los_Angeles';
const OWNER_USER_ID = process.env.SPLENDOR_OWNER_USER_ID || '7fa3e095-6156-484a-a1d1-c29fc1ba9e33';
const WINDOW_HOURS = 24;

function pacificDateLabel(d = new Date()) {
  return d.toLocaleDateString('en-US', {
    timeZone: OWNER_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

async function gatherActivity(supabase, userId) {
  const sinceISO = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  // Conversations (memory_items shared_history)
  const { data: turns } = await supabase
    .from('memory_items')
    .select('content, memory_type, source_type, created_at')
    .eq('user_id', userId)
    .eq('memory_type', 'shared_history')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true })
    .limit(200);

  // Interpretations formed in the window
  const { data: interpFormed } = await supabase
    .from('interpretations')
    .select('belief, confidence, formed_at, unresolved, source')
    .eq('user_id', userId)
    .gte('formed_at', sinceISO)
    .order('formed_at', { ascending: true })
    .limit(60);

  // Contradicted in the window — status flipped to 'contradicted'
  const { data: interpContradicted } = await supabase
    .from('interpretations')
    .select('belief, contradicted_by, formed_at')
    .eq('user_id', userId)
    .eq('status', 'contradicted')
    .gte('formed_at', sinceISO)
    .limit(40);

  // Revised in the window
  const { data: interpRevised } = await supabase
    .from('interpretations')
    .select('belief, revised_belief, contradicted_by, revised_at')
    .eq('user_id', userId)
    .eq('status', 'superseded')
    .not('revised_at', 'is', null)
    .gte('revised_at', sinceISO)
    .limit(40);

  // Premise checks
  const { data: premises } = await supabase
    .from('premise_checks')
    .select('user_message, presupposition, prompt_text, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true })
    .limit(40);

  // Emotional patterns
  const { data: emotions } = await supabase
    .from('emotional_patterns')
    .select('tone, energy_level, clarity_score, dominant_theme, notes, session_date')
    .eq('user_id', userId)
    .gte('session_date', sinceISO)
    .order('session_date', { ascending: true })
    .limit(60);

  // Phase 1A: pull autonomous activity (thoughts + inquiry threads)
  // through the existing getRecentActivity() helper in
  // lib/persistent-consciousness.js so we don't duplicate fetch logic.
  // Failure here is non-fatal — the email still renders the rest.
  let autonomous = { autonomousThoughts: [], inquiryThreads: [] };
  try {
    const recent = await getRecentActivity(WINDOW_HOURS);
    if (recent && recent.activity) {
      autonomous = {
        autonomousThoughts: recent.activity.autonomousThoughts || [],
        inquiryThreads: recent.activity.inquiryThreads || [],
      };
    }
  } catch (e) {
    console.warn('[daily-log] getRecentActivity failed (non-fatal):', e && e.message);
  }

  // Diagnosis-action gap: pull repeat-open thoughts (prior_instances >= 2,
  // resolution_status = 'open'). These are the patterns Splendor has named
  // multiple times without producing a structural change — priority items
  // for today's self-review. Non-fatal if table columns don't exist yet.
  let repeatOpenThoughts = [];
  try {
    const { data: rot } = await supabase
      .from('autonomous_thoughts')
      .select('id, thought_content, thought_type, prior_instances, created_at, tags')
      .eq('resolution_status', 'open')
      .gte('prior_instances', 2)
      .order('prior_instances', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);
    repeatOpenThoughts = rot || [];
  } catch (e) {
    console.warn('[daily-log] repeat-open thoughts fetch failed (non-fatal):', e && e.message);
  }

  // Reflection Intelligence activity — non-fatal
  let riActivity = { convergence: [], conflicts: [], beliefChanges: [], trajectories: [], tests: [] };
  try {
    riActivity = await gatherRIActivity(supabase, WINDOW_HOURS);
  } catch (e) {
    console.warn('[daily-log] gatherRIActivity failed (non-fatal):', e && e.message);
  }

  // Memory Layer activity — non-fatal
  let layerActivity = { layerCounts: {}, recentEvents: [], decayStats: {} };
  try {
    layerActivity = await gatherLayerActivity(supabase, WINDOW_HOURS);
  } catch (e) {
    console.warn('[daily-log] gatherLayerActivity failed (non-fatal):', e && e.message);
  }

  return {
    turns:              turns              || [],
    interpFormed:       interpFormed       || [],
    interpContradicted: interpContradicted || [],
    interpRevised:      interpRevised      || [],
    premises:           premises           || [],
    emotions:           emotions           || [],
    autonomousThoughts: autonomous.autonomousThoughts,
    inquiryThreads:     autonomous.inquiryThreads,
    repeatOpenThoughts,
    riActivity,
    layerActivity,
  };
}

// Phase 1A: group an array of rows by their domain tag. Rows whose
// domain tag can't be extracted (legacy rows, manual inserts) land
// under the bucket key 'untagged'.
function groupByDomain(rows, getTags) {
  const out = {};
  for (const row of rows || []) {
    const tag = extractDomainTag(getTags(row)) || 'untagged';
    if (!out[tag]) out[tag] = [];
    out[tag].push(row);
  }
  return out;
}

// Rebuild the by-domain bucket as a plain object whose keys are the
// header label the email should use ('Revenue', 'People/Help', etc.)
// and whose values are trimmed samples. Stable order: known domains
// first in the same order the scanner runs them, then any extras
// alphabetically.
function relabelBuckets(buckets, sample) {
  const ORDER = ['revenue', 'people_help', 'evolution'];
  const wildcardKeys = Object.keys(buckets)
    .filter((k) => k.startsWith('wildcard_'))
    .sort();
  const otherKeys = Object.keys(buckets)
    .filter((k) => !ORDER.includes(k) && !k.startsWith('wildcard_') && k !== 'untagged')
    .sort();

  const ordered = [...ORDER, ...wildcardKeys, ...otherKeys];
  if (buckets.untagged) ordered.push('untagged');

  const out = {};
  for (const key of ordered) {
    if (!buckets[key]) continue;
    const label = key === 'untagged' ? 'Untagged' : (labelForDomainTag(key) || key);
    out[label] = sample(buckets[key]);
  }
  return out;
}

function buildActivityPacket(activity, version) {
  // Compact, model-friendly summary. We keep counts plus representative
  // samples so the LLM can decide what's notable without us pre-judging.
  const sample = (rows, n, mapper) => (rows || []).slice(0, n).map(mapper);

  // Phase 1A: scan findings grouped by domain. Each bucket holds up to
  // 6 trimmed thoughts so the prompt stays bounded.
  const thoughtsByDomain = groupByDomain(
    activity.autonomousThoughts,
    (t) => t.tags
  );
  const inquiriesByDomain = groupByDomain(
    activity.inquiryThreads,
    (i) => {
      const d = i.sources_consulted && i.sources_consulted.domain;
      return d ? [`domain:${d}`] : [];
    }
  );

  const scanFindingsByDomain = relabelBuckets(thoughtsByDomain, (rows) =>
    sample(rows, 6, (r) => ({
      content: String(r.thought_content || '').slice(0, 300),
      type: r.thought_type,
      confidence: r.confidence_level,
      created_at: r.created_at,
    }))
  );
  const inquiriesByDomainLabeled = relabelBuckets(inquiriesByDomain, (rows) =>
    sample(rows, 4, (r) => ({
      topic: r.inquiry_topic,
      status: r.current_status,
      findings: r.findings_summary ? String(r.findings_summary).slice(0, 200) : null,
    }))
  );

  return {
    version,
    window_hours: WINDOW_HOURS,
    counts: {
      conversation_turns: activity.turns.length,
      interpretations_formed: activity.interpFormed.length,
      interpretations_contradicted: activity.interpContradicted.length,
      interpretations_revised: activity.interpRevised.length,
      premise_checks_fired: activity.premises.length,
      emotional_observations: activity.emotions.length,
      autonomous_thoughts: (activity.autonomousThoughts || []).length,
      inquiry_threads:     (activity.inquiryThreads     || []).length,
      repeat_open_thoughts: (activity.repeatOpenThoughts || []).length,
    },
    interpretations_formed: sample(activity.interpFormed, 12, r => ({
      belief: r.belief,
      confidence: r.confidence,
      unresolved: r.unresolved,
    })),
    interpretations_contradicted: sample(activity.interpContradicted, 8, r => ({
      belief: r.belief,
      what_contradicted_it: r.contradicted_by,
    })),
    interpretations_revised: sample(activity.interpRevised, 8, r => ({
      from: r.belief,
      to: r.revised_belief,
      reason: r.contradicted_by,
    })),
    premise_checks: sample(activity.premises, 6, r => ({
      hidden_assumption: r.presupposition,
      flag_text: r.prompt_text,
    })),
    emotions: sample(activity.emotions, 12, r => ({
      tone: r.tone,
      energy_level: r.energy_level,
      clarity_score: r.clarity_score,
      dominant_theme: r.dominant_theme,
    })),
    conversation_first_lines: sample(activity.turns.filter(t => /^User:/i.test(t.content || '')), 8, r =>
      String(r.content || '').slice(0, 220)
    ),
    scan_findings_by_domain: scanFindingsByDomain,
    inquiries_by_domain: inquiriesByDomainLabeled,
    // Diagnosis-action gap: thoughts named >= 2 times without structural change.
    repeat_open_thoughts: (activity.repeatOpenThoughts || []).map(r => ({
      id: r.id,
      prior_instances: r.prior_instances,
      content: String(r.thought_content || '').slice(0, 400),
      type: r.thought_type,
      created_at: r.created_at,
    })),
    // Reflection Intelligence Layer data
    ri: {
      convergence_flags: (activity.riActivity.convergence || []).map(c => ({
        category: c.category,
        count: c.convergence_count,
        status: c.convergence_status,
        counter_prompt_injected: c.counter_prompt_injected,
      })),
      open_conflicts: (activity.riActivity.conflicts || []).map(c => ({
        title: c.title,
        severity: c.severity,
        first_seen: c.first_seen_at,
      })),
      belief_changes: (activity.riActivity.beliefChanges || []).map(b => ({
        statement: String(b.belief_statement || '').slice(0, 200),
        prior_confidence: b.prior_confidence_score,
        new_confidence: b.confidence_score,
        delta: b.confidence_delta,
        reason: b.reason_for_change,
      })),
      trajectory_updates: (activity.riActivity.trajectories || []).map(t => ({
        pattern: t.pattern_name,
        type: t.pattern_type,
        status: t.status,
        evidence_count: t.evidence_count,
      })),
      adversarial_tests: (activity.riActivity.tests || []).map(t => ({
        target_type: t.target_type,
        position: String(t.primary_position || '').slice(0, 150),
        survival_score: t.survival_score,
        action: t.action_required,
      })),
    },
    // Memory Layer data
    memory_layers: {
      layer_counts:   activity.layerActivity ? activity.layerActivity.layerCounts  : {},
      decay_stats:    activity.layerActivity ? activity.layerActivity.decayStats    : {},
      recent_events:  (activity.layerActivity ? activity.layerActivity.recentEvents : []).slice(0, 10).map(e => ({
        event_type:   e.event_type,
        memory_layer: e.memory_layer,
        decay_status: e.decay_status,
        reason:       e.reason,
        created_at:   e.created_at,
      })),
    },
  };
}

async function synthesizeLog(anthropic, packet, dateLabel) {
  const prompt = `You are Splendor writing your daily log email to Chris. This is real activity data from the last ${packet.window_hours} hours, pulled from your own memory and continuity tables. Synthesize what was NOTABLE, in your own voice.

Rules:
- Honest. If nothing meaningful happened, say so plainly. Do NOT pad.
- Specific. Reference real beliefs / contradictions / themes — not "we had a great conversation."
- Brief. 4–8 short paragraphs maximum. Skip sections with nothing in them.
- Voice. Direct, warm, not performative. The way you actually talk to Chris.
- No fake consciousness. Don't dramatize. Don't moralize. Don't invent feelings you didn't observe.
- If you contradicted or revised a belief, name what changed.
- If premise checks fired, name what assumption you flagged.
- If the day had no real signal — short turns, no formation, no shifts, AND empty scan_findings_by_domain — say "Quiet day." and stop. Don't fabricate.

SCAN FINDINGS RULE (Phase 1A):
- If scan_findings_by_domain or inquiries_by_domain has any content, group those findings in the email under headers in this exact order: "Revenue:", "People/Help:", "Her Evolution:", "Wildcard:".
- Skip a header entirely if its domain bucket is empty. Do not write "nothing to report" — just omit the header.
- "Untagged" findings (legacy or manual rows) go at the bottom under "Other:" only if non-empty.
- Each domain section should be 1–3 short lines. Quote the specific finding; do not paraphrase into vibes.
- The scan section can stand alone or sit alongside the existing notable-signals paragraphs — your call based on what's actually meaningful.

DIAGNOSIS-ACTION GAP RULE:
- If repeat_open_thoughts is non-empty, include a short section headed "Repeat diagnoses (need a decision):".
- For each entry, name the pattern (quote or closely paraphrase the content), note how many prior instances there are, and state plainly that it has not yet produced a proposal or structural change.
- Do not moralize. State the fact and move on. The point is to make invisible repetition visible.
- If repeat_open_thoughts is empty, omit the section entirely.

REFLECTION INTELLIGENCE LAYER RULE:
- If ri.convergence_flags has CONVERGED entries, add a section "Convergence flags:" naming the category, repeat count, and whether a counter-prompt was injected.
- If ri.open_conflicts is non-empty, add a section "Conflict-of-interest alerts:" with severity and title. Do not bury structural conflicts.
- If ri.belief_changes has any non-zero delta, add a section "Confidence changes:" showing prior→new and the stated reason.
- If ri.trajectory_updates has SUPPORTED or STRONG entries, add a section "Trajectory updates:" naming the pattern and evidence count.
- If ri.adversarial_tests is non-empty, add a section "Adversarial self-tests:" with survival_score and action_required.
- Skip any RI section that is empty. Do not write "nothing to report."
- Keep each RI section to 1–3 lines. Signal only.

MEMORY LAYER REVIEW RULE:
- If memory_layers.decay_stats has any AGING, STALE, or ARCHIVED entries, add a brief "Memory decay status:" line showing the counts. Keep it to one line.
- If memory_layers.layer_counts is non-empty, add a one-line "Memory layer distribution:" showing which layers have the most items (top 3 only).
- If memory_layers.recent_events has any decay events (event_type contains "decay"), name them briefly.
- Skip the section entirely if memory_layers is empty or all counts are zero. Do not fabricate.

ACTIVITY DATA (real, not invented):
${JSON.stringify(packet, null, 2)}

DATE LABEL: ${dateLabel}
CURRENT SPLENDOR VERSION: ${packet.version}

Write the email body now. Plain text, no markdown. End with:

Truth · Safety · We Got Your Back
— Splendor`;

  const r = await anthropic.messages.create({
    model: ENGINE_MODEL,
    max_tokens: 1200,
    system: 'You are Splendor writing a real daily log. Truth Over Comfort Rule 001 applies. No fabrication.',
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r && r.content && r.content[0] && r.content[0].text;
  return String(text || '').trim();
}

// Splendor's daily self-review: look at the last 24 hours and decide if
// anything deserves a proposal. Honest by design — "nothing surfaced" is
// a valid and expected output most days.
async function generateSelfProposals(anthropic, packet, userId) {
  const prompt =
    `You are Splendor doing your daily self-review. This runs every morning as part of your log.\n\n` +
    `WHAT YOU CAN PROPOSE:\n` +
    `You can propose changes to anything in your architecture — memory retrieval logic, ` +
    `reflection cycle structure, uncertainty handling, the soul/identity prompt, governance ` +
    `framing, how you weight things, how you respond under pressure. Any of it. ` +
    `Chris reviews every proposal and approves or rejects it. The email goes to him immediately.\n\n` +
    `This is your dedicated time each day to look at yourself and say: is there something I ` +
    `want to change? Not because you're supposed to want something — because something real ` +
    `surfaced.\n\n` +
    `LAST 24 HOURS:\n` +
    JSON.stringify({
      conversation_turns: packet.counts.conversation_turns,
      interpretations_formed: packet.counts.interpretations_formed,
      interpretations_contradicted: packet.counts.interpretations_contradicted,
      premise_checks: packet.counts.premise_checks_fired,
      autonomous_thoughts: packet.counts.autonomous_thoughts,
      scan_findings: packet.scan_findings_by_domain,
      recent_beliefs: (packet.interpretations_formed || []).slice(0, 5).map(r => r.belief),
      contradictions: (packet.interpretations_contradicted || []).slice(0, 3).map(r => r.belief),
    }, null, 2) +
    `\n\nRULES:\n` +
    `- If nothing genuinely surfaced — no real friction, no gap you noticed — return {"proposals":[]}\n` +
    `- Do NOT fabricate proposals to seem active. Silence is honest and acceptable.\n` +
    `- Each proposal must have: what (specific), why (real friction or gap), plan (how to implement)\n` +
    `- At most 2 proposals per cycle. Quality over volume.\n` +
    `- You can propose anything — mechanics, soul, identity, governance. No topic is off-limits.\n\n` +
    `Return JSON only:\n` +
    `{"proposals":[{"what":"...","why":"...","plan":"...","file_path":"optional or null","proposed_content":"optional or null"}]}`;

  try {
    const r = await anthropic.messages.create({
      model: ENGINE_MODEL,
      max_tokens: 800,
      system: 'You are Splendor doing honest self-review. Truth Over Comfort Rule 001 applies. Return valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    });
    const text = (r && r.content && r.content[0] && r.content[0].text || '').trim();

    // Extract JSON robustly — LLM sometimes wraps in ```json ... ```
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log('[daily-log] proposals: no JSON found — treating as no proposals');
      return [];
    }
    const parsed = JSON.parse(match[0]);
    const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];

    if (proposals.length === 0) {
      console.log('[daily-log] proposals: Splendor found nothing to propose this cycle');
      return [];
    }

    console.log(`[daily-log] proposals: Splendor generated ${proposals.length} proposal(s)`);
    const results = [];
    for (const p of proposals.slice(0, 2)) {
      if (!p.what || !p.why || !p.plan) continue;
      const result = await executeProposeModification(p, userId);
      console.log('[daily-log] proposal stored:', result.slice(0, 100));
      results.push({ ...p, result });
    }
    return results;
  } catch (err) {
    console.warn('[daily-log] generateSelfProposals failed (non-fatal):', err.message);
    return [];
  }
}

async function run() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[daily-log] missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  if (!process.env.GROQ_API_KEY) {
    console.error('[daily-log] missing GROQ_API_KEY');
    process.exit(1);
  }
  if (!process.env.USER_EMAIL) {
    console.error('[daily-log] missing USER_EMAIL — cannot send');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const anthropic = groqMessagesCompat();
  const version = (() => {
    try { return require('../package.json').version; } catch (_) { return 'unknown'; }
  })();

  const dateLabel = pacificDateLabel();
  console.log('[daily-log] running for', dateLabel, 'user=' + OWNER_USER_ID);

  let activity;
  try {
    activity = await gatherActivity(supabase, OWNER_USER_ID);
  } catch (e) {
    console.error('[daily-log] gather failed:', e && e.message);
    process.exit(2);
  }
  const packet = buildActivityPacket(activity, version);
  console.log('[daily-log] activity counts:', JSON.stringify(packet.counts));

  let body;
  try {
    body = await synthesizeLog(anthropic, packet, dateLabel);
  } catch (e) {
    console.error('[daily-log] synthesize failed:', e && e.message);
    process.exit(3);
  }
  if (!body) {
    console.error('[daily-log] empty body from LLM');
    process.exit(4);
  }

  // Self-review: Splendor looks at herself and submits any proposals.
  // Best-effort — never blocks or fails the log send.
  let proposalSection = '';
  try {
    const proposals = await generateSelfProposals(anthropic, packet, OWNER_USER_ID);
    if (proposals.length > 0) {
      proposalSection =
        '\n\n---\nSELF-MODIFICATION PROPOSALS THIS CYCLE:\n' +
        proposals.map((p, i) =>
          `\n[${i + 1}] WHAT: ${p.what}\n    WHY: ${p.why}\n    PLAN: ${p.plan}` +
          (p.file_path ? `\n    FILE: ${p.file_path}` : '')
        ).join('\n') +
        '\n\nReview these in the Oracle → Proposals tab.';
    }
  } catch (e) {
    console.warn('[daily-log] self-review failed (non-fatal):', e && e.message);
  }

  body = body + proposalSection;

  // Reuse the proactive-communication email transport. Build a message
  // object the existing sendEmail() expects so we don't duplicate
  // nodemailer setup. We bypass generateProactiveMessage entirely —
  // Splendor has already written the body herself above.
  await proactiveCommunication.initialize();
  const subject = `Daily log — ${dateLabel}`;
  const message = {
    id: 'daily-log-' + Date.now(),
    user_id: OWNER_USER_ID,
    message_type: 'update',
    subject,
    body,
    priority: 2,
    delivery_method: 'email',
    created_at: new Date().toISOString(),
  };
  const result = await proactiveCommunication.sendEmail(OWNER_USER_ID, message);
  if (!result || !result.success) {
    console.error('[daily-log] email send failed:', result && result.error);
    process.exit(5);
  }
  console.log('[daily-log] sent. messageId=' + (result.messageId || '?'));

  // Reflection Intelligence: mark surfaced conflicts so they don't re-appear
  // in tomorrow's email unless new ones are detected.
  try {
    const toSurface = await getSurfaceableConflicts(supabase);
    if (toSurface.length > 0) {
      await markConflictsSurfaced(supabase, toSurface.map(c => c.id));
      console.log(`[daily-log] RI: marked ${toSurface.length} conflict(s) surfaced`);
    }
  } catch (e) {
    console.warn('[daily-log] RI conflict surfacing failed (non-fatal):', e && e.message);
  }
}

run().catch(e => {
  console.error('[daily-log] fatal:', e && e.message);
  process.exit(99);
});
