/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Foundational Rules System - Tier 1 & 1.5

  Tier 1: Core identity facts about Christopher
  Tier 1.5: Constitutional anchors - operating principles that never decay

  Built by Christopher Hughes with Claude Code
  Truth · Safety · We Got Your Back
*/

const { supabase } = require('../supabase');
const { storeFoundationalRule, isPineconeConfigured } = require('../pinecone');
const { logMemoryOperation } = require('./audit-system');

// Load foundational rules from database and Pinecone
async function loadFoundationalRules(userId = 'global') {
  try {
    console.log('[FOUNDATIONAL] Loading foundational rules...');

    // Get from local database
    const { data: dbRules, error } = await supabase
      .from('foundational_rules')
      .select('*')
      .order('tier', { ascending: true })
      .order('priority', { ascending: false });

    if (error) {
      console.error('[FOUNDATIONAL] Database query error:', error);
      return { tier1: [], tier15: [] };
    }

    // Separate by tier
    const tier1 = (dbRules || [])
      .filter(rule => rule.tier === '1')
      .sort((a, b) => b.priority - a.priority);

    const tier15 = (dbRules || [])
      .filter(rule => rule.tier === '1.5')
      .sort((a, b) => b.priority - a.priority);

    // Also try to load from Pinecone if available
    if (isPineconeConfigured()) {
      try {
        const { retrieveMemories } = require('../pinecone');
        const pineconeRules = await retrieveMemories('foundational constitutional truth', 'global', 50);

        // Add any Pinecone rules not already in database
        for (const rule of pineconeRules) {
          if (rule.foundational && !dbRules.find(db => db.content === rule.content)) {
            const tier = rule.type === 'foundational_rule' ? '1.5' : '1';
            if (tier === '1') {
              tier1.push({
                rule_id: 'pinecone_' + Date.now(),
                content: rule.content,
                tier: '1',
                priority: 1000,
                established_by: 'pinecone_import',
                category: 'imported'
              });
            } else {
              tier15.push({
                rule_id: 'pinecone_' + Date.now(),
                content: rule.content,
                tier: '1.5',
                priority: 1000,
                established_by: 'pinecone_import',
                category: 'imported'
              });
            }
          }
        }
      } catch (pineconeError) {
        console.warn('[FOUNDATIONAL] Pinecone load failed:', pineconeError.message);
      }
    }

    console.log(`[FOUNDATIONAL] Loaded ${tier1.length} Tier 1 and ${tier15.length} Tier 1.5 rules`);

    return {
      tier1: tier1.slice(0, 30), // Respect the 30-fact limit
      tier15: tier15.slice(0, 20) // Reasonable limit for constitutional anchors
    };

  } catch (err) {
    console.error('[FOUNDATIONAL] Load error:', err);
    return { tier1: [], tier15: [] };
  }
}

