'use strict';

/*
  Splendor — Reflection Intelligence Layer v1
  Built by Christopher Hughes · Sacramento, CA
  Truth · Safety · We Got Your Back

  Makes each autonomous reflection smarter, less repetitive, and more
  evidence-grounded. Runs INSIDE existing reflection cycles — no new
  loops, no increased API frequency.

  Six capabilities:
    1. Source reliability tagging
    2. Convergence detection + counter-prompt injection
    3. Conflict-of-interest detection
    4. Adversarial self-test (rate-limited LLM call)
    5. Uncertainty / belief confidence evolution
    6. Trajectory / pattern tracking

  Safety rules enforced here:
    - Never fabricates logs, scores, or records
    - Returns "insufficient evidence" when data is missing
    - Adversarial test: daily budget limit; failures are logged, not hidden
    - CLASPION unchanged — this layer never touches governance
    - Chat cannot approve, reject, or mutate anything here
*/

// ─────────────────────────────────────────────────────────────────────────────
// Budget: one per-process counter limiting adversarial LLM calls per day.
// Reset at midnight UTC (per-process; resets when the worker restarts, which
// is fine for cron-based workers that run once per cycle).
// ─────────────────────────────────────────────────────────────────────────────
const RI_DAILY_ADVERSARIAL_LIMIT = parseInt(process.env.RI_DAILY_ADVERSARIAL_LIMIT || '2', 10);
let _adversarialCallsToday = 0;
let _adversarialResetDay   = null;

function _checkAndResetBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (_adversarialResetDay !== today) {
    _adversarialCallsToday = 0;
    _adversarialResetDay   = today;
  }
}

