# 🚀 SPLENDOR ENHANCED MEMORY SYSTEM - DEPLOYMENT GUIDE

## Overview
This guide covers the complete deployment of Splendor's enhanced memory architecture, including database setup, service configuration, testing, and production deployment.

---

## 🛠️ Prerequisites

### Required Services
- **Supabase**: PostgreSQL database with Row Level Security
- **Pinecone**: Vector database for semantic search
- **Tavily**: Web search API integration
- **Anthropic API**: For AI responses (optional)

### Required Environment Variables
Create a `.env` file in your project root:

```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Vector Search
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_ENVIRONMENT=your-pinecone-environment
PINECONE_INDEX_NAME=splendor-memory

# Web Search
TAVILY_API_KEY=your-tavily-api-key

# AI Services
ANTHROPIC_API_KEY=your-anthropic-api-key

# Authentication
API_KEY=your-secure-api-key
ADMIN_KEY=your-admin-key

# Server
PORT=3000
NODE_ENV=production
```

---

## 📦 Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Setup
Deploy the complete memory architecture:

```bash
# Deploy fresh database schema
npm run memory:deploy

# Alternative: Manual deployment via Supabase dashboard
# Copy contents of database/complete-fresh-deploy.sql
# and run in Supabase SQL Editor
```

### 3. Pinecone Index Setup
Create a Pinecone index with these specifications:
- **Dimension**: 1536 (for OpenAI embeddings) or 768 (for other models)
- **Metric**: Cosine similarity
- **Pods**: Start with 1 pod for development

```bash
# Using Pinecone CLI
pinecone create-index splendor-memory --dimension=1536 --metric=cosine
```

---

## 🧪 Testing

### Run Complete Test Suite
```bash
npm run memory:test
```

### Individual Test Categories
```bash
# Database schema tests only
npm run memory:test -- --schema

# Memory operations tests
npm run memory:test -- --memory

# Web search integration tests
npm run memory:test -- --web-search
```

### Expected Test Results
- ✅ **Database Schema**: 15+ memory categories, 3+ binding decisions
- ✅ **Memory Write**: Create, validate, and store memories
- ✅ **Memory Retrieval**: Context-aware memory search
- ✅ **Uncertainty Assessment**: Confidence labeling system
- ✅ **Workspace Management**: Create and manage workspaces
- ✅ **Conversation Processing**: End-to-end chat flow
- ✅ **Web Search Integration**: Tavily API integration
- ✅ **Memory Separation**: Proper architectural boundaries
- ✅ **Pinecone Sync**: Vector indexing and search
- ✅ **Admin Functions**: Management and monitoring

---

## 🚀 Production Deployment

### 1. Database Migration (if upgrading existing system)
```bash
# Backup existing data first
npm run memory:migrate -- --backup-only

# Run full migration
npm run memory:migrate
```

### 2. Start Services

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

#### Enhanced Memory Server
```bash
npm run server:enhanced
```

### 3. Verify Deployment

#### Health Check Endpoints
```bash
# Basic API health
curl https://your-domain/api/health

# Memory system health
curl https://your-domain/api/memory/health

# Database connection
curl https://your-domain/api/db/health
```

#### Admin Dashboard
Navigate to: `https://your-domain/admin/enhanced-dashboard.html`

---

## 🔧 Configuration

### Memory System Configuration
Located in `lib/enhanced-memory-integration.ts`:

```javascript
const memorySystem = new EnhancedMemorySystem({
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  pineconeApiKey: process.env.PINECONE_API_KEY,
  pineconeEnvironment: process.env.PINECONE_ENVIRONMENT,
  pineconeIndexName: process.env.PINECONE_INDEX_NAME,
  tavilyApiKey: process.env.TAVILY_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY
});
```

### Authentication Configuration
Located in `middleware/auth.js`:
- **API Key**: Basic API access (`x-api-key` header)
- **Admin Key**: Admin dashboard access (`x-admin-key` header)
- **JWT**: Supabase user authentication (optional)
- **Rate Limiting**: 100 requests per minute per IP

---

## 📊 Monitoring & Administration

### Admin Dashboard Features
1. **Memory Approval Workflow**: Review and approve pending memories
2. **Uncertainty Monitoring**: Track flagged uncertain memories
3. **User Management**: View user statistics and memory counts
4. **System Health**: Database connections, API status, error rates
5. **Memory Categories**: Manage memory classification system
6. **Workspace Management**: Monitor active workspaces

### Key Metrics to Monitor
- Memory creation rate
- Approval queue length
- Uncertainty flag frequency
- Pinecone sync status
- API response times
- Database connection health