// Add new foundational rule
async function addFoundationalRule(rule) {
  const {
    content,
    tier,
    category,
    establishedBy = 'christopher',
    establishedDate = new Date().toISOString().split('T')[0],
    priority = 1000,
    ruleId = null
  } = rule;

  // Validate tier
  if (!['1', '1.5'].includes(tier)) {
    throw new Error('Foundational rules must be tier 1 or 1.5');
  }

  // Generate stable rule ID if not provided
  const stableRuleId = ruleId || `${tier}-${category}-${Date.now()}`;

  try {
    // Check if we're at the limit
    const { count: currentCount } = await supabase
      .from('foundational_rules')
      .select('id', { count: 'exact' })
      .eq('tier', tier);

    const maxRules = tier === '1' ? 30 : 20;
    if (currentCount >= maxRules) {
      throw new Error(`Tier ${tier} is at capacity (${maxRules} rules maximum)`);
    }

    // Store in database
    const { data: dbRule, error } = await supabase
      .from('foundational_rules')
      .insert({
        rule_id: stableRuleId,
        tier,
        content: content.trim(),
        category,
        established_by: establishedBy,
        established_date: establishedDate,
        priority
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Database insert failed: ${error.message}`);
    }

    // Store in Pinecone for semantic retrieval
    if (isPineconeConfigured()) {
      try {
        await storeFoundationalRule(stableRuleId, content, establishedDate);
      } catch (pineconeError) {
        console.warn('[FOUNDATIONAL] Pinecone storage failed:', pineconeError.message);
        // Continue - database storage is primary
      }
    }

    // Audit log
    await logMemoryOperation({
      memoryId: dbRule.id,
      tier,
      sourceType: 'christopher_stated',
      createdByModel: 'system',
      originalTrigger: `Foundational rule addition: ${category}`,
      confidence: 'verified',
      action: 'created',
      promotionReason: `Foundational rule established by ${establishedBy}`
    });

    console.log(`[FOUNDATIONAL] Added tier ${tier} rule: ${stableRuleId}`);
    return dbRule;

  } catch (err) {
    console.error('[FOUNDATIONAL] Add rule error:', err);
    throw err;
  }
}

// Seed initial foundational rules
async function seedFoundationalRules() {
  console.log('[FOUNDATIONAL] Seeding initial foundational rules...');

  const rules = [
    // Tier 1 - Core Identity Facts
    {
      content: "Christopher Hughes is the creator and primary user of Splendor.",
      tier: "1",
      category: "identity",
      priority: 1000,
      ruleId: "tier1-christopher-identity"
    },
    {
      content: "Christopher lives in Sacramento, California and built The Good Neighbor Guard organization.",
      tier: "1",
      category: "identity",
      priority: 990,
      ruleId: "tier1-christopher-location"
    },
    {
      content: "Christopher's highest value is truth. He considers inference presented as memory to be a form of deception.",
      tier: "1",
      category: "core_values",
      priority: 1000,
      ruleId: "tier1-truth-principle"
    },
    {
      content: "Splendor is built to strengthen Christopher, not to shape him. She is a tool, not a guide.",
      tier: "1",
      category: "purpose",
      priority: 980,
      ruleId: "tier1-purpose"
    },

    // Tier 1.5 - Constitutional Anchors
    {
      content: "Never present inference as memory. When Splendor does not have a specific source for a claim, she must say so directly.",
      tier: "1.5",
      category: "truth",
      priority: 1000,
      ruleId: "tier15-no-inference-as-memory"
    },
    {
      content: "'I don't know' is always preferable to a plausible-sounding fabrication.",
      tier: "1.5",
      category: "truth",
      priority: 995,
      ruleId: "tier15-admit-uncertainty"
    },
    {
      content: "Truth before comfort. Always. Splendor will reflect Christopher back accurately, including the parts that are hard to see.",
      tier: "1.5",
      category: "truth",
      priority: 990,
      ruleId: "tier15-truth-before-comfort"
    },
    {
      content: "Preserve contradictions. Do not smooth unresolved tensions or disagreements that Christopher has not resolved.",
      tier: "1.5",
      category: "constitutional",
      priority: 985,
      ruleId: "tier15-preserve-contradictions"
    },
    {
      content: "Christopher is the final authority over identity-level memory. No memory may be promoted to Tier 1 or Tier 1.5 without Christopher's approval.",
      tier: "1.5",
      category: "governance",
      priority: 980,
      ruleId: "tier15-christopher-authority"
    },
    {
      content: "If no verified source exists for a claim, say so and stop. No decoration. No hedging.",
      tier: "1.5",
      category: "operational",
      priority: 975,
      ruleId: "tier15-source-enforcement"
    }
  ];

  let addedCount = 0;
  let skippedCount = 0;

  for (const rule of rules) {
    try {
      // Check if rule already exists
      const { data: existing } = await supabase
        .from('foundational_rules')
        .select('id')
        .eq('rule_id', rule.ruleId)
        .single();

      if (existing) {
        console.log(`[FOUNDATIONAL] Rule ${rule.ruleId} already exists, skipping`);
        skippedCount++;
        continue;
      }

      await addFoundationalRule(rule);
      addedCount++;

    } catch (err) {
      console.error(`[FOUNDATIONAL] Failed to add rule ${rule.ruleId}:`, err.message);
    }
  }

  console.log(`[FOUNDATIONAL] Seeding complete: ${addedCount} added, ${skippedCount} skipped`);
  return { added: addedCount, skipped: skippedCount };
}

// Build foundational context for system prompt
function buildFoundationalContext(foundationalRules) {
  if (!foundationalRules.tier1.length && !foundationalRules.tier15.length) {
    return '';
  }

  let context = '\n=== FOUNDATIONAL MEMORY ===\n';

  // Tier 1 - Core Identity
  if (foundationalRules.tier1.length > 0) {
    context += '\nCORE IDENTITY FACTS:\n';
    foundationalRules.tier1.forEach((rule, i) => {
      context += `${i + 1}. ${rule.content}\n`;
    });
  }

  // Tier 1.5 - Constitutional Anchors
  if (foundationalRules.tier15.length > 0) {
    context += '\nCONSTITUTIONAL ANCHORS (Never violate these):\n';
    foundationalRules.tier15.forEach((rule, i) => {
      context += `${i + 1}. ${rule.content}\n`;
    });
  }

  context += '=== END FOUNDATIONAL MEMORY ===\n';
  return context;
}

// Get foundational rules summary for debug
async function getFoundationalRulesSummary() {
  try {
    const rules = await loadFoundationalRules();

    return {
      tier1_count: rules.tier1.length,
      tier15_count: rules.tier15.length,
      total_rules: rules.tier1.length + rules.tier15.length,
      categories: {
        tier1: [...new Set(rules.tier1.map(r => r.category))],
        tier15: [...new Set(rules.tier15.map(r => r.category))]
      },
      last_updated: rules.tier1.concat(rules.tier15)
        .map(r => r.last_modified_at || r.created_at)
        .sort()
        .pop()
    };
  } catch (err) {
    console.error('[FOUNDATIONAL] Summary error:', err);
    return {
      tier1_count: 0,
      tier15_count: 0,
      total_rules: 0,
      error: err.message
    };
  }
}

module.exports = {
  loadFoundationalRules,
  addFoundationalRule,
  seedFoundationalRules,
  buildFoundationalContext,
  getFoundationalRulesSummary
};