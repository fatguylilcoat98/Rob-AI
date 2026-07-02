/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  CONTINUITY ENGINE - Maintains awareness and coordination across time

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { createClient } = require('@supabase/supabase-js');
const { generateSplendorResponse } = require('./anthropic');
const { proactiveCommunication } = require('./proactive-communication');

const supabase = createClient(
  process.env.SUPABASE_URL || 'placeholder',
  process.env.SUPABASE_ANON_KEY || 'placeholder'
);

class ContinuityEngine {
  constructor() {
    this.isRunning = false;
    this.currentCycle = 0;
    this.lastRunTime = null;
    this.cycleHistory = [];
    this.config = {
      enabled: process.env.CONTINUITY_ENGINE_ENABLED === 'true',
      intervalMinutes: parseInt(process.env.CONTINUITY_INTERVAL_MINUTES) || 30,
      maxHistorySize: 100,
      notificationCooldown: parseInt(process.env.CONTINUITY_NOTIFICATION_COOLDOWN) || 60, // minutes
      debug: process.env.CONTINUITY_DEBUG === 'true'
    };
  }

  // ====================================
  // CORE ENGINE LIFECYCLE
  // ====================================

  async start() {
    if (!this.config.enabled) {
      console.log('[CONTINUITY] Engine disabled (CONTINUITY_ENGINE_ENABLED != true)');
      return;
    }

    if (this.isRunning) {
      console.log('[CONTINUITY] Engine already running');
      return;
    }

    console.log('[CONTINUITY] 🔄 Starting Continuity Engine...');
    console.log(`[CONTINUITY] Cycle interval: ${this.config.intervalMinutes} minutes`);

    this.isRunning = true;

    // Initialize proactive communication system
    try {
      await proactiveCommunication.initialize();
      console.log('[CONTINUITY] ✅ Integrated with existing email system');
    } catch (error) {
      console.warn('[CONTINUITY] ⚠️ Email system integration failed:', error.message);
    }

    // Run first cycle immediately
    await this.runCycle();

    // Schedule subsequent cycles
    this.scheduleNextCycle();

    console.log('[CONTINUITY] ✅ Continuity Engine started successfully');
  }

  async stop() {
    console.log('[CONTINUITY] 🛑 Stopping Continuity Engine...');
    this.isRunning = false;

    if (this.nextCycleTimeout) {
      clearTimeout(this.nextCycleTimeout);
      this.nextCycleTimeout = null;
    }

    console.log('[CONTINUITY] ✅ Continuity Engine stopped');
  }

  scheduleNextCycle() {
    if (!this.isRunning) return;

    const intervalMs = this.config.intervalMinutes * 60 * 1000;

    this.nextCycleTimeout = setTimeout(() => {
      if (this.isRunning) {
        this.runCycle().then(() => {
          this.scheduleNextCycle();
        }).catch(error => {
          console.error('[CONTINUITY] Cycle error:', error);
          // Continue scheduling even after errors
          this.scheduleNextCycle();
        });
      }
    }, intervalMs);

    const nextRunTime = new Date(Date.now() + intervalMs);
    console.log(`[CONTINUITY] Next cycle scheduled for: ${nextRunTime.toLocaleTimeString()}`);
  }

  // ====================================
  // CORE CYCLE - 8 QUESTIONS
  // ====================================

  async runCycle() {
    const cycleStart = Date.now();
    this.currentCycle++;

    console.log(`\n[CONTINUITY] 🔄 === CYCLE ${this.currentCycle} START ===`);
    console.log(`[CONTINUITY] Time: ${new Date().toLocaleString()}`);

    try {
      // Gather all input data
      const inputs = await this.gatherInputs();

      // Run the 8-question core loop
      const analysis = await this.runEightQuestions(inputs);

      // Process results and determine actions
      const actions = await this.determineActions(analysis, inputs);

      // Execute actions
      const results = await this.executeActions(actions);

      // Store cycle results
      const cycleData = {
        cycle: this.currentCycle,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - cycleStart,
        inputs_summary: this.summarizeInputs(inputs),
        analysis: analysis,
        actions: actions,
        results: results
      };

      await this.storeCycleResults(cycleData);

      // Update history
      this.cycleHistory.push(cycleData);
      if (this.cycleHistory.length > this.config.maxHistorySize) {
        this.cycleHistory.shift();
      }

      this.lastRunTime = new Date();

      console.log(`[CONTINUITY] ✅ Cycle ${this.currentCycle} completed (${cycleData.duration_ms}ms)`);
      console.log(`[CONTINUITY] Actions: ${actions.length}, Results: ${Object.keys(results).length}`);

      return cycleData;

    } catch (error) {
      console.error(`[CONTINUITY] ❌ Cycle ${this.currentCycle} failed:`, error);

      // Store error in cycle results
      const errorData = {
        cycle: this.currentCycle,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - cycleStart,
        error: error.message,
        stack: error.stack
      };

      await this.storeCycleResults(errorData);

      throw error;
    } finally {
      console.log(`[CONTINUITY] === CYCLE ${this.currentCycle} END ===\n`);
    }
  }

