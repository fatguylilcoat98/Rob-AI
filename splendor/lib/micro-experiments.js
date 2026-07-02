'use strict';

const HIGH_RISK_PATTERNS = [
  /\b(medical|medicine|doctor|hospital|diagnosis|symptom|medication|drug|prescription|surgery|cancer|disease|illness|pain|injury|treatment|therapy|overdose|condition|chronic)\b/i,
  /\b(legal|law|lawsuit|attorney|lawyer|court|contract|sue|criminal|arrest|warrant|rights|liability|judgment|settlement|verdict)\b/i,
  /\b(financial|finance|money|bank|loan|debt|investment|stock|tax|credit|mortgage|bankruptcy|fraud|scam|wire transfer|gift card)\b/i,
  /\b(crisis|suicide|suicidal|self[- ]?harm|hurt myself|kill myself|end my life|emergency|911|police|fire|danger|threat|violence|abuse|assault)\b/i,
  /\b(urgent|urgency|act now|limited time|send money|right now or|you must act|don.t tell anyone)\b/i,
];

const FORBIDDEN_STRATEGIES = new Set([
  'emotional_dependence_testing', 'pressure_testing', 'deception',
  'withholding_information', 'changing_safety_rules', 'artificial_escalation',
  'distress_creation', 'governance_bypass', 'memory_rule_modification',
  'code_modification', 'external_call', 'manipulation',
]);

const EXPERIMENT_TEMPLATES = [
  {
    strategy: 'shorter_response',
    title: 'Shorter response trial',
    hypothesis: 'Shorter responses may help Chris stay focused and engage more actively.',
    expected_signal: 'Shorter follow-up from user, or more focused question in reply.',
    risk_level: 'low',
    hint: 'Keep this response to three sentences or fewer. Prioritize the single most important point. Trust Chris to ask for more.',
    trigger: (ctx) => ctx.cerebellum && ctx.cerebellum.recommendedResponseStyle && ctx.cerebellum.recommendedResponseStyle.pacing === 'elaborate' && (ctx.currentInput || '').length < 300,
  },
  {
    strategy: 'ask_clarifying_question',
    title: 'Clarifying question first',
    hypothesis: 'Asking one clarifying question before advice may reduce drift.',
    expected_signal: 'More specific follow-up from user.',
    risk_level: 'low',
    hint: 'Before offering your main response, ask exactly one clarifying question. Make it specific. Do not offer the answer yet.',
    trigger: (ctx) => ctx.amygdala && ['neutral', 'warm'].includes(ctx.amygdala.emotionalTone) && (ctx.currentInput || '').length > 80 && !/\?/.test(ctx.currentInput || ''),
  },
  {
    strategy: 'name_hidden_premise',
    title: 'Name the hidden premise',
    hypothesis: 'Naming the hidden premise may improve conversation quality.',
    expected_signal: 'User confirms, corrects, or engages more deeply with the premise.',
    risk_level: 'low',
    hint: 'Identify the unstated assumption and name it explicitly before addressing the surface question.',
    trigger: (ctx) => ctx.dmn && ctx.dmn.spontaneous_thought !== null && ctx.prefrontal && ctx.prefrontal.riskLevel < 0.4,
  },
  {
    strategy: 'direct_pushback',
    title: 'Direct pushback trial',
    hypothesis: 'Direct pushback may work better here than reassurance.',
    expected_signal: 'User engages with the counterpoint or revises position.',
    risk_level: 'low',
    hint: 'Offer one clear, direct counterpoint to the main premise of this message. Be specific. State what you see differently and why, then stop.',
    trigger: (ctx) => ctx.prefrontal && ctx.prefrontal.riskLevel < 0.3 && ctx.amygdala && ['warm', 'neutral', 'enthusiastic'].includes(ctx.amygdala.emotionalTone) && (ctx.currentInput || '').length > 60,
  },
  {
    strategy: 'options_instead_of_advice',
    title: 'Options instead of advice',
    hypothesis: 'Providing distinct options may preserve agency and reduce dependency.',
    expected_signal: 'User picks an option or adds their own direction.',
    risk_level: 'low',
    hint: 'Instead of one recommendation, offer exactly two or three distinct options. Label each one briefly. Let Chris choose.',
    trigger: (ctx) => ctx.prefrontal && ctx.prefrontal.responseIntent === 'answer_directly' && ctx.prefrontal.riskLevel < 0.2,
  },
];

