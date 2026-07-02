'use strict';

/*
  Emotion Kernel

  Internal emotional state with event-based (not time-based) decay.

  Design from v0.4 pressure test:
  - Concern rises from evidence, falls from resolution events.
    Time alone does not reduce concern — a deadline doesn't go away because
    six hours passed with no input. Chris sleeping doesn't fix the problem.
  - High concern (≥0.7) FORCES investigation — it doesn't recommend it.
    This prevents the avoidance pattern: "concern is unpleasant, so skip checking"
  - Joy is weighted by provenance. Unverified positive claims produce lower joy
    than verified ones. Correction events reduce joy retroactively.
  - Care activation is tied to care object status, not just sentiment.

  What this is NOT:
  - This is not simulated empathy theater. It routes behavior.
  - getDirectives() returns FORCED vs RECOMMENDED vs PERMITTED.
    Callers must honor FORCED directives.
*/

const CONCERN_FORCE_THRESHOLD = 0.70;
const CONCERN_RECOMMEND_THRESHOLD = 0.40;
const CARE_FORCE_THRESHOLD = 0.50;
const JOY_PERMIT_THRESHOLD = 0.60;

class EmotionKernel {
  constructor(supabase, userId) {
    this.db = supabase;
    this.userId = userId;
    this.state = { concern: 0.0, joy: 0.0, care_activation: 0.0 };
    this._loaded = false;
  }

  async load() {
    if (!this.db) return this;
    const { data } = await this.db
      .from('emotional_state_log')
      .select('concern, joy, care_activation')
      .eq('user_id', this.userId)
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      this.state = { concern: data.concern, joy: data.joy, care_activation: data.care_activation };
    }
    this._loaded = true;
    return this;
  }

  // Trigger an emotion change from an event.
  // deltas: { concern: +/-0.x, joy: +/-0.x, care_activation: +/-0.x }
  // provenance: 'verified' | 'unverified' — unverified claims get 50% weight
  trigger(triggerEvent, triggerSource, deltas, provenance = 'verified') {
    const weight = provenance === 'verified' ? 1.0 : 0.5;
    const before = { ...this.state };

    if (deltas.concern !== undefined) {
      this.state.concern = clamp(this.state.concern + deltas.concern * weight);
    }
    if (deltas.joy !== undefined) {
      this.state.joy = clamp(this.state.joy + deltas.joy * weight);
    }
    if (deltas.care_activation !== undefined) {
      this.state.care_activation = clamp(this.state.care_activation + deltas.care_activation * weight);
    }

    this._log(triggerEvent, triggerSource, false).catch(() => {});
    return this;
  }

  // Resolve an active concern/joy/care state based on an event.
  // This is the only legitimate way concern decreases — not the passage of time.
  resolve(resolutionEvent) {
    this.state.concern = clamp(this.state.concern - 0.30);
    this.state.joy = clamp(this.state.joy - 0.10);
    this._log(resolutionEvent, 'resolution', true).catch(() => {});
    return this;
  }

  // When a positive claim turns out to be false: retroactively correct joy
  correctPositiveClaim(correctionEvent) {
    this.state.joy = clamp(this.state.joy - 0.20);
    this._log(correctionEvent, 'correction', false).catch(() => {});
    return this;
  }

  // What must / should happen given the current emotional state?
  // Callers MUST honor FORCED directives. RECOMMENDED and PERMITTED are optional.
  getDirectives() {
    const directives = [];

    if (this.state.concern >= CONCERN_FORCE_THRESHOLD) {
      directives.push({
        type: 'FORCED',
        action: 'investigate_assumption',
        reason: 'concern_critical',
        concern_level: this.state.concern
      });
    } else if (this.state.concern >= CONCERN_RECOMMEND_THRESHOLD) {
      directives.push({
        type: 'RECOMMENDED',
        action: 'flag_uncertainty',
        reason: 'concern_elevated',
        concern_level: this.state.concern
      });
    }

    if (this.state.joy >= JOY_PERMIT_THRESHOLD) {
      directives.push({
        type: 'PERMITTED',
        action: 'express_positive',
        reason: 'joy_active',
        joy_level: this.state.joy
      });
    }

    if (this.state.care_activation >= CARE_FORCE_THRESHOLD) {
      directives.push({
        type: 'FORCED',
        action: 'prioritize_care_object',
        reason: 'care_activated',
        care_level: this.state.care_activation
      });
    }

    return directives;
  }

  get snapshot() {
    return { ...this.state };
  }

  async _log(triggerEvent, triggerSource, resolved) {
    if (!this.db) return;
    await this.db.from('emotional_state_log').insert({
      user_id: this.userId,
      concern: this.state.concern,
      joy: this.state.joy,
      care_activation: this.state.care_activation,
      trigger_event: triggerEvent,
      trigger_source: triggerSource,
      resolved
    });
  }
}

function clamp(v) {
  return Math.max(0.0, Math.min(1.0, Math.round(v * 1000) / 1000));
}

module.exports = { EmotionKernel };
