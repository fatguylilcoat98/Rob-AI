/**
 * ENHANCED MEMORY INTEGRATION - JavaScript Version
 * Complete integration of memory services with web search
 */

const { createClient } = require('@supabase/supabase-js');
const { generateSplendorResponse, streamSplendorResponse } = require('./anthropic');
const { stringToUUID, storeMemory } = require('./supabase');
const { activityBus } = require('./activity-bus');
const { evaluateTurn: evaluateInterpretationTurn } = require('./interpretation-engine');
const { analyzeAndPersist: analyzeEmotionalPattern } = require('./emotional-pattern-analyzer');
let recordMetric = () => {};
try { ({ recordMetric } = require('./behavioral-metrics')); } catch (_) { /* optional */ }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Idempotent: leaves a real UUID alone, hashes anything else into one.
// memory_items.user_id (and friends) are UUID columns, so we can never
// pass a raw string handle like "default-user" through to Supabase.
function ensureUUID(id) {
  if (typeof id === 'string' && UUID_RE.test(id)) return id;
  return stringToUUID(id);
}

class EnhancedMemorySystem {
  constructor(config) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.tavilyApiKey = config.tavilyApiKey;

    // Create memoryServices object for compatibility
    this.memoryServices = {
      retrieval: {
        retrieveMemoryContext: this.retrieveMemoryContext.bind(this)
      },
      write: {
        writeMemory: this.writeMemory.bind(this)
      }
    };
  }

  /**
   * Enhanced conversation processing with memory and web search.
   * v15.18.3 — options.imageData (base64 JPEG, no data: prefix) routes
   * through to Claude's vision input so Splendor can actually SEE the
   * photo, not just be told one was taken.
   */
  async processConversation(userId, userMessage, sessionId, workspaceId, options = {}) {
    const { imageData = null, identityContext = '', accountabilityContext = '', isOwner = false, guestSession = false } = options || {};
    const _aiCallStart = Date.now();
    try { activityBus.emit('ai:call:start', { surface: 'enhanced-chat' }); } catch (_) {}
    try {
      userId = ensureUUID(userId);
      // 1. Record user message
      await this.recordUserMessage(userId, userMessage, sessionId);

      // 2. Check if web search is needed
      const needsWebSearch = this.shouldSearchWeb(userMessage);

      // 3. Get existing memory context (simplified)
      const memoryContext = await this.getSimpleMemoryContext(userId, userMessage, workspaceId);

      // 4. Perform web search if needed
      let webSearchResults = [];
      if (needsWebSearch && this.tavilyApiKey) {
        webSearchResults = await this.performWebSearch(userId, userMessage);
      }

      // 5. Build context
      const context = {
        ...memoryContext,
        webSearchResults,
        hasWebSearch: webSearchResults.length > 0
      };

      // 6. Generate response.
      //   v15.17.1 — reflexive layer.  v15.17.2 — contradiction check.
      //   v15.18.0 — premise check.    v15.18.1 — self-audit on request.
      // Premise lands at the top of the system prompt; if Chris asks
      // her to audit herself the self-audit block lands above THAT.
      const { loadReflexiveContext, checkContradictions, checkPremises } = require('./interpretation-engine');
      const { isSelfAuditRequest, buildManifest, buildSelfAuditPromptBlock } = require('./self-manifest');
      const auditRequested = isSelfAuditRequest(userMessage);
      const [selfReflectionRaw, contradictionResult, premiseResult, manifest] = await Promise.all([
        loadReflexiveContext(userId).catch(() => ''),
        checkContradictions(userId, userMessage).catch(() => ({ contradictions: [], promptBlock: '' })),
        checkPremises(userId, userMessage).catch(() => ({ presuppositions: [], promptBlock: '' })),
        auditRequested ? buildManifest(userId).catch(() => null) : Promise.resolve(null),
      ]);
      const auditBlock = manifest ? buildSelfAuditPromptBlock(manifest) : '';
      const selfReflection =
        auditBlock +
        (premiseResult.promptBlock || '') +
        (contradictionResult.promptBlock || '') +
        (selfReflectionRaw || '');
      if (contradictionResult && Array.isArray(contradictionResult.contradictions) && contradictionResult.contradictions.length) {
        try { recordMetric(userId, 'contradiction_caught', contradictionResult.contradictions.length, { source: 'enhanced_memory' }); } catch (_) { /* best-effort */ }
      }
      const response = await this.generateResponse(context, userMessage, selfReflection, imageData, { identityContext, accountabilityContext, isOwner, guestSession });

      // 7. Record assistant response
      await this.recordAssistantResponse(userId, response, sessionId, workspaceId);

      // 8. Persist the chat turn to memory_items so it shows up in
      //    the Provenance Stream. The enhanced path previously only
      //    wrote to the `conversations` table, which the oracle UI
      //    never reads — so memories appeared empty. storeMemory()
      //    handles UUID conversion + the standard provenance fields.
      storeMemory(userId, `User: ${userMessage}`, 'shared_history', 'user.general', {
        source_type: 'user_direct_statement',
        session_id: sessionId,
        creation_reason: 'enhanced_chat_user_turn'
      }).catch(e => console.error('Memory storage (user) failed:', e.message));
      storeMemory(userId, `Splendor: ${response}`, 'shared_history', 'user.general', {
        source_type: 'conversation',
        session_id: sessionId,
        creation_reason: 'enhanced_chat_assistant_turn'
      }).catch(e => console.error('Memory storage (assistant) failed:', e.message));

      // Continuity Core (v15.17.0): fire-and-forget belief audit. Never
      // blocks the user-visible reply; logs are the only surface if it
      // misbehaves.
      evaluateInterpretationTurn({
        userId, userMessage, assistantResponse: response, surface: 'chat',
      }).catch(e => console.warn('[interp] dispatch failed:', e && e.message));
      analyzeEmotionalPattern({
        userId, userMessage, assistantResponse: response, surface: 'chat',
      }).catch(e => console.warn('[emotional] dispatch failed:', e && e.message));

      try {
        activityBus.emit('ai:call:end', {
          surface: 'enhanced-chat',
          ok: true,
          latency_ms: Date.now() - _aiCallStart,
        });
      } catch (_) {}

      return {
        response,
        context,
        memoryStats: {
          factsUsed: memoryContext.facts?.length || 0,
          interpretationsUsed: memoryContext.interpretations?.length || 0,
          bindingRulesActive: memoryContext.governingRules?.length || 0,
          webSearchPerformed: needsWebSearch,
          webResultsCount: webSearchResults.length
        }
      };

    } catch (error) {
      console.error('Enhanced memory processing error:', error);

      try {
        activityBus.emit('ai:call:end', {
          surface: 'enhanced-chat',
          ok: false,
          latency_ms: Date.now() - _aiCallStart,
        });
      } catch (_) {}

      // Fallback response
      return {
        response: `I encountered an issue with my enhanced memory system: ${error.message}. I'm working with basic functionality.`,
        context: { facts: [], interpretations: [], governingRules: [] },
        memoryStats: {
          factsUsed: 0,
          interpretationsUsed: 0,
          bindingRulesActive: 0,
          webSearchPerformed: false,
          webResultsCount: 0,
          error: error.message
        }
      };
    }
  }

  /**
   * Token-streaming variant of processConversation. callbacks = { onToken, onError }.
   * Returns { response, context, memoryStats } once the stream finishes.
   */
  async streamConversation(userId, userMessage, sessionId, workspaceId, callbacks = {}) {
    const { onToken = () => {}, onError = () => {}, imageData = null, identityContext = '', accountabilityContext = '', isOwner = false, guestSession = false } = callbacks;
    const _aiCallStart = Date.now();
    try { activityBus.emit('ai:call:start', { surface: 'enhanced-chat-stream' }); } catch (_) {}
    try {
      userId = ensureUUID(userId);
      await this.recordUserMessage(userId, userMessage, sessionId);

      const needsWebSearch = this.shouldSearchWeb(userMessage);
      const memoryContext = await this.getSimpleMemoryContext(userId, userMessage, workspaceId);
      let webSearchResults = [];
      if (needsWebSearch && this.tavilyApiKey) {
        webSearchResults = await this.performWebSearch(userId, userMessage);
      }

      const memoriesForPrompt = [];
      for (const f of (memoryContext.facts || [])) {
        memoriesForPrompt.push({
          content: f.content,
          memory_type: f.memory_type || 'user_fact',
          created_at: f.created_at,
          category: f.category,
        });
      }
      for (const i of (memoryContext.interpretations || [])) {
        memoriesForPrompt.push({
          content: i.content || i.text,
          memory_type: 'interpretation',
          created_at: i.created_at,
          category: i.category,
        });
      }

      const searchResults = webSearchResults.length ? webSearchResults : null;

      // v15.17.1 reflexive, v15.17.2 contradictions, v15.18.0 premise,
      // v15.18.1 self-audit on request. Top-of-prompt order:
      //   audit > premise > contradiction > reflexive.
      const { loadReflexiveContext, checkContradictions, checkPremises } = require('./interpretation-engine');
      const { isSelfAuditRequest, buildManifest, buildSelfAuditPromptBlock } = require('./self-manifest');
      const auditRequested = isSelfAuditRequest(userMessage);
      const [selfReflectionRaw, contradictionResult, premiseResult, manifest] = await Promise.all([
        loadReflexiveContext(userId).catch(() => ''),
        checkContradictions(userId, userMessage).catch(() => ({ contradictions: [], promptBlock: '' })),
        checkPremises(userId, userMessage).catch(() => ({ presuppositions: [], promptBlock: '' })),
        auditRequested ? buildManifest(userId).catch(() => null) : Promise.resolve(null),
      ]);
      const auditBlock = manifest ? buildSelfAuditPromptBlock(manifest) : '';
      const selfReflection =
        auditBlock +
        (premiseResult.promptBlock || '') +
        (contradictionResult.promptBlock || '') +
        (selfReflectionRaw || '');
      if (contradictionResult && Array.isArray(contradictionResult.contradictions) && contradictionResult.contradictions.length) {
        try { recordMetric(userId, 'contradiction_caught', contradictionResult.contradictions.length, { source: 'enhanced_memory' }); } catch (_) { /* best-effort */ }
      }

      const response = await streamSplendorResponse(
        userMessage,
        memoriesForPrompt,
        searchResults,
        { selfReflection, imageData, identityContext, accountabilityContext, isOwner, guestSession },
        onToken,
      );

      await this.recordAssistantResponse(userId, response, sessionId, workspaceId);
      storeMemory(userId, `User: ${userMessage}`, 'shared_history', 'user.general', {
        source_type: 'user_direct_statement',
        session_id: sessionId,
        creation_reason: 'enhanced_chat_user_turn',
      }).catch(e => console.error('Memory storage (user) failed:', e.message));
      storeMemory(userId, `Splendor: ${response}`, 'shared_history', 'user.general', {
        source_type: 'conversation',
        session_id: sessionId,
        creation_reason: 'enhanced_chat_assistant_turn',
      }).catch(e => console.error('Memory storage (assistant) failed:', e.message));

      // Continuity Core (v15.17.0): fire-and-forget belief audit for the
      // streaming path. Same contract as processConversation — never
      // blocks, errors only land in logs.
      evaluateInterpretationTurn({
        userId, userMessage, assistantResponse: response, surface: 'chat-stream',
      }).catch(e => console.warn('[interp] dispatch failed:', e && e.message));
      analyzeEmotionalPattern({
        userId, userMessage, assistantResponse: response, surface: 'chat-stream',
      }).catch(e => console.warn('[emotional] dispatch failed:', e && e.message));

      try {
        activityBus.emit('ai:call:end', {
          surface: 'enhanced-chat-stream',
          ok: true,
          latency_ms: Date.now() - _aiCallStart,
        });
      } catch (_) {}

      return {
        response,
        context: { ...memoryContext, webSearchResults, hasWebSearch: webSearchResults.length > 0 },
        memoryStats: {
          factsUsed: memoryContext.facts?.length || 0,
          interpretationsUsed: memoryContext.interpretations?.length || 0,
          bindingRulesActive: memoryContext.governingRules?.length || 0,
          webSearchPerformed: needsWebSearch,
          webResultsCount: webSearchResults.length,
        },
      };
    } catch (err) {
      try {
        activityBus.emit('ai:call:end', {
          surface: 'enhanced-chat-stream',
          ok: false,
          latency_ms: Date.now() - _aiCallStart,
        });
      } catch (_) {}
      try { onError(err); } catch (_) {}
      throw err;
    }
  }

  /**
   * Extract distinctive keyword candidates from the user's current message
   * so we can pull rows that LITERALLY mention those entities, not just
   * the most-recent N. Heuristic: 4+-letter words, excluding common
   * stopwords. Capitalized words (proper nouns) get higher priority.
   * Returns a deduped array of up to `max` strings, lowercased.
   */
  extractRecallKeywords(message, max = 4) {
    if (!message || typeof message !== 'string') return [];
    const STOPWORDS = new Set([
      'the','this','that','these','those','about','from','with','have','your','yours',
      'mine','tell','what','when','where','which','would','could','should','will','were',
      'they','them','then','than','some','very','here','there','still','just','remember',
      'memory','splendor','chris','know','knew','said','says','saying','please','about',
      'going','gonna','wanna','really','because','before','after','again','okay','also',
      'hello','thank','thanks','need','want','make','take','give','look','same','only',
      'something','anything','nothing','everything','being','doing','having','think',
    ]);
    const tokens = (message.match(/[A-Za-z][A-Za-z']{3,}/g) || []);
    const ranked = [];
    const seen = new Set();
    for (const t of tokens) {
      const lower = t.toLowerCase();
      if (STOPWORDS.has(lower)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      // Proper-noun-ish (capitalized AND not sentence-start) outranks
      // common words.
      const isProper = /^[A-Z]/.test(t);
      ranked.push({ word: lower, score: isProper ? 2 : 1 });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, max).map(r => r.word);
  }

  /**
   * Simplified memory context retrieval
   */
  async getSimpleMemoryContext(userId, requestText, workspaceId) {
    try {
      userId = ensureUUID(userId);
      // v15.16.5 — load everything. Single-user product, total row count
      // well under the model's context window for a long time. We
      // surface up to 1000 rows; the keyword pass below adds anything
      // outside that ceiling if it directly matches the question.
      let query = this.supabase
        .from('memory_items')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { data: recent, error } = await query;

      if (error) {
        console.error('Memory retrieval error:', error);
        return { facts: [], interpretations: [], governingRules: [] };
      }

      // Keyword-search pass — distinct proper nouns / topic words from
      // the current message. Surfaces rows that mention those entities
      // even if they fall outside the recent window. The "Do you know
      // about Bob?" case wouldn't recall Bob if Bob was 80 turns ago;
      // this fixes that without needing Pinecone.
      let keywordHits = [];
      try {
        const keywords = this.extractRecallKeywords(requestText, 4);
        if (keywords.length > 0) {
          let kwQuery = this.supabase
            .from('memory_items')
            .select('*')
            .eq('user_id', userId)
            .eq('active', true)
            .eq('approval_status', 'approved')
            .order('created_at', { ascending: false })
            .limit(20);
          // Supabase JS supports `.or()` with ilike for OR-search.
          const ors = keywords.map(k => `content.ilike.%${k.replace(/[%,]/g, '')}%`).join(',');
          kwQuery = kwQuery.or(ors);
          const { data: hits, error: kwErr } = await kwQuery;
          if (!kwErr && Array.isArray(hits)) {
            keywordHits = hits;
            console.log('[memory] keyword hits for', keywords.join(','), '=', hits.length);
          } else if (kwErr) {
            console.warn('[memory] keyword search failed:', kwErr.message);
          }
        }
      } catch (e) {
        console.warn('[memory] keyword pass error:', e && e.message);
      }

      // Merge + dedup by id, preserve order: recent first then keyword
      // hits not already in recent. Cap at 60 total to keep prompt size
      // sane.
      const seenIds = new Set();
      const memories = [];
      for (const m of (recent || [])) {
        if (m && !seenIds.has(m.id)) {
          seenIds.add(m.id);
          memories.push(m);
        }
      }
      for (const m of keywordHits) {
        if (m && !seenIds.has(m.id)) {
          seenIds.add(m.id);
          memories.push(m);
        }
        if (memories.length >= 1000) break;
      }

      try { activityBus.emit('memory:read', { count: memories.length, surface: 'enhanced-chat' }); } catch (_) {}

      // Categorize retrieved memories for the prompt. Real DB content today
      // is shared_history + user_preference; user_fact and interpretation
      // are kept in the allowlist so future rows of those types still surface.
      const FACT_TYPES = new Set([
        'user_fact',
        'interpretation',
        'shared_history',
        'user_preference'
      ]);
      const facts = memories?.filter(m => FACT_TYPES.has(m.memory_type)) || [];
      const interpretations = memories?.filter(m => m.memory_type === 'interpretation') || [];

      // Get governing rules
      const { data: rules } = await this.supabase
        .from('splendor_decisions')
        .select('*')
        .eq('status', 'active')
        .limit(5);

      return {
        facts: facts.map(f => ({
          content: f.content,
          category: f.category,
          confidence: f.confidence,
          citationString: f.citation_string || `Memory from ${new Date(f.created_at).toLocaleDateString()}`
        })),
        interpretations: interpretations.map(i => ({
          summary: i.content,
          citationString: i.citation_string || `Interpretation from ${new Date(i.created_at).toLocaleDateString()}`
        })),
        governingRules: (rules || []).map(r => ({
          title: r.decision_type,
          decision: r.decision_content
        }))
      };

    } catch (error) {
      console.error('Memory context error:', error);
      return { facts: [], interpretations: [], governingRules: [] };
    }
  }

  /**
   * Web search integration
   */
  async performWebSearch(userId, query) {
    userId = ensureUUID(userId);
    if (!this.tavilyApiKey) {
      console.log('Tavily API key not available for web search');
      return [];
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tavilyApiKey}`
        },
        body: JSON.stringify({
          api_key: this.tavilyApiKey,
          query: query,
          search_depth: 'basic',
          include_answer: true,
          max_results: 3
        })
      });

      if (!response.ok) {
        throw new Error(`Tavily search failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Store search results as memories
      for (const result of data.results || []) {
        await this.storeWebSearchResult(userId, query, result);
      }

      return data.results || [];

    } catch (error) {
      console.error('Web search failed:', error);
      await this.recordEvent(userId, 'web_search_failed', 'system', `Failed to search web: ${error.message}`);
      return [];
    }
  }

  /**
   * Store web search results as memories
   */
  async storeWebSearchResult(userId, query, result) {
    try {
      userId = ensureUUID(userId);
      const { data, error } = await this.supabase
        .from('memory_items')
        .insert({
          user_id: userId,
          content: `${result.title}\n\n${result.content}`,
          category: 'system.external_search',
          memory_type: 'technical_context',
          source_type: 'web_search',
          confidence: Math.min(result.score || 0.7, 0.7),
          importance: 0.3,
          provenance: 'VERIFIED_FACT',
          active: true,
          approval_status: 'approved'
        })
        .select()
        .single();

      if (!error) {
        await this.recordEvent(userId, 'web_search_result_stored', 'system',
          `Stored web result: ${result.title}`, {
            query,
            url: result.url,
            score: result.score
          });
      }

      return !error;

    } catch (error) {
      console.error('Failed to store web search result:', error);
      return false;
    }
  }

  /**
   * Determine if web search is needed
   */
  shouldSearchWeb(message) {
    const webSearchIndicators = [
      'what\'s the latest',
      'current news',
      'recent developments',
      'what happened today',
      'latest information',
      'what\'s new',
      'recent updates',
      'current status',
      'breaking news',
      'today\'s',
      'this week',
      'this month',
      'recently',
      'now'
    ];

    const lowerMessage = message.toLowerCase();
    return webSearchIndicators.some(indicator =>
      lowerMessage.includes(indicator)
    );
  }

  /**
   * Record user message
   */
  async recordUserMessage(userId, content, sessionId) {
    try {
      userId = ensureUUID(userId);
      await this.supabase
        .from('conversations')
        .insert({
          user_id: userId,
          session_id: sessionId,
          role: 'user',
          content
        });

      await this.recordEvent(userId, 'chat_message_received', 'user', content, { session_id: sessionId });
    } catch (error) {
      console.error('Failed to record user message:', error);
    }
  }

  /**
   * Record assistant response
   */
  async recordAssistantResponse(userId, content, sessionId, workspaceId) {
    try {
      userId = ensureUUID(userId);
      await this.supabase
        .from('conversations')
        .insert({
          user_id: userId,
          session_id: sessionId,
          role: 'assistant',
          content
        });

      await this.recordEvent(userId, 'assistant_response_generated', 'splendor', content,
        { session_id: sessionId, workspace_id: workspaceId });
    } catch (error) {
      console.error('Failed to record assistant response:', error);
    }
  }

  /**
   * Record system event
   */
  async recordEvent(userId, eventType, actor, content, metadata = {}) {
    try {
      userId = ensureUUID(userId);
      await this.supabase
        .from('raw_events')
        .insert({
          user_id: userId,
          event_type: eventType,
          actor,
          content,
          metadata
        });
    } catch (error) {
      console.error('Failed to record event:', error);
    }
  }

  /**
   * Generate a real AI reply via the Anthropic bridge, using the
   * retrieved memory facts/interpretations as the working memory
   * context and any web-search results as supporting search context.
   */
  async generateResponse(context, userMessage, selfReflection = '', imageData = null, extra = {}) {
    // Flatten retrieved memories into the format generateSplendorResponse
    // expects: { content, memory_type, created_at, category }
    const memories = [];
    for (const f of (context.facts || [])) {
      memories.push({
        content: f.content,
        memory_type: f.memory_type || 'user_fact',
        created_at: f.created_at,
        category: f.category
      });
    }
    for (const i of (context.interpretations || [])) {
      memories.push({
        content: i.content || i.text,
        memory_type: 'interpretation',
        created_at: i.created_at,
        category: i.category
      });
    }

    const searchResults = (context.webSearchResults && context.webSearchResults.length)
      ? context.webSearchResults
      : null;

    try {
      return await generateSplendorResponse(userMessage, memories, false, searchResults, {
        selfReflection,
        imageData,
        identityContext: extra.identityContext || '',
        accountabilityContext: extra.accountabilityContext || '',
        isOwner: extra.isOwner || false,
        guestSession: extra.guestSession || false,
      });
    } catch (err) {
      console.error('[enhanced-memory] generateSplendorResponse failed:', err.message);
      return "I had trouble generating a reply just now. Please try again.";
    }
  }

  /**
   * Build memory prompt for AI
   */
  buildMemoryPrompt(context) {
    let prompt = '';

    if (context.governingRules.length > 0) {
      prompt += 'BINDING DECISIONS:\n';
      context.governingRules.forEach(rule => {
        prompt += `- ${rule.title}: ${rule.decision}\n`;
      });
      prompt += '\n';
    }

    if (context.facts.length > 0) {
      prompt += 'VERIFIED FACTS:\n';
      context.facts.forEach(fact => {
        prompt += `- ${fact.content} (${fact.citationString})\n`;
      });
      prompt += '\n';
    }

    if (context.interpretations.length > 0) {
      prompt += 'INTERPRETATIONS:\n';
      context.interpretations.forEach(interp => {
        prompt += `- ${interp.summary} (${interp.citationString})\n`;
      });
      prompt += '\n';
    }

    return prompt;
  }

  /**
   * Create workspace
   */
  async createWorkspace(userId, title, objective) {
    userId = ensureUUID(userId);
    const { data, error } = await this.supabase
      .from('active_workspaces')
      .insert({
        user_id: userId,
        title,
        objective,
        status: 'active',
        priority: 'medium'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create workspace: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Update workspace
   */
  async updateWorkspace(workspaceId, updates) {
    const { error } = await this.supabase
      .from('active_workspaces')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', workspaceId);

    if (error) {
      throw new Error(`Failed to update workspace: ${error.message}`);
    }
  }

  /**
   * Get memory stats
   */
  async getMemoryStats(userId) {
    try {
      userId = ensureUUID(userId);
      const { data: memories } = await this.supabase
        .from('memory_items')
        .select('approval_status')
        .eq('user_id', userId)
        .eq('active', true);

      const { data: workspaces } = await this.supabase
        .from('active_workspaces')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active');

      return {
        totalMemories: memories?.length || 0,
        pendingApproval: memories?.filter(m => m.approval_status === 'pending').length || 0,
        activeWorkspaces: workspaces?.length || 0
      };
    } catch (error) {
      return {
        totalMemories: 0,
        pendingApproval: 0,
        activeWorkspaces: 0,
        error: error.message
      };
    }
  }

  /**
   * Retrieve memory context (for compatibility with routes)
   */
  async retrieveMemoryContext(options) {
    return await this.getSimpleMemoryContext(
      options.userId,
      options.requestText,
      options.workspaceId
    );
  }

  /**
   * Write memory (for compatibility with routes)
   */
  async writeMemory(options) {
    try {
      const { data, error } = await this.supabase
        .from('memory_items')
        .insert({
          user_id: ensureUUID(options.userId),
          content: options.content,
          category: options.category,
          memory_type: options.memoryType,
          source_type: options.sourceType,
          confidence: options.confidence,
          importance: options.importance,
          provenance: 'splendor_conversation',
          active: true,
          approval_status: 'approved'
        })
        .select()
        .single();

      if (error) {
        return {
          success: false,
          errors: [error.message]
        };
      }

      return {
        success: true,
        memoryId: data.id,
        needsApproval: false,
        errors: []
      };

    } catch (error) {
      return {
        success: false,
        errors: [error.message]
      };
    }
  }
}

module.exports = { EnhancedMemorySystem };