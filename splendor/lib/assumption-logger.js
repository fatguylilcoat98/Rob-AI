'use strict';

/*
  Assumption Logger

  Explicit premise tracking that makes reflection honest.

  Problem from v0.4 pressure test: Reflection Loop without this becomes
  self-serving. Splendor generates the reflection on its own failure,
  so it can unconsciously generate self-exonerating reflections. Growth
  Engine then trains on bad data.

  Fix: log assumptions at prediction time, before outcome is known.
  At reflection time, test each assumption independently. Causality
  classification happens structurally — not by asking "did I fail?"
  but by asking "which premise failed, and why?"

  Causality types:
  - assumption_error: the premise was available and Splendor got it wrong
  - external_change: an external event invalidated a premise nobody could predict
  - specification_change: Chris changed the goal midway (not a model failure)
  - insufficient_data: couldn't verify the premise at prediction time
  - correct: prediction matched outcome
*/

class AssumptionLogger {
  constructor(supabase, userId) {
    this.db = supabase;
    this.userId = userId;
  }

  // Call this at prediction time, before the outcome is known.
  // assumptions: [{text: string, type: string, verifiable: bool}]
  //   type: 'about_person' | 'about_timeline' | 'about_resource' | 'about_goal' | 'about_context'
  async logPrediction(prediction, confidence, assumptions = []) {
    if (!this.db) return null;
    const { data, error } = await this.db
      .from('assumption_log')
      .insert({
        user_id: this.userId,
        prediction,
        confidence,
        assumptions
      })
      .select('id')
      .single();

    if (error) {
      console.error('[ASSUMPTION] Log error:', error.message);
      return null;
    }
    return data.id;
  }

  // Call when the outcome is observed.
  async recordOutcome(predictionId, outcome, outcomeMatches) {
    if (!this.db || !predictionId) return;
    await this.db
      .from('assumption_log')
      .update({
        outcome,
        outcome_matches: outcomeMatches,
        outcome_recorded_at: new Date().toISOString()
      })
      .eq('id', predictionId)
      .eq('user_id', this.userId);
  }

  // Call at reflection time with results for each assumption.
  // assumptionResults: [{index: number, held: bool, reason: string}]
  // This is where causality is attributed — the key fix that prevents
  // scar tissue forming for external events Splendor couldn't control.
  async reflect(predictionId, assumptionResults = []) {
    if (!this.db || !predictionId) return null;

    const { data: pred } = await this.db
      .from('assumption_log')
      .select('*')
      .eq('id', predictionId)
      .eq('user_id', this.userId)
      .single();

    if (!pred) return null;

    let attribution = 'correct';
    const notes = [];

    for (const result of assumptionResults) {
      if (result.held) continue;

      const assumption = (pred.assumptions || [])[result.index];
      const text = assumption?.text || `assumption[${result.index}]`;
      const reason = result.reason || '';

      if (/emergency|unexpected|sudden|left|died|quit|external/i.test(reason)) {
        attribution = attribution === 'correct' ? 'external_change' : attribution;
        notes.push(`External event: "${text}" — ${reason}`);
      } else if (/changed.*goal|reprioritized|new.*direction|spec.*change/i.test(reason)) {
        attribution = attribution === 'correct' ? 'specification_change' : attribution;
        notes.push(`Specification changed: "${text}" — ${reason}`);
      } else if (/no.*data|couldn't.*verify|unknown/i.test(reason)) {
        attribution = attribution === 'correct' ? 'insufficient_data' : attribution;
        notes.push(`Insufficient data: "${text}" — ${reason}`);
      } else {
        attribution = 'assumption_error';
        notes.push(`Assumption wrong: "${text}" — ${reason}`);
      }
    }

    await this.db
      .from('assumption_log')
      .update({
        causality_attribution: attribution,
        reflection_notes: notes.join('\n') || null
      })
      .eq('id', predictionId);

    console.log(`[ASSUMPTION] Reflection: "${pred.prediction.slice(0, 60)}..." → ${attribution}`);
    return { attribution, notes, prediction: pred.prediction };
  }

  async getUnreflected() {
    if (!this.db) return [];
    const { data } = await this.db
      .from('assumption_log')
      .select('id, prediction, confidence, predicted_at')
      .eq('user_id', this.userId)
      .not('outcome', 'is', null)
      .is('causality_attribution', null)
      .order('predicted_at', { ascending: false })
      .limit(10);
    return data || [];
  }
}

module.exports = { AssumptionLogger };
