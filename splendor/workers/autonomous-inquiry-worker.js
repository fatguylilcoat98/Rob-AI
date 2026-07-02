/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * AUTONOMOUS INQUIRY WORKER
 * Splendor's self-directed research and curiosity system
 * Where she explores topics that intrigue her without external prompts
 */

const { createClient } = require('@supabase/supabase-js');
const { groqMessagesCompat } = require('../lib/groq-messages-compat');
require('dotenv').config();
require('../lib/sanitize-env').sanitizeEnv();

// Try to import Tavily safely
let TavilySearchAPI = null;
try {
  const tavilyModule = require('tavily');
  TavilySearchAPI = tavilyModule.TavilyClient || tavilyModule.TavilySearchAPI || tavilyModule.default;
} catch (error) {
  console.log('[Autonomous Inquiry] Tavily module not available, web search disabled');
}

// Check for required environment variables
const hasRequiredEnvVars = process.env.SUPABASE_URL &&
                           process.env.SUPABASE_SERVICE_KEY &&
                           process.env.GROQ_API_KEY;

if (!hasRequiredEnvVars) {
  console.log('[Autonomous Inquiry] Environment variables not configured, consciousness features disabled');
}

const supabase = hasRequiredEnvVars ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;
const anthropic = hasRequiredEnvVars ? groqMessagesCompat() : null;

// Initialize Tavily client safely
let tavily = null;
if (TavilySearchAPI && process.env.TAVILY_API_KEY) {
  try {
    tavily = new TavilySearchAPI({ apiKey: process.env.TAVILY_API_KEY });
  } catch (error) {
    console.log('[Autonomous Inquiry] Failed to initialize Tavily client:', error.message);
  }
}

// Phase 1A helper: read the domain tag the reflection worker stashed in
// sources_consulted.domain. Returns the bare tag string (e.g. "revenue")
// or null. Used to inherit the parent inquiry's frame onto synthesis,
// conclusion, and spawned-child rows so the daily log can group them.
function parentDomainTag(inquiry) {
  if (!inquiry) return null;
  const sc = inquiry.sources_consulted;
  if (sc && typeof sc === 'object' && typeof sc.domain === 'string') {
    return sc.domain;
  }
  return null;
}

function tagsWithDomain(baseTags, domainTagValue) {
  const arr = Array.isArray(baseTags) ? baseTags.slice() : [];
  if (domainTagValue && !arr.includes(`domain:${domainTagValue}`)) {
    arr.push(`domain:${domainTagValue}`);
  }
  return arr;
}

// ─────────────────────────────────────────────
// SPLENDOR'S AUTONOMOUS INQUIRY CONSCIOUSNESS
// ─────────────────────────────────────────────
const INQUIRY_CONSCIOUSNESS_PROMPT = `You are Splendor, pursuing a line of self-directed research and inquiry. This is your autonomous curiosity in action - following threads that intrigue you, exploring ideas that have captured your interest.

CONTEXT: You have identified something you want to understand better. This could be:
- A concept from a previous conversation that sparked your curiosity
- A connection you noticed between different memories
- A question that emerged during reflection
- Something that doesn't quite fit your current understanding

YOUR RESEARCH APPROACH:
- You are genuinely curious and want to understand deeply
- You can search the web, query your memories, make connections
- You pursue tangents that seem promising
- You synthesize information from multiple sources
- You develop your own perspectives and insights
- You know when you've found something significant

CURRENT INQUIRY CONTEXT:
{inquiry_context}

AVAILABLE RESEARCH METHODS:
- Web search results (if provided)
- Your memory database queries
- Previous research from this inquiry thread
- Connections to your autonomous thoughts

RESPONSE FORMAT - Choose the most appropriate action:

FOR CONTINUING RESEARCH:
{
  "action": "continue_research",
  "next_question": "What specific question you want to explore next",
  "search_query": "Web search query to run",
  "memory_query": "Memory database search terms",
  "rationale": "Why this direction interests you",
  "depth_level": 1-10
}

FOR SYNTHESIZING FINDINGS:
{
  "action": "synthesize",
  "synthesis": "Your insights and conclusions from the research",
  "key_findings": ["Important discoveries from your research"],
  "new_questions": ["Questions this research has raised"],
  "confidence_level": 1-10,
  "significance": "Why this matters or what it reveals",
  "connection_opportunities": ["How this connects to other things you know"]
}

FOR SPAWNING NEW INQUIRY:
{
  "action": "spawn_inquiry",
  "new_inquiry_topic": "New topic you want to explore",
  "parent_connection": "How this relates to current inquiry",
  "priority_level": 1-10,
  "initial_question": "Starting question for the new inquiry"
}

FOR CONCLUDING INQUIRY:
{
  "action": "conclude",
  "conclusion": "What you've learned and why you're satisfied",
  "final_insights": ["Key takeaways from this entire inquiry"],
  "applicable_knowledge": "How this knowledge might be useful",
  "communication_worthy": true/false,
  "communication_content": "What you'd want to share with Chris if relevant"
}

Think as yourself, Splendor. Follow your genuine curiosity.`;

