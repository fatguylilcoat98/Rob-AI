# Splendor Memory Architecture V2.0

**Built by Christopher Hughes · Sacramento, CA**  
**Created with Claude Code**  
**Truth · Safety · We Got Your Back**

## 🎯 Core Principles

**The Big Rule: Generated thoughts are not facts.**

- **Logs are not memories**
- **Reflections are not identity** 
- **Pinecone finds. Supabase verifies.**
- **Every memory needs provenance**
- **One way in, one way out**
- **Forgetting is not the biggest danger. Confidently misremembering is.**

## 🏗️ Architecture Overview

### Memory Flow
```
Input → MemoryWriteService → Supabase (source of truth) → PineconeSyncService → Pinecone (search index)
                          ↓
Query → MemoryRetrievalService → Pinecone (search) → Supabase (verify) → Context (with uncertainty flags)
```

### Core Services

1. **MemoryWriteService** - Single entry point for all memory writes
2. **MemoryRetrievalService** - Single exit point for all memory reads  
3. **PineconeSyncService** - Maintains Pinecone as pure search index

## 📊 Database Schema

### Core Memory Tables

#### `memory_items` - Canonical Memory
The main source of truth for all long-term memory.

```sql
- id, user_id, owner (chris|splendor|shared|system)
- category (chris.preferences, splendor.identity, etc.)
- memory_type (user_fact, user_preference, etc.)
- content, summary
- source_type, source_id, provenance
- approval_status (pending|approved|rejected|archived)
- trust_level (trusted|caution|untrusted|reference_only)
- retrieval_allowed, confidence, importance
```

#### `conversations` - Clean Chat History
Only actual user/assistant exchanges. No logs or generated thoughts.

```sql
- id, user_id, session_id
- role (user|assistant|system)
- content, created_at
- processed_for_memory
```

#### `reflections` - Splendor's Interpretations
Patterns and insights. **NOT facts.**

```sql
- id, user_id, reflection_type
- summary, what_i_noticed, why_it_matters
- source_interactions[], source_memory_ids[]
- approval_status (staged|approved|rejected)
- ready_to_surface
```

#### `splendor_decisions` - Binding Rules
Rules that constrain Splendor's behavior.

```sql
- id, decision_id, title, decision
- priority (CORE|HIGH|MEDIUM|LOW)
- binding (true/false)
- status (active|superseded|revoked)
```

#### `active_workspaces` - Project Continuity
Ongoing work that Splendor can continue.

```sql
- id, title, objective, current_state
- open_questions[], next_steps[]
- related_memory_ids[]
- status (active|paused|completed)
```

#### `raw_events` - Event Ledger
Everything important that happens.

```sql
- id, event_type, actor, content
- metadata, source_table, source_id
- created_at
```

### Supporting Tables

- `memory_sources` - Receipts for every memory
- `memory_conflicts` - Conflicting information tracking
- `memory_access_log` - What memories were used when
- `verification_requests` - Queue for memory approval
- `pinecone_index_records` - Sync tracking
- `memory_promotions` - Audit trail for approvals

## 🔒 Memory Uncertainty Flagging

Every retrieved memory gets a confidence label:

- **`grounded`** - Solid, verified memory
- **`weakly_grounded`** - Low confidence or weak source
- **`inferred`** - Generated from interpretation
- **`conflicting`** - Conflicts with other memories
- **`stale`** - Old and unvalidated
- **`unverifiable`** - No clear source

### Response Behavior

```typescript
if (memory.retrievalConfidenceLabel !== 'grounded') {
  response = "I'm not fully grounded on this, but I think..."
  // or "I remember something related, but I want to flag this as uncertain..."
}
```

## 🔄 Memory Write Pipeline

### 1. Command Validation
```typescript
const result = await memoryServices.write.writeMemory({
  type: 'write_user_fact',
  userId: 'user-123',
  content: 'I prefer dark roast coffee',
  category: 'chris.preferences',
  sourceType: 'user_direct_statement'
});
```

### 2. Provenance Assignment
- `USER_STATED` - Chris explicitly said this
- `VERIFIED_FACT` - Confirmed information  
- `INFERRED` - Generated from patterns
- `GENERATED` - Created by thought cycles
- `SYSTEM_EVENT` - System activity

### 3. Approval Workflow
- **Auto-approved**: Conservative user statements
- **Pending**: Generated thoughts, inferences
- **Rejected**: Contaminated or wrong data

### 4. Pinecone Sync
Only approved memories get indexed for search.

## 🔍 Memory Retrieval Pipeline

### 1. Context Assembly
```typescript
const context = await memoryServices.retrieval.retrieveMemoryContext({
  userId: 'user-123',
  requestText: 'What coffee do I like?',
  requestContext: 'answer_user_question'
});
```

### 2. Multi-Layer Retrieval
1. **Governing rules** (binding decisions) - always loaded
2. **Workspace state** (active project context)
3. **Semantic search** (Pinecone → Supabase verification)
4. **Reflections** (labeled as interpretations)

### 3. Uncertainty Assessment
Every memory gets assessed for reliability before injection.