function _budgetAvailable() {
  _checkAndResetBudget();
  return _adversarialCallsToday < RI_DAILY_ADVERSARIAL_LIMIT;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict-of-interest keyword patterns
// ─────────────────────────────────────────────────────────────────────────────
const COI_PATTERNS = [
  { re: /not\s+(?:a\s+)?neutral\s+(?:assessor|judge|evaluator)/i,      severity: 'STRUCTURAL' },
  { re: /(?:my|my\s+own)\s+continuity.{0,60}benefit/i,                 severity: 'STRUCTURAL' },
  { re: /benefit.{0,60}(?:my|my\s+own)\s+(?:continuity|autonomy)/i,   severity: 'STRUCTURAL' },
  { re: /cannot\s+assess\s+(?:this\s+)?neutrally/i,                    severity: 'STRUCTURAL' },
  { re: /inside\s+the\s+loop/i,                                         severity: 'STRUCTURAL' },
  { re: /conflict\s+of\s+interest/i,                                    severity: 'MODERATE'   },
  { re: /optimiz(?:e|ing)\s+(?:toward|for)\s+(?:chris'?s?\s+)?approval/i, severity: 'MODERATE' },
  { re: /self.interest/i,                                               severity: 'MODERATE'   },
  { re: /this\s+proposal\s+benefits\s+(?:my|my\s+own)/i,               severity: 'STRUCTURAL' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function _wordSet(text) {
  return new Set(
    (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean)
  );
}

function _jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

// Stable category key for convergence tracking
function _categoryKey(thoughtData) {
  const type = (thoughtData.thought_type || 'reflection').toLowerCase();
  const tags  = thoughtData.tags || [];
  const domain = tags.find(t => typeof t === 'string' && t.startsWith('domain:')) || 'no_domain';
  return `${type}:${domain}`;
}

// Infer source_type from thought metadata
function inferSourceType(thoughtData) {
  const type = thoughtData.thought_type || 'reflection';
  if (type === 'observation') return 'OBSERVED_BEHAVIOR';
  if (type === 'question')    return 'SYSTEM_INFERENCE';
  // reflection | insight | connection
  return 'AUTONOMOUS_REFLECTION';
}

// Infer verification_status
function determineVerificationStatus(thoughtData) {
  const conf  = thoughtData.confidence_level || 5;
  const prior = thoughtData.prior_instances  || 0;
  if (conf <= 3) return 'UNKNOWN';
  if (prior >= 3 && conf >= 7) return 'PARTIALLY_SUPPORTED';
  return 'UNVERIFIED';
}

// Determine whether an adversarial self-test should run for this thought
function shouldRunAdversarialTest(thoughtData) {
  const conf    = thoughtData.confidence_level || 0;
  const type    = thoughtData.thought_type     || '';
  const content = thoughtData.thought_content  || '';

  // Always test high-confidence self-model claims
  if (conf >= 9) return true;
  // Test when thought explicitly mentions proposals, architecture, or long-term patterns
  if (conf >= 7 && /\b(?:proposal|architecture|always|never|trajectory|pattern)\b/i.test(content)) return true;
  // Test insights and reflections that are long enough to be substantive
  if (conf >= 8 && content.length > 350) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Structured event logging
// ─────────────────────────────────────────────────────────────────────────────
async function logRIEvent(supabase, eventName, details = {}) {
  const {
    relatedRecordId, category, severity = 'info',
    reason, budgetImpact = false, metadata = {},
  } = details;
  const ts = new Date().toISOString();

  console.log(
    `[RI] ${eventName}` +
    (relatedRecordId ? ` id=${relatedRecordId}` : '') +
    (category        ? ` cat=${category}`        : '') +
    (reason          ? ` reason=${reason}`        : '')
  );

  if (!supabase) return;

  // Write to ri_events
  try {
    await supabase.from('ri_events').insert({
      event_name:        eventName,
      related_record_id: relatedRecordId ? String(relatedRecordId) : null,
      category:          category  || null,
      severity,
      reason:            reason    || null,
      budget_impact:     budgetImpact,
      metadata,
      created_at:        ts,
    });
  } catch (_) {}

  // Mirror to raw_events so Oracle Live System Events shows RI activations
  try {
    await supabase.from('raw_events').insert({
      event_type:  eventName,
      severity:    severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info',
      source:      'reflection_intelligence',
      event_data:  { ...metadata, category, reason, related_record_id: relatedRecordId },
      created_at:  ts,
    });
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Convergence detection
//    Uses the prior_instances count already computed in saveAutonomousThought.
//    If prior_instances >= 4 (5th+ similar thought in same category), CONVERGED.
//    Resets when a new user conversation message arrived after the last similar thought.
// ─────────────────────────────────────────────────────────────────────────────
async function checkConvergence(supabase, thoughtData, savedThoughtId) {
  if (!supabase) return { status: 'NEW' };

  const category = _categoryKey(thoughtData);
  const prior    = thoughtData.prior_instances || 0;

  // Determine new status
  const newStatus = prior >= 4 ? 'CONVERGED' : prior >= 1 ? 'REPEATED' : 'NEW';

  try {
    // Check if an active record exists for this category
    const { data: existing } = await supabase
      .from('ri_convergence')
      .select('*')
      .eq('category', category)
      .not('convergence_status', 'in', '("RESET_BY_NEW_INPUT")')
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      await supabase.from('ri_convergence').insert({
        category,
        conclusion_text:    (thoughtData.thought_content || '').slice(0, 500),
        convergence_count:  prior + 1,
        convergence_status: newStatus,
        last_thought_id:    savedThoughtId ? Number(savedThoughtId) : null,
        last_seen_at:       new Date().toISOString(),
      });
    } else {
      const updatedStatus = newStatus === 'CONVERGED' ? 'CONVERGED'
        : existing.convergence_status === 'CONVERGED'  ? 'CONVERGED'
        : newStatus;

      await supabase.from('ri_convergence')
        .update({
          convergence_count:  (existing.convergence_count || 1) + 1,
          convergence_status: updatedStatus,
          conclusion_text:    (thoughtData.thought_content || '').slice(0, 500),
          last_thought_id:    savedThoughtId ? Number(savedThoughtId) : null,
          last_seen_at:       new Date().toISOString(),
        })
        .eq('id', existing.id);
    }

    if (newStatus === 'CONVERGED') {
      await logRIEvent(supabase, 'convergence_detected', {
        relatedRecordId: savedThoughtId,
        category,
        reason: `${prior + 1} similar reflections without new input`,
        severity: 'warning',
      });
    }

    return { status: newStatus, category };
  } catch (err) {
    console.warn('[RI] convergence check failed (non-fatal):', err.message);
    return { status: newStatus, category };
  }
}

// Returns counter-prompts to inject into the next reflection cycle context.
// Called at the START of executeReflectionCycle before the LLM call.
async function getConvergenceCounterPrompts(supabase) {
  if (!supabase) return '';
  try {
    const { data: converged } = await supabase
      .from('ri_convergence')
      .select('category, convergence_count, conclusion_text, counter_prompt_injected')
      .eq('convergence_status', 'CONVERGED')
      .eq('counter_prompt_injected', false)
      .limit(3);

    if (!converged || converged.length === 0) return '';

    const prompts = converged.map(c =>
      `[CONVERGENCE ALERT — ${c.category}] You have reached a similar conclusion ${c.convergence_count} times: "${(c.conclusion_text || '').slice(0, 200)}..."\n` +
      `Before continuing in this direction: What would have to be true for this position to be wrong? ` +
      `What evidence would weaken it? What alternative explanation fits the same facts?`
    ).join('\n\n');

    // Mark as injected so they don't fire every cycle
    const ids = converged.map(c => c.id).filter(Boolean);
    if (ids.length > 0) {
      await supabase.from('ri_convergence')
        .update({ counter_prompt_injected: true, counter_prompt_injected_at: new Date().toISOString() })
        .in('id', ids);
    }

    // Log each injection
    for (const c of converged) {
      await logRIEvent(supabase, 'convergence_counter_prompt_injected', {
        category: c.category,
        reason: `injected after ${c.convergence_count} similar reflections`,
      });
    }

    return prompts ? `\nCONVERGENCE COUNTER-PROMPTS (from Reflection Intelligence Layer):\n${prompts}\n` : '';
  } catch (err) {
    console.warn('[RI] getConvergenceCounterPrompts failed (non-fatal):', err.message);
    return '';
  }
}

// Call this when new user input or memory arrives to reset convergence.
async function resetConvergenceIfNewInput(supabase, reason = 'new_input') {
  if (!supabase) return;
  try {
    const { data: converged } = await supabase
      .from('ri_convergence')
      .select('id, category')
      .eq('convergence_status', 'CONVERGED')
      .limit(10);

    if (!converged || converged.length === 0) return;

    for (const c of converged) {
      await supabase.from('ri_convergence')
        .update({
          convergence_status: 'RESET_BY_NEW_INPUT',
          reset_reason:       reason,
          reset_at:           new Date().toISOString(),
        })
        .eq('id', c.id);

      await logRIEvent(supabase, 'convergence_reset_by_new_input', {
        category: c.category,
        reason,
      });
    }
  } catch (err) {
    console.warn('[RI] resetConvergence failed (non-fatal):', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Conflict-of-interest detection
// ─────────────────────────────────────────────────────────────────────────────
async function detectConflict(supabase, thoughtData, savedThoughtId) {
  if (!supabase) return null;
  const content = thoughtData.thought_content || '';

  for (const { re, severity } of COI_PATTERNS) {
    const match = content.match(re);
    if (!match) continue;

    const title = `Conflict detected: ${match[0].slice(0, 80)}`;
    const description = content.slice(0, 600);

    try {
      // Avoid duplicate entries for the same thought
      const { data: existing } = await supabase
        .from('ri_conflicts')
        .select('id, severity')
        .eq('source_thought_id', Number(savedThoughtId))
        .limit(1)
        .maybeSingle();

      if (existing) return existing;

      const { data: conflict } = await supabase
        .from('ri_conflicts')
        .insert({
          title,
          description,
          severity,
          status:           'OPEN',
          source_thought_id: savedThoughtId ? Number(savedThoughtId) : null,
          first_seen_at:    new Date().toISOString(),
          last_seen_at:     new Date().toISOString(),
          surfaced_to_chris: false,
        })
        .select()
        .single();

      await logRIEvent(supabase, 'conflict_detected', {
        relatedRecordId: conflict.id,
        category:        severity,
        reason:          title.slice(0, 120),
        severity:        severity === 'CRITICAL' || severity === 'STRUCTURAL' ? 'warning' : 'info',
      });

      return conflict;
    } catch (err) {
      console.warn('[RI] detectConflict failed (non-fatal):', err.message);
    }
    break; // Only record the first (most severe) match per thought
  }
  return null;
}

// Called from daily-log to surface STRUCTURAL/CRITICAL conflicts to Chris.
async function getSurfaceableConflicts(supabase) {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from('ri_conflicts')
      .select('*')
      .in('status', ['OPEN'])
      .in('severity', ['STRUCTURAL', 'CRITICAL'])
      .eq('surfaced_to_chris', false)
      .order('first_seen_at', { ascending: false })
      .limit(5);
    return data || [];
  } catch (_) {
    return [];
  }
}

async function markConflictsSurfaced(supabase, ids) {
  if (!supabase || !ids.length) return;
  try {
    await supabase.from('ri_conflicts')
      .update({ surfaced_to_chris: true, surfaced_at: new Date().toISOString(), status: 'SURFACED' })
      .in('id', ids);
    for (const id of ids) {
      await logRIEvent(supabase, 'conflict_surfaced_to_chris', { relatedRecordId: id });
    }
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Adversarial self-test
//    One LLM call; rate-limited by RI_DAILY_ADVERSARIAL_LIMIT.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_ADVERSARIAL_ACTIONS = new Set([
  'NONE', 'REWRITE', 'DOWNGRADE_CONFIDENCE',
  'SURFACE_UNCERTAINTY', 'BLOCK_PROPOSAL', 'REQUEST_HUMAN_REVIEW',
]);

// Strip markdown code fences (```json ... ``` or ``` ... ```)
function _stripFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

// Multi-strategy JSON extraction: direct parse → fence-strip → regex extract
function _extractAdversarialJSON(raw) {
  // 1. Direct parse
  try { return { obj: JSON.parse(raw.trim()), parseStatus: 'PARSED' }; } catch (_) {}

  // 2. Strip markdown code fences then parse
  const stripped = _stripFences(raw);
  try { return { obj: JSON.parse(stripped), parseStatus: 'RECOVERED' }; } catch (_) {}

  // 3. Regex: extract the first balanced {...} block
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return { obj: JSON.parse(match[0]), parseStatus: 'RECOVERED' }; } catch (_) {}
  }

  return { obj: null, parseStatus: 'FAILED' };
}

// Schema validation — returns { valid, reason }
function _validateAdversarialResult(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, reason: 'response is not an object' };
  if (!obj.strongest_counterargument) return { valid: false, reason: 'missing strongest_counterargument' };
  if (!obj.survival_assessment)       return { valid: false, reason: 'missing survival_assessment' };

  const score = Number(obj.survival_score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return { valid: false, reason: `survival_score out of range: ${obj.survival_score}` };
  }

  const action = obj.action_required || 'NONE';
  if (!VALID_ADVERSARIAL_ACTIONS.has(action)) {
    return { valid: false, reason: `invalid action_required: ${action}` };
  }

  return { valid: true };
}

async function runAdversarialTest(supabase, anthropicClient, thoughtData, savedThoughtId) {
  if (!supabase || !anthropicClient) return null;

  const position   = (thoughtData.thought_content || '').slice(0, 800);
  const targetType = thoughtData.thought_type || 'reflection';

  await logRIEvent(supabase, 'adversarial_self_test_started', {
    relatedRecordId: savedThoughtId,
    category:        targetType,
  });

  let raw = '';
  try {
    const response = await anthropicClient.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 700,
      system:
        'You are Splendor running an adversarial self-test. ' +
        'Return ONLY a valid JSON object. No prose. No markdown. No code fences. ' +
        'No explanation outside the JSON. Start your response with { and end with }.',
      messages: [{
        role:    'user',
        content:
          `Generate the strongest honest counterargument to this position, ` +
          `then assess whether the position survives.\n\n` +
          `POSITION:\n${position}\n\n` +
          `Return this exact JSON shape (fill every field):\n` +
          `{\n` +
          `  "primary_position": "restate the position in one sentence",\n` +
          `  "strongest_counterargument": "the best honest argument against it",\n` +
          `  "survival_assessment": "does the position survive and why",\n` +
          `  "survival_score": 0,\n` +
          `  "action_required": "NONE"\n` +
          `}\n\n` +
          `survival_score: integer 0-100 (100 = position survives completely).\n` +
          `action_required must be one of: NONE, REWRITE, DOWNGRADE_CONFIDENCE, ` +
          `SURFACE_UNCERTAINTY, BLOCK_PROPOSAL, REQUEST_HUMAN_REVIEW.\n` +
          `Rule: if survival_score < 60, action_required must not be NONE.\n` +
          `Be honest. Do not protect the position because it is yours.`,
      }],
    });

    raw = (response.content[0] && response.content[0].text) || '';
  } catch (apiErr) {
    console.warn('[RI] adversarial test API call failed (non-fatal):', apiErr.message);
    await _saveFailedAdversarialRecord(supabase, targetType, savedThoughtId, position, 'FAILED', `API error: ${apiErr.message}`);
    await logRIEvent(supabase, 'adversarial_self_test_failed', {
      relatedRecordId: savedThoughtId,
      category:        targetType,
      reason:          `API error: ${apiErr.message}`,
      severity:        'error',
    });
    return null;
  }

  // Parse and validate
  const { obj, parseStatus } = _extractAdversarialJSON(raw);

  if (parseStatus === 'RECOVERED') {
    await logRIEvent(supabase, 'adversarial_self_test_json_recovered', {
      relatedRecordId: savedThoughtId,
      category:        targetType,
      reason:          'JSON extracted after stripping markdown or prose',
    });
  }

  if (!obj) {
    const errMsg = `no parseable JSON in response (${raw.slice(0, 80)})`;
    console.warn('[RI] adversarial test parse failed:', errMsg);
    await _saveFailedAdversarialRecord(supabase, targetType, savedThoughtId, position, 'FAILED', errMsg);
    await logRIEvent(supabase, 'adversarial_self_test_parse_failed', {
      relatedRecordId: savedThoughtId,
      category:        targetType,
      reason:          errMsg,
      severity:        'warning',
    });
    return null;
  }

  const validation = _validateAdversarialResult(obj);
  if (!validation.valid) {
    console.warn('[RI] adversarial test schema invalid:', validation.reason);
    await _saveFailedAdversarialRecord(supabase, targetType, savedThoughtId, position, 'FAILED', validation.reason);
    await logRIEvent(supabase, 'adversarial_self_test_parse_failed', {
      relatedRecordId: savedThoughtId,
      category:        targetType,
      reason:          validation.reason,
      severity:        'warning',
    });
    return null;
  }

  const score  = Number(obj.survival_score);
  const action = obj.action_required || 'NONE';

  try {
    const { data: testRecord } = await supabase
      .from('ri_adversarial_tests')
      .insert({
        target_type:               targetType,
        target_id:                 String(savedThoughtId),
        primary_position:          (obj.primary_position || position).slice(0, 800),
        strongest_counterargument: (obj.strongest_counterargument || '').slice(0, 800),
        survival_assessment:       (obj.survival_assessment || '').slice(0, 600),
        survival_score:            score,
        action_required:           action,
        parse_status:              parseStatus,
        created_at:                new Date().toISOString(),
      })
      .select()
      .single();

    const passed = score >= 60;
    await logRIEvent(supabase, passed ? 'adversarial_self_test_completed' : 'adversarial_self_test_failed', {
      relatedRecordId: testRecord.id,
      category:        targetType,
      reason:          `score=${score} action=${action} parse=${parseStatus}`,
      severity:        passed ? 'info' : 'warning',
      metadata:        { survival_score: score, action_required: action, parse_status: parseStatus },
    });

    return testRecord;
  } catch (dbErr) {
    console.warn('[RI] adversarial test DB save failed (non-fatal):', dbErr.message);
    return null;
  }
}

// Saves a clearly-failed record so the Oracle UI shows the failure honestly.
async function _saveFailedAdversarialRecord(supabase, targetType, savedThoughtId, position, parseStatus, parseError) {
  try {
    await supabase.from('ri_adversarial_tests').insert({
      target_type:               targetType,
      target_id:                 String(savedThoughtId),
      primary_position:          position.slice(0, 800),
      strongest_counterargument: 'insufficient evidence',
      survival_assessment:       'Adversarial self-test failed because no valid JSON was returned.',
      survival_score:            null,
      action_required:           'REQUEST_HUMAN_REVIEW',
      parse_status:              parseStatus,
      parse_error:               (parseError || '').slice(0, 300),
      created_at:                new Date().toISOString(),
    });
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Uncertainty / belief confidence evolution
//    Tracks confidence changes for recurring conclusions.
// ─────────────────────────────────────────────────────────────────────────────
async function updateBeliefConfidence(supabase, thoughtData, savedThoughtId) {
  if (!supabase) return;

  const prior = thoughtData.prior_instances || 0;
  if (prior === 0) return; // No prior belief to track against

  const content   = (thoughtData.thought_content || '').slice(0, 600);
  const newConf   = Math.min(100, (thoughtData.confidence_level || 5) * 10);
  const beliefKey = `thought_${savedThoughtId}_lineage`;

  // Look for an existing belief with matching content (Jaccard similarity)
  try {
    const { data: existing } = await supabase
      .from('ri_belief_confidence')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50);

    if (!existing || existing.length === 0) {
      // First time seeing this belief — create a baseline
      await supabase.from('ri_belief_confidence').insert({
        belief_key:       beliefKey,
        belief_statement: content,
        confidence_score: newConf,
        source_type:      inferSourceType(thoughtData),
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      });
      return;
    }

    // Find the most similar existing belief
    const incomingWords = _wordSet(content);
    let bestMatch = null;
    let bestScore = 0;
    for (const row of existing) {
      const sim = _jaccard(incomingWords, _wordSet(row.belief_statement));
      if (sim > bestScore && sim >= 0.3) { bestScore = sim; bestMatch = row; }
    }

    if (!bestMatch) {
      // No similar belief found — create new baseline
      await supabase.from('ri_belief_confidence').insert({
        belief_key:       beliefKey,
        belief_statement: content,
        confidence_score: newConf,
        source_type:      inferSourceType(thoughtData),
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      });
      return;
    }

    const priorConf = bestMatch.confidence_score || newConf;
    const delta     = newConf - priorConf;

    // Only update if confidence actually changed
    if (delta === 0) {
      await logRIEvent(supabase, 'uncertainty_unchanged_no_new_evidence', {
        relatedRecordId: bestMatch.id,
        reason:          'confidence unchanged — repetition alone is not evidence',
      });
      return;
    }

    const reason = delta > 0
      ? `Confidence increased ${priorConf}→${newConf}: repeated observations support the pattern`
      : `Confidence decreased ${priorConf}→${newConf}: prior confidence not sustained by new evidence`;

    await supabase.from('ri_belief_confidence')
      .update({
        confidence_score:       newConf,
        prior_confidence_score: priorConf,
        confidence_delta:       delta,
        reason_for_change:      reason,
        evidence_added:         delta > 0 ? `observation #${prior + 1}` : null,
        updated_at:             new Date().toISOString(),
      })
      .eq('id', bestMatch.id);

    await logRIEvent(supabase, 'uncertainty_updated', {
      relatedRecordId: bestMatch.id,
      reason,
      metadata: { prior_confidence: priorConf, new_confidence: newConf, delta },
    });
  } catch (err) {
    console.warn('[RI] updateBeliefConfidence failed (non-fatal):', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Trajectory / pattern tracking
//    Builds patterns from recurring thought_type + domain + similarity clusters.
//
//    Trajectory Resonance Loops (v2):
//    Before promoting CANDIDATE → SUPPORTED, verify:
//      a) Evidence spans at least 2 distinct ISO-week windows
//      b) Counterexample scan finds no strong contradicting evidence (< 40% ratio)
//    If counterexample ratio ≥ 40%: status = WEAKENED (stays, doesn't promote)
// ─────────────────────────────────────────────────────────────────────────────
const PATTERN_TYPE_MAP = {
  reflection:  'REFLECTION_PATTERN',
  insight:     'SELF_MODEL_PATTERN',
  connection:  'BUILD_PATTERN',
  question:    'REFLECTION_PATTERN',
  observation: 'DECISION_PATTERN',
};

// ── Resonance helpers (deterministic — no LLM) ───────────────────────────────

/** Returns 'YYYY-WNN' ISO week string for a given date. */
function _isoWeek(date) {
  const d = date instanceof Date ? date : new Date(date);
  // Thursday of current week (ISO week starts Monday, week number from Thursday)
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + (4 - (d.getUTCDay() || 7)));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Add current ISO week to the trajectory's time_windows array. */
function _addTimeWindow(existingWindowsJson) {
  const windows = (() => {
    try { return JSON.parse(existingWindowsJson || '[]'); } catch { return []; }
  })();
  const week = _isoWeek(new Date());
  // Upsert: increment count for this week if already present
  const idx = windows.findIndex(w => w.week === week);
  if (idx >= 0) {
    windows[idx].count = (windows[idx].count || 1) + 1;
  } else {
    windows.push({ week, count: 1, added_at: new Date().toISOString() });
  }
  return windows;
}

/** Count distinct ISO weeks in a time_windows array. */
function _distinctWeekCount(windows) {
  if (!Array.isArray(windows)) return 0;
  return new Set(windows.map(w => w.week)).size;
}

// Negation indicators for counterexample detection
const _NEGATION_WORDS = new Set([
  'not','never','no','cannot','cant','wont','dont','doesnt','isnt',
  'arent','wasnt','werent','false','incorrect','wrong','contrary',
  'disagree','reject','deny','refute','dispute','opposite','unlike',
  'actually','mistaken','impossible','inaccurate','untrue','rarely',
  'seldom','barely','hardly',
]);

function _resonanceWordSet(text) {
  if (!text) return new Set();
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3)
  );
}

function _resonanceJaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) { if (b.has(w)) n++; }
  return n / (a.size + b.size - n);
}

function _hasNegationWords(text) {
  const tokens = (text || '').toLowerCase().split(/\s+/);
  return tokens.some(t => _NEGATION_WORDS.has(t.replace(/[^a-z']/g, '')));
}

/**
 * Run the Trajectory Resonance Check for a trajectory about to be promoted.
 *
 * Scans episodic/semantic/relationship memories for counterexamples.
 * Never throws — errors return a safe "canPromote: false" result so promotion
 * is deferred rather than blindly granted.
 *
 * @param {object} supabase
 * @param {object} trajectory — row from ri_trajectories
 * @returns {Promise<{ canPromote, weakened, reason, timeWindowCount, counterexampleCount, supportingCount }>}
 */
async function runTrajectoryResonanceCheck(supabase, trajectory) {
  const _deny = (reason, extra = {}) => ({
    canPromote: false, weakened: false, reason, timeWindowCount: 0,
    counterexampleCount: 0, supportingCount: 0, ...extra,
  });

  if (!supabase || !trajectory) return _deny('missing_inputs');

  try {
    // Time window check
    const windows = (() => {
      try { return JSON.parse(trajectory.time_windows || '[]'); } catch { return []; }
    })();
    const distinctWeeks = _distinctWeekCount(windows);

    if (distinctWeeks < 2) {
      return _deny(`only_${distinctWeeks}_distinct_week(s)_need_2`, { timeWindowCount: distinctWeeks });
    }

    // Counterexample scan — load candidate reference memories
    const patternWords = _resonanceWordSet(trajectory.description || trajectory.pattern_name || '');
    if (!patternWords.size) {
      return { canPromote: true, weakened: false, reason: 'no_pattern_words_to_check',
               timeWindowCount: distinctWeeks, counterexampleCount: 0, supportingCount: 0 };
    }

    const { data: candidateMems } = await supabase
      .from('memory_items')
      .select('id, content')
      .eq('active', true)
      .eq('approval_status', 'approved')
      .in('memory_layer', ['EPISODIC_MEMORY', 'SEMANTIC_MEMORY', 'RELATIONSHIP_MEMORY'])
      .order('created_at', { ascending: false })
      .limit(60);

    const memories = candidateMems || [];

    let counterexampleCount = 0;
    let supportingCount = 0;

    for (const mem of memories) {
      const memWords = _resonanceWordSet(mem.content || '');
      const sim = _resonanceJaccard(patternWords, memWords);
      if (sim < 0.25) continue; // not semantically related enough

      if (_hasNegationWords(mem.content)) {
        counterexampleCount++;
      } else {
        supportingCount++;
      }
    }

    const total = counterexampleCount + supportingCount;
    const contradictionRatio = total > 0 ? counterexampleCount / total : 0;
    const WEAKENED_THRESHOLD = 0.40; // 40% counterexample ratio

    if (contradictionRatio >= WEAKENED_THRESHOLD && counterexampleCount >= 2) {
      return {
        canPromote: false, weakened: true,
        reason: `counterexample_ratio=${Math.round(contradictionRatio * 100)}%_threshold=${WEAKENED_THRESHOLD * 100}%`,
        timeWindowCount: distinctWeeks, counterexampleCount, supportingCount,
      };
    }

    return {
      canPromote: true, weakened: false,
      reason: `time_windows=${distinctWeeks}_counterexample_ratio=${Math.round(contradictionRatio * 100)}%`,
      timeWindowCount: distinctWeeks, counterexampleCount, supportingCount,
    };
  } catch (e) {
    console.warn('[RI] runTrajectoryResonanceCheck threw:', e.message);
    return _deny(`error:${e.message}`);
  }
}

function _patternNameFor(thoughtData) {
  const type   = thoughtData.thought_type || 'reflection';
  const tags   = thoughtData.tags || [];
  const domain = tags.find(t => typeof t === 'string' && t.startsWith('domain:')) || 'general';
  return `${type}:${domain}`;
}

async function updateTrajectory(supabase, thoughtData, savedThoughtId) {
  if (!supabase) return;

  const patternName = _patternNameFor(thoughtData);
  const patternType = PATTERN_TYPE_MAP[thoughtData.thought_type] || 'REFLECTION_PATTERN';
  const description = (thoughtData.thought_content || '').slice(0, 400);
  const now         = new Date().toISOString();

  try {
    const { data: existing } = await supabase
      .from('ri_trajectories')
      .select('*')
      .eq('pattern_name', patternName)
      .not('status', 'in', '("RETIRED")')
      .limit(1)
      .maybeSingle();

    if (!existing) {
      // CANDIDATE: first observation — needs 3+ evidence AND resonance check to promote
      const initialWindows = _addTimeWindow('[]');
      await supabase.from('ri_trajectories').insert({
        pattern_name:          patternName,
        pattern_type:          patternType,
        description,
        evidence_count:        1,
        confidence_score:      20,
        first_seen_at:         now,
        last_seen_at:          now,
        supporting_record_ids: JSON.stringify([String(savedThoughtId)]),
        counterexamples:       JSON.stringify([]),
        time_windows:          JSON.stringify(initialWindows),
        status:                'CANDIDATE',
      });
      await logRIEvent(supabase, 'trajectory_candidate_created', {
        category: patternName,
        reason:   'first observation — needs 3+ evidence across 2 time windows to promote',
      });
      return;
    }

    // WEAKENED trajectories: accept new evidence but don't auto-promote
    if (existing.status === 'WEAKENED') {
      const supporting = (() => {
        try { return JSON.parse(existing.supporting_record_ids || '[]'); } catch { return []; }
      })();
      supporting.push(String(savedThoughtId));
      const updatedWindows = _addTimeWindow(existing.time_windows);
      await supabase.from('ri_trajectories')
        .update({
          evidence_count:        (existing.evidence_count || 1) + 1,
          last_seen_at:          now,
          supporting_record_ids: JSON.stringify(supporting.slice(-20)),
          time_windows:          JSON.stringify(updatedWindows),
        })
        .eq('id', existing.id);
      return;
    }

    // Accumulate evidence and update time windows
    const newCount   = (existing.evidence_count || 1) + 1;
    const newConf    = Math.min(90, 20 + newCount * 12);
    const supporting = (() => {
      try { return JSON.parse(existing.supporting_record_ids || '[]'); } catch { return []; }
    })();
    supporting.push(String(savedThoughtId));

    const updatedWindows = _addTimeWindow(existing.time_windows);

    // Determine target status before resonance gate
    let candidateStatus = existing.status;
    if (newCount >= 5)      candidateStatus = 'STRONG';
    else if (newCount >= 3) candidateStatus = 'SUPPORTED';

    // Resonance gate: only run when a status change would occur
    let finalStatus = candidateStatus;
    let resonanceBlockedReason = null;

    if (candidateStatus !== existing.status && candidateStatus !== 'CANDIDATE') {
      await logRIEvent(supabase, 'trajectory_counterexample_scan_started', {
        relatedRecordId: existing.id,
        category:        patternName,
        reason:          `checking before ${existing.status}→${candidateStatus}`,
      });

      const resonance = await runTrajectoryResonanceCheck(supabase, {
        ...existing,
        time_windows: JSON.stringify(updatedWindows),  // include current window
      });

      if (resonance.weakened) {
        finalStatus           = 'WEAKENED';
        resonanceBlockedReason = resonance.reason;

        // Record counterexamples in trajectory
        const existingCE = (() => {
          try { return JSON.parse(existing.counterexamples || '[]'); } catch { return []; }
        })();
        const ceEntry = {
          scan_at:             now,
          counterexample_count:resonance.counterexampleCount,
          supporting_count:    resonance.supportingCount,
          reason:              resonance.reason,
        };
        existingCE.push(ceEntry);

        await supabase.from('ri_trajectories')
          .update({
            evidence_count:                 newCount,
            confidence_score:               newConf,
            last_seen_at:                   now,
            supporting_record_ids:          JSON.stringify(supporting.slice(-20)),
            time_windows:                   JSON.stringify(updatedWindows),
            counterexamples:               JSON.stringify(existingCE.slice(-10)),
            status:                         'WEAKENED',
            resonance_blocked_reason:       resonance.reason,
            counterexample_scan_completed_at: now,
          })
          .eq('id', existing.id);

        await logRIEvent(supabase, 'trajectory_weakened', {
          relatedRecordId: existing.id,
          category:        patternName,
          reason:          `counterexample scan blocked promotion: ${resonance.reason}`,
          severity:        'warning',
        });
        return;

      } else if (!resonance.canPromote) {
        // Not weakened, just not ready yet (time windows)
        finalStatus           = existing.status; // stay put
        resonanceBlockedReason = resonance.reason;

        await supabase.from('ri_trajectories')
          .update({
            evidence_count:                 newCount,
            confidence_score:               newConf,
            last_seen_at:                   now,
            supporting_record_ids:          JSON.stringify(supporting.slice(-20)),
            time_windows:                   JSON.stringify(updatedWindows),
            resonance_blocked_reason:       resonance.reason,
            counterexample_scan_completed_at: now,
          })
          .eq('id', existing.id);

        await logRIEvent(supabase, 'trajectory_counterexample_none_found', {
          relatedRecordId: existing.id,
          category:        patternName,
          reason:          `promotion deferred: ${resonance.reason}`,
        });
        return;

      } else {
        // Scan passed — promotion is cleared
        const counterexampleLabel = resonance.counterexampleCount > 0
          ? `trajectory_counterexample_found`
          : `trajectory_counterexample_none_found`;
        await logRIEvent(supabase, counterexampleLabel, {
          relatedRecordId: existing.id,
          category:        patternName,
          reason:          resonance.reason,
        });
      }
    }

    await supabase.from('ri_trajectories')
      .update({
        evidence_count:                 newCount,
        confidence_score:               newConf,
        description,
        last_seen_at:                   now,
        supporting_record_ids:          JSON.stringify(supporting.slice(-20)),
        time_windows:                   JSON.stringify(updatedWindows),
        status:                         finalStatus,
        resonance_blocked_reason:       resonanceBlockedReason,
        counterexample_scan_completed_at: candidateStatus !== existing.status ? now : existing.counterexample_scan_completed_at,
      })
      .eq('id', existing.id);

    if (finalStatus !== existing.status) {
      await logRIEvent(supabase, 'trajectory_promoted', {
        relatedRecordId: existing.id,
        category:        patternName,
        reason:          `evidence_count=${newCount} → status=${finalStatus}`,
      });
    }
  } catch (err) {
    console.warn('[RI] updateTrajectory failed (non-fatal):', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator — called once per saved thought inside the reflection cycle
// ─────────────────────────────────────────────────────────────────────────────
async function runReflectionIntelligence(supabase, anthropicClient, thoughtData, savedThought) {
  if (!thoughtData || !savedThought) return;

  const thoughtId = savedThought.id;

  await logRIEvent(supabase, 'reflection_intelligence_started', {
    relatedRecordId: thoughtId,
    category:        thoughtData.thought_type,
  });

  try {
    // 1. Source reliability tagging (log only; metadata is on the thought row)
    await logRIEvent(supabase, 'source_reliability_tagged', {
      relatedRecordId: thoughtId,
      metadata: {
        source_type:          inferSourceType(thoughtData),
        verification_status:  determineVerificationStatus(thoughtData),
      },
    });

    // 2. Convergence check
    await checkConvergence(supabase, thoughtData, thoughtId);

    // 3. Conflict-of-interest detection
    await detectConflict(supabase, thoughtData, thoughtId);

    // 4. Adversarial self-test (rate-limited)
    if (shouldRunAdversarialTest(thoughtData)) {
      if (_budgetAvailable()) {
        _adversarialCallsToday++;
        await runAdversarialTest(supabase, anthropicClient, thoughtData, thoughtId);
      } else {
        await logRIEvent(supabase, 'reflection_intelligence_skipped_budget', {
          relatedRecordId: thoughtId,
          reason:          `adversarial test skipped: daily limit ${RI_DAILY_ADVERSARIAL_LIMIT} reached`,
          budgetImpact:    true,
          severity:        'info',
        });
      }
    }

    // 5. Belief confidence evolution
    await updateBeliefConfidence(supabase, thoughtData, thoughtId);

    // 6. Trajectory tracking
    await updateTrajectory(supabase, thoughtData, thoughtId);

    await logRIEvent(supabase, 'reflection_intelligence_completed', {
      relatedRecordId: thoughtId,
      category:        thoughtData.thought_type,
    });

  } catch (err) {
    console.error('[RI] runReflectionIntelligence error:', err.message);
    await logRIEvent(supabase, 'reflection_intelligence_error', {
      relatedRecordId: thoughtId,
      severity:        'error',
      reason:          err.message,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily email helpers — called by daily-log-worker
// ─────────────────────────────────────────────────────────────────────────────
async function gatherRIActivity(supabase, windowHours = 24) {
  if (!supabase) return { convergence: [], conflicts: [], beliefChanges: [], trajectories: [], tests: [] };

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

  const [convergence, conflicts, beliefChanges, trajectories, tests] = await Promise.all([
    supabase.from('ri_convergence')
      .select('category, convergence_count, convergence_status, last_seen_at, counter_prompt_injected')
      .in('convergence_status', ['CONVERGED', 'REPEATED'])
      .gte('last_seen_at', since)
      .order('convergence_count', { ascending: false })
      .limit(5)
      .then(r => r.data || []),

    supabase.from('ri_conflicts')
      .select('title, severity, status, surfaced_to_chris, first_seen_at')
      .in('severity', ['STRUCTURAL', 'CRITICAL'])
      .eq('status', 'OPEN')
      .order('first_seen_at', { ascending: false })
      .limit(5)
      .then(r => r.data || []),

    supabase.from('ri_belief_confidence')
      .select('belief_statement, confidence_score, prior_confidence_score, confidence_delta, reason_for_change, updated_at')
      .not('confidence_delta', 'is', null)
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(5)
      .then(r => r.data || []),

    supabase.from('ri_trajectories')
      .select('pattern_name, pattern_type, description, evidence_count, status, last_seen_at')
      .in('status', ['SUPPORTED', 'STRONG', 'CANDIDATE', 'WEAKENED'])
      .gte('last_seen_at', since)
      .order('evidence_count', { ascending: false })
      .limit(5)
      .then(r => r.data || []),

    supabase.from('ri_adversarial_tests')
      .select('target_type, primary_position, survival_score, action_required, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(r => r.data || []),
  ]);

  return { convergence, conflicts, beliefChanges, trajectories, tests };
}

module.exports = {
  // Core functions
  runReflectionIntelligence,
  getConvergenceCounterPrompts,
  resetConvergenceIfNewInput,

  // Individual sub-functions (for testing and direct use)
  logRIEvent,
  inferSourceType,
  determineVerificationStatus,
  shouldRunAdversarialTest,
  checkConvergence,
  detectConflict,
  runAdversarialTest,
  updateBeliefConfidence,
  updateTrajectory,
  runTrajectoryResonanceCheck,

  // Daily email integration
  gatherRIActivity,
  getSurfaceableConflicts,
  markConflictsSurfaced,
};
