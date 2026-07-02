/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// SCI-FI MODE ROUTES
// API endpoints for toggling expensive experimental features

const express = require('express');
const { requireAuth, requireOwner } = require('../middleware/auth');
const router = express.Router();
const {
  isSciFiModeEnabled,
  toggleSciFiMode,
  getSciFiModeStatus
} = require('../lib/scifi-mode-manager');
const {
  handleSciFiModeToggle,
  getSciFiStatusForUser,
  getSystemSciFiStatus
} = require('../lib/scifi-orchestrator');

// Get current sci-fi mode status
router.get('/status/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const status = await getSciFiModeStatus(userId);
    const orchestratorStatus = await getSciFiStatusForUser(userId);

    res.json({
      success: true,
      ...status,
      runtime: orchestratorStatus
    });

  } catch (error) {
    console.error('Sci-fi status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sci-fi mode status'
    });
  }
});

// Toggle sci-fi mode on/off
router.post('/toggle/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const { enabled } = req.body; // Optional: specify enabled state

    const result = await toggleSciFiMode(userId, enabled);

    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'Failed to toggle sci-fi mode'
      });
    }

    // Actually start/stop the sci-fi features
    const orchestratorResult = await handleSciFiModeToggle(userId, result.enabled);

    res.json({
      success: true,
      enabled: result.enabled,
      message: result.message,
      features: orchestratorResult || { note: 'Feature orchestration in progress...' }
    });

  } catch (error) {
    console.error('Sci-fi toggle error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle sci-fi mode'
    });
  }
});

// Enable sci-fi mode
router.post('/enable/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const result = await toggleSciFiMode(userId, true);

    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'Failed to enable sci-fi mode'
      });
    }

    res.json({
      success: true,
      enabled: true,
      message: 'Sci-fi mode ENABLED - Prepare for continuous consciousness!',
      warning: 'API costs will increase significantly. Monitor usage at /cognitive/:userId'
    });

  } catch (error) {
    console.error('Sci-fi enable error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable sci-fi mode'
    });
  }
});

// Disable sci-fi mode
router.post('/disable/:userId', requireAuth, requireOwner, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access other users data' });
    }
    const userId = req.user.id;
    const result = await toggleSciFiMode(userId, false);

    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'Failed to disable sci-fi mode'
      });
    }

    res.json({
      success: true,
      enabled: false,
      message: 'Sci-fi mode DISABLED - Costs reduced to standard levels',
      info: 'Standard cognitive fingerprinting continues normally'
    });

  } catch (error) {
    console.error('Sci-fi disable error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable sci-fi mode'
    });
  }
});

// Get system-wide sci-fi mode status (admin endpoint)
router.get('/system/status', requireAuth, requireOwner, async (req, res) => {
  try {
    const systemStatus = getSystemSciFiStatus();

    res.json({
      success: true,
      system: systemStatus
    });

  } catch (error) {
    console.error('System sci-fi status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system sci-fi status'
    });
  }
});

module.exports = router;