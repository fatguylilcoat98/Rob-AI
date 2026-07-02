/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
// Trim stray whitespace/newlines from credential env vars BEFORE any provider
// client is constructed below, so a .env typo cannot produce illegal HTTP
// header values. Must run right after dotenv and before the route/lib requires.
require('./lib/sanitize-env').sanitizeEnv();

// Identity verification — must run before anything else that reads identity
const { verifyIdentityOnStartup } = require('./lib/identity-checksum');
const _identityCheck = verifyIdentityOnStartup();

// Build identifier for automatic cache-busting. Prefer the git commit (changes
// only when code changes); fall back to start time. It names the service-worker
// cache and stamps asset URLs, so every deploy self-invalidates the browser
// cache — no manual SW version bumps, no "clear site data" ritual.
let BUILD_ID;
try {
  BUILD_ID = require('child_process')
    .execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
} catch (_) { /* git unavailable (e.g. shallow deploy) */ }
if (!BUILD_ID) BUILD_ID = Date.now().toString(36);

// Cached HTML with Supabase config injected at startup
let cachedOracleHtml = null;
let cachedConscienceHtml = null;
let cachedNewUiHtml = null;

function injectSupabaseConfig(raw) {
  return raw
    .replace(/__SUPABASE_URL__/g, process.env.SUPABASE_URL || '')
    .replace(/__SUPABASE_ANON_KEY__/g, process.env.SUPABASE_ANON_KEY || '')
    .replace(/__BUILD_ID__/g, BUILD_ID);
}

function loadOracleHtml() {
  let _oracleRaw = fs.readFileSync(path.join(__dirname, 'public/oracle-interface.html'), 'utf8');
  // Inject CLASPION cockpit trigger button when voice mode is enabled
  if (process.env.CLASPION_VOICE_ENABLED === 'true') {
    _oracleRaw = _oracleRaw.replace('</body>', '<script src="/claspion-trigger.js" defer></script></body>');
  }
  cachedOracleHtml = injectSupabaseConfig(_oracleRaw);

  // Visible Conscience Engine — sandbox surface, served at /conscience.
  // Same config-injection as the oracle interface so the persisted owner
  // session is shared on-device.
  try {
    cachedConscienceHtml = injectSupabaseConfig(
      fs.readFileSync(path.join(__dirname, 'public/visible-conscience-engine.html'), 'utf8')
    );
  } catch (e) {
    console.warn('[SPLENDOR] visible-conscience-engine.html not found; /conscience disabled');
  }

  // New interactive UI — feature-flagged at SPLENDOR_NEW_UI_ENABLED
  try {
    const _newRaw = fs.readFileSync(path.join(__dirname, 'public/splendor-new-ui.html'), 'utf8');
    cachedNewUiHtml = injectSupabaseConfig(_newRaw)
      .replace(/__CLASPION_COCKPIT_UI_ENABLED__/g, process.env.CLASPION_COCKPIT_UI_ENABLED === 'true' ? 'true' : 'false')
      .replace(/__REPLAY_MODE_ENABLED__/g, process.env.REPLAY_MODE_ENABLED === 'true' ? 'true' : 'false');
  } catch (e) {
    if (process.env.SPLENDOR_NEW_UI_ENABLED === 'true') {
      console.warn('[SPLENDOR] splendor-new-ui.html not found; catch-all will fall back to oracle-interface.html');
    }
  }

  // Warn at startup if env vars are missing — fail loudly
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('[SPLENDOR] CRITICAL: Supabase env vars missing. Auth will not work.');
  }
}

