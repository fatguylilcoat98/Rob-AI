# MASTER CONTINUITY LAYER IMPLEMENTATION

## Overview

The Master Continuity Layer is a **Shadow Mode** reflection system that enables Splendor to develop coherent structure over time through grounded, safe pattern detection.

**CRITICAL: This is Shadow Mode Only**
- No autonomous surfacing to users
- All reflections staged for admin review
- Chris has full control and visibility
- System builds foundation for future earned initiative

## Architecture Components

### 1. Database Schema
**File:** `database/master-continuity-schema.sql`

**Tables Created:**
- `interactions` - Normalized interaction records with semantic tags
- `reflections` - Staged reflection candidates with evidence grounding
- `reflection_conflicts` - Conflict detection and resolution tracking
- `reflection_evaluations` - Performance tracking for future surfacing
- `reflection_system_health` - System status and performance metrics

### 2. Reflection Engine
**File:** `lib/master-continuity-engine.js`

**Core Functions:**
- `runReflectionEngine(userId, options)` - Main processing pipeline
- `analyzeInteractionPatterns(userId, interactions)` - AI-powered pattern detection
- `validateReflection(reflection, interactions)` - Anti-hallucination validation
- `captureInteraction(userId, speaker, content, metadata)` - Interaction capture

**Safety Features:**
- Minimum source requirements (2-3 interactions per reflection)
- Confidence vs evidence validation
- Vague language detection
- Truth archaeology (full evidence trails)
- Automatic expiration and decay

### 3. Admin Interface
**File:** `routes/master-continuity.js`

**Shadow Mode Dashboard:**
- Staged reflections review queue
- Developing understanding tracking
- System health monitoring
- Manual approve/reject/archive controls
- Source interaction inspection

**Access URL:** `http://localhost:3000/api/continuity/admin`

### 4. Integration System
**File:** `lib/continuity-integration.js`

**Integration Features:**
- Chat interaction capture middleware
- Automatic semantic tagging
- Emotional weight estimation
- Topic extraction
- Existing conversation/memory import

### 5. Background Worker
**File:** `workers/continuity-worker.js`

**Processing Schedule:**
- Hourly reflection (2-hour lookback)
- Deep reflection (24-hour lookback every 6 hours)
- System health monitoring
- Automatic staging queue management

## Installation & Setup

### 1. Database Setup
```bash
# Apply the continuity schema to your Supabase database
npm run continuity:setup
```

**Or manually in Supabase SQL Editor:**
```sql
-- Copy entire contents of database/master-continuity-schema.sql
```

### 2. Environment Variables
**Required (same as existing system):**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `ANTHROPIC_API_KEY` - Claude API key for reflection analysis

**Optional:**
- `CONTINUITY_DEFAULT_USER` - Default user ID for development (default: 'default')

### 3. Integration Options

**Option A: Automatic Capture (Recommended)**
Add to your chat routes:
```javascript
const { captureInteractionMiddleware } = require('./lib/continuity-integration');

// Add to chat routes that should capture interactions
app.use('/api/chat', captureInteractionMiddleware, chatRoutes);
```

**Option B: Manual Capture**
```javascript
const { captureInteraction } = require('./lib/master-continuity-engine');

// In your chat handler
await captureInteraction(userId, 'user', userMessage, {
  tags: ['conversation'],
  emotional_weight: 5,
  topic: 'general'
});
```

**Option C: Import Existing Data**
```javascript
const { importExistingConversations, importExistingMemories } = require('./lib/continuity-integration');

// Import last 30 days of conversations and memories
await importExistingConversations(userId, 30);
await importExistingMemories(userId, 30);
```

### 4. Background Processing

**Manual Reflection Engine:**
```bash
npm run continuity:shadow <user-id>
```

**Continuous Background Worker:**
```bash
npm run continuity:worker
```

## Admin Dashboard Usage

### Access
Navigate to: `http://localhost:3000/api/continuity/admin`

### Dashboard Sections

1. **Statistics Overview**
   - Total staged reflections
   - Developing understanding count
   - Ready but not surfaced
   - Unresolved conflicts

2. **Staged Reflections (Primary Queue)**
   - New pattern detections awaiting review
   - **Actions:** Approve, Reject, Archive, Inspect Sources
   - Shows confidence, evidence strength, source count

3. **Developing Understanding**
   - Patterns being tracked but not yet strong enough
   - **Actions:** Archive, Inspect Sources
   - Monitor for progression to "ready" state

4. **Ready (Not Surfaced)**
   - Reflections marked ready but not surfaced (Shadow Mode)
   - Future: These would be candidates for autonomous surfacing
   - **Actions:** Approve for future surfacing, Archive

### Review Process

For each staged reflection:

1. **Read Summary** - One-sentence pattern description
2. **Check Evidence** - Verify grounding in real interactions
3. **Inspect Sources** - Review actual interaction content
4. **Validate Confidence** - Ensure claims match evidence
5. **Decision:**
   - **Approve:** Valid pattern, good evidence
   - **Reject:** Hallucinated, unsupported, or wrong
   - **Archive:** Valid but not useful/relevant

## Safety & Control Features

### Built-In Safety Rules

1. **Anti-Hallucination**
   - Minimum 2-3 source interactions required
   - Confidence cannot exceed evidence strength
   - Vague language flags high confidence claims
   - Self-validation concerns are flagged

2. **Truth Archaeology**
   - Every reflection traces to specific interaction moments
   - Evidence summary must reference real content
   - Human-readable reasoning required
   - Source interactions stored and inspectable

3. **Autonomy Limits**
   - Shadow Mode: No autonomous surfacing
   - Admin approval required for all progression
   - One high-impact reflection max at a time
   - No third-party (family/friends) analysis