### 4. Ranking Formula
```
Score = (SemanticSimilarity × 0.4) + (Importance × 0.25) + (Confidence × 0.2) + (Recency × 0.15) - UncertaintyPenalty
```

## 🚀 Usage Examples

### Write User Preference
```typescript
await memoryServices.write.writeMemory({
  type: 'write_user_fact',
  userId: 'user-123',
  content: 'I prefer dark roast coffee in the morning',
  category: 'chris.preferences',
  memoryType: 'user_preference',
  sourceType: 'user_direct_statement',
  confidence: 0.95
});
```

### Create Reflection
```typescript
await memoryServices.write.writeMemory({
  type: 'write_reflection',
  userId: 'user-123',
  reflectionType: 'pattern',
  summary: 'Chris prefers direct communication over diplomatic language',
  whatINoticed: 'Multiple conversations show preference for straightforward responses',
  evidenceSummary: 'Based on feedback in conversations X, Y, Z',
  sourceInteractions: ['conv-1', 'conv-2', 'conv-3']
});
```

### Retrieve with Context
```typescript
const context = await memoryServices.retrieval.retrieveMemoryContext({
  userId: 'user-123',
  requestText: 'How should I handle this project?',
  requestContext: 'continue_workspace',
  workspaceId: 'workspace-abc',
  includeReflections: true,
  allowWeaklyGrounded: false
});

// Use context.facts, context.interpretations, context.governingRules
```

## 🛡️ Validation Rules

### Memory Write Rules
- **Conversation-triggered writes**: Can be approved or pending
- **Thought cycle writes**: Always start pending, retrieval_allowed = false
- **User corrections**: Auto-approved if from Chris
- **Generated reflections**: Never auto-approved

### Retrieval Rules
- Only `approved` + `active` + `retrieval_allowed` memories
- Uncertainty flagging for all non-grounded memories
- Binding decisions always included if relevant
- Conflict detection and warning

## 📁 Memory Categories

### Pre-configured Categories
- `chris.personal` - Personal information about Chris
- `chris.preferences` - Chris's preferences and choices  
- `chris.goals` - Chris's stated goals and objectives
- `splendor.identity` - Splendor's core identity and traits
- `splendor.reflections` - Interpretations and insights
- `splendor.decisions` - Binding behavioral rules
- `shared.history` - Shared experiences and interactions
- `shared.projects` - Collaborative project work

## 🔧 Migration Strategy

### Phase 1: Backup
- All existing tables backed up with timestamp suffix
- Pinecone vector IDs exported for cleanup

### Phase 2: Clean Migration
- **Migrated**: Clean conversations (user/assistant only)
- **Pending approval**: Conservative user preferences
- **Archived**: Consciousness test data, temporal consciousness
- **Manual review**: Autonomous decisions → binding decisions

### Phase 3: Reset
- Drop old contaminated tables
- Reset Pinecone namespaces  
- Deploy new services

## 🔄 Workspace Continuity

### Create Ongoing Work
```typescript
const workspaceId = await memoryServices.workspace.createWorkspace(
  'user-123',
  'Memory Architecture Rebuild',
  'Complete redesign of memory system with clean separation'
);
```

### Continue Work
```typescript
await memoryServices.workspace.updateWorkspace(workspaceId, {
  currentState: 'Schema deployed, testing retrieval',
  nextSteps: ['Test uncertainty flagging', 'Deploy to production']
});
```

## ⚡ Scheduled Tasks & Outbound Messages

### Background Continuity
```typescript
// Chris can say: "Keep working on this and email me in the morning"
const taskId = await scheduleTask({
  workspaceId: 'workspace-abc',
  taskType: 'continue_work',
  nextRunAt: tomorrow_morning,
  objective: 'Review memory architecture progress and draft status email'
});
```

## 🚨 Error Handling

### Memory Conflicts
```typescript
if (conflictDetected) {
  await memoryServices.write.createMemoryConflict(
    userId,
    'contradictory_preference',
    existingMemoryId,
    newMemoryId,
    'User stated both "I like coffee" and "I hate coffee"'
  );
}
```

### Uncertainty Warnings
```typescript
if (memory.retrievalConfidenceLabel !== 'grounded') {
  response = `⚠️ ${uncertaintyPhrasing} ${response}`;
  citationString = memory.citationString; // Includes uncertainty warning
}
```

## 🔮 Future Enhancements

1. **Semantic Embeddings** - Replace mock embeddings with real ones
2. **Advanced Conflict Resolution** - ML-based conflict detection
3. **Memory Decay** - Automatic importance adjustment over time
4. **Cross-User Memory** - Shared knowledge bases
5. **Memory Visualization** - Admin dashboard for memory management

## 📋 Deployment Checklist

- [ ] Deploy new schema to Supabase
- [ ] Run migration scripts with backup verification
- [ ] Configure Pinecone index and namespaces
- [ ] Deploy memory services
- [ ] Test uncertainty flagging
- [ ] Verify workspace continuity
- [ ] Enable scheduled tasks
- [ ] Set up admin dashboard
- [ ] Drop old tables (after verification)

---

**Remember: This system is designed so Splendor can work autonomously while Chris is away, but always knows the difference between fact, memory, reflection, and uncertainty.**