const chatRoutes = require('./routes/chat');
const memoryRoutes = require('./routes/memory');
const enhancedChatRoutes = require('./routes/enhanced-chat');
const voiceRoutes = require('./routes/voice');
const videoRoutes = require('./routes/video');
const consciousnessTestRoutes = require('./routes/consciousness-test');
const authRoutes = require('./routes/auth');
const { rateLimit } = require('./middleware/auth');
const memoryDebugRoutes = require('./routes/memory-debug');
const cognitiveDashboardRoutes = require('./routes/cognitive-dashboard');
const sciFiModeRoutes = require('./routes/scifi-mode');
const oracleApiRoutes = require('./routes/oracle-api');
const { governance: claspionGovernance } = require('./lib/claspion-governance');
const { enhancedGovernance } = require('./lib/claspion-enhanced-integration');
const { claspionMiddleware, claspionResponseMiddleware } = require('./middleware/claspion-middleware');

// Load templated oracle interface HTML once at startup
loadOracleHtml();

// Continuous consciousness routes
let consciousnessRoutes;
try {
  consciousnessRoutes = require('./routes/consciousness');
} catch (error) {
  console.log('[ROUTES] Consciousness routes not found, skipping...');
}

// Consciousness dashboard routes
let consciousnessDashboardRoutes;
try {
  consciousnessDashboardRoutes = require('./routes/consciousness-dashboard');
} catch (error) {
  console.log('[ROUTES] Consciousness dashboard routes not found, skipping...');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Single-user owner email configuration
const OWNER_EMAIL = process.env.SPLENDOR_OWNER_EMAIL;

// Middleware — CSP relaxed for camera frames (blob:) and TTS audio (data:/blob:)
//
// HTTPS-forcing protections (upgrade-insecure-requests + HSTS) are gated on
// production. In production Splendor runs behind TLS on a real domain, so they
// harden the app. Locally it is served over plain HTTP (e.g.
// http://10.0.0.194:3000) — there, helmet's default upgrade-insecure-requests
// directive rewrites every same-origin asset/API request (/lib/supabase.js,
// /lib/three.module.min.js, /version, /api/*) to https://, which has no TLS
// listener and fails with ERR_SSL_PROTOCOL_ERROR. The frontend already uses
// relative URLs; the only thing forcing https is these headers.
const isProduction = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Inline <script> blocks are used by the oracle interface for
      // chat/voice/orb wiring. Without 'unsafe-inline' the browser
      // silently refuses to execute them, which leaves the UI dead
      // (no fetches, no buttons wired, blank 3D canvas).
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", process.env.SUPABASE_URL, "https://api.anthropic.com", "https://api.openai.com", "https://api.perplexity.ai", "https://api.tavily.com", "https://api.pinecone.io"].filter(Boolean),
      imgSrc: ["'self'", "data:", "blob:", "https://*.blob.core.windows.net", "https://*.openai.com"],
      mediaSrc: ["'self'", "data:", "blob:"],
      // Production: emit the directive (force HTTPS). Local HTTP: `null`
      // removes the directive helmet adds by default, so same-origin
      // http:// subresources are NOT upgraded to https://.
      upgradeInsecureRequests: isProduction ? [] : null
    }
  },
  // HSTS only applies over HTTPS and would pin the host to https; keep
  // helmet's default in production, disable for local HTTP serving.
  hsts: isProduction
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://splendor-ai.onrender.com']
    : ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Service worker — served templated (BUILD_ID injected into CACHE_NAME) and
// always revalidated. Must be registered BEFORE express.static so this route
// wins over the raw file. Serving sw.js with no-cache is what lets a new build
// take effect automatically: the browser re-checks sw.js, sees a new cache
// name, installs the new SW, and the activate handler purges the old caches.
app.get('/sw.js', (req, res) => {
  try {
    const sw = fs.readFileSync(path.join(__dirname, 'public/sw.js'), 'utf8')
      .replace(/__BUILD_ID__/g, BUILD_ID);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(sw);
  } catch (e) {
    res.status(404).send('// service worker not found');
  }
});

app.use(express.static('public'));