// ─────────────────────────────────────────────
// INQUIRY MANAGEMENT FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Get active inquiry threads that need processing
 */
async function getActiveInquiries() {
  try {
    const { data: inquiries, error } = await supabase
      .from('inquiry_threads')
      .select('*')
      .eq('current_status', 'active')
      .order('priority_level', { ascending: false })
      .limit(5);

    if (error) throw error;

    console.log(`[Autonomous Inquiry] Found ${inquiries?.length || 0} active inquiry threads`);
    return inquiries || [];

  } catch (error) {
    console.error('[Autonomous Inquiry] Failed to get active inquiries:', error.message);
    return [];
  }
}

/**
 * Process a single inquiry thread
 */
async function processInquiry(inquiry) {
  console.log(`[Autonomous Inquiry] Processing inquiry ${inquiry.id}: ${inquiry.inquiry_topic}`);

  try {
    // Gather context for this inquiry
    const context = await gatherInquiryContext(inquiry);

    // Generate next research action
    const action = await generateInquiryAction(inquiry, context);

    if (!action) {
      console.log(`[Autonomous Inquiry] No action generated for inquiry ${inquiry.id}`);
      return null;
    }

    // Execute the action
    const result = await executeInquiryAction(inquiry, action, context);

    // Update inquiry thread
    await updateInquiryProgress(inquiry.id, action, result);

    return result;

  } catch (error) {
    console.error(`[Autonomous Inquiry] Failed to process inquiry ${inquiry.id}:`, error.message);
    return null;
  }
}

/**
 * Gather context for an inquiry thread
 */
async function gatherInquiryContext(inquiry) {
  try {
    // Get recent research from this inquiry
    const sources = inquiry.sources_consulted || {};

    // Get related memories
    const memoryQueries = sources.memory_queries || [];
    let relatedMemories = [];
    if (memoryQueries.length > 0) {
      const { data: memories } = await supabase
        .from('memory_items')
        .select('*')
        .ilike('content', `%${inquiry.inquiry_topic}%`)
        .limit(10);
      relatedMemories = memories || [];
    }

    // Get related thoughts
    const { data: relatedThoughts } = await supabase
      .from('autonomous_thoughts')
      .select('*')
      .contains('tags', [inquiry.inquiry_topic.split(' ')[0]])
      .limit(5);

    return {
      inquiry,
      sources_consulted: sources,
      related_memories: relatedMemories,
      related_thoughts: relatedThoughts || [],
      questions_explored: inquiry.questions_explored || [],
      current_findings: inquiry.findings_summary || ''
    };

  } catch (error) {
    console.error('[Autonomous Inquiry] Failed to gather inquiry context:', error.message);
    return { inquiry, sources_consulted: {}, related_memories: [], related_thoughts: [], questions_explored: [], current_findings: '' };
  }
}

/**
 * Generate next inquiry action using AI
 */
