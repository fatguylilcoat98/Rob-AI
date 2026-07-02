/*
 * MASTER CONTINUITY ROUTES
 * Built by Christopher Hughes · Sacramento, CA
 * Created with Claude Code
 * Truth · Safety · We Got Your Back
 *
 * Shadow Mode Admin Interface
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { runReflectionEngine, captureInteraction } = require('../lib/master-continuity-engine');

// Initialize Supabase client only if environment variables are set
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE - CHECK CONTINUITY SYSTEM ENABLED
// ═══════════════════════════════════════════════════════════════════════════════

// Check if continuity system is properly configured
function requireContinuityEnabled(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      error: 'Master Continuity Layer not configured',
      message: 'Supabase environment variables not set. Set SUPABASE_URL and SUPABASE_SERVICE_KEY to enable continuity features.',
      status: 'disabled'
    });
  }
  next();
}

// Apply middleware to all routes.
// SECURITY: the entire Shadow-Mode admin surface (reads, approve/reject/
// archive mutations, shadow-mode toggle, manual engine runs, and the admin
// UI) is owner-only. requireAuth must run before requireOwner so req.user is
// populated. User identity is taken from req.userId, never from a client-
// supplied user_id (prevents IDOR across users).
router.use(requireContinuityEnabled);
router.use(requireAuth, requireOwner);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * GET /api/continuity/dashboard
 * Main admin dashboard for Shadow Mode
 */
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.userId; // authenticated owner; never a client-supplied id

    // Get staged reflections
    const { data: stagedReflections, error: stagedError } = await supabase
      .from('reflections')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'staged')
      .order('created_at', { ascending: false });

    if (stagedError) throw stagedError;

    // Get developing understanding reflections
    const { data: developingReflections, error: developingError } = await supabase
      .from('reflections')
      .select('*')
      .eq('user_id', userId)
      .eq('state', 'developing_understanding')
      .neq('status', 'archived')
      .neq('status', 'rejected')
      .order('updated_at', { ascending: false });

    if (developingError) throw developingError;

    // Get ready reflections
    const { data: readyReflections, error: readyError } = await supabase
      .from('reflections')
      .select('*')
      .eq('user_id', userId)
      .eq('ready_to_surface', true)
      .neq('status', 'surfaced')
      .neq('status', 'archived')
      .order('readiness_score', { ascending: false });

    if (readyError) throw readyError;

    // Get system health
    const { data: systemHealth, error: healthError } = await supabase
      .from('reflection_system_health')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (healthError && healthError.code !== 'PGRST116') throw healthError;

    // Get recent conflicts
    const { data: conflicts, error: conflictsError } = await supabase
      .from('reflection_conflicts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'unresolved')
      .order('created_at', { ascending: false })
      .limit(10);

    if (conflictsError) throw conflictsError;

    // Get processing stats
    const stats = {
      total_staged: stagedReflections?.length || 0,
      developing: developingReflections?.length || 0,
      ready_to_surface: readyReflections?.length || 0,
      unresolved_conflicts: conflicts?.length || 0,
      shadow_mode_enabled: systemHealth?.shadow_mode_enabled ?? true,
      autonomous_surfacing_enabled: systemHealth?.autonomous_surfacing_enabled ?? false
    };

    res.json({
      success: true,
      stats,
      staged_reflections: stagedReflections || [],
      developing_reflections: developingReflections || [],
      ready_reflections: readyReflections || [],
      system_health: systemHealth,
      recent_conflicts: conflicts || []
    });

  } catch (error) {
    console.error('[Continuity Dashboard] Failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
/**
 * GET /api/continuity/reflection/:id
 * Get detailed reflection information
 */
router.get('/reflection/:id', async (req, res) => {
  try {
    const reflectionId = req.params.id;
    const userId = req.userId; // authenticated owner; never a client-supplied id

    const { data: reflection, error } = await supabase
      .from('reflections')
      .select('*')
      .eq('id', reflectionId)
      .eq('user_id', userId)
      .single();

    if (error) throw error;

    // Get source interactions
    const { data: sourceInteractions, error: sourceError } = await supabase
      .from('interactions')
      .select('*')
      .in('id', reflection.source_interactions || [])
      .order('timestamp', { ascending: true });

    if (sourceError) throw sourceError;

    res.json({
      success: true,
      reflection,
      source_interactions: sourceInteractions || []
    });

  } catch (error) {
    console.error('[Continuity Reflection Detail] Failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
/**
 * POST /api/continuity/reflection/:id/approve
 * Approve a staged reflection
 */
router.post('/reflection/:id/approve', async (req, res) => {
  try {
    const reflectionId = req.params.id;
    const userId = req.userId; // authenticated owner; never a client-supplied id
    const { notes } = req.body;

    const { data: updated, error } = await supabase
      .from('reflections')
      .update({
        status: 'approved',
        reviewer_notes: notes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reflectionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    console.log(`[Continuity Admin] Approved reflection ${reflectionId}`);

    res.json({
      success: true,
      reflection: updated
    });

  } catch (error) {
    console.error('[Continuity Approve] Failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
/**
 * POST /api/continuity/reflection/:id/reject
 * Reject a staged reflection
 */
router.post('/reflection/:id/reject', async (req, res) => {
  try {
    const reflectionId = req.params.id;
    const userId = req.userId; // authenticated owner; never a client-supplied id
    const { reason, notes } = req.body;

    const { data: updated, error } = await supabase
      .from('reflections')
      .update({
        status: 'rejected',
        reviewer_notes: notes || reason || 'Rejected by admin',
        updated_at: new Date().toISOString()
      })
      .eq('id', reflectionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    console.log(`[Continuity Admin] Rejected reflection ${reflectionId}: ${reason}`);

    res.json({
      success: true,
      reflection: updated
    });

  } catch (error) {
    console.error('[Continuity Reject] Failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
/**
 * POST /api/continuity/reflection/:id/archive
 * Archive a reflection
 */
router.post('/reflection/:id/archive', async (req, res) => {
  try {
    const reflectionId = req.params.id;
    const userId = req.userId; // authenticated owner; never a client-supplied id
    const { notes } = req.body;

    const { data: updated, error } = await supabase
      .from('reflections')
      .update({
        status: 'archived',
        state: 'archived',
        reviewer_notes: notes || 'Archived by admin',
        updated_at: new Date().toISOString()
      })
      .eq('id', reflectionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    console.log(`[Continuity Admin] Archived reflection ${reflectionId}`);

    res.json({
      success: true,
      reflection: updated
    });

  } catch (error) {
    console.error('[Continuity Archive] Failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM CONTROL ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
/**
 * POST /api/continuity/system/toggle-shadow-mode
 * Enable/disable Shadow Mode
 */
router.post('/system/toggle-shadow-mode', async (req, res) => {
  try {
    const userId = req.userId; // authenticated owner; never a client-supplied id
    const { enabled } = req.body;

    const { data: health, error } = await supabase
      .from('reflection_system_health')
      .insert({
        user_id: userId,
        shadow_mode_enabled: enabled,
        autonomous_surfacing_enabled: false, // Always disabled
        system_status: enabled ? 'healthy' : 'disabled'
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Continuity Admin] Shadow Mode ${enabled ? 'enabled' : 'disabled'} for user ${userId}`);

    res.json({
      success: true,
      shadow_mode_enabled: enabled,
      system_health: health
    });

  } catch (error) {
    console.error('[Continuity Toggle Shadow Mode] Failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
/**
 * POST /api/continuity/system/run-engine
 * Manually trigger reflection engine
 */
router.post('/system/run-engine', async (req, res) => {
  try {
    const userId = req.userId; // authenticated owner; never a client-supplied id
    const { lookback_hours } = req.body;

    console.log(`[Continuity Admin] Manually triggering reflection engine for user ${userId}`);

    const result = await runReflectionEngine(userId, {
      lookbackHours: lookback_hours || 24
    });

    res.json({
      success: true,
      engine_result: result
    });

  } catch (error) {
    console.error('[Continuity Manual Engine] Failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
/**
 * POST /api/continuity/capture
 * Capture interaction for reflection processing
 */
router.post('/capture', async (req, res) => {
  try {
    const { speaker, content, metadata } = req.body;
    const userId = req.userId; // bind capture to the authenticated owner

    if (!speaker || !content) {
      return res.status(400).json({
        success: false,
        error: 'speaker and content are required'
      });
    }

    const result = await captureInteraction(userId, speaker, content, metadata);

    res.json(result);

  } catch (error) {
    console.error('[Continuity Capture] Failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC ADMIN UI
// ═══════════════════════════════════════════════════════════════════════════════

/**
/**
 * GET /continuity-admin
 * Serve Shadow Mode admin interface
 */
router.get('/admin', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Splendor Continuity Layer — Shadow Mode</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: system-ui, -apple-system, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8f9fa;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px 0;
            margin-bottom: 30px;
        }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { opacity: 0.9; font-size: 1.1em; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-number { font-size: 2.5em; font-weight: bold; color: #667eea; }
        .stat-label { color: #666; margin-top: 5px; }
        .section {
            background: white;
            margin-bottom: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .section-header {
            background: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #dee2e6;
            font-size: 1.3em;
            font-weight: bold;
        }
        .section-content { padding: 20px; }
        .reflection-card {
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 15px;
            background: #fafafa;
        }
        .reflection-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-size: 0.9em;
            color: #666;
        }
        .reflection-summary { font-weight: bold; margin-bottom: 10px; color: #333; }
        .reflection-evidence { color: #555; font-size: 0.95em; line-height: 1.5; }
        .confidence-bar {
            height: 4px;
            background: #e9ecef;
            border-radius: 2px;
            overflow: hidden;
            margin: 10px 0;
        }
        .confidence-fill { height: 100%; background: linear-gradient(90deg, #28a745, #ffc107, #dc3545); }
        .buttons { margin-top: 15px; }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 8px;
            font-size: 0.9em;
            transition: background-color 0.2s;
        }
        .btn-approve { background: #28a745; color: white; }
        .btn-reject { background: #dc3545; color: white; }
        .btn-archive { background: #6c757d; color: white; }
        .btn-inspect { background: #007bff; color: white; }
        .btn:hover { opacity: 0.9; }
        .controls {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
            display: flex;
            gap: 15px;
            align-items: center;
        }
        .controls button {
            padding: 10px 20px;
            border: 1px solid #ccc;
            border-radius: 4px;
            background: white;
            cursor: pointer;
        }
        .controls .btn-primary { background: #007bff; color: white; border-color: #007bff; }
        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
            margin-right: 8px;
        }
        .status-healthy { background: #28a745; }
        .status-warning { background: #ffc107; }
        .status-disabled { background: #6c757d; }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        #loadingSpinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #007bff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="header">
        <div class="container">
            <h1>Splendor Continuity Layer</h1>
            <p>Shadow Mode — Reflection Staging & Review</p>
        </div>
    </div>

    <div class="container">
        <div class="controls">
            <button onclick="loadDashboard()" class="btn-primary">
                <span id="loadingSpinner" style="display: none;"></span>
                Refresh Dashboard
            </button>
            <button onclick="runEngine()">Run Reflection Engine</button>
            <button onclick="toggleShadowMode()" id="shadowModeBtn">Toggle Shadow Mode</button>
            <span id="systemStatus">
                <span class="status-indicator status-healthy"></span>
                System Status: Loading...
            </span>
        </div>

        <div class="stats-grid" id="statsGrid">
            <!-- Stats will be populated by JavaScript -->
        </div>

        <div class="section">
            <div class="section-header">Staged Reflections (Awaiting Review)</div>
            <div class="section-content" id="stagedReflections">
                <div class="empty-state">Loading...</div>
            </div>
        </div>

        <div class="section">
            <div class="section-header">Developing Understanding</div>
            <div class="section-content" id="developingReflections">
                <div class="empty-state">Loading...</div>
            </div>
        </div>

        <div class="section">
            <div class="section-header">Ready (Not Surfaced - Shadow Mode)</div>
            <div class="section-content" id="readyReflections">
                <div class="empty-state">Loading...</div>
            </div>
        </div>
    </div>

    <script>
        let currentData = {};
        const userId = 'default'; // TODO: Get from auth

        async function loadDashboard() {
            const spinner = document.getElementById('loadingSpinner');
            spinner.style.display = 'inline-block';

            try {
                const response = await fetch(\`/api/continuity/dashboard?user_id=\${userId}\`);
                const data = await response.json();

                if (data.success) {
                    currentData = data;
                    updateStats(data.stats);
                    updateSystemStatus(data.system_health);
                    updateReflections('stagedReflections', data.staged_reflections);
                    updateReflections('developingReflections', data.developing_reflections);
                    updateReflections('readyReflections', data.ready_reflections);
                } else {
                    alert('Failed to load dashboard: ' + data.error);
                }
            } catch (error) {
                alert('Dashboard load error: ' + error.message);
            } finally {
                spinner.style.display = 'none';
            }
        }

        function updateStats(stats) {
            document.getElementById('statsGrid').innerHTML = \`
                <div class="stat-card">
                    <div class="stat-number">\${stats.total_staged}</div>
                    <div class="stat-label">Staged Reflections</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${stats.developing}</div>
                    <div class="stat-label">Developing Understanding</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${stats.ready_to_surface}</div>
                    <div class="stat-label">Ready (Not Surfaced)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">\${stats.unresolved_conflicts}</div>
                    <div class="stat-label">Unresolved Conflicts</div>
                </div>
            \`;
        }

        function updateSystemStatus(health) {
            const statusEl = document.getElementById('systemStatus');
            const shadowMode = health?.shadow_mode_enabled ?? true;
            const status = health?.system_status || 'healthy';

            statusEl.innerHTML = \`
                <span class="status-indicator status-\${status}"></span>
                Shadow Mode: \${shadowMode ? 'Enabled' : 'Disabled'} | System: \${status}
            \`;

            document.getElementById('shadowModeBtn').textContent =
                shadowMode ? 'Disable Shadow Mode' : 'Enable Shadow Mode';
        }

        function updateReflections(containerId, reflections) {
            const container = document.getElementById(containerId);

            if (!reflections || reflections.length === 0) {
                container.innerHTML = '<div class="empty-state">No reflections in this category</div>';
                return;
            }

            container.innerHTML = reflections.map(reflection => \`
                <div class="reflection-card">
                    <div class="reflection-meta">
                        <span><strong>Type:</strong> \${reflection.type} | <strong>Impact:</strong> \${reflection.impact_level}</span>
                        <span>\${new Date(reflection.created_at).toLocaleString()}</span>
                    </div>
                    <div class="reflection-summary">\${reflection.summary}</div>
                    <div class="reflection-evidence">\${reflection.evidence_summary}</div>
                    <div class="confidence-bar">
                        <div class="confidence-fill" style="width: \${(reflection.confidence * 100)}%"></div>
                    </div>
                    <div style="font-size: 0.85em; color: #666;">
                        Confidence: \${reflection.confidence?.toFixed(2)} | Evidence: \${reflection.evidence_strength?.toFixed(2)} | Sources: \${reflection.source_interactions?.length || 0}
                    </div>
                    <div class="buttons">
                        <button class="btn btn-inspect" onclick="inspectReflection('\${reflection.id}')">Inspect Sources</button>
                        \${reflection.status === 'staged' ? \`
                            <button class="btn btn-approve" onclick="approveReflection('\${reflection.id}')">Approve</button>
                            <button class="btn btn-reject" onclick="rejectReflection('\${reflection.id}')">Reject</button>
                        \` : ''}
                        <button class="btn btn-archive" onclick="archiveReflection('\${reflection.id}')">Archive</button>
                    </div>
                </div>
            \`).join('');
        }

        async function approveReflection(id) {
            const notes = prompt('Approval notes (optional):');
            try {
                const response = await fetch(\`/api/continuity/reflection/\${id}/approve?user_id=\${userId}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notes })
                });
                const result = await response.json();
                if (result.success) {
                    loadDashboard();
                } else {
                    alert('Approval failed: ' + result.error);
                }
            } catch (error) {
                alert('Approval error: ' + error.message);
            }
        }

        async function rejectReflection(id) {
            const reason = prompt('Rejection reason:');
            if (!reason) return;

            try {
                const response = await fetch(\`/api/continuity/reflection/\${id}/reject?user_id=\${userId}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason })
                });
                const result = await response.json();
                if (result.success) {
                    loadDashboard();
                } else {
                    alert('Rejection failed: ' + result.error);
                }
            } catch (error) {
                alert('Rejection error: ' + error.message);
            }
        }

        async function archiveReflection(id) {
            if (!confirm('Archive this reflection?')) return;

            try {
                const response = await fetch(\`/api/continuity/reflection/\${id}/archive?user_id=\${userId}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                const result = await response.json();
                if (result.success) {
                    loadDashboard();
                } else {
                    alert('Archive failed: ' + result.error);
                }
            } catch (error) {
                alert('Archive error: ' + error.message);
            }
        }

        async function inspectReflection(id) {
            try {
                const response = await fetch(\`/api/continuity/reflection/\${id}?user_id=\${userId}\`);
                const data = await response.json();

                if (data.success) {
                    const sources = data.source_interactions.map(i =>
                        \`[\${i.speaker}] \${i.content.substring(0, 200)}...\`
                    ).join('\\n\\n');

                    alert(\`Reflection Sources:\\n\\n\${sources}\`);
                } else {
                    alert('Inspection failed: ' + data.error);
                }
            } catch (error) {
                alert('Inspection error: ' + error.message);
            }
        }

        async function runEngine() {
            if (!confirm('Run reflection engine now?')) return;

            try {
                const response = await fetch(\`/api/continuity/system/run-engine?user_id=\${userId}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lookback_hours: 24 })
                });
                const result = await response.json();
                if (result.success) {
                    alert(\`Engine completed: \${result.engine_result.processed} interactions, \${result.engine_result.reflections} reflections\`);
                    loadDashboard();
                } else {
                    alert('Engine failed: ' + result.error);
                }
            } catch (error) {
                alert('Engine error: ' + error.message);
            }
        }

        async function toggleShadowMode() {
            const currentlyEnabled = currentData.system_health?.shadow_mode_enabled ?? true;

            try {
                const response = await fetch(\`/api/continuity/system/toggle-shadow-mode?user_id=\${userId}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: !currentlyEnabled })
                });
                const result = await response.json();
                if (result.success) {
                    loadDashboard();
                } else {
                    alert('Toggle failed: ' + result.error);
                }
            } catch (error) {
                alert('Toggle error: ' + error.message);
            }
        }

        // Load dashboard on page load
        loadDashboard();

        // Auto-refresh every 30 seconds
        setInterval(loadDashboard, 30000);
    </script>
</body>
</html>
  `);
});

module.exports = router;