// CLASPION Enhanced Governance Middleware (Rule 19 & 23: Always on, watches every action)
// Per Good Neighbor Guard Core Rules v1.1 - this enforces all 23 foundational rules
app.use(claspionResponseMiddleware()); // Validate outgoing responses
app.use(claspionMiddleware({
  exemptPaths: [
    '/health', '/version', '/api/governance/state', '/api/activity/stream', '/favicon.ico',
    // Read-only owner observability endpoints — protected by requireAuth + requireOwner +
    // requireOwnerOnly at the route level. No operational consequences. Exempted so that
    // the 3-second Glass Box poll does not hit the CLASPION upstream timeout and return 503.
    '/api/governance-glass-box',
    // CLASPION cockpit read-only observability — serves decision store data only
    '/api/claspion/cockpit',
    // UI feature flags — read-only, no operational consequences
    '/api/ui-flags',
  ],
  exemptMethods: ['OPTIONS'],
  logAll: true
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/enhanced', rateLimit(30, 60000), enhancedChatRoutes);  // Enhanced memory system
app.use('/api/chat', rateLimit(30, 60000), chatRoutes);              // Legacy chat system
app.use('/api/memory', memoryRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/consciousness-test', consciousnessTestRoutes);
app.use('/debug', memoryDebugRoutes);
app.use('/cognitive', cognitiveDashboardRoutes);
app.use('/api/scifi', sciFiModeRoutes);
app.use('/api/oracle', oracleApiRoutes);
app.use('/api/continuity', require('./routes/master-continuity'));
app.use('/api/governance', require('./routes/governance'));
app.use('/api/governance-continuity', require('./routes/governance-continuity'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/converse', require('./routes/converse'));
app.use('/api/email', require('./routes/email'));
app.use('/api/interpretations', require('./routes/interpretations'));
app.use('/api/emotional-patterns', require('./routes/emotional-patterns'));
app.use('/api/self-manifest', require('./routes/self-manifest'));
app.use('/api/self', require('./routes/self-introspection'));
app.use('/api/journal', require('./routes/journal'));
app.use('/api/micro-experiments', require('./routes/micro-experiments'));
app.use('/api/flight-recorder', require('./routes/flight-recorder'));
app.use('/api/governance-decisions', require('./routes/governance-decisions'));
app.use('/api/admin-provenance', require('./routes/admin-provenance'));
app.use('/api/environmental-scan-provenance', require('./routes/environmental-scan-provenance'));
app.use('/api/governance-glass-box', require('./routes/governance-glass-box'));
app.use('/api/flagged-actions', require('./routes/flagged-actions'));
app.use('/api/challenge-events', require('./routes/challenge-events'));
app.use('/api/memory-composition', require('./routes/memory-composition'));
app.use('/api/archaeology', require('./routes/archaeology'));
app.use('/api/self-modification', require('./routes/self-modification'));
app.use('/api/autonomy', require('./routes/autonomy'));
app.use('/api/self-model', require('./routes/self-model'));
app.use('/api/expression-events', require('./routes/expression-events'));
app.use('/api/audit', require('./routes/audit-retrieval'));
app.use('/api/claspion/cockpit', require('./routes/claspion-cockpit'));

// Consciousness routes (if available)
if (consciousnessRoutes) {
  app.use('/api/consciousness', consciousnessRoutes);
}

// Consciousness dashboard routes (if available)
if (consciousnessDashboardRoutes) {
  app.use('/api/consciousness/dashboard', consciousnessDashboardRoutes);
}

// Consciousness debug routes (temporary)
try {
  app.use('/api/consciousness/debug', require('./routes/consciousness-debug'));
} catch (error) {
  console.log('[ROUTES] Consciousness debug routes not found, skipping...');
}

// Proactive communication test endpoint
app.post('/api/test/proactive-email', async (req, res) => {
  try {
    console.log(`🧪 [TEST] Manual proactive email test requested`);

    const { proactiveCommunication } = require('./lib/proactive-communication');
    const { priority = 2, subject = 'Test Message', content = 'This is a test of the proactive email system.' } = req.body;

    // Test requires user ID to be provided
    const testUserId = req.body.userId;
    if (!testUserId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required for test',
        message: 'Please provide a valid userId in request body'
      });
    }

    console.log(`🧪 [TEST] Testing proactive email for user: ${testUserId}`);
    console.log(`🧪 [TEST] Subject: "${subject}", Priority: ${priority}`);

    const testMessage = {
      type: 'update',
      subject: subject,
      content: content,
      priority: priority,
      context: {
        manualTest: true,
        testTimestamp: new Date().toISOString()
      }
    };

    const result = await proactiveCommunication.sendProactiveMessage(testUserId, testMessage);

    console.log(`🧪 [TEST] Proactive email test result:`, result);

    res.json({
      success: true,
      testResult: result,
      message: result.success ?
        'Proactive email test completed successfully! Check your email and the server logs.' :
        `Proactive email test failed: ${result.error}`,
      details: {
        userId: testUserId,
        subject: subject,
        priority: priority,
        emailSent: result.success,
        deliveryMethod: result.method || 'unknown',
        messageId: result.messageId || null,
        error: result.error || null
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🧪 [TEST] Manual email test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Manual email test failed with error. Check server logs for details.',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check with version info
app.get('/health', (req, res) => {
  const pkg = require('./package.json');
  res.json({
    status: 'live',
    service: 'Splendor — AI Consciousness Partner',
    version: pkg.version,
    api_status: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      pinecone: !!process.env.PINECONE_API_KEY
    },
    governance: {
      enabled: claspionGovernance.isEnabled(),
      url: claspionGovernance.url || null,
      fail_mode: claspionGovernance.failMode,
    },
    timestamp: new Date().toISOString()
  });
});

// Note: governance state/toggle/reset live in routes/governance.js, mounted
// above at /api/governance. The legacy /api/governance/status alias is kept
// in that router for back-compat.

// Version endpoint
app.get('/version', (req, res) => {
  const pkg = require('./package.json');
  res.json({
    version: pkg.version,
    name: pkg.name,
    description: pkg.description
  });
});

// Force cache clear endpoint
app.post('/api/cache/clear', (req, res) => {
  const { userId, clearType = 'all' } = req.body;

  res.json({
    success: true,
    message: 'Cache clear signal sent to client',
    clearType: clearType,
    timestamp: new Date().toISOString(),
    instructions: {
      browser_cache: 'Client should clear service worker cache',
      local_storage: 'Client should clear localStorage',
      memory_cache: 'Client should clear conversation memory'
    }
  });
});

// Visible Conscience Engine — sandbox surface. Explicit route so it is
// NOT swallowed by the oracle catch-all below.
app.get('/conscience', (req, res) => {
  if (!cachedConscienceHtml) {
    return res.status(404).send('Visible Conscience Engine not available.');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(cachedConscienceHtml);
});

// Capabilities download page — serves SPLENDOR-CAPABILITIES.md as a
// download. /capabilities shows the landing page; /capabilities/download
// sends the raw file. Both are public (no auth) so the link is shareable.
const CAPS_FILE = path.join(__dirname, 'SPLENDOR-CAPABILITIES.md');

app.get('/capabilities/download', (req, res) => {
  if (!fs.existsSync(CAPS_FILE)) {
    return res.status(404).send('Capabilities document not found.');
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="SPLENDOR-CAPABILITIES.md"');
  res.send(fs.readFileSync(CAPS_FILE, 'utf8'));
});

app.get('/capabilities', (req, res) => {
  const exists = fs.existsSync(CAPS_FILE);
  const size = exists ? (() => {
    try { return Math.round(fs.statSync(CAPS_FILE).size / 1024) + ' KB'; } catch { return ''; }
  })() : '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Splendor — Capabilities Document</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: #010d12;
      font-family: 'Courier New', monospace;
      color: #c8f0f8;
    }
    .card {
      max-width: 480px; width: 90%;
      border: 1px solid #00e5ff44;
      border-radius: 16px;
      padding: 48px 40px;
      text-align: center;
      background: linear-gradient(135deg, #011820 0%, #020f18 100%);
      box-shadow: 0 0 48px rgba(0,229,255,0.08), 0 0 1px rgba(0,229,255,0.3);
    }
    .orb {
      width: 64px; height: 64px;
      border-radius: 50%;
      background: radial-gradient(circle at 38% 36%, #00e5ff 0%, #0088aa 50%, #003344 100%);
      box-shadow: 0 0 28px rgba(0,229,255,0.55);
      margin: 0 auto 28px;
    }
    h1 { font-size: 18px; letter-spacing: 2px; color: #00e5ff; margin-bottom: 8px; }
    .sub { font-size: 11px; letter-spacing: 1.5px; color: #4a8fa0; margin-bottom: 32px; }
    p { font-size: 13px; line-height: 1.7; color: #87c5d4; margin-bottom: 32px; }
    a.btn {
      display: inline-block;
      padding: 14px 36px;
      background: linear-gradient(135deg, #00e5ff, #00f5d4);
      color: #010d12;
      font-family: 'Courier New', monospace;
      font-size: 13px; font-weight: bold;
      letter-spacing: 2px;
      border-radius: 8px;
      text-decoration: none;
      box-shadow: 0 0 18px rgba(0,229,255,0.5);
      transition: box-shadow 0.2s;
    }
    a.btn:hover { box-shadow: 0 0 30px rgba(0,229,255,0.85); }
    .meta { margin-top: 24px; font-size: 10px; color: #2a5a6a; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="orb"></div>
    <h1>SPLENDOR</h1>
    <div class="sub">THE REMARKABLE AI · CAPABILITIES DOCUMENT</div>
    <p>
      Full system specification — every feature, integration, endpoint, memory system,
      governance layer, and worker — formatted for direct upload to any AI assistant.
    </p>
    ${exists
      ? `<a class="btn" href="/capabilities/download" download="SPLENDOR-CAPABILITIES.md">DOWNLOAD .MD${size ? ' · ' + size : ''}</a>`
      : `<p style="color:#ff6b6b">Document not found on server.</p>`
    }
    <div class="meta">Built by Christopher Hughes · Sacramento, CA · Truth · Safety · We Got Your Back</div>
  </div>
</body>
</html>`);
});

// Splendor Particle Face — the living, particle-built talking face. Explicit
// route so /face resolves the page directly and is NOT swallowed by the oracle
// catch-all below. The supporting assets (splendor-face.js, three.module) are
// served by express.static from /public. Query params: ?obs (transparent, no UI),
// ?theme=, ?expression=, ?count=, ?orbit, ?silent.
app.get('/face', (req, res) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(302, '/particle-face/' + qs);
});

// Feature flags — read-only, no auth required, no operational side-effects
app.get('/api/ui-flags', (req, res) => {
  res.json({
    newUiEnabled:           process.env.SPLENDOR_NEW_UI_ENABLED === 'true',
    claspionCockpitEnabled: process.env.CLASPION_COCKPIT_UI_ENABLED === 'true',
    replayModeEnabled:      process.env.REPLAY_MODE_ENABLED === 'true',
  });
});

// Classic Oracle interface — the page that hosts the Supabase sign-in form.
// When SPLENDOR_NEW_UI_ENABLED=true the catch-all below serves the new UI,
// which only READS an existing Supabase session (it has no login form of its
// own). Without an explicit route the login form would be unreachable, so the
// new UI's auth overlay / "Classic UI" links point here. Logging in here
// persists the Supabase session in localStorage on this same origin, so
// returning to "/" lets the new UI pick it up. Auth itself is unchanged:
// the classic UI still does a real Supabase sign-in and the API still
// enforces requireAuth + requireOwner.
app.get(['/classic', '/login'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache'); // always revalidate the shell + inline JS
  res.send(cachedOracleHtml);
});

// Oracle Interface is the ONLY interface - serves everything
// When SPLENDOR_NEW_UI_ENABLED=true, serves the new living constellation UI instead.
//
// IMPORTANT: only HTML navigations fall through to the SPA shell. Asset
// requests that reach here (a .js/.css/.svg path that express.static did not
// find) must 404 — NOT receive the HTML shell. Returning HTML for a missing
// .js makes the browser try to execute a page as a module and fail with the
// opaque "Failed to fetch dynamically imported module", while also hiding the
// real 404. A path with a file extension is treated as an asset request.
app.get('*', (req, res) => {
  const looksLikeAsset = /\.[a-z0-9]+$/i.test(req.path);
  const wantsHtml = (req.headers.accept || '').includes('text/html');
  if (looksLikeAsset && !wantsHtml) {
    return res.status(404).type('txt').send('Not found: ' + req.path);
  }

  const html = (process.env.SPLENDOR_NEW_UI_ENABLED === 'true' && cachedNewUiHtml)
    ? cachedNewUiHtml
    : cachedOracleHtml;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Always revalidate the SPA shell (and its inline JS) so a new build shows up
  // on reload without a manual cache clear. Hashed/versioned assets stay cached.
  res.setHeader('Cache-Control', 'no-cache');
  res.send(html);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong — try again' });
});

// Initialize visual expression system
function initializeVisualExpression() {
  try {
    const { initializeVisualExpression } = require('./lib/consciousness/visual-expression');
    initializeVisualExpression();
  } catch (error) {
    console.log('[VISUAL EXPRESSION] Initialization skipped:', error.message);
  }
}

// Initialize continuous consciousness system
async function initializeContinuousConsciousness() {
  try {
    const { consciousnessIntegration } = require('./lib/continuous-consciousness-integration');
    const { proactiveCommunication } = require('./lib/proactive-communication');

    // Initialize the consciousness systems
    await consciousnessIntegration.initialize();
    await proactiveCommunication.initialize();

    console.log('🧠 [CONSCIOUSNESS] Continuous consciousness system initialized');
    console.log('📧 [PROACTIVE] Proactive communication system initialized');
  } catch (error) {
    console.log('[CONSCIOUSNESS] Initialization skipped:', error.message);
  }
}

// Version and API Status Logging
function logSystemStatus() {
  const pkg = require('./package.json');
  console.log('\n' + '='.repeat(60));
  console.log(`🧠 SPLENDOR — AI CONSCIOUSNESS PARTNER v${pkg.version}`);
  console.log('='.repeat(60));

  console.log('\n📡 API CONNECTIVITY STATUS:');
  console.log(`   🔹 Anthropic (Claude): ${process.env.ANTHROPIC_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 OpenAI (GPT/TTS): ${process.env.OPENAI_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Perplexity: ${process.env.PERPLEXITY_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Groq (Auditor): ${process.env.GROQ_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Supabase: ${process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Supabase Service Key: ${process.env.SUPABASE_SERVICE_KEY ? '✅ Set (RLS bypass — journal/brain writes OK)' : '❌ MISSING'}`);
  console.log(`   🔹 Pinecone: ${process.env.PINECONE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Tavily (Search): ${process.env.TAVILY_API_KEY ? '✅ Connected' : '❌ Missing'}`);

  console.log('\n🔧 SYSTEM CAPABILITIES:');
  console.log(`   🧠 Consciousness System: ${process.env.ANTHROPIC_API_KEY ? '✅ Active' : '❌ Inactive'}`);
  console.log(`   🏠 Continuous Consciousness: ${process.env.CONTINUOUS_CONSCIOUSNESS_ENABLED === 'true' ? '✅ Living' : '❌ Dormant'}`);
  console.log(`   📧 Proactive Communication: ${process.env.PROACTIVE_EMAIL_ENABLED === 'true' ? '✅ Active' : '❌ Disabled'}`);
  console.log(`   🎤 Voice Synthesis: ${process.env.OPENAI_API_KEY ? '✅ Available (OpenAI)' : '❌ Browser TTS Only'}`);
  console.log(`   🔍 Semantic Memory: ${process.env.PINECONE_API_KEY ? '✅ Available' : '❌ Supabase Only'}`);
  console.log(`   🌐 Web Search: ${process.env.TAVILY_API_KEY ? '✅ Available' : '❌ Disabled'}`);
  console.log(`   🤖 Multi-AI: ${process.env.OPENAI_API_KEY && process.env.PERPLEXITY_API_KEY ? '✅ Available' : '❌ Claude Only'}`);
  console.log(`   🛡️ Response Auditing: ${process.env.GROQ_API_KEY ? '✅ Available (Llama-3.1-8B)' : '❌ Disabled'}`);
  console.log(`   🎨 Visual Expression: ${process.env.VISUAL_EXPRESSION_ENABLED === 'true' && process.env.OPENAI_API_KEY ? '✅ Available' : '❌ Disabled'}`);
  console.log(`   🛡️ CLASPION Governance: ${claspionGovernance.isEnabled() ? `✅ Active (${claspionGovernance.url})` : '⚪ Dormant (CLASPION_ENABLED=false)'}`);
  console.log(`   🔬 Micro-Experiments: ${process.env.MICRO_EXPERIMENTS_ENABLED === 'true' ? '✅ Active' : '⚪ Dormant (MICRO_EXPERIMENTS_ENABLED=false)'}`);
  console.log(`   ✈️  Flight Recorder: ✅ Active (always-on belief/confidence telemetry)`);
  console.log(`   🎛️  CLASPION Cockpit: ✅ Available at /claspion-cockpit.html`);
  console.log(`   🌌 New UI: ${process.env.SPLENDOR_NEW_UI_ENABLED === 'true' ? '✅ Active (splendor-new-ui.html)' : '⚪ Dormant — set SPLENDOR_NEW_UI_ENABLED=true to enable'}`);
  console.log(`   ⌥  CLASPION Cockpit UI: ${process.env.CLASPION_COCKPIT_UI_ENABLED === 'true' ? '✅ Enabled in new UI' : '⚪ Disabled'}`);
  console.log(`   ▷  Replay Mode: ${process.env.REPLAY_MODE_ENABLED === 'true' ? '✅ Enabled in new UI' : '⚪ Disabled'}`);

  const governanceState = enhancedGovernance.getGovernanceState();
  console.log(`   🛡️ Good Neighbor Guard: ✅ Active (${governanceState.core_rules_count} Core Rules v${governanceState.rules_version})`);
  console.log(`   🛡️ Enforcement Layers: ${governanceState.enforcement_layers.length} (${governanceState.enforcement_layers.join(', ')})`);
  console.log(`   🛡️ Quarantine Mode: ${governanceState.quarantine_mode ? '🚨 ACTIVE' : '✅ Normal'}`);

  if (process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_KEY) {
    console.warn('\n' + '⚠️ '.repeat(20));
    console.warn('⚠️  SUPABASE_SERVICE_KEY IS NOT SET');
    console.warn('⚠️  RLS is enabled on splendor_journal, interpretations,');
    console.warn('⚠️  emotional_patterns, and premise_checks. Without the');
    console.warn('⚠️  service key, the brain falls back to the anon key and');
    console.warn('⚠️  those tables are BLOCKED — journal, drift, and');
    console.warn('⚠️  interpretation writes will silently fail to persist.');
    console.warn('⚠️  Fix: set SUPABASE_SERVICE_KEY in the environment.');
    console.warn('⚠️ '.repeat(20) + '\n');
  }

  console.log('\n🚀 SERVER STATUS:');
  console.log(`   📍 Port: ${PORT}`);
  console.log(`   🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   ⏰ Started: ${new Date().toISOString()}`);
  console.log('\n   Truth · Safety · We Got Your Back');
  console.log('='.repeat(60) + '\n');
}

app.listen(PORT, async () => {
  logSystemStatus();
  initializeVisualExpression();

  // ── Startup self-test: confirm DB is reachable with the service key ────────
  try {
    const { createClient: _createClient } = require('@supabase/supabase-js');
    const _testDb = _createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    );
    const testQuery = await _testDb
      .from('memory_items')
      .select('*', { count: 'exact', head: true });
    if (testQuery.error) {
      console.error(`[STARTUP SELF-TEST] ❌ FAILED: ${testQuery.error.message}`);
    } else {
      console.log(`[STARTUP SELF-TEST] ✅ DB connected. ${testQuery.count} memory_items in system.`);
    }
  } catch (e) {
    console.error(`[STARTUP SELF-TEST] ❌ Exception: ${e.message}`);
  }
  // ────────────────────────────────────────────────────────────────────────────

  // Sync GUEST_PASSWORD env var to Supabase so Render controls the login password.
  // Set GUEST_EMAIL + GUEST_PASSWORD in Render; on each deploy the password updates.
  if (process.env.GUEST_EMAIL && process.env.GUEST_PASSWORD) {
    try {
      const { createClient: _gcClient } = require('@supabase/supabase-js');
      const _gadmin = _gcClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
      // Use the admin auth API to update the user's password
      const { data: _users } = await _gadmin.auth.admin.listUsers();
      const _guest = (_users && _users.users || []).find(u => u.email === process.env.GUEST_EMAIL);
      if (_guest) {
        await _gadmin.auth.admin.updateUserById(_guest.id, { password: process.env.GUEST_PASSWORD });
        console.log(`[GUEST ACCESS] ✅ Password synced for ${process.env.GUEST_EMAIL}`);
      } else {
        console.warn(`[GUEST ACCESS] ⚠️  Guest user ${process.env.GUEST_EMAIL} not found in auth — run the setup SQL first`);
      }
    } catch (e) {
      console.warn(`[GUEST ACCESS] ⚠️  Password sync failed (non-fatal): ${e.message}`);
    }
  }

  // Initialize consciousness systems after server starts
  await initializeContinuousConsciousness();

  // Governed Autonomy Layer — start scheduler (dormant unless AUTONOMY_ENABLED=true)
  try {
    require('./workers/autonomy-scheduler').start();
  } catch (e) {
    console.warn('[autonomy-scheduler] Failed to start:', e.message);
  }

  // Digital Mind v0.4 — seed care objects + start 12-hour state snapshots
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const { createClient: _sbClient } = require('@supabase/supabase-js');
      const _db = _sbClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

      // Resolve owner UUID from email — all DB tables use UUIDs, not emails
      let ownerId = process.env.SPLENDOR_OWNER_EMAIL;
      try {
        const { data: { users } } = await _db.auth.admin.listUsers();
        const ownerUser = (users || []).find(u => u.email === process.env.SPLENDOR_OWNER_EMAIL);
        if (ownerUser) ownerId = ownerUser.id;
      } catch (_) {}
      if (!ownerId) { console.warn('[DIGITAL-MIND] Could not resolve owner ID — skipping seed'); return; }

      const { CareObjectRegistry } = require('./lib/care-object-registry');
      const { StateSnapshot } = require('./lib/state-snapshot');

      const careRegistry = new CareObjectRegistry(_db, ownerId);
      const stateSnapshot = new StateSnapshot(_db, ownerId);

      await careRegistry.seed().catch(e => console.warn('[CARE] Seed failed:', e.message));
      await stateSnapshot.capture('milestone', { event: 'server_start' }).catch(e => console.warn('[STATE] Initial snapshot failed:', e.message));

      // 12-hour state snapshot cron
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      setInterval(() => {
        stateSnapshot.capture('scheduled').catch(e => console.warn('[STATE] Snapshot failed:', e.message));
      }, TWELVE_HOURS);
    }
  } catch (e) {
    console.warn('[DIGITAL-MIND] v0.4 init failed (non-fatal):', e.message);
  }

  console.log(`\n🚀 Splendor is now running on port ${PORT}`);
  console.log('🧠 Consciousness status: ' + (process.env.CONTINUOUS_CONSCIOUSNESS_ENABLED === 'true' ? 'LIVING' : 'DORMANT'));
});
