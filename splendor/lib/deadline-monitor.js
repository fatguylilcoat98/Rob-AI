'use strict';

/*
  Deadline Monitor — Persistent Motivation

  Checks autonomous_goals and care_objects for approaching or passed deadlines.
  Produces actionable alerts that bypass the normal approval bottleneck when
  a hard_stop threshold is hit.

  Fix for v0.4 attack "Chris unavailable + deadline approaching":
  - care_objects with deadline_hard_stop surface regardless of approval status
    once within the warning window. Chris set the deadline — surfacing it
    at hard stop is honoring what Chris said mattered, not overriding him.

  Also detects goal drift (last_worked_on too old) and stalled progress.
*/

const GOAL_STALL_DAYS = 7;

class DeadlineMonitor {
  constructor(supabase, userId, careRegistry) {
    this.db = supabase;
    this.userId = userId;
    this.careRegistry = careRegistry;
  }

  async run() {
    const alerts = [];
    const now = Date.now();

    // --- Goals ---
    if (this.db) {
      const { data: goals } = await this.db
        .from('autonomous_goals')
        .select('goal_title, goal_type, priority, progress_score, target_completion, last_worked_on')
        .eq('user_id', this.userId)
        .eq('status', 'active');

      for (const goal of goals || []) {
        if (goal.target_completion) {
          const hoursLeft = (new Date(goal.target_completion) - now) / 3600000;

          if (hoursLeft <= 0) {
            alerts.push({
              type: 'goal_overdue',
              name: goal.goal_title,
              hoursLeft: Math.round(hoursLeft),
              severity: 'critical',
              priority: goal.priority
            });
          } else if (hoursLeft <= 48) {
            alerts.push({
              type: 'goal_deadline_approaching',
              name: goal.goal_title,
              hoursLeft: Math.round(hoursLeft),
              severity: 'warning',
              priority: goal.priority
            });
          }
        }

        // Drift detection
        if (goal.last_worked_on) {
          const daysSinceWork = (now - new Date(goal.last_worked_on)) / 86400000;
          if (daysSinceWork > GOAL_STALL_DAYS) {
            alerts.push({
              type: 'goal_stalled',
              name: goal.goal_title,
              daysSinceWork: Math.round(daysSinceWork),
              severity: 'info',
              progress: goal.progress_score
            });
          }
        }
      }
    }

    // --- Care objects ---
    if (this.careRegistry) {
      const careDeadlines = await this.careRegistry.checkDeadlines();
      for (const obj of careDeadlines) {
        alerts.push({
          type: obj.isHardStop ? 'care_hard_stop' : 'care_deadline_warning',
          name: obj.name,
          hoursLeft: obj.hoursRemaining,
          severity: obj.isHardStop ? 'critical' : 'warning',
          overridesDeprioritization: obj.isHardStop
        });
      }
    }

    if (alerts.length > 0) {
      const criticals = alerts.filter(a => a.severity === 'critical');
      const warnings = alerts.filter(a => a.severity === 'warning');
      console.log(`[DEADLINE] ${criticals.length} critical, ${warnings.length} warning, ${alerts.length - criticals.length - warnings.length} info`);
    }

    return alerts;
  }
}

module.exports = { DeadlineMonitor };