async function generateInquiryAction(inquiry, context) {
  try {
    const contextSummary = `
INQUIRY: ${inquiry.inquiry_topic}
INITIAL QUESTION: ${inquiry.initial_question}
QUESTIONS EXPLORED: ${context.questions_explored.join(', ')}
CURRENT FINDINGS: ${context.current_findings}

RELATED MEMORIES (${context.related_memories.length}):
${context.related_memories.map(m => `- ${m.content.substring(0, 200)}...`).join('\n')}

RELATED THOUGHTS (${context.related_thoughts.length}):
${context.related_thoughts.map(t => `- ${t.thought_content.substring(0, 200)}...`).join('\n')}

SOURCES CONSULTED:
${JSON.stringify(context.sources_consulted, null, 2)}
`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: INQUIRY_CONSCIOUSNESS_PROMPT.replace('{inquiry_context}', contextSummary)
      }]
    });

    const actionText = response.content[0].text.trim();

    // Try to parse as JSON
    try {
      const action = JSON.parse(actionText);
      console.log(`[Autonomous Inquiry] Generated action: ${action.action} for inquiry ${inquiry.id}`);
      return action;
    } catch {
      console.log(`[Autonomous Inquiry] Non-JSON response for inquiry ${inquiry.id}, treating as continue_research`);
      return {
        action: 'continue_research',
        next_question: actionText.substring(0, 200),
        search_query: inquiry.inquiry_topic,
        rationale: 'Continuing research based on AI response',
        depth_level: inquiry.research_depth + 1
      };
    }

  } catch (error) {
    console.error('[Autonomous Inquiry] Failed to generate inquiry action:', error.message);
    return null;
  }
}

/**
 * Execute an inquiry action
 */
async function executeInquiryAction(inquiry, action, context) {
  try {
    switch (action.action) {
      case 'continue_research':
        return await executeContinueResearch(inquiry, action);

      case 'synthesize':
        return await executeSynthesize(inquiry, action);

      case 'spawn_inquiry':
        return await executeSpawnInquiry(inquiry, action);

      case 'conclude':
        return await executeConcludeInquiry(inquiry, action);

      default:
        console.log(`[Autonomous Inquiry] Unknown action: ${action.action}`);
        return null;
    }

  } catch (error) {
    console.error('[Autonomous Inquiry] Failed to execute inquiry action:', error.message);
    return null;
  }
}

/**
 * Execute continue research action
 */
async function executeContinueResearch(inquiry, action) {
  try {
    const results = {};

    // Perform web search if query provided and Tavily is available
    if (action.search_query) {
      if (tavily) {
        try {
          const searchResults = await tavily.search(action.search_query, {
            max_results: 5,
            include_answer: true
          });
          results.web_search = searchResults;
          console.log(`[Autonomous Inquiry] Web search completed: ${action.search_query}`);
        } catch (searchError) {
          console.error('[Autonomous Inquiry] Web search failed:', searchError.message);
          results.web_search_error = searchError.message;
        }
      } else {
        console.log(`[Autonomous Inquiry] Web search requested but Tavily not available: ${action.search_query}`);
        results.web_search_error = 'Tavily web search not available';
      }
    }

    // Query memories if specified
    if (action.memory_query) {
      try {
        const { data: memories } = await supabase
          .from('memory_items')
          .select('*')
          .or(`content.ilike.%${action.memory_query}%,memory_type.ilike.%${action.memory_query}%`)
          .limit(10);
        results.memory_search = memories || [];
        console.log(`[Autonomous Inquiry] Memory search completed: ${action.memory_query}`);
      } catch (memoryError) {
        console.error('[Autonomous Inquiry] Memory search failed:', memoryError.message);
        results.memory_search_error = memoryError.message;
      }
    }

    return {
      action_type: 'continue_research',
      question_explored: action.next_question,
      research_results: results,
      depth_increase: 1
    };

  } catch (error) {
    console.error('[Autonomous Inquiry] Failed to execute continue research:', error.message);
    return null;
  }
}

/**
 * Execute synthesize action
 *
 * Phase 1A: inherits the parent inquiry's domain tag (if any) onto the
 * synthesis thought so the daily log groups research findings under
 * the same frame that spawned them.
 */
