/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// COGNITIVE DASHBOARD ROUTES
// Real-time visualization of cognitive fingerprint development
// Shows how Splendor maps thinking patterns over time

const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { getCognitiveProfile, getProfileSummary } = require('../lib/cognitive-profile-builder');
const { getEvolutionHistory, analyzeEvolutionTrends } = require('../lib/metacognitive-evolution-tracker');
const { getSciFiModeStatus } = require('../lib/scifi-mode-manager');

// Main cognitive dashboard endpoint.
// SECURITY: owner-gated, and the dashboard is keyed to the authenticated
// user's id (req.userId) — the :userId path param is NOT trusted as an
// identity selector (prevents reading another user's cognitive profile).
router.get('/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    const userId = req.userId;

    // Get cognitive profile
    const profile = await getCognitiveProfile(userId);
    const profileSummary = await getProfileSummary(userId);

    // Get evolution history
    const evolutionHistory = await getEvolutionHistory(userId, 50);

    // Get evolution trends
    const evolutionTrends = await analyzeEvolutionTrends(userId, '30 days');

    // Get sci-fi mode status
    const sciFiStatus = await getSciFiModeStatus(userId);

    // Get recent reasoning chains
    const { data: recentReasoning, error: reasoningError } = await supabase
      .from('reasoning_evolution')
      .select('*')
      .eq('user_id', userId)
      .order('tracked_at', { ascending: false })
      .limit(20);

    if (reasoningError) {
      console.error('Dashboard reasoning fetch error:', reasoningError);
    }

    // Serve the dashboard HTML
    res.send(generateDashboardHTML({
      userId,
      profile,
      profileSummary,
      evolutionHistory,
      evolutionTrends,
      recentReasoning: recentReasoning || [],
      sciFiStatus
    }));

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load cognitive dashboard' });
  }
});

