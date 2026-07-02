/*
  Splendor — The Good Neighbor Guard
  Continuity Core: emotional-pattern analyzer.

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

  After each chat turn, observe (NOT invent) the tone, energy, clarity,
  and dominant theme of the exchange and write one row to
  emotional_patterns. Powers the timeline in the Cognitive Archaeology
  panel showing how Chris's state varies across sessions.

  Honest by design: if the model can't read a signal it leaves the
  field null. No filler. No fake emotions.
*/

const { activityBus } = require('./activity-bus');

const ENGINE_MODEL = 'claude-sonnet-4-6';

let _supabase = null;
let _anthropic = null;

function getSupabase() {
  if (!_supabase) {
    const { createClient } = require('@supabase/supabase-js');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return null;
    }
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _supabase;
}

function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    } catch (_) {
      return null;
    }
  }
  return _anthropic;
}

function tryParseJson(text) {
  let t = String(text || '').trim();
  if (t.startsWith('```json')) t = t.replace(/^```json\s*/, '').replace(/\s*```\s*$/, '');
  else if (t.startsWith('```')) t = t.replace(/^```\s*/, '').replace(/\s*```\s*$/, '');
  const first = t.indexOf('{');
  const last  = t.lastIndexOf('}');
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

async function analyzeAndPersist({ userId, userMessage, assistantResponse, surface = 'chat' }) {
  if (!userId || !userMessage) return;
  const supabase = getSupabase();
  const anthropic = getAnthropic();
  if (!supabase || !anthropic) return;

  const prompt = `Observe — do not invent — the tone, energy, and clarity of this conversation turn.

USER: ${String(userMessage || '').slice(0, 1500)}
SPLENDOR: ${String(assistantResponse || '').slice(0, 1500)}

Return JSON only:
{
  "tone": "<single word or short phrase, e.g. 'frustrated', 'curious', 'tired', 'focused', 'neutral'>",
  "energy_level": "<one of: 'low', 'medium', 'high'>",
  "clarity_score": <0.0 to 1.0 — how clearly the user is thinking and communicating>,
  "dominant_theme": "<one short phrase — what was this turn about? e.g. 'memory testing', 'building Splendor', 'venting about work'>",
  "notes": "<one short sentence of additional context if useful, or null>"
}

Rules:
- If you cannot read a signal honestly, leave the field null. NO filler.
- Do NOT invent emotions Chris didn't express.
- clarity_score reflects how coherent his thinking is, not whether you agree.
- This is observation, not interpretation.`;

  try { activityBus.emit('emotional:analyzer_called', { surface }); } catch (_) {}

  let raw = '';
  try {
    const r = await anthropic.messages.create({
      model: ENGINE_MODEL,
      max_tokens: 220,
      system: 'You are an observation engine. Return strictly valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });
    raw = r && r.content && r.content[0] && r.content[0].text;
  } catch (e) {
    console.warn('[emotional] LLM call failed:', e && e.message);
    try { activityBus.emit('emotional:error', { reason: 'llm_failed', error: e && e.message, surface }); } catch (_) {}
    return;
  }
  if (!raw) {
    try { activityBus.emit('emotional:error', { reason: 'empty_body', surface }); } catch (_) {}
    return;
  }

  let parsed;
  try { parsed = tryParseJson(raw); } catch (e) {
    console.warn('[emotional] non-JSON output:', e && e.message);
    try { activityBus.emit('emotional:error', { reason: 'non_json', error: e && e.message, surface }); } catch (_) {}
    return;
  }
  if (!parsed || typeof parsed !== 'object') {
    try { activityBus.emit('emotional:error', { reason: 'parse_returned_non_object', surface }); } catch (_) {}
    return;
  }

  const row = {
    user_id: userId,
    session_date: new Date().toISOString(),
    tone:           parsed.tone           || null,
    energy_level:   parsed.energy_level   || null,
    clarity_score:  typeof parsed.clarity_score === 'number'
                      ? Math.max(0, Math.min(1, parsed.clarity_score))
                      : null,
    dominant_theme: parsed.dominant_theme || null,
    notes:          parsed.notes          || null,
  };

  // Skip writing if every field is null — the analyzer had nothing
  // observable to log. Honest by default.
  const hasContent =
    row.tone || row.energy_level || row.dominant_theme ||
    (row.clarity_score !== null);
  if (!hasContent) {
    console.log('[emotional] no observable signal — skip write (surface=' + surface + ')');
    try { activityBus.emit('emotional:no_signal', { surface }); } catch (_) {}
    return;
  }

  try {
    const { error } = await supabase.from('emotional_patterns').insert(row);
    if (error) {
      console.warn('[emotional] insert failed:', error.message);
      try { activityBus.emit('emotional:write_error', { error: error.message, surface }); } catch (_) {}
      return;
    }
    console.log('[emotional] logged: tone=' + (row.tone || '∅') +
      ' energy=' + (row.energy_level || '∅') +
      ' clarity=' + (row.clarity_score == null ? '∅' : row.clarity_score.toFixed(2)) +
      ' theme=' + (row.dominant_theme || '∅') +
      ' surface=' + surface);
    try {
      activityBus.emit('emotional:logged', {
        tone: row.tone,
        energy_level: row.energy_level,
        clarity_score: row.clarity_score,
        surface,
      });
    } catch (_) {}
  } catch (e) {
    console.warn('[emotional] write threw:', e && e.message);
  }
}

module.exports = { analyzeAndPersist };
