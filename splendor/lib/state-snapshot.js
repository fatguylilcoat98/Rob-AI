'use strict';

/*
  State Snapshot — Self-Model Shadow Log

  Captures what Splendor believes about itself at a point in time.
  Used for:
  - Behavioral drift detection (compare snapshot N to snapshot N-1)
  - Rollback reference (what was Splendor like 3 months ago?)
  - Chris's weekly review (what changed and why?)

  Minimum viable: zero behavioral change, just historical record.
  Runs every 12 hours via setInterval in server.js.
*/

class StateSnapshot {
  constructor(supabase, userId) {
    this.db = supabase;
    this.userId = userId;
  }

  async capture(trigger = 'scheduled', additionalContext = {}) {
    if (!this.db) return null;

    const [identityRes, goalsRes, decisionsRes, emotionRes, scarsRes] = await Promise.allSettled([
      this.db
        .from('identity_states')
        .select('identity_version, core_traits, identity_narrative')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      this.db
        .from('autonomous_goals')
        .select('goal_title, status, priority, progress_score')
        .eq('user_id', this.userId)
        .eq('status', 'active')
        .limit(10),

      this.db
        .from('splendor_decisions')
        .select('decision_id, title, priority, binding, status')
        .eq('user_id', this.userId)
        .eq('status', 'active')
        .order('priority'),

      this.db
        .from('emotional_state_log')
        .select('concern, joy, care_activation')
        .eq('user_id', this.userId)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      this.db
        .from('scar_tissue')
        .select('domain, failure_count, confidence_penalty')
        .eq('user_id', this.userId)
        .eq('active', true)
    ]);

    const identity = identityRes.status === 'fulfilled' ? identityRes.value.data : null;
    const goals = goalsRes.status === 'fulfilled' ? goalsRes.value.data : [];
    const decisions = decisionsRes.status === 'fulfilled' ? decisionsRes.value.data : [];
    const emotion = emotionRes.status === 'fulfilled' ? emotionRes.value.data : null;
    const scars = scarsRes.status === 'fulfilled' ? scarsRes.value.data : [];

    const snapshot = {
      identity_version: identity?.identity_version || null,
      core_traits: identity?.core_traits || null,
      active_goal_count: (goals || []).length,
      active_goals: (goals || []).map(g => ({
        title: g.goal_title,
        priority: g.priority,
        progress: g.progress_score
      })),
      binding_decision_count: (decisions || []).length,
      emotional_state: emotion
        ? { concern: emotion.concern, joy: emotion.joy, care: emotion.care_activation }
        : null,
      active_scars: (scars || []).map(s => ({
        domain: s.domain,
        failures: s.failure_count,
        penalty: s.confidence_penalty
      })),
      ...additionalContext
    };

    const { error } = await this.db
      .from('splendor_state_log')
      .insert({ user_id: this.userId, snapshot, trigger });

    if (error) {
      console.error('[STATE] Snapshot error:', error.message);
      return null;
    }

    console.log(`[STATE] ✓ Snapshot captured (trigger=${trigger}, goals=${snapshot.active_goal_count}, scars=${snapshot.active_scars.length})`);
    return snapshot;
  }

  // Returns the two most recent snapshots for drift comparison
  async compareRecent() {
    if (!this.db) return null;
    const { data } = await this.db
      .from('splendor_state_log')
      .select('snapshot, captured_at, trigger')
      .eq('user_id', this.userId)
      .order('captured_at', { ascending: false })
      .limit(2);

    if (!data || data.length < 2) return { insufficient_history: true, snapshots: data || [] };

    const [current, previous] = data;
    return {
      current: current.snapshot,
      previous: previous.snapshot,
      current_at: current.captured_at,
      previous_at: previous.captured_at,
      delta: {
        goal_count_change: (current.snapshot.active_goal_count || 0) - (previous.snapshot.active_goal_count || 0),
        scar_count_change: (current.snapshot.active_scars?.length || 0) - (previous.snapshot.active_scars?.length || 0),
        concern_change: (current.snapshot.emotional_state?.concern || 0) - (previous.snapshot.emotional_state?.concern || 0)
      }
    };
  }
}

module.exports = { StateSnapshot };