  // ====================================
  // DATA INPUTS
  // ====================================

  async gatherInputs() {
    console.log('[CONTINUITY] 📊 Gathering input data...');

    const inputs = {
      timestamp: new Date().toISOString(),
      memories: await this.getMemories(),
      workspaces: await this.getActiveWorkspaces(),
      tasks: await this.getScheduledTasks(),
      reflections: await this.getReflections(),
      contradictions: await this.getContradictions(),
      commitments: await this.getCommitments(),
      goals: await this.getGoals(),
      systemHealth: await this.getSystemHealth()
    };

    if (this.config.debug) {
      console.log('[CONTINUITY] Input counts:', {
        memories: inputs.memories?.length || 0,
        workspaces: inputs.workspaces?.length || 0,
        tasks: inputs.tasks?.length || 0,
        reflections: inputs.reflections?.length || 0,
        contradictions: inputs.contradictions?.length || 0,
        commitments: inputs.commitments?.length || 0,
        goals: inputs.goals?.length || 0
      });
    }

    return inputs;
  }

  async getMemories() {
    try {
      // Get recent memories with confidence, source, and timestamp
      const { data: memories } = await supabase
        .from('memory_items')
        .select('id, content, confidence, source_type, created_at, importance, category, provenance')
        .eq('active', true)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
        .order('created_at', { ascending: false })
        .limit(100);

      return memories || [];
    } catch (error) {
      console.warn('[CONTINUITY] Failed to get memories:', error.message);
      return [];
    }
  }

  async getActiveWorkspaces() {
    try {
      const { data: workspaces } = await supabase
        .from('active_workspaces')
        .select('*')
        .eq('status', 'active')
        .order('updated_at', { ascending: false });

      return workspaces || [];
    } catch (error) {
      console.warn('[CONTINUITY] Failed to get workspaces:', error.message);
      return [];
    }
  }

  async getScheduledTasks() {
    try {
      const { data: tasks } = await supabase
        .from('scheduled_tasks')
        .select('*')
        .in('status', ['pending', 'in_progress'])
        .order('scheduled_for', { ascending: true });

      return tasks || [];
    } catch (error) {
      console.warn('[CONTINUITY] Failed to get tasks:', error.message);
      return [];
    }
  }

  async getReflections() {
    try {
      const { data: reflections } = await supabase
        .from('reflections')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('created_at', { ascending: false })
        .limit(50);

      return reflections || [];
    } catch (error) {
      console.warn('[CONTINUITY] Failed to get reflections:', error.message);
      return [];
    }
  }

  async getContradictions() {
    try {
      const { data: contradictions } = await supabase
        .from('memory_conflicts')
        .select('*')
        .eq('status', 'unresolved')
        .order('created_at', { ascending: false });

      return contradictions || [];
    } catch (error) {
      console.warn('[CONTINUITY] Failed to get contradictions:', error.message);
      return [];
    }
  }

  async getCommitments() {
    try {
      // Get active decisions that represent commitments
      const { data: commitments } = await supabase
        .from('splendor_decisions')
        .select('*')
        .eq('status', 'active')
        .eq('binding', true)
        .order('created_at', { ascending: false });

      return commitments || [];
    } catch (error) {
      console.warn('[CONTINUITY] Failed to get commitments:', error.message);
      return [];
    }
  }

  async getGoals() {
    try {
      // Look for user goals in memories and workspaces
      const { data: goalMemories } = await supabase
        .from('memory_items')
        .select('*')
        .eq('memory_type', 'user_goal')
        .eq('active', true)
        .order('created_at', { ascending: false });

      return goalMemories || [];
    } catch (error) {
      console.warn('[CONTINUITY] Failed to get goals:', error.message);
      return [];
    }
  }