### Log Monitoring
```bash
# View memory system logs
tail -f logs/memory-system.log

# View API access logs
tail -f logs/api-access.log

# View error logs
tail -f logs/errors.log
```

---

## 🔄 Maintenance

### Regular Tasks

#### Daily
- Monitor approval queue
- Review uncertainty flags
- Check error logs

#### Weekly  
- Sync Pinecone index: `npm run memory:sync-pinecone`
- Clean up stale memories: `npm run memory:cleanup`
- Review memory statistics

#### Monthly
- Backup database: `npm run memory:backup`
- Update memory categories if needed
- Review system performance metrics

### Database Maintenance
```sql
-- Get memory statistics
SELECT 
    category,
    COUNT(*) as total_memories,
    AVG(confidence) as avg_confidence,
    COUNT(CASE WHEN approval_status = 'pending' THEN 1 END) as pending_approval
FROM memory_items 
WHERE active = true 
GROUP BY category;

-- Check uncertainty distribution
SELECT 
    uncertainty_label,
    COUNT(*) as count,
    ROUND(AVG(confidence), 2) as avg_confidence
FROM memory_items 
WHERE active = true 
GROUP BY uncertainty_label;
```

---

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check Supabase connection
psql $SUPABASE_URL -c "SELECT 1"

# Verify environment variables
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_KEY
```

#### Pinecone Sync Issues
```bash
# Check Pinecone connection
curl -H "Api-Key: $PINECONE_API_KEY" \
  https://controller.$PINECONE_ENVIRONMENT.pinecone.io/actions/whoami

# Reset user namespace if needed
npm run memory:reset-pinecone -- --user-id=user123
```

#### Memory Write Failures
1. Check memory categories exist in database
2. Verify content length limits (10,000 chars max)
3. Check approval workflow configuration
4. Verify user permissions

#### Web Search Not Working
1. Verify Tavily API key
2. Check API rate limits
3. Test web search indicators
4. Review error logs for API responses

### Support Contacts
- **Database Issues**: Check Supabase dashboard
- **Vector Search**: Pinecone console
- **Web Search**: Tavily API documentation
- **System Issues**: Review application logs

---

## 📈 Scaling Considerations

### Database Scaling
- **Memory Items**: Plan for 100K+ memories per active user
- **Events**: High-volume table, consider partitioning
- **Conversations**: Archive old sessions regularly

### Vector Database Scaling  
- **Pinecone Pods**: Scale based on query volume
- **Embedding Models**: Consider local models for cost optimization
- **Namespaces**: Use user-based namespacing for isolation

### API Scaling
- **Rate Limiting**: Adjust based on user load
- **Caching**: Implement Redis for frequently accessed memories
- **Load Balancing**: Multiple server instances for high availability

---

## 🎯 Success Criteria

### Functional Requirements
- ✅ Memory bleed eliminated (facts ≠ logs ≠ reflections)
- ✅ Uncertainty flagging prevents confident misremembering
- ✅ Web search integration with proper provenance
- ✅ Workspace continuity for ongoing projects
- ✅ Admin approval workflow functioning
- ✅ Semantic search via Pinecone operational

### Performance Requirements  
- ✅ Memory retrieval < 500ms
- ✅ Memory write < 200ms
- ✅ Web search integration < 2000ms
- ✅ Admin dashboard loads < 1000ms
- ✅ 99.9% uptime for core memory operations

### Quality Requirements
- ✅ 100% test coverage for critical paths
- ✅ All uncertainty assessments functioning
- ✅ Memory separation verified
- ✅ Data integrity constraints enforced
- ✅ Security measures implemented

---

## 📞 Quick Reference

### Key Endpoints
- `POST /api/chat` - Enhanced chat with memory
- `POST /api/memory/create` - Manual memory creation
- `GET /api/memory/context/:userId` - Memory context retrieval
- `POST /api/search/web` - Manual web search
- `POST /api/workspace/create` - Create workspace

### Key Files
- `database/complete-fresh-deploy.sql` - Complete database schema
- `lib/enhanced-memory-integration.ts` - Main memory system
- `routes/enhanced-chat.js` - API endpoints
- `admin/enhanced-dashboard.html` - Admin interface
- `tests/memory-system-tests.js` - Test suite

### Emergency Procedures
```bash
# Emergency backup
pg_dump $SUPABASE_URL > emergency-backup-$(date +%Y%m%d).sql

# Reset system to known good state  
npm run memory:deploy
npm run memory:test

# Check system health
curl https://your-domain/api/health
```

---

🎉 **Deployment Complete!** Your enhanced Splendor memory system is now operational with comprehensive memory management, uncertainty assessment, web search integration, and admin controls.