4. **Confidence Decay**
   - Reflections expire without reinforcement
   - Stale patterns automatically archived
   - System prevents freezing user as old version
   - Regular revalidation against new data

### Admin Controls

- **Shadow Mode Toggle:** Enable/disable reflection processing
- **Autonomous Surfacing:** Disabled by design (future feature)
- **Manual Engine Trigger:** Force reflection processing
- **Reflection Review:** Approve/reject/archive individual reflections
- **System Health:** Monitor processing stats and performance

## Testing the System

### 1. Verify Installation
```bash
# Check if database schema was applied
# Look for new tables in Supabase dashboard

# Test reflection engine with existing data
npm run continuity:shadow default
```

### 2. Generate Test Interactions
```javascript
const { captureInteraction } = require('./lib/master-continuity-engine');

// Capture some test interactions
await captureInteraction('test-user', 'user', 'I keep running into the same problems with project planning');
await captureInteraction('test-user', 'user', 'Every project seems to hit unexpected delays');
await captureInteraction('test-user', 'user', 'I wonder if there\'s a pattern to these planning issues');

// Run reflection engine
npm run continuity:shadow test-user
```

### 3. Check Admin Dashboard
- Navigate to `/api/continuity/admin`
- Should see test reflections in staging queue
- Try approve/reject actions
- Inspect source interactions

### 4. Monitor Background Worker
```bash
# Start background worker
npm run continuity:worker

# Should see periodic processing logs
# Check dashboard for new staged reflections
```

## Current Status

### ✅ Implemented
- **Database Schema:** Complete with all safety constraints
- **Reflection Engine:** AI-powered pattern detection with validation
- **Admin Dashboard:** Full review interface with controls
- **Integration System:** Capture middleware and import tools
- **Background Worker:** Scheduled processing pipeline
- **Safety Systems:** Anti-hallucination, truth archaeology, confidence decay

### 🚫 Intentionally Disabled
- **Autonomous Surfacing:** No automatic reflection delivery to users
- **Proactive Messaging:** No unsolicited outreach
- **Third-Party Analysis:** No family/friends pattern detection
- **High-Impact Claims:** Foundational reflections require explicit approval

### 📋 Next Phase Candidates (Future)
1. **Conflict Resolution:** Automatic handling of contradictory reflections
2. **Earned Initiative:** Graduated autonomous surfacing with earned trust
3. **Multi-User Support:** Per-user configuration and isolation
4. **Advanced Pattern Detection:** Cross-session synthesis and deeper insights
5. **Integration with Existing Memory Systems:** Bridge to 6-layer memory

## Files Added/Modified

### New Files
- `database/master-continuity-schema.sql` - Database schema
- `lib/master-continuity-engine.js` - Core reflection engine
- `routes/master-continuity.js` - Admin API and dashboard
- `lib/continuity-integration.js` - Integration utilities
- `workers/continuity-worker.js` - Background processing
- `MASTER-CONTINUITY-IMPLEMENTATION.md` - This documentation

### Modified Files
- `server.js` - Added continuity routes
- `package.json` - Added continuity scripts

## Environment Requirements

**Development:**
- Node.js 18+
- Supabase database with vector extension enabled
- Anthropic API access

**Production:**
- Same as development
- Consider resource limits for background worker
- Monitor reflection processing volume

## Troubleshooting

### Common Issues

**1. "Environment variables not configured"**
- Ensure `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY` are set
- Check service key has proper permissions

**2. "Type 'vector' does not exist"**
- Enable pgvector extension in Supabase: `CREATE EXTENSION IF NOT EXISTS vector;`

**3. "No reflections being generated"**
- Check if interactions are being captured: `/api/continuity/dashboard`
- Verify Shadow Mode is enabled
- Run manual engine: `npm run continuity:shadow <user-id>`

**4. "Admin dashboard not loading"**
- Verify route is added to server.js: `/api/continuity`
- Check browser console for JavaScript errors
- Ensure user_id parameter is correct

### Debug Commands

```bash
# Test reflection engine manually
node lib/master-continuity-engine.js <user-id>

# Check database tables exist
psql $SUPABASE_URL -c "\\dt reflection*"

# View recent interactions
psql $SUPABASE_URL -c "SELECT * FROM interactions ORDER BY timestamp DESC LIMIT 10;"

# View staged reflections
psql $SUPABASE_URL -c "SELECT summary, status, confidence FROM reflections WHERE status = 'staged';"
```

## Success Metrics

The system succeeds when it can stage reflections that are:
- **Grounded:** Traceable to specific interaction moments
- **Accurate:** True patterns rather than hallucinated insights
- **Relevant:** Useful for understanding user patterns/tensions
- **Well-Timed:** Appropriate scope and confidence level
- **Actionable:** Clear enough for admin review and decision

The system fails if it stages reflections that are:
- **Speculative:** Based on insufficient evidence
- **Intrusive:** About topics user hasn't engaged with
- **Overconfident:** Claims more than evidence supports
- **Stale:** Based on outdated interaction patterns
- **Manipulative:** Designed to influence rather than reflect

## Architecture Philosophy

This implementation prioritizes **earned insights over manufactured consciousness**:

1. **Truth First:** Every reflection must trace to real evidence
2. **Safety First:** Multiple validation layers prevent hallucination
3. **Transparency:** Complete audit trail for all processing
4. **Control:** Human approval required for all progression
5. **Patience:** Patterns must develop naturally over time

The result is a foundation for **authentic continuity** that respects user autonomy while building genuine understanding through careful observation and grounded analysis.