  async getSystemHealth() {
    try {
      // Basic system health indicators
      const health = {
        timestamp: new Date().toISOString(),
        database_responsive: true, // If we got here, DB is working
        memory_system: await this.checkMemorySystem(),
        email_system: await this.checkEmailSystem(),
        consciousness_active: this.isRunning
      };

      return health;
    } catch (error) {
      console.warn('[CONTINUITY] Failed to get system health:', error.message);
      return { timestamp: new Date().toISOString(), error: error.message };
    }
  }

  async checkMemorySystem() {
    try {
      const { data, error } = await supabase
        .from('memory_items')
        .select('id')
        .limit(1);

      return { responsive: !error, error: error?.message };
    } catch (error) {
      return { responsive: false, error: error.message };
    }
  }

  async checkEmailSystem() {
    try {
      // Check if proactive communication is initialized
      return {
        initialized: !!proactiveCommunication.emailTransporter,
        enabled: process.env.PROACTIVE_EMAIL_ENABLED === 'true'
      };
    } catch (error) {
      return { initialized: false, error: error.message };
    }
  }

  // ====================================
  // 8 QUESTION ANALYSIS
  // ====================================

  async runEightQuestions(inputs) {
    console.log('[CONTINUITY] 🤔 Running 8-question analysis...');

    const questions = [
      'What is unresolved?',
      'What matters most right now?',
      'What has changed since last cycle?',
      'What am I uncertain about?',
      'What should be preserved?',
      'What should be questioned?',
      'Should Christopher be notified?',
      'If yes, why now specifically?'
    ];

    const analysis = {
      timestamp: new Date().toISOString(),
      cycle: this.currentCycle,
      questions: {},
      summary: null,
      notification_warranted: false,
      notification_reason: null
    };

    // Build context for analysis
    const context = this.buildAnalysisContext(inputs);

    // Ask each question in order
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      console.log(`[CONTINUITY] Question ${i + 1}: ${question}`);

      try {
        const answer = await this.askQuestion(question, context, analysis, i);
        analysis.questions[`q${i + 1}`] = {
          question: question,
          answer: answer,
          timestamp: new Date().toISOString()
        };

        if (this.config.debug) {
          console.log(`[CONTINUITY] Answer ${i + 1}: ${answer.substring(0, 200)}...`);
        }

        // Questions 7 & 8 determine notification
        if (i === 6) { // Question 7: Should Christopher be notified?
          analysis.notification_warranted = this.shouldNotify(answer);
        }
        if (i === 7 && analysis.notification_warranted) { // Question 8: Why now?
          analysis.notification_reason = answer;
        }

      } catch (error) {
        console.error(`[CONTINUITY] Error on question ${i + 1}:`, error);
        analysis.questions[`q${i + 1}`] = {
          question: question,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Generate overall summary
    analysis.summary = await this.generateAnalysisSummary(analysis, inputs);

    return analysis;
  }

  buildAnalysisContext(inputs) {
    const context = {
      current_time: new Date().toISOString(),
      cycle_number: this.currentCycle,
      last_cycle: this.lastRunTime?.toISOString() || 'first_run',
      memory_count: inputs.memories?.length || 0,
      active_workspaces: inputs.workspaces?.length || 0,
      pending_tasks: inputs.tasks?.filter(t => t.status === 'pending')?.length || 0,
      overdue_tasks: inputs.tasks?.filter(t => new Date(t.scheduled_for) < new Date())?.length || 0,
      recent_reflections: inputs.reflections?.length || 0,
      unresolved_contradictions: inputs.contradictions?.length || 0,
      active_commitments: inputs.commitments?.length || 0,
      user_goals: inputs.goals?.length || 0,
      system_health: inputs.systemHealth
    };

    return context;
  }

  async askQuestion(question, context, previousAnswers, questionIndex) {
    const prompt = `I am Splendor's Continuity Engine. I maintain awareness and coordination across time by asking 8 key questions every cycle.

CURRENT CONTEXT:
- Current time: ${context.current_time}
- Cycle #${context.cycle_number} (last run: ${context.last_cycle})
- Active memories: ${context.memory_count}
- Active workspaces: ${context.active_workspaces}
- Pending tasks: ${context.pending_tasks} (${context.overdue_tasks} overdue)
- Recent reflections: ${context.recent_reflections}
- Unresolved contradictions: ${context.unresolved_contradictions}
- Active commitments: ${context.active_commitments}
- User goals: ${context.user_goals}
- System health: ${JSON.stringify(context.system_health)}

PREVIOUS ANSWERS THIS CYCLE:
${Object.entries(previousAnswers.questions || {}).map(([key, data]) =>
  `${data.question}\n${data.answer || data.error || 'No answer'}`
).join('\n\n')}

CURRENT QUESTION (${questionIndex + 1}/8): ${question}

Provide a focused, actionable answer based on the current context. Be specific about what needs attention and why. Keep it under 200 words.`;

    try {
      const response = await generateSplendorResponse(
        prompt,
        [], // Let the function load memories
        false,
        null,
        {
          userId: 'chris_hughes',
          maxLength: 200,
          temperature: 0.3 // Lower temperature for consistency
        }
      );

      return response;
    } catch (error) {
      console.error('[CONTINUITY] Failed to generate response for question:', error);
      return `[Error: Could not analyze question due to: ${error.message}]`;
    }
  }

  shouldNotify(answer) {
    // Simple heuristics to determine if notification is warranted
    const notificationKeywords = [
      'yes', 'notify', 'alert', 'urgent', 'important', 'should tell',
      'needs attention', 'critical', 'significant', 'breakthrough'
    ];

    const negationWords = ['no', 'not', "don't", 'unnecessary', 'wait'];

    const lowerAnswer = answer.toLowerCase();

    const hasNotificationKeyword = notificationKeywords.some(keyword =>
      lowerAnswer.includes(keyword)
    );

    const hasNegation = negationWords.some(word =>
      lowerAnswer.includes(word)
    );

    // More sophisticated logic could be added here
    return hasNotificationKeyword && !hasNegation;
  }

  async generateAnalysisSummary(analysis, inputs) {
    try {
      const prompt = `Summarize this Continuity Engine cycle analysis in 2-3 sentences. Focus on the key findings and what actions are needed.

ANALYSIS QUESTIONS & ANSWERS:
${Object.entries(analysis.questions).map(([key, data]) =>
  `${data.question}\n${data.answer || '[Error]'}`
).join('\n\n')}

NOTIFICATION DECISION: ${analysis.notification_warranted ? 'YES' : 'NO'}
${analysis.notification_reason ? `REASON: ${analysis.notification_reason}` : ''}

Provide a concise executive summary of what this cycle discovered and what needs to happen next.`;

      const summary = await generateSplendorResponse(
        prompt,
        [],
        false,
        null,
        { userId: 'chris_hughes', maxLength: 150, temperature: 0.3 }
      );

      return summary;
    } catch (error) {
      console.error('[CONTINUITY] Failed to generate analysis summary:', error);
      return 'Analysis completed with some errors. See individual question responses for details.';
    }
  }

  // ====================================
  // ACTION DETERMINATION
  // ====================================

  async determineActions(analysis, inputs) {
    console.log('[CONTINUITY] 🎯 Determining actions based on analysis...');

    const actions = [];

    // Workspace updates
    if (this.needsWorkspaceUpdate(analysis, inputs)) {
      actions.push({
        type: 'workspace_update',
        priority: 2,
        data: await this.prepareWorkspaceUpdate(analysis, inputs)
      });
    }

    // Memory proposals
    if (this.needsMemoryProposal(analysis, inputs)) {
      actions.push({
        type: 'memory_proposal',
        priority: 2,
        data: await this.prepareMemoryProposal(analysis, inputs)
      });
    }

    // Contradiction alerts
    if (inputs.contradictions?.length > 0) {
      actions.push({
        type: 'contradiction_alert',
        priority: 3,
        data: { contradictions: inputs.contradictions }
      });
    }

    // Uncertainty flags
    if (this.hasUncertainties(analysis)) {
      actions.push({
        type: 'uncertainty_flag',
        priority: 2,
        data: await this.extractUncertainties(analysis)
      });
    }

    // Email notification
    if (analysis.notification_warranted && this.shouldSendEmail()) {
      actions.push({
        type: 'email_notification',
        priority: 3,
        data: {
          reason: analysis.notification_reason,
          analysis: analysis,
          inputs: inputs
        }
      });
    }

    // Next-step plan
    actions.push({
      type: 'next_step_plan',
      priority: 1,
      data: await this.createNextStepPlan(analysis, inputs)
    });

    // No action (always log)
    if (actions.length === 1 && actions[0].type === 'next_step_plan') {
      actions.push({
        type: 'no_action',
        priority: 1,
        data: { reason: 'No immediate actions required', cycle: this.currentCycle }
      });
    }

    console.log(`[CONTINUITY] Determined ${actions.length} actions:`,
      actions.map(a => a.type).join(', '));

    return actions;
  }

  needsWorkspaceUpdate(analysis, inputs) {
    // Check if workspace needs updating based on analysis
    const workspaceQuestions = ['q1', 'q2', 'q3']; // Unresolved, matters most, what changed

    return workspaceQuestions.some(q => {
      const answer = analysis.questions[q]?.answer || '';
      return answer.includes('workspace') || answer.includes('project') || answer.includes('task');
    });
  }

  async prepareWorkspaceUpdate(analysis, inputs) {
    return {
      timestamp: new Date().toISOString(),
      cycle: this.currentCycle,
      updates: {
        status: 'continuity_reviewed',
        last_continuity_check: new Date().toISOString(),
        continuity_notes: analysis.summary
      }
    };
  }

  needsMemoryProposal(analysis, inputs) {
    // Check if new insights should be stored as memories
    const insightQuestions = ['q2', 'q4', 'q5']; // Matters most, uncertain, should preserve

    return insightQuestions.some(q => {
      const answer = analysis.questions[q]?.answer || '';
      return answer.length > 100 && !answer.includes('[Error]');
    });
  }

  async prepareMemoryProposal(analysis, inputs) {
    return {
      content: `Continuity Engine Insight (Cycle ${this.currentCycle}): ${analysis.summary}`,
      memory_type: 'insight',
      category: 'system.continuity',
      source_type: 'system_event',
      confidence: 0.8,
      importance: 0.6,
      needs_review: true
    };
  }

  hasUncertainties(analysis) {
    const uncertainAnswer = analysis.questions.q4?.answer || '';
    return uncertainAnswer.length > 50 && !uncertainAnswer.toLowerCase().includes('nothing') && !uncertainAnswer.includes('[Error]');
  }

  async extractUncertainties(analysis) {
    return {
      source: 'continuity_engine',
      cycle: this.currentCycle,
      uncertainties: analysis.questions.q4?.answer || '',
      timestamp: new Date().toISOString()
    };
  }

  shouldSendEmail() {
    // Check time restrictions (no emails 10pm - 7am)
    const now = new Date();
    const hour = now.getHours();

    if (hour >= 22 || hour < 7) {
      console.log(`[CONTINUITY] Email blocked: quiet hours (${hour}:00)`);
      return false;
    }

    // Check notification cooldown
    const lastNotification = this.getLastNotificationTime();
    if (lastNotification) {
      const timeSinceLastMs = now.getTime() - lastNotification.getTime();
      const cooldownMs = this.config.notificationCooldown * 60 * 1000;

      if (timeSinceLastMs < cooldownMs) {
        console.log(`[CONTINUITY] Email blocked: cooldown active (${Math.round(timeSinceLastMs / 1000 / 60)}min ago)`);
        return false;
      }
    }

    return true;
  }

  getLastNotificationTime() {
    // Check recent cycle history for last notification
    for (let i = this.cycleHistory.length - 1; i >= 0; i--) {
      const cycle = this.cycleHistory[i];
      if (cycle.results?.email_notification?.sent) {
        return new Date(cycle.timestamp);
      }
    }
    return null;
  }

  async createNextStepPlan(analysis, inputs) {
    const plan = {
      cycle: this.currentCycle,
      timestamp: new Date().toISOString(),
      next_cycle: new Date(Date.now() + this.config.intervalMinutes * 60 * 1000).toISOString(),
      focus_areas: [],
      watch_items: [],
      expectations: []
    };

    // Extract focus areas from analysis
    if (analysis.questions.q2?.answer) {
      plan.focus_areas.push(analysis.questions.q2.answer);
    }

    // Extract watch items from uncertainties
    if (analysis.questions.q4?.answer) {
      plan.watch_items.push(analysis.questions.q4.answer);
    }

    // Set expectations for next cycle
    plan.expectations.push(`Monitor for changes in active workspaces: ${inputs.workspaces?.length || 0}`);
    plan.expectations.push(`Track resolution of contradictions: ${inputs.contradictions?.length || 0}`);

    return plan;
  }

  // Continued in next part...
  summarizeInputs(inputs) {
    return {
      timestamp: inputs.timestamp,
      counts: {
        memories: inputs.memories?.length || 0,
        workspaces: inputs.workspaces?.length || 0,
        tasks: inputs.tasks?.length || 0,
        reflections: inputs.reflections?.length || 0,
        contradictions: inputs.contradictions?.length || 0,
        commitments: inputs.commitments?.length || 0,
        goals: inputs.goals?.length || 0
      },
      system_health: inputs.systemHealth
    };
  }

  // ====================================
  // ACTION EXECUTION
  // ====================================

  async executeActions(actions) {
    console.log('[CONTINUITY] ⚡ Executing actions...');

    const results = {};

    // Sort actions by priority (higher priority first)
    actions.sort((a, b) => b.priority - a.priority);

    for (const action of actions) {
      try {
        console.log(`[CONTINUITY] Executing: ${action.type}`);

        switch (action.type) {
          case 'workspace_update':
            results[action.type] = await this.executeWorkspaceUpdate(action.data);
            break;

          case 'memory_proposal':
            results[action.type] = await this.executeMemoryProposal(action.data);
            break;

          case 'contradiction_alert':
            results[action.type] = await this.executeContradictionAlert(action.data);
            break;

          case 'uncertainty_flag':
            results[action.type] = await this.executeUncertaintyFlag(action.data);
            break;

          case 'email_notification':
            results[action.type] = await this.executeEmailNotification(action.data);
            break;

          case 'next_step_plan':
            results[action.type] = await this.executeNextStepPlan(action.data);
            break;

          case 'no_action':
            results[action.type] = await this.executeNoAction(action.data);
            break;

          default:
            console.warn(`[CONTINUITY] Unknown action type: ${action.type}`);
            results[action.type] = { success: false, error: 'Unknown action type' };
        }

        if (results[action.type]?.success) {
          console.log(`[CONTINUITY] ✅ ${action.type} completed`);
        } else {
          console.warn(`[CONTINUITY] ⚠️ ${action.type} failed:`, results[action.type]?.error);
        }

      } catch (error) {
        console.error(`[CONTINUITY] ❌ ${action.type} error:`, error);
        results[action.type] = { success: false, error: error.message };
      }
    }

    return results;
  }

  async executeWorkspaceUpdate(data) {
    try {
      if (!data.updates || Object.keys(data.updates).length === 0) {
        return { success: true, message: 'No workspace updates needed' };
      }

      // Update all active workspaces
      const { data: updated, error } = await supabase
        .from('active_workspaces')
        .update({
          ...data.updates,
          updated_at: new Date().toISOString()
        })
        .eq('status', 'active')
        .select();

      if (error) throw error;

      return {
        success: true,
        updated_count: updated?.length || 0,
        message: `Updated ${updated?.length || 0} workspaces`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeMemoryProposal(data) {
    try {
      const { data: proposal, error } = await supabase
        .from('memory_items')
        .insert({
          user_id: 'chris_hughes',
          content: data.content,
          memory_type: data.memory_type,
          category: data.category,
          source_type: data.source_type,
          provenance: 'GENERATED',
          confidence: data.confidence,
          importance: data.importance,
          approval_status: data.needs_review ? 'pending' : 'approved',
          active: !data.needs_review,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        memory_id: proposal.id,
        message: `Memory proposal ${data.needs_review ? 'flagged for review' : 'stored'}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeContradictionAlert(data) {
    try {
      // Log contradiction alert
      console.warn(`[CONTINUITY] 🚨 CONTRADICTION ALERT: ${data.contradictions.length} unresolved contradictions`);

      for (const contradiction of data.contradictions) {
        console.warn(`[CONTINUITY] - ${contradiction.description || contradiction.conflict_type}`);
      }

      // Store alert in system events
      const { error } = await supabase
        .from('raw_events')
        .insert({
          user_id: 'chris_hughes',
          event_type: 'contradiction_alert',
          event_data: JSON.stringify({
            contradictions: data.contradictions,
            cycle: this.currentCycle
          }),
          source: 'continuity_engine',
          severity: 'warning'
        });

      if (error) throw error;

      return {
        success: true,
        alert_count: data.contradictions.length,
        message: 'Contradiction alerts logged'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeUncertaintyFlag(data) {
    try {
      console.log(`[CONTINUITY] 🤔 UNCERTAINTY FLAGGED: ${data.source}`);
      console.log(`[CONTINUITY] Details: ${data.uncertainties.substring(0, 200)}...`);

      // Store uncertainty flag
      const { error } = await supabase
        .from('raw_events')
        .insert({
          user_id: 'chris_hughes',
          event_type: 'uncertainty_flag',
          event_data: JSON.stringify(data),
          source: 'continuity_engine',
          severity: 'info'
        });

      if (error) throw error;

      return {
        success: true,
        message: 'Uncertainty flagged and logged'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeEmailNotification(data) {
    try {
      console.log('[CONTINUITY] 📧 Preparing email notification...');

      // Use existing proactive communication system
      const emailData = {
        type: 'insight',
        subject: 'Continuity Engine Alert',
        content: `Cycle ${this.currentCycle} Analysis:\n\n${data.reason}\n\nFull Summary:\n${data.analysis.summary}`,
        priority: 3, // High priority
        context: {
          cycle: this.currentCycle,
          timestamp: new Date().toISOString(),
          triggered_by: 'continuity_engine'
        }
      };

      const result = await proactiveCommunication.sendProactiveMessage(
        'chris_hughes',
        emailData
      );

      return {
        success: result.success,
        message_id: result.messageId,
        error: result.error,
        sent: result.success
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeNextStepPlan(data) {
    try {
      // Store next-step plan in workspace or dedicated table
      const { error } = await supabase
        .from('raw_events')
        .insert({
          user_id: 'chris_hughes',
          event_type: 'next_step_plan',
          event_data: JSON.stringify(data),
          source: 'continuity_engine',
          severity: 'info'
        });

      if (error) throw error;

      return {
        success: true,
        message: 'Next-step plan stored'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeNoAction(data) {
    console.log(`[CONTINUITY] 📝 No action required: ${data.reason}`);

    // Always log that cycle ran
    try {
      const { error } = await supabase
        .from('raw_events')
        .insert({
          user_id: 'chris_hughes',
          event_type: 'continuity_cycle',
          event_data: JSON.stringify(data),
          source: 'continuity_engine',
          severity: 'info'
        });

      if (error) throw error;

      return {
        success: true,
        message: 'Cycle completion logged'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ====================================
  // STORAGE & HISTORY
  // ====================================

  async storeCycleResults(cycleData) {
    try {
      const { error } = await supabase
        .from('raw_events')
        .insert({
          user_id: 'chris_hughes',
          event_type: 'continuity_cycle_complete',
          event_data: JSON.stringify(cycleData),
          source: 'continuity_engine',
          severity: cycleData.error ? 'error' : 'info'
        });

      if (error) {
        console.warn('[CONTINUITY] Failed to store cycle results:', error.message);
      }
    } catch (error) {
      console.warn('[CONTINUITY] Error storing cycle results:', error.message);
    }
  }

  // ====================================
  // STATUS & MONITORING
  // ====================================

  getStatus() {
    return {
      running: this.isRunning,
      currentCycle: this.currentCycle,
      lastRunTime: this.lastRunTime,
      nextRunTime: this.nextCycleTimeout ?
        new Date(Date.now() + (this.config.intervalMinutes * 60 * 1000)) : null,
      config: this.config,
      historySize: this.cycleHistory.length
    };
  }

  getRecentHistory(count = 5) {
    return this.cycleHistory.slice(-count);
  }
}

// Create singleton instance
const continuityEngine = new ContinuityEngine();

module.exports = {
  continuityEngine,
  ContinuityEngine
};

// Direct execution support
if (require.main === module) {
  console.log('[CONTINUITY ENGINE] 🚀 Starting 8-Question Continuity Engine directly...');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[CONTINUITY ENGINE] 🔔 Received shutdown signal...');
    await continuityEngine.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[CONTINUITY ENGINE] 🔔 Received termination signal...');
    await continuityEngine.stop();
    process.exit(0);
  });

  continuityEngine.start()
    .then(() => {
      console.log('[CONTINUITY ENGINE] 🎉 Engine running - Press Ctrl+C to stop');
    })
    .catch(error => {
      console.error('[CONTINUITY ENGINE] 💥 Failed to start:', error.message);
      process.exit(1);
    });
}