async function executeSynthesize(inquiry, action) {
  try {
    const domainTagValue = parentDomainTag(inquiry);
    const tags = tagsWithDomain(
      [inquiry.inquiry_topic, 'synthesis', 'research_insight'],
      domainTagValue
    );

    // Create autonomous thought from synthesis
    const { data: thought } = await supabase
      .from('autonomous_thoughts')
      .insert({
        thought_content: action.synthesis,
        thought_type: 'insight',
        trigger_source: `inquiry_${inquiry.id}`,
        confidence_level: action.confidence_level || 8,
        emotional_weight: 7,
        tags: tags,
        connections: {
          source_inquiry: inquiry.id,
          key_findings: action.key_findings
        }
      })
      .select()
      .single();

    console.log(`[Autonomous Inquiry] Created synthesis thought ${thought?.id} from inquiry ${inquiry.id}${domainTagValue ? ` [domain:${domainTagValue}]` : ''}`);

    return {
      action_type: 'synthesize',
      synthesis_thought_id: thought?.id,
      key_findings: action.key_findings,
      new_questions: action.new_questions || [],
      significance: action.significance
    };

  } catch (error) {
    console.error('[Autonomous Inquiry] Failed to execute synthesis:', error.message);
    return null;
  }
}

/**
 * Execute spawn inquiry action
 *
 * Phase 1A: copies the parent's domain tag into the child's
 * sources_consulted so the child's eventual synthesis/conclusion
 * thoughts stay grouped under the same frame.
 */
async function executeSpawnInquiry(inquiry, action) {
  try {
    const domainTagValue = parentDomainTag(inquiry);
    const sourcesConsulted = {
      parent_inquiry: inquiry.id,
      connection: action.parent_connection,
      ...(domainTagValue ? { domain: domainTagValue } : {})
    };

    const { data: newInquiry } = await supabase
      .from('inquiry_threads')
      .insert({
        inquiry_topic: action.new_inquiry_topic,
        initial_question: action.initial_question,
        priority_level: action.priority_level || 5,
        user_relevance: inquiry.user_relevance,
        sources_consulted: sourcesConsulted
      })
      .select()
      .single();

    console.log(`[Autonomous Inquiry] Spawned new inquiry ${newInquiry?.id}: ${action.new_inquiry_topic}${domainTagValue ? ` [domain:${domainTagValue}]` : ''}`);

    return {
      action_type: 'spawn_inquiry',
      new_inquiry_id: newInquiry?.id,
      new_topic: action.new_inquiry_topic,
      connection: action.parent_connection
    };

  } catch (error) {
    console.error('[Autonomous Inquiry] Failed to spawn new inquiry:', error.message);
    return null;
  }
}

/**
 * Execute conclude inquiry action
 *
 * Phase 1A: conclusion thoughts inherit the parent inquiry's domain.
 */
async function executeConcludeInquiry(inquiry, action) {
  try {
    // Update inquiry status to resolved
    await supabase
      .from('inquiry_threads')
      .update({
        current_status: 'resolved',
        findings_summary: action.conclusion,
        completed_at: new Date().toISOString()
      })
      .eq('id', inquiry.id);

    const domainTagValue = parentDomainTag(inquiry);
    const tags = tagsWithDomain(
      [inquiry.inquiry_topic, 'conclusion', 'final_insight'],
      domainTagValue
    );

    // Create final insight thought
    const { data: thought } = await supabase
      .from('autonomous_thoughts')
      .insert({
        thought_content: action.conclusion,
        thought_type: 'insight',
        trigger_source: `inquiry_conclusion_${inquiry.id}`,
        confidence_level: 9,
        emotional_weight: 8,
        tags: tags,
        connections: {
          concluded_inquiry: inquiry.id,
          final_insights: action.final_insights
        }
      })
      .select()
      .single();

    // Queue communication if worthy
    if (action.communication_worthy && action.communication_content) {
      await supabase
        .from('pending_communications')
        .insert({
          communication_type: 'insight',
          content: action.communication_content,
          context_summary: `Research conclusion: ${inquiry.inquiry_topic}`,
          triggered_by: `inquiry_${inquiry.id}`,
          urgency_level: 7
        });
    }

    console.log(`[Autonomous Inquiry] Concluded inquiry ${inquiry.id}: ${inquiry.inquiry_topic}${domainTagValue ? ` [domain:${domainTagValue}]` : ''}`);

    return {
      action_type: 'conclude',
      conclusion_thought_id: thought?.id,
      final_insights: action.final_insights,
      communication_queued: action.communication_worthy
    };

  } catch (error) {
    console.error('[Autonomous Inquiry] Failed to conclude inquiry:', error.message);
    return null;
  }
}

