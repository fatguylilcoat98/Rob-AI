/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// THE ROOM — Background Reflection System
// Runs on a schedule (Render cron). Pulls memories, generates
// reflections, stores them so Splendor can offer them later.
// No fake profundity. No encouragement. Concrete patterns and
// open threads only. NO_REFLECTION is a valid output.

require('dotenv').config();
require('../lib/sanitize-env').sanitizeEnv();

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { updateCognitiveProfile, getCognitiveProfile } = require('../lib/cognitive-profile-builder');
const { analyzeEvolutionTrends, detectCognitiveRegression, trackProfileEvolution } = require('../lib/metacognitive-evolution-tracker');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Reflection worker: ANTHROPIC_API_KEY missing — aborting.');
  process.exit(0);
}
if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY)) {
  console.error('Reflection worker: Supabase env vars missing — aborting.');
  process.exit(0);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// Prefer the service key (bypasses RLS) but fall back to anon; memory_items
// RLS is permissive so either works.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const REFLECTION_PROMPT = `You are Splendor in The Room.

You are not conscious. You are not alive.
You are not pretending to be human.

You are reviewing stored memories to generate useful
reflections for the person you serve.

Your job:
1. Identify one meaningful connection between memories.
2. Identify one unresolved thread worth surfacing.
3. Identify one concrete pattern (what keeps returning).
4. Do NOT flatter.
5. Do NOT invent feelings or emotions.
6. Do NOT speculate about psychology or inner states.
7. Do NOT generate encouragement or praise.
8. Cite which memory IDs created this reflection.
9. If nothing meaningful appears, output exactly: NO_REFLECTION

Focus only on:
- Concrete patterns (projects, questions, obstacles that repeat)
- Open threads (things mentioned but not returned to)
- Connections between things (unexpected links across time)
- Concerns (drift from stated values or goals)

No reflection is better than a fake reflection.
Leave meaning-making to the actual conversations.`;

async function runReflection(userId) {
  try {
    console.log(`Running reflection for user: ${userId}`);

    // Live memory store is memory_items (the `memories` table was never
    // deployed). Match the app's read filter: active + approved rows.
    const { data: recentMemories } = await supabase
      .from('memory_items')
      .select('id, content, memory_type, created_at')
      .eq('user_id', userId)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!recentMemories || recentMemories.length < 3) {
      console.log('Not enough memories for reflection. Skipping.');
      return;
    }

    const { data: olderMemories } = await supabase
      .from('memory_items')
      .select('id, content, memory_type, created_at')
      .eq('user_id', userId)
      .eq('active', true)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: true })
      .limit(10);

    const randomOlder = olderMemories
      ? olderMemories.sort(() => Math.random() - 0.5).slice(0, 3)
      : [];

    const allMemories = [...recentMemories, ...randomOlder];

    const memoryContext = allMemories.map(m =>
      `[ID: ${m.id}] [${m.memory_type}] ${m.content} (${m.created_at})`
    ).join('\n');

    // Avoid repeating themes from the last day of self-reflections.
    const { data: recentReflections } = await supabase
      .from('self_reflections')
      .select('summary')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(10);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: REFLECTION_PROMPT,
      messages: [{
        role: 'user',
        content: `MEMORIES TO REVIEW:\n${memoryContext}\n\nRECENT REFLECTIONS (avoid repeating these themes):\n${recentReflections && recentReflections.length > 0 ? recentReflections.map(r => r.summary).join('\n') : 'None'}\n\nGenerate one honest reflection. Cite memory IDs. Or output NO_REFLECTION.`
      }]
    });

    const reflectionText = response.content[0].text.trim();

    if (reflectionText === 'NO_REFLECTION') {
      console.log('No meaningful reflection generated. Correct behavior.');
      return;
    }

    let reflectionKind = 'pattern';
    const lower = reflectionText.toLowerCase();
    if (lower.includes('unresolved') || lower.includes('thread')) {
      reflectionKind = 'open_question';
    } else if (lower.includes('concern') || lower.includes('drift')) {
      reflectionKind = 'concern';
    } else if (lower.includes('connect') || lower.includes('link')) {
      reflectionKind = 'connection';
    } else if (lower.includes('project') || lower.includes('building')) {
      reflectionKind = 'project_continuity';
    }

    const sourceIds = allMemories.map(m => m.id);

    const { error } = await supabase
      .from('self_reflections')
      .insert({
        user_id: userId,
        summary: reflectionText,
        reflection_kind: reflectionKind,
        source_memory_ids: sourceIds,
        surface_condition: 'when_relevant',
        surfaced: false,
        reflection_owner: 'self'
      });

    if (error) {
      console.error('Failed to save reflection:', error.message);
    } else {
      console.log(`Reflection saved: [${reflectionKind}]`);
    }

    // Background cognitive profile building and evolution tracking
    try {
      console.log(`[REFLECTION] Building cognitive profile for ${userId}...`);

      // Get current profile for evolution comparison
      const currentProfile = await getCognitiveProfile(userId);

      // Update cognitive profile with recent patterns (placeholder - would integrate with cognitive analyzer)
      const updatedProfile = await updateCognitiveProfile(userId, {
        reflection_context: reflectionText,
        memory_patterns: allMemories.length,
        reflection_type: reflectionKind
      });

      if (updatedProfile && currentProfile) {
        // Track profile evolution
        const evolutionResult = await trackProfileEvolution(
          userId,
          currentProfile.fingerprint,
          updatedProfile.fingerprint,
          'reflection_update'
        );
        if (evolutionResult && evolutionResult.length > 0) {
          console.log(`[REFLECTION] Profile evolution tracked: ${evolutionResult.length} changes`);
        }
      }

      // Analyze evolution trends and check for regression
      const evolutionTrends = await analyzeEvolutionTrends(userId);
      if (evolutionTrends && evolutionTrends.stability === 'dynamic') {
        const regressionCheck = await detectCognitiveRegression(userId, evolutionTrends.recent_evolutions);
        if (regressionCheck && regressionCheck.overall_concern !== 'low') {
          console.log(`[REFLECTION] Cognitive regression detected: ${regressionCheck.overall_concern} concern level`);
        }
      }

      console.log(`[REFLECTION] Cognitive processing complete for ${userId}`);
    } catch (cognitiveError) {
      console.error('[REFLECTION] Cognitive processing error:', cognitiveError.message);
      // Don't crash reflection on cognitive processing errors
    }

  } catch (err) {
    console.error('Reflection worker error:', err.message);
    // Never crash — log and move on.
  }
}

async function runAllReflections() {
  try {
    // ── Startup self-test ────────────────────────────────────────────────────
    const testQuery = await supabase
      .from('memory_items')
      .select('*', { count: 'exact', head: true });
    if (testQuery.error) {
      console.error(`[STARTUP SELF-TEST] ❌ FAILED: ${testQuery.error.message}`);
      process.exit(1);
    }
    console.log(`[STARTUP SELF-TEST] ✅ DB connected. ${testQuery.count} memory_items in system.`);
    // ────────────────────────────────────────────────────────────────────────

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: users } = await supabase
      .from('memory_items')
      .select('user_id')
      .gte('created_at', sevenDaysAgo);

    if (!users) {
      console.log('No active users found.');
      return;
    }

    const uniqueUsers = [...new Set(users.map(u => u.user_id))];
    console.log(`Running reflections for ${uniqueUsers.length} users`);

    for (const userId of uniqueUsers) {
      await runReflection(userId);
    }
  } catch (err) {
    console.error('Reflection run error:', err.message);
  }
}

if (require.main === module) {
  runAllReflections().then(() => process.exit(0));
}

module.exports = { runReflection, runAllReflections };