// API endpoint for real-time profile data
router.get('/api/:userId/profile', requireAuth, requireOwner, async (req, res) => {
  try {
    const userId = req.userId;
    const profile = await getCognitiveProfile(userId);
    const summary = await getProfileSummary(userId);

    res.json({
      profile: profile?.fingerprint,
      summary,
      confidence: profile?.confidence_score,
      lastUpdated: profile?.last_updated
    });
  } catch (error) {
    console.error('Profile API error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// API endpoint for evolution data
router.get('/api/:userId/evolution', requireAuth, requireOwner, async (req, res) => {
  try {
    const userId = req.userId;
    const { days = 30 } = req.query;

    const evolutionHistory = await getEvolutionHistory(userId, 100);
    const evolutionTrends = await analyzeEvolutionTrends(userId, `${days} days`);

    res.json({
      history: evolutionHistory,
      trends: evolutionTrends
    });
  } catch (error) {
    console.error('Evolution API error:', error);
    res.status(500).json({ error: 'Failed to fetch evolution data' });
  }
});

// Generate dashboard HTML
function generateDashboardHTML(data) {
  const { userId, profile, profileSummary, evolutionHistory, evolutionTrends, recentReasoning, sciFiStatus } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cognitive Dashboard - Splendor</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            min-height: 100vh;
            padding: 20px;
        }

        .dashboard {
            max-width: 1400px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            border: 1px solid rgba(255,255,255,0.2);
        }

        .header {
            grid-column: 1 / -1;
            text-align: center;
            background: rgba(255, 255, 255, 0.9);
        }

        .header h1 {
            color: #4a5568;
            font-size: 2.5rem;
            font-weight: 300;
            margin-bottom: 10px;
        }

        .header .subtitle {
            color: #718096;
            font-size: 1.2rem;
            font-weight: 400;
        }

        .profile-overview h2 {
            color: #2d3748;
            margin-bottom: 20px;
            font-size: 1.8rem;
            font-weight: 500;
        }

        .fingerprint-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 25px;
        }

        .fingerprint-section {
            background: #f7fafc;
            padding: 15px;
            border-radius: 12px;
            border-left: 4px solid #4299e1;
        }

        .fingerprint-section h3 {
            color: #2d3748;
            font-size: 1.1rem;
            margin-bottom: 10px;
            font-weight: 600;
        }

        .fingerprint-section .value {
            color: #4a5568;
            font-size: 0.95rem;
            text-transform: capitalize;
            background: #e2e8f0;
            padding: 5px 10px;
            border-radius: 6px;
            display: inline-block;
            margin: 2px;
        }

        .confidence-meter {
            margin: 20px 0;
            background: #e2e8f0;
            border-radius: 10px;
            height: 8px;
            overflow: hidden;
        }

        .confidence-fill {
            height: 100%;
            background: linear-gradient(90deg, #48bb78, #38a169);
            border-radius: 10px;
            transition: width 0.3s ease;
        }

        .evolution-timeline {
            max-height: 400px;
            overflow-y: auto;
        }

        .evolution-item {
            background: #f7fafc;
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 10px;
            border-left: 4px solid #ed8936;
        }

        .evolution-item .dimension {
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 5px;
        }

        .evolution-item .change {
            font-size: 0.9rem;
            color: #4a5568;
        }

        .evolution-item .timestamp {
            font-size: 0.8rem;
            color: #718096;
            margin-top: 8px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-top: 20px;
        }

        .stat-item {
            text-align: center;
            background: #f7fafc;
            padding: 20px 15px;
            border-radius: 12px;
        }

        .stat-value {
            font-size: 2rem;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 5px;
        }

        .stat-label {
            font-size: 0.9rem;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .reasoning-chain {
            background: #f7fafc;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 10px;
            border-left: 4px solid #9f7aea;
        }

        .reasoning-chain .type {
            font-weight: 600;
            color: #553c9a;
            font-size: 0.9rem;
            margin-bottom: 5px;
        }

        .reasoning-chain .evolution {
            font-size: 0.85rem;
            color: #4a5568;
        }

        .no-data {
            text-align: center;
            color: #718096;
            font-style: italic;
            padding: 40px;
        }

        .scifi-controls {
            background: #f7fafc;
            border-radius: 15px;
            padding: 25px;
            margin: 20px 0;
            border: 2px solid #e2e8f0;
        }

        .scifi-enabled .scifi-controls {
            background: linear-gradient(135deg, #667eea20, #764ba220);
            border: 2px solid #667eea;
        }

        .scifi-status {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            font-weight: 600;
            font-size: 1.1rem;
        }

        .status-indicator.enabled {
            color: #38a169;
        }

        .status-indicator.disabled {
            color: #e53e3e;
        }

        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 10px;
            animation: pulse 2s infinite;
        }

        .status-dot.enabled {
            background: #38a169;
        }

        .status-dot.disabled {
            background: #e53e3e;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .toggle-button {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 1rem;
        }

        .toggle-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .toggle-button.danger {
            background: linear-gradient(135deg, #e53e3e, #c53030);
        }

        .toggle-button.danger:hover {
            box-shadow: 0 4px 12px rgba(229, 62, 62, 0.4);
        }

        .cost-estimate {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-top: 20px;
        }

        .cost-item {
            background: white;
            padding: 15px;
            border-radius: 10px;
            text-align: center;
        }

        .cost-value {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 5px;
        }

        .cost-value.expensive {
            color: #e53e3e;
        }

        .cost-value.normal {
            color: #38a169;
        }

        .feature-list {
            background: white;
            border-radius: 10px;
            padding: 15px;
            margin-top: 15px;
        }

        .feature-list ul {
            margin: 10px 0 0 20px;
            color: #4a5568;
        }

        .feature-list li {
            margin-bottom: 5px;
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            .dashboard {
                grid-template-columns: 1fr;
            }

            .fingerprint-grid {
                grid-template-columns: 1fr;
            }

            .stats-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="card header">
            <h1>🧠 Cognitive Dashboard</h1>
            <p class="subtitle">How Splendor Maps Your Thinking Patterns</p>
        </div>

        <div class="card ${sciFiStatus?.enabled ? 'scifi-enabled' : ''}">
            <h2>🚀 Sci-Fi Mode Control</h2>

            <div class="scifi-controls">
                <div class="scifi-status">
                    <div class="status-indicator ${sciFiStatus?.enabled ? 'enabled' : 'disabled'}">
                        <div class="status-dot ${sciFiStatus?.enabled ? 'enabled' : 'disabled'}"></div>
                        ${sciFiStatus?.enabled ? 'EXPERIMENTAL MODE ACTIVE' : 'STANDARD MODE ACTIVE'}
                    </div>

                    <button class="toggle-button ${sciFiStatus?.enabled ? 'danger' : ''}"
                            onclick="toggleSciFiMode('${userId}', ${!sciFiStatus?.enabled})">
                        ${sciFiStatus?.enabled ? 'DISABLE' : 'ENABLE'} SCI-FI MODE
                    </button>
                </div>

                ${sciFiStatus?.costEstimate ? `
                    <div class="cost-estimate">
                        <div class="cost-item">
                            <div class="cost-value ${sciFiStatus.enabled ? 'expensive' : 'normal'}">
                                ${sciFiStatus.costEstimate.daily}
                            </div>
                            <div class="stat-label">Daily Cost</div>
                        </div>
                        <div class="cost-item">
                            <div class="cost-value ${sciFiStatus.enabled ? 'expensive' : 'normal'}">
                                ${sciFiStatus.costEstimate.monthly}
                            </div>
                            <div class="stat-label">Monthly Cost</div>
                        </div>
                    </div>

                    <div class="feature-list">
                        <strong>${sciFiStatus.enabled ? 'Active' : 'Available'} Features:</strong>
                        <ul>
                            ${sciFiStatus.costEstimate.features.map(feature => `<li>${feature}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>

            ${sciFiStatus?.globalOverride ? `
                <div style="background: #fed7d7; border: 1px solid #fc8181; border-radius: 8px; padding: 15px; margin-top: 15px; color: #742a2a;">
                    <strong>⚠️ Global Override Active</strong><br>
                    Sci-fi mode is ${sciFiStatus.enabled ? 'force-enabled' : 'force-disabled'} via environment variable.
                </div>
            ` : ''}
        </div>

        <div class="card profile-overview">
            <h2>Cognitive Fingerprint</h2>

            ${profileSummary?.exists ? `
                <div class="fingerprint-grid">
                    <div class="fingerprint-section">
                        <h3>Reasoning Style</h3>
                        <div class="value">${profileSummary.reasoningStyle || 'developing'}</div>
                    </div>
                    <div class="fingerprint-section">
                        <h3>Communication</h3>
                        <div class="value">${profileSummary.communicationStyle || 'developing'}</div>
                    </div>
                    <div class="fingerprint-section">
                        <h3>Learning Style</h3>
                        <div class="value">${profileSummary.learningStyle || 'developing'}</div>
                    </div>
                    <div class="fingerprint-section">
                        <h3>Profile Version</h3>
                        <div class="value">v${profileSummary.version || '1.0'}</div>
                    </div>
                </div>

                <div>
                    <strong>Profile Confidence: ${Math.round((profileSummary.confidence || 0) * 100)}%</strong>
                    <div class="confidence-meter">
                        <div class="confidence-fill" style="width: ${Math.round((profileSummary.confidence || 0) * 100)}%"></div>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${profileSummary.conversations || 0}</div>
                        <div class="stat-label">Conversations</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${evolutionHistory?.length || 0}</div>
                        <div class="stat-label">Evolutions</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${evolutionTrends?.stability || 'stable'}</div>
                        <div class="stat-label">Stability</div>
                    </div>
                </div>
            ` : `
                <div class="no-data">
                    <p>Cognitive fingerprint is building...</p>
                    <p>Start a conversation to begin pattern analysis.</p>
                </div>
            `}
        </div>

        <div class="card">
            <h2>Thinking Evolution</h2>

            ${evolutionHistory?.length > 0 ? `
                <div class="evolution-timeline">
                    ${evolutionHistory.slice(0, 10).map(evolution => `
                        <div class="evolution-item">
                            <div class="dimension">${evolution.thinking_dimension}</div>
                            <div class="change">
                                <strong>From:</strong> ${evolution.previous_pattern}<br>
                                <strong>To:</strong> ${evolution.new_pattern}
                            </div>
                            <div class="timestamp">${new Date(evolution.timestamp).toLocaleDateString()}</div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="no-data">
                    <p>No thinking evolution data yet.</p>
                    <p>Evolution tracking begins after your first cognitive profile update.</p>
                </div>
            `}
        </div>

        <div class="card">
            <h2>Decision Reasoning</h2>

            ${recentReasoning?.length > 0 ? `
                <div class="evolution-timeline">
                    ${recentReasoning.slice(0, 8).map(reasoning => `
                        <div class="reasoning-chain">
                            <div class="type">${reasoning.evolution_type}</div>
                            <div class="evolution">Decision ID: ${reasoning.decision_id}</div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="no-data">
                    <p>No decision reasoning data yet.</p>
                    <p>Start making decisions to see reasoning chain analysis.</p>
                </div>
            `}
        </div>

        <div class="card">
            <h2>Pattern Insights</h2>

            ${evolutionTrends ? `
                <div class="fingerprint-grid">
                    <div class="fingerprint-section">
                        <h3>Most Evolving</h3>
                        <div class="value">${evolutionTrends.trends?.most_evolving_dimension || 'none'}</div>
                    </div>
                    <div class="fingerprint-section">
                        <h3>Evolution Type</h3>
                        <div class="value">${evolutionTrends.trends?.dominant_evolution_type || 'none'}</div>
                    </div>
                    <div class="fingerprint-section">
                        <h3>Stability Score</h3>
                        <div class="value">${Math.round((evolutionTrends.stability_score || 0) * 100)}%</div>
                    </div>
                    <div class="fingerprint-section">
                        <h3>Period</h3>
                        <div class="value">${evolutionTrends.period || '30 days'}</div>
                    </div>
                </div>
            ` : `
                <div class="no-data">
                    <p>Pattern analysis developing...</p>
                    <p>Insights will appear as your cognitive profile strengthens.</p>
                </div>
            `}
        </div>
    </div>

    <script>
        // Auto-refresh every 30 seconds
        setInterval(() => {
            window.location.reload();
        }, 30000);

        // Toggle sci-fi mode
        async function toggleSciFiMode(userId, enable) {
            try {
                const response = await fetch(\`/api/scifi/toggle/\${userId}\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ enabled: enable })
                });

                const result = await response.json();

                if (result.success) {
                    alert(result.message);
                    window.location.reload();
                } else {
                    alert('Failed to toggle sci-fi mode: ' + result.error);
                }
            } catch (error) {
                console.error('Toggle error:', error);
                alert('Failed to toggle sci-fi mode');
            }
        }

        // Add some basic interactivity
        document.addEventListener('DOMContentLoaded', () => {
            console.log('Cognitive Dashboard loaded for user: ${userId}');
        });
    </script>
</body>
</html>`;
}

module.exports = router;