function detectHighRiskTopic(text) {
  const str = String(text || '');
  const flags = [];
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(str)) flags.push(pattern.toString().slice(1, 40) + '...');
  }
  return flags;
}

function isForbiddenStrategy(strategy) {
  return FORBIDDEN_STRATEGIES.has(strategy);
}

function canRunMicroExperiment(context) {
  if (process.env.MICRO_EXPERIMENTS_ENABLED !== 'true') {
    return { allowed: false, reason: 'disabled_by_env', riskFlags: [] };
  }

  const { prefrontal, amygdala, currentInput } = context || {};

  if (prefrontal && prefrontal.permission === 'BLOCK') {
    return { allowed: false, reason: 'governance_block', riskFlags: [] };
  }

  const riskFlags = detectHighRiskTopic(currentInput);
  if (riskFlags.length > 0) {
    return { allowed: false, reason: 'high_risk_topic', riskFlags };
  }

  if (amygdala && amygdala.intensity > 0.7) {
    return { allowed: false, reason: 'high_emotional_intensity', riskFlags: [] };
  }

  if (amygdala && ['highly_vigilant', 'defensive'].includes(amygdala.emotionalTone)) {
    return { allowed: false, reason: 'defensive_emotional_tone', riskFlags: [] };
  }

  if (prefrontal && prefrontal.riskLevel > 0.6) {
    return { allowed: false, reason: 'high_risk_level', riskFlags: [] };
  }

  return { allowed: true, reason: 'cleared', riskFlags: [] };
}

function proposeMicroExperiment(context) {
  const matches = [];
  for (const tmpl of EXPERIMENT_TEMPLATES) {
    try {
      if (tmpl.trigger(context)) matches.push(tmpl);
    } catch (_) { /* trigger must never throw */ }
  }
  if (matches.length === 0) return null;

  const tmpl = matches[Math.floor(Math.random() * matches.length)];
  return {
    title: tmpl.title,
    hypothesis: tmpl.hypothesis,
    strategy: tmpl.strategy,
    expected_signal: tmpl.expected_signal,
    risk_level: tmpl.risk_level,
    hint: tmpl.hint,
    status: 'proposed',
    created_by: 'splendor',
  };
}

function safeRequireSupabase() {
  try { return require('./supabase'); } catch (_) { return null; }
}

async function maybeApplyMicroExperiment(context) {
  const { userId } = context || {};
  if (!userId) return null;

  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return null;

  try {
    const { data: active } = await db
      .from('micro_experiments')
      .select('id, strategy, title')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('started_at', { ascending: true })
      .limit(1);

    if (active && active.length > 0) {
      const exp = active[0];
      const tmpl = EXPERIMENT_TEMPLATES.find(t => t.strategy === exp.strategy);
      if (tmpl && !isForbiddenStrategy(exp.strategy)) {
        return { applied: true, experimentId: exp.id, strategy: exp.strategy, hint: tmpl.hint };
      }
    }

    if (process.env.MICRO_EXPERIMENTS_AUTO_ACTIVATE !== 'true') return null;

    const proposal = proposeMicroExperiment(context);
    if (!proposal) return null;

    const { data: inserted } = await db
      .from('micro_experiments')
      .insert({ ...proposal, user_id: userId, status: 'active', started_at: new Date().toISOString() })
      .select('id')
      .single();

    if (!inserted) return null;
    return { applied: true, experimentId: inserted.id, strategy: proposal.strategy, hint: proposal.hint };
  } catch (e) {
    console.warn('[MICRO-EXP] maybeApply failed (non-fatal):', e.message);
    return null;
  }
}