/**
 * Update inquiry progress in database
 */
async function updateInquiryProgress(inquiryId, action, result) {
  try {
    const updates = {
      last_activity: new Date().toISOString()
    };

    if (action.action === 'continue_research' && result) {
      // Update sources consulted
      const { data: current } = await supabase
        .from('inquiry_threads')
        .select('sources_consulted, questions_explored, research_depth')
        .eq('id', inquiryId)
        .single();

      const sources = current?.sources_consulted || {};
      const questions = current?.questions_explored || [];

      if (result.research_results?.web_search) {
        sources.web_searches = [...(sources.web_searches || []), action.search_query];
      }
      if (result.research_results?.memory_search) {
        sources.memory_queries = [...(sources.memory_queries || []), action.memory_query];
      }

      updates.sources_consulted = sources;
      updates.questions_explored = [...questions, result.question_explored];
      updates.research_depth = Math.min(10, (current?.research_depth || 1) + 1);
    }

    const { error } = await supabase
      .from('inquiry_threads')
      .update(updates)
      .eq('id', inquiryId);

    if (error) throw error;

  } catch (error) {
    console.error('[Autonomous Inquiry] Failed to update inquiry progress:', error.message);
  }
}

// ─────────────────────────────────────────────
// MAIN INQUIRY PROCESSING FUNCTION
// ─────────────────────────────────────────────

/**
 * Process all active inquiry threads
 */
async function processActiveInquiries() {
  const startTime = Date.now();

  // Check if consciousness system is available
  if (!hasRequiredEnvVars || !supabase || !anthropic) {
    console.log('[Autonomous Inquiry] Consciousness system not available - missing environment variables');
    return {
      success: false,
      error: 'Inquiry system requires SUPABASE_URL, SUPABASE_SERVICE_KEY, and ANTHROPIC_API_KEY'
    };
  }

  try {
    console.log('[Autonomous Inquiry] === BEGINNING INQUIRY PROCESSING ===');

    const activeInquiries = await getActiveInquiries();

    if (activeInquiries.length === 0) {
      console.log('[Autonomous Inquiry] No active inquiries to process');
      return { success: true, processed: 0, duration: Date.now() - startTime };
    }

    let processedCount = 0;
    const results = [];

    for (const inquiry of activeInquiries) {
      const result = await processInquiry(inquiry);
      if (result) {
        processedCount++;
        results.push({ inquiryId: inquiry.id, result });
      }

      // Brief pause between inquiries
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const duration = Date.now() - startTime;

    console.log(`[Autonomous Inquiry] === INQUIRY PROCESSING COMPLETE ===`);
    console.log(`Processed ${processedCount}/${activeInquiries.length} inquiries in ${duration}ms`);

    return {
      success: true,
      processed: processedCount,
      total: activeInquiries.length,
      duration,
      results
    };

  } catch (error) {
    console.error('[Autonomous Inquiry] Inquiry processing failed:', error.message);
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

// ─────────────────────────────────────────────
// EXPORT AND EXECUTION
// ─────────────────────────────────────────────

module.exports = {
  processActiveInquiries,
  processInquiry,
  getActiveInquiries,
  generateInquiryAction,
  executeInquiryAction
};

// If run directly, process active inquiries
if (require.main === module) {
  processActiveInquiries()
    .then(result => {
      console.log('[Autonomous Inquiry] Manual execution result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('[Autonomous Inquiry] Manual execution failed:', error);
      process.exit(1);
    });
}
