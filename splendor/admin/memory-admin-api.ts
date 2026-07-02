/**
 * MEMORY ADMIN API
 * Express.js endpoints for the memory management dashboard
 */

import express from 'express';
import { createMemoryServices } from '../lib/memory-service-factory';
import { MemoryServices } from '../lib/memory-services';

const router = express.Router();

// Initialize memory services
const services: MemoryServices = createMemoryServices({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY!, // Use service key for admin
  pineconeApiKey: process.env.PINECONE_API_KEY!,
  pineconeEnvironment: process.env.PINECONE_ENVIRONMENT!,
  pineconeIndexName: process.env.PINECONE_INDEX_NAME!
});

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const stats = await getMemoryStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY REVIEW QUEUE
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/memories/pending/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type = 'pending', limit = 20 } = req.query;

    const memories = await getPendingMemories(userId, type as string, Number(limit));

    res.json({
      success: true,
      data: memories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY APPROVAL ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/memories/:memoryId/approve', async (req, res) => {
  try {
    const { memoryId } = req.params;
    const { userId, reason, approvedBy = 'admin' } = req.body;

    const result = await services.write.writeMemory({
      type: 'promote_memory',
      userId,
      sourceTable: 'memory_items',
      sourceId: memoryId,
      targetApprovalStatus: 'approved',
      promotedBy: approvedBy,
      reason: reason || 'Approved via admin dashboard'
    });

    // Index in Pinecone after approval
    if (result.success) {
      await indexApprovedMemory(memoryId);
    }

    res.json({
      success: result.success,
      data: { memoryId: result.memoryId },
      message: 'Memory approved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/memories/:memoryId/reject', async (req, res) => {
  try {
    const { memoryId } = req.params;
    const { userId, reason, rejectedBy = 'admin' } = req.body;

    const result = await services.write.writeMemory({
      type: 'promote_memory',
      userId,
      sourceTable: 'memory_items',
      sourceId: memoryId,
      targetApprovalStatus: 'rejected',
      promotedBy: rejectedBy,
      reason: reason || 'Rejected via admin dashboard'
    });

    res.json({
      success: result.success,
      data: { memoryId: result.memoryId },
      message: 'Memory rejected successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY SEARCH & BROWSE
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/memories/search/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      q: query,
      category,
      type: memoryType,
      status,
      confidence_label,
      limit = 50
    } = req.query;

    const memories = await searchMemoriesForAdmin(
      userId,
      {
        query: query as string,
        category: category as string,
        memoryType: memoryType as string,
        status: status as string,
        confidenceLabel: confidence_label as string,
        limit: Number(limit)
      }
    );

    res.json({
      success: true,
      data: memories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY EDITING
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/memories/:memoryId', async (req, res) => {
  try {
    const { memoryId } = req.params;
    const { content, category, memory_type, confidence, importance } = req.body;

    const result = await updateMemory(memoryId, {
      content,
      category,
      memory_type,
      confidence,
      importance
    });

    // Mark Pinecone record as stale if memory was updated
    if (result.success) {
      await services.pinecone.markStale(result.userId, 'memory_items', memoryId);
    }

    res.json({
      success: result.success,
      data: { memoryId },
      message: 'Memory updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.delete('/memories/:memoryId', async (req, res) => {
  try {
    const { memoryId } = req.params;
    const { userId } = req.body;

    // Delete from Pinecone first
    await services.pinecone.deleteRecord(userId, 'memory_items', memoryId);

    // Mark as inactive in Supabase
    const result = await deleteMemory(memoryId);

    res.json({
      success: result.success,
      message: 'Memory deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/workspaces/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const workspaces = await getActiveWorkspaces(userId);

    res.json({
      success: true,
      data: workspaces
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY CONFLICTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/conflicts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const conflicts = await getMemoryConflicts(userId);

    res.json({
      success: true,
      data: conflicts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/conflicts/:conflictId/resolve', async (req, res) => {
  try {
    const { conflictId } = req.params;
    const { resolution, resolution_notes } = req.body;

    const result = await resolveMemoryConflict(conflictId, resolution, resolution_notes);

    res.json({
      success: result.success,
      message: 'Conflict resolved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PINECONE SYNC MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/sync/pinecone/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const syncResult = await services.pinecone.syncStaleRecords(userId);

    res.json({
      success: true,
      data: syncResult,
      message: `Sync completed: ${syncResult.updated} updated, ${syncResult.deleted} deleted`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/sync/reset-namespace/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    await services.pinecone.resetUserNamespace(userId);

    res.json({
      success: true,
      message: 'User Pinecone namespace reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (Database queries)
// ═══════════════════════════════════════════════════════════════════════════════

async function getMemoryStats(userId: string) {
  // These would be actual database queries in implementation
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  const [
    { count: totalMemories },
    { count: pendingApproval },
    { count: uncertainMemories },
    { count: activeWorkspaces },
    { count: bindingDecisions },
    { count: memoryConflicts }
  ] = await Promise.all([
    supabase.from('memory_items').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('active', true),
    supabase.from('memory_items').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('approval_status', 'pending'),
    supabase.from('uncertain_memories').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('active_workspaces').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
    supabase.from('splendor_decisions').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active').eq('binding', true),
    supabase.from('memory_conflicts').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'unresolved')
  ]);

  return {
    totalMemories: totalMemories || 0,
    pendingApproval: pendingApproval || 0,
    uncertainMemories: uncertainMemories || 0,
    activeWorkspaces: activeWorkspaces || 0,
    bindingDecisions: bindingDecisions || 0,
    memoryConflicts: memoryConflicts || 0
  };
}

async function getPendingMemories(userId: string, type: string, limit: number) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  let query = supabase
    .from('memory_items_with_uncertainty')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (type === 'pending') {
    query = query.eq('approval_status', 'pending');
  } else if (type === 'uncertain') {
    query = query.neq('uncertainty_assessment->confidence_label', 'grounded');
  }

  const { data: memories, error } = await query;

  if (error) throw error;

  return memories?.map(memory => ({
    id: memory.id,
    content: memory.content,
    category: memory.category,
    memory_type: memory.memory_type,
    approval_status: memory.approval_status,
    confidence_label: memory.uncertainty_assessment?.confidence_label || 'grounded',
    uncertainty_reason: memory.uncertainty_assessment?.uncertainty_reason,
    provenance: memory.provenance,
    created_at: memory.created_at,
    citation_string: memory.citation_string
  })) || [];
}

async function searchMemoriesForAdmin(userId: string, filters: any) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  let query = supabase
    .from('memory_items_with_uncertainty')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(filters.limit);

  if (filters.category) {
    query = query.eq('category', filters.category);
  }

  if (filters.memoryType) {
    query = query.eq('memory_type', filters.memoryType);
  }

  if (filters.status) {
    query = query.eq('approval_status', filters.status);
  }

  if (filters.query) {
    query = query.ilike('content', `%${filters.query}%`);
  }

  const { data: memories, error } = await query;

  if (error) throw error;

  return memories || [];
}

async function indexApprovedMemory(memoryId: string) {
  // Get memory details and index in Pinecone
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  const { data: memory } = await supabase
    .from('memory_items')
    .select('*')
    .eq('id', memoryId)
    .single();

  if (memory && memory.approval_status === 'approved') {
    await services.pinecone.indexMemory(
      memory.user_id,
      'memory_items',
      memory.id,
      memory.content,
      {
        category: memory.category,
        memory_type: memory.memory_type,
        confidence: memory.confidence,
        importance: memory.importance
      }
    );
  }
}

async function updateMemory(memoryId: string, updates: any) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  const { data: memory, error } = await supabase
    .from('memory_items')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', memoryId)
    .select()
    .single();

  return {
    success: !error,
    userId: memory?.user_id
  };
}

async function deleteMemory(memoryId: string) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  const { error } = await supabase
    .from('memory_items')
    .update({
      active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', memoryId);

  return {
    success: !error
  };
}

async function getActiveWorkspaces(userId: string) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  const { data: workspaces, error } = await supabase
    .from('active_workspaces')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('last_worked_at', { ascending: false });

  if (error) throw error;
  return workspaces || [];
}

async function getMemoryConflicts(userId: string) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  const { data: conflicts, error } = await supabase
    .from('memory_conflicts')
    .select(`
      *,
      memory_a:memory_a_id(content),
      memory_b:memory_b_id(content)
    `)
    .eq('user_id', userId)
    .eq('status', 'unresolved')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return conflicts || [];
}

async function resolveMemoryConflict(conflictId: string, resolution: string, notes: string) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  const { error } = await supabase
    .from('memory_conflicts')
    .update({
      status: 'resolved',
      resolution,
      resolution_notes: notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', conflictId);

  return {
    success: !error
  };
}

export default router;

/**
 * USAGE:
 *
 * Add to your Express app:
 * ```typescript
 * import memoryAdminApi from './admin/memory-admin-api';
 * app.use('/api/admin/memory', memoryAdminApi);
 * ```
 *
 * Dashboard endpoints:
 * - GET /api/admin/memory/stats/:userId
 * - GET /api/admin/memory/memories/pending/:userId
 * - POST /api/admin/memory/memories/:memoryId/approve
 * - POST /api/admin/memory/memories/:memoryId/reject
 * - GET /api/admin/memory/memories/search/:userId
 * - PUT /api/admin/memory/memories/:memoryId
 * - DELETE /api/admin/memory/memories/:memoryId
 * - GET /api/admin/memory/workspaces/:userId
 * - GET /api/admin/memory/conflicts/:userId
 * - POST /api/admin/memory/conflicts/:conflictId/resolve
 * - POST /api/admin/memory/sync/pinecone/:userId
 * - POST /api/admin/memory/sync/reset-namespace/:userId
 */