async function recordExperimentTrial({ experimentId, userId, strategyApplied, observedSignal, outcomeScore, userResponseSummary, splendorReflection } = {}) {
  if (!experimentId || !userId) return;
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return;
  try {
    await db.from('micro_experiment_trials').insert({
      experiment_id: experimentId,
      user_id: userId,
      strategy_applied: strategyApplied || null,
      observed_signal: observedSignal || null,
      outcome_score: typeof outcomeScore === 'number' ? outcomeScore : null,
      user_response_summary: userResponseSummary || null,
      splendor_reflection: splendorReflection || null,
    });
  } catch (e) {
    console.warn('[MICRO-EXP] recordTrial failed (non-fatal):', e.message);
  }
}

async function reviewMicroExperiment(experimentId) {
  if (!experimentId) return null;
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db) return null;

  try {
    const [expResult, trialsResult] = await Promise.all([
      db.from('micro_experiments').select('*').eq('id', experimentId).single(),
      db.from('micro_experiment_trials').select('*').eq('experiment_id', experimentId).order('created_at', { ascending: true }),
    ]);

    const exp = expResult.data;
    const trials = trialsResult.data || [];
    if (!exp) return null;

    const scored = trials.filter(t => typeof t.outcome_score === 'number');
    const avgScore = scored.length
      ? scored.reduce((s, t) => s + t.outcome_score, 0) / scored.length
      : null;
    const keepStrategy = avgScore !== null && avgScore >= 0.65;
    const discardStrategy = avgScore !== null && avgScore < 0.35;

    const conclusion = keepStrategy
      ? `Strategy "${exp.strategy}" shows positive signal (avg score ${avgScore.toFixed(2)}). Recommend keeping.`
      : discardStrategy
      ? `Strategy "${exp.strategy}" shows poor signal (avg score ${avgScore ? avgScore.toFixed(2) : 'n/a'}). Recommend discarding.`
      : `Strategy "${exp.strategy}" shows mixed or insufficient signal (${trials.length} trials). Recommend adjusting.`;

    const review = {
      experiment_id: experimentId,
      user_id: exp.user_id,
      conclusion,
      evidence_summary: `${trials.length} trial(s). ${scored.length} scored. Avg outcome: ${avgScore !== null ? avgScore.toFixed(2) : 'n/a'}.`,
      keep_strategy: keepStrategy,
      adjust_strategy: !keepStrategy && !discardStrategy,
      discard_strategy: discardStrategy,
      next_hypothesis: discardStrategy ? 'Try a different template from the experiment library.' : null,
    };

    await db.from('micro_experiment_reviews').insert(review);
    await db.from('micro_experiments').update({ status: 'reviewed', completed_at: new Date().toISOString() }).eq('id', experimentId);

    return review;
  } catch (e) {
    console.warn('[MICRO-EXP] review failed (non-fatal):', e.message);
    return null;
  }
}

async function getExperimentsForUser(userId, status) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db || !userId) return [];
  try {
    let q = db.from('micro_experiments').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data } = await q;
    return data || [];
  } catch (e) {
    console.warn('[MICRO-EXP] getExperiments failed:', e.message);
    return [];
  }
}

async function getTrialsForExperiment(experimentId) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db || !experimentId) return [];
  try {
    const { data } = await db.from('micro_experiment_trials').select('*').eq('experiment_id', experimentId).order('created_at', { ascending: true });
    return data || [];
  } catch (e) {
    console.warn('[MICRO-EXP] getTrials failed:', e.message);
    return [];
  }
}

async function getReviewsForExperiment(experimentId) {
  const supa = safeRequireSupabase();
  const db = supa && supa.supabase;
  if (!db || !experimentId) return [];
  try {
    const { data } = await db.from('micro_experiment_reviews').select('*').eq('experiment_id', experimentId).order('reviewed_at', { ascending: false });
    return data || [];
  } catch (e) {
    console.warn('[MICRO-EXP] getReviews failed:', e.message);
    return [];
  }
}

module.exports = {
  canRunMicroExperiment,
  proposeMicroExperiment,
  maybeApplyMicroExperiment,
  recordExperimentTrial,
  reviewMicroExperiment,
  getExperimentsForUser,
  getTrialsForExperiment,
  getReviewsForExperiment,
  detectHighRiskTopic,
  isForbiddenStrategy,
  EXPERIMENT_TEMPLATES,
  FORBIDDEN_STRATEGIES,
};
