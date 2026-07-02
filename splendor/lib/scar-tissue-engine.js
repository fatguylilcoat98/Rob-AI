'use strict';

/*
  Scar Tissue Engine

  Tracks failures by domain and applies calibrated confidence penalties.

  Key design decisions from v0.4 pressure test:
  - Hard floor at 0.30 — confidence never crushes to zero (avoids learned helplessness)
  - Three failures in a domain trigger investigation, not more penalties
  - Failure type is recorded (assumption_error vs external_change vs specification_change)
    so reflection can attribute causality correctly instead of blaming the system
    for external events
*/

const CONFIDENCE_FLOOR = 0.30;
const INVESTIGATION_THRESHOLD = 3;
const DEFAULT_PENALTY = 0.15;

class ScarTissueEngine {
  constructor(supabase, userId) {
    this.db = supabase;
    this.userId = userId;
  }

  async recordFailure({ domain, description, failureType = 'assumption_error', penalty = DEFAULT_PENALTY }) {
    if (!this.db) return null;

    const { data: existing } = await this.db
      .from('scar_tissue')
      .select('*')
      .eq('user_id', this.userId)
      .eq('domain', domain)
      .eq('active', true)
      .maybeSingle();

    if (existing) {
      const newCount = existing.failure_count + 1;
      const triggerInvestigation = newCount >= INVESTIGATION_THRESHOLD && !existing.investigation_triggered;

      await this.db
        .from('scar_tissue')
        .update({
          failure_count: newCount,
          last_failure_at: new Date().toISOString(),
          investigation_triggered: triggerInvestigation || existing.investigation_triggered,
          investigation_notes: triggerInvestigation
            ? `Auto-triggered after ${newCount} failures. Root cause investigation required — do not add more penalties without identifying method failure.`
            : existing.investigation_notes
        })
        .eq('id', existing.id);

      if (triggerInvestigation) {
        console.log(`[SCAR] ⚠ Investigation triggered: domain="${domain}" after ${newCount} failures`);
      }

      return { domain, penalty: existing.confidence_penalty, floor: CONFIDENCE_FLOOR, failure_count: newCount };
    }

    const { data } = await this.db
      .from('scar_tissue')
      .insert({
        user_id: this.userId,
        domain,
        failure_description: description,
        failure_type: failureType,
        confidence_penalty: Math.min(penalty, 0.50),
        current_floor: CONFIDENCE_FLOOR
      })
      .select()
      .single();

    console.log(`[SCAR] New scar: domain="${domain}" type=${failureType} penalty=${penalty}`);
    return data;
  }

  // Returns a modifier (0.3–1.0) to apply to confidence scores in this domain.
  // Caller multiplies their base confidence by this value.
  async getConfidenceModifier(domain) {
    if (!this.db) return { modifier: 1.0, hasScars: false };

    const { data } = await this.db
      .from('scar_tissue')
      .select('confidence_penalty, current_floor, investigation_triggered')
      .eq('user_id', this.userId)
      .eq('domain', domain)
      .eq('active', true);

    if (!data || data.length === 0) return { modifier: 1.0, floor: null, hasScars: false };

    const totalPenalty = data.reduce((sum, s) => sum + s.confidence_penalty, 0);
    const floor = Math.max(...data.map(s => s.current_floor));
    const investigationPending = data.some(s => s.investigation_triggered);

    return {
      modifier: Math.max(1.0 - totalPenalty, floor),
      floor,
      hasScars: true,
      investigationPending,
      scarCount: data.length
    };
  }

  async markRecovered(domain, notes = '') {
    if (!this.db) return;
    await this.db
      .from('scar_tissue')
      .update({ active: false, recovered_at: new Date().toISOString(), investigation_notes: notes })
      .eq('user_id', this.userId)
      .eq('domain', domain)
      .eq('active', true);

    console.log(`[SCAR] Recovered: domain="${domain}"`);
  }

  async listActive() {
    if (!this.db) return [];
    const { data } = await this.db
      .from('scar_tissue')
      .select('domain, failure_count, confidence_penalty, investigation_triggered, last_failure_at')
      .eq('user_id', this.userId)
      .eq('active', true)
      .order('last_failure_at', { ascending: false });
    return data || [];
  }
}

module.exports = { ScarTissueEngine, CONFIDENCE_FLOOR };
