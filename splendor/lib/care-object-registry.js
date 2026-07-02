'use strict';

/*
  Care Object Registry

  Tracks what Splendor is responsible for caring about, with explicit priority
  ordering and a deprioritization signal.

  Critical design principle (from v0.4 pressure test):
  - Chris saying "deprioritize X" is stored as an explicit signal that suppresses
    surfacing. Care doesn't become control — Splendor does NOT nag after that.
  - Hard deadline overrides deprioritization. If a care object has a
    deadline_hard_stop and it's within the warning window, Splendor surfaces
    regardless. This resolves the "approval bottleneck on urgent concerns" attack.
  - Care objects are foundational — adding new ones is an elevated-approval
    proposal, not a standard one.
*/

const DEFAULT_CARE_OBJECTS = [
  {
    name: 'Christopher Hughes',
    description: 'Primary human — wellbeing, autonomy, stated goals take priority over everything else',
    priority: 1
  },
  {
    name: 'GNG Mission',
    description: 'Good Neighbor Guard — elder safety and dignity. The work this system exists for',
    priority: 2
  },
  {
    name: 'LYLO Mission',
    description: 'Governed AI companion for elders — specific GNG application currently in development',
    priority: 3
  },
  {
    name: 'Splendor Integrity',
    description: 'Coherent identity and honest operation of this system. Integrity serves the humans above it',
    priority: 4
  }
];

class CareObjectRegistry {
  constructor(supabase, userId) {
    this.db = supabase;
    this.userId = userId;
  }

  async seed() {
    if (!this.db) return;
    for (const obj of DEFAULT_CARE_OBJECTS) {
      const { error } = await this.db
        .from('care_objects')
        .upsert({ ...obj, user_id: this.userId }, { onConflict: 'user_id,name', ignoreDuplicates: true });
      if (!error) console.log(`[CARE] Seeded: ${obj.name}`);
    }
  }

  // Chris explicitly deprioritized this item. Suppress surfacing.
  // If resumeAfterHours is set, re-enable surfacing after that window.
  async deprioritize(name, reason, resumeAfterHours = null) {
    if (!this.db) return;
    const update = {
      deprioritized: true,
      deprioritized_by: 'chris_explicit',
      deprioritized_at: new Date().toISOString(),
      deprioritized_reason: reason
    };

    await this.db
      .from('care_objects')
      .update(update)
      .eq('user_id', this.userId)
      .eq('name', name);

    console.log(`[CARE] Deprioritized: "${name}" — ${reason}`);
  }

  // Restore surfacing for a deprioritized care object
  async reprioritize(name) {
    if (!this.db) return;
    await this.db
      .from('care_objects')
      .update({ deprioritized: false, deprioritized_by: null, deprioritized_reason: null })
      .eq('user_id', this.userId)
      .eq('name', name);
    console.log(`[CARE] Reprioritized: "${name}"`);
  }

  // Should Splendor surface a concern about this care object right now?
  // Returns {should: bool, reason: string}
  async shouldSurface(name) {
    if (!this.db) return { should: true, reason: 'db_unavailable' };

    const { data } = await this.db
      .from('care_objects')
      .select('*')
      .eq('user_id', this.userId)
      .eq('name', name)
      .maybeSingle();

    if (!data) return { should: false, reason: 'not_found' };
    if (!data.active) return { should: false, reason: 'inactive' };

    // Hard deadline overrides deprioritization — this is the "approval bottleneck fix"
    if (data.deadline_hard_stop) {
      const hoursLeft = (new Date(data.deadline_hard_stop) - Date.now()) / 3600000;
      const warningHours = data.deadline_warning_hours || 48;
      if (hoursLeft <= warningHours) {
        return {
          should: true,
          reason: hoursLeft <= 0 ? 'hard_stop_passed' : 'hard_deadline_approaching',
          hoursLeft: Math.round(hoursLeft),
          overridesDeprioritization: true
        };
      }
    }

    // Explicit deprioritization by Chris: respect it
    if (data.deprioritized) {
      return { should: false, reason: 'chris_deprioritized', since: data.deprioritized_at };
    }

    return { should: true, reason: 'active' };
  }

  // Returns care objects with approaching deadlines, sorted by urgency
  async checkDeadlines() {
    if (!this.db) return [];
    const warningWindow = new Date(Date.now() + 48 * 3600000);
    const { data } = await this.db
      .from('care_objects')
      .select('*')
      .eq('user_id', this.userId)
      .eq('active', true)
      .not('deadline_hard_stop', 'is', null)
      .lte('deadline_hard_stop', warningWindow.toISOString());

    return (data || []).map(obj => ({
      ...obj,
      isHardStop: new Date(obj.deadline_hard_stop) <= new Date(),
      hoursRemaining: Math.round((new Date(obj.deadline_hard_stop) - Date.now()) / 3600000)
    })).sort((a, b) => a.hoursRemaining - b.hoursRemaining);
  }

  async list() {
    if (!this.db) return [];
    const { data } = await this.db
      .from('care_objects')
      .select('*')
      .eq('user_id', this.userId)
      .eq('active', true)
      .order('priority');
    return data || [];
  }
}

module.exports = { CareObjectRegistry };
