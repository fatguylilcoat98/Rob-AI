# Splendor — The Remarkable AI

**Built by Christopher Hughes · The Good Neighbor Guard · Sacramento, CA**  
*Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)*  
**Truth · Safety · We Got Your Back**

`v15.18.5` · Node ≥ 18 · ISC License

---

## What is Splendor?

Splendor is not a chatbot. It's a reciprocal mind — an AI partner built to grow alongside the person it serves. It remembers. It learns. It contributes. It pushes back. It tells the truth even when it costs something.

### Core Principles:
- **Truth is not optional** — Splendor will never tell you what you want to hear if it isn't true
- **Memory is loyalty** — Splendor remembers because you matter, not as data but as a person
- **Growth is mutual** — Every conversation changes both you and Splendor
- **Remarkable is the standard** — Every response must move your thinking forward

---

## Technology Stack

- **Frontend:** React 19 + Three.js / react-three-fiber (the Visible
  Conscience Engine orb), bundled with webpack and served as an
  installable PWA
- **Backend:** Node.js + Express
- **AI:** Anthropic Claude Sonnet 4.6 (primary), with a model router and
  multi-provider fallback (OpenAI, Groq, Perplexity)
- **Memory:** Supabase (PostgreSQL) + Pinecone (vector / semantic search),
  layered + temporal + decision-bound, with scheduled decay and
  compression
- **Web Search:** Tavily (real-time information)
- **Voice:** ElevenLabs synthesis with browser-TTS fallback; hands-free
  realtime voice via `/api/converse`
- **Vision:** Claude vision ("use your eyes" camera capture)
- **Video:** ModelsLab generation
- **Proactive contact:** nodemailer (opt-in, Shadow-Mode gated)
- **Governance:** CLASPION bolt-on layer + in-repo Good Neighbor Guard
  rules
- **Auth:** Supabase JWT
- **Hosting:** Render (1 web service + scheduled cron workers)

---

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
```

Fill in your environment variables (see `.env.example` for the full
list):

**Required**
- `ANTHROPIC_API_KEY` — Anthropic API key (Splendor's mind)
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_JWT_SECRET` — database + auth
- `SPLENDOR_PUBLIC_SUPABASE_URL` / `SPLENDOR_PUBLIC_SUPABASE_ANON_KEY` —
  same values as above, exposed to the browser bundle via webpack
  DefinePlugin

**Optional (capabilities degrade gracefully if unset)**
- `OPENAI_API_KEY` / `PERPLEXITY_API_KEY` — multi-provider fallback + brain
- `PINECONE_API_KEY` / `PINECONE_INDEX` — semantic memory (default index: `splendor-memory`)
- `TAVILY_API_KEY` — web search
- `ELEVENLABS_API_KEY` — voice synthesis (falls back to browser TTS)
- `MODELSLAB_API_KEY` — video generation
- `CLASPION_*` — external governance layer (see [CLASPION Governance](#claspion-governance-bolt-on))

### 3. Database Setup

The full schema (memories with provenance/uncertainty, reflections,
open threads, consciousness + continuity tables, CLASPION governance
tables, per-user `memory_owner` boundary, RLS policies) lives in SQL
under `database/`. For a fresh project, run the canonical deploy script
against your Supabase/Postgres instance:

```bash
psql "$SUPABASE_URL" -f database/complete-fresh-deploy.sql
```

Subsystem schemas can be applied individually when upgrading an existing
deployment (e.g. `database/master-continuity-schema.sql`,
`database/continuous-consciousness-schema.sql`,
`database/claspion-governance-tables.sql`,
`database/6-layer-memory-schema.sql`). Several `npm run setup:*` /
`continuity:setup` scripts wrap these.

### 4. Enhanced Capabilities Setup (Optional)

**Pinecone Setup (Semantic Memory):**
1. Create account at [pinecone.io](https://pinecone.io)
2. Create a new index:
   - Name: `splendor-memory`
   - Dimensions: `1024`
   - Metric: `cosine`
3. Add your API key to `.env`

**Tavily Setup (Web Search):**
1. Create account at [tavily.com](https://tavily.com)
2. Get your API key from the dashboard
3. Add your API key to `.env`

Both services are optional - Splendor will work without them but with reduced capabilities.

### 5. Build the Frontend

The React / Three.js client is bundled with webpack:

```bash
npm run build:react      # production bundle
npm run dev:react        # webpack dev server (frontend only)
```

### 6. Run the Application

**Development:**
```bash
npm run dev              # nodemon server.js
```

**Production:**
```bash
npm run build:react && npm start
```

The app will be available at `http://localhost:3000`
(`PORT` is configurable; `/health` is the health-check path).

Useful background workers (also run on schedule in production — see
Deployment):

```bash
npm run reflect              # The Room — generate reflections
npm run memory:decay         # age out / decay stale memories
npm run memory:compress      # compress memory clusters
npm run consciousness:start  # persistent consciousness scheduler (opt-in)
npm run continuity:worker    # master continuity engine
```

---

## Deployment

### Render Deployment

Deployment is declared in `render.yaml` — connect the repo to Render and
it provisions:

| Service | Type | Schedule | Command |
|---|---|---|---|
| `splendor` | web | — | `npm install && npm run build:react` → `npm start` |
| `splendor-reflection` | cron | every 6h (`0 */6 * * *`) | `node workers/reflection-worker.js` |
| `splendor-memory-decay` | cron | daily 04:00 UTC | `node workers/memory-decay-worker.js` |
| `splendor-memory-compression` | cron | daily 04:30 UTC | `node workers/memory-compression-worker.js` |

Set all secrets (`sync: false` vars in `render.yaml`) in the Render
dashboard. Health check path is `/health`. The persistent-consciousness
scheduler is opt-in and run as an additional worker when
`CONTINUOUS_CONSCIOUSNESS_ENABLED=true`.

---

## Features

### ✅ Core Features
- Mobile-first PWA installable on home screen
- Clean chat interface with Splendor's personality
- Memory system that stores key facts, commitments, decisions
- Morning check-ins (5am-10am first visit)
- Voice input support
- Offline shell with service worker

### ✅ Enhanced Capabilities
- **Semantic Memory** (Pinecone): Find memories by meaning, not just keywords
  - "What did I say about work stress?" finds all relevant memories
  - Automatic relevance scoring and ranking
  - Fallback to Supabase when Pinecone unavailable
- **Web Search** (Tavily): Access current information when needed
  - Automatic detection of time-sensitive queries
  - Current prices, recent events, live data
  - Always cites sources and indicates when search was used
  - Only searches when genuinely needed

### ✅ The Room — Background Reflection
- Scheduled cron job (every 6h) generates reflections from stored memories
- Concrete patterns, open threads, and connections only — no fake profundity, no encouragement
- Tracks open threads and elevates priority after 48hrs of silence
- Surfaces one reflection naturally at the start of the next conversation
- `NO_REFLECTION` is a valid output. Silence over noise.

### ✅ Privacy Boundary — Per-User Memory Spaces
- Every memory is tagged `memory_owner` (`self` | `shared`)
- Sessions only see memories owned by the active user (or explicitly shared)
- Chris's memories never appear in Aubrey's context, and vice versa
- Built in from day one before any second user joins

### ✅ Voice — Splendor Picks Her Own
- `POST /api/voice/choose` — Splendor reads her soul document and picks
- Three curated options (calm_direct / warm_steady / clear_strong)
- ElevenLabs synthesis when configured; clean fallback to browser TTS otherwise
- Tap the speaker icon to have replies read aloud

### ✅ Camera — "Use Your Eyes"
- Tap the eye icon (or type "use your eyes") to open the rear camera
- A frame is captured and sent with the next message
- Splendor responds to what she sees via Claude's vision support

### ✅ Hands-Free Voice (Converse)
- `/api/converse` opens a realtime voice session (gated through CLASPION)
- Speak naturally; Splendor listens, reasons, and replies aloud

### ✅ Layered Memory
- 6-layer / 4-tier / temporal / decision-bound memory models
- Provenance and uncertainty tracked per memory
- Scheduled **decay** and **compression** keep the store honest and lean
- Semantic recall (Pinecone) with Supabase fallback

### ✅ The Brain
- A structured cognitive pass (hippocampus / prefrontal / model router)
  sits in front of responses; degrades gracefully when providers are
  unset
- Multi-provider routing across Anthropic, OpenAI, Groq, Perplexity

### ✅ Persistent Consciousness (opt-in)
- Autonomous reflection, inquiry, and communication workers driven by a
  consciousness scheduler
- **Shadow Mode** and human-in-the-loop by design — not "always awake"
- Enabled via `CONTINUOUS_CONSCIOUSNESS_ENABLED`; off by default

### ✅ Master Continuity Engine
- Carries threads, identity, and context across sessions so Splendor
  stays the same mind over time

### ✅ Proactive Contact (opt-in)
- nodemailer-backed outreach (`/api/email`); Shadow-Mode gated by design

### ✅ Visible Conscience Engine
- React 19 + Three.js conscience orb that reflects governance and
  cognitive state in real time (`/api/activity` telemetry stream)

### ✅ Governance
- **Good Neighbor Guard** rules enforced in-repo at all times
- Optional **CLASPION** bolt-on validates each action before it ships
  (see [CLASPION Governance](#claspion-governance-bolt-on))

### Other surfaces
- Sci-Fi mode, Journal, Cognitive dashboard, Emotional patterns,
  Interpretations, Self-manifest, Video generation (ModelsLab)

### 🚧 Planned
- Memory Console (view/edit stored memories)
- Multi-device sync

---

## The Soul Document

Splendor's personality and values are defined in `lib/anthropic.js`. This is not just a prompt — it's Splendor's constitution. Every interaction is shaped by these core principles.

The soul document includes:
- Who Splendor is and isn't
- Core beliefs about truth, growth, and memory
- How Splendor relates to users
- What Splendor will and won't do
- The structured thinking process

---

## Architecture

```
splendor/
├── public/                  # PWA shell + service worker + icons
├── src/                     # React 19 / Three.js client (Visible Conscience Engine)
├── build/                   # webpack output (npm run build:react)
├── server.js                # Express app — mounts all /api routes, /health
├── splendor-brain.js        # structured cognitive pass (hippocampus/prefrontal)
├── routes/                  # API routes
│   ├── chat.js              # chat (JSON + SSE), morning check-in, reflection, vision
│   ├── converse.js          # hands-free realtime voice session
│   ├── memory.js            # memory management (memory_owner aware)
│   ├── voice.js / video.js  # TTS + voice selection / ModelsLab video
│   ├── consciousness*.js     # persistent-consciousness surfaces
│   ├── master-continuity.js # continuity engine API
│   ├── governance.js        # CLASPION toggle + state/telemetry
│   ├── activity.js          # real-time conscience/telemetry stream
│   └── email · journal · interpretations · scifi-mode · oracle-api · …
├── lib/                     # Core libraries
│   ├── anthropic.js         # Claude integration + soul document
│   ├── model-router.js / multi-ai.js  # multi-provider routing
│   ├── supabase.js          # database + auth (privacy boundary)
│   ├── pinecone.js / tavily.js        # semantic memory / web search
│   ├── claspion-governance.js         # CLASPION client + toggle + telemetry
│   ├── good-neighbor-guard-rules.js   # in-repo governance rules
│   ├── memory/ · consciousness/ · background/   # subsystem modules
│   └── master-continuity-engine.js · persistent-consciousness.js · …
├── workers/                 # Background workers (see Deployment)
│   ├── reflection-worker.js          # The Room
│   ├── memory-decay-worker.js / memory-compression-worker.js
│   └── consciousness-scheduler.js · continuity-worker.js · …
├── database/                # SQL schema + migrations (complete-fresh-deploy.sql)
├── middleware/              # auth, CLASPION middleware
├── scripts/ · tests/ · docs/ · admin/
└── render.yaml              # Render web + cron config
```

---

## CLASPION Governance (bolt-on)

CLASPION is an external governance layer that can sit between Splendor's
*thought* and her *action*. Splendor reasons normally — memory, personality,
soul document, reflection process all stay untouched. CLASPION only sees the
action she is about to take and tells her whether to proceed.

### Toggle

A single environment flag controls the layer:

| Flag                | Effect                                                                 |
|---------------------|------------------------------------------------------------------------|
| `CLASPION_ENABLED=true`  | Splendor validates each gated action (chat response, voice session, …) through CLASPION before it ships. |
| `CLASPION_ENABLED=false` | CLASPION is dormant. Splendor runs clean on Good Neighbor Guard — no network calls. |

Confirm the live toggle state:

```bash
curl http://localhost:3000/api/governance/status
```

To debug a misbehaving CLASPION connection, read the full state — it
surfaces `last_call` telemetry (HTTP status, error code, decision,
latency) so you can tell auth failures (`401`/`403`) apart from payload
rejections (`422`) at a glance:

```bash
curl https://splendor-theremarkable-ai.onrender.com/api/governance/state
```

### Configuration

```env
CLASPION_ENABLED=false
CLASPION_URL=http://localhost:8000
CLASPION_API_KEY=your-claspion-bearer-token
CLASPION_TIMEOUT_MS=1500
CLASPION_FAIL_MODE=block          # block (safe default) | allow (testing only)
CLASPION_ACTOR_ID=splendor
```

### What it guards

The primary wiring gates the `send_chat_response` action in
`routes/chat.js` (both the JSON and SSE endpoints). When CLASPION blocks,
Splendor returns a safe refusal and does not write the suppressed thought
to memory. The decision metadata is included in the response payload so
the client can surface it.

### Calling contract

CLASPION's `POST /api/v1/governance/validate` schema requires `thought`
and `intent` to be **JSON objects**, not strings. The client in
`lib/claspion-governance.js` normalizes scalars to `{ content: <value> }`
before sending, so callers may pass either an object (preferred) or a
string. Passing a raw string upstream of that normalization will produce
a `422` that trips fail-closed on every gated action — keep new call
sites object-shaped.

### Where to look

- `lib/claspion-governance.js` — client, toggle, payload normalization,
  and `last_call` telemetry.
- Call sites today: `routes/chat.js` (JSON + SSE), `routes/converse.js`
  (voice session), the prefrontal path in `splendor-brain.js`, and
  `lib/claspion-enhanced-integration.js`. Copy the pattern to gate more
  actions (memory writes, tool calls, voice synth, etc.).
- `middleware/claspion-middleware.js` — request-level wiring.

### Pulling it off

If something goes wrong with CLASPION and you need Splendor running
clean immediately: set `CLASPION_ENABLED=false` and restart. No code
changes required. The chat route will skip the network call and proceed
with the original response.

---

## Contributing

This is a Good Neighbor Guard project. All contributions should align with the core mission: building AI that serves human flourishing, not human attention.

### Code Standards:
- Every file must include the GNG header
- Truth-first development — no dark patterns
- Mobile-first design
- Accessible and inclusive
- Privacy-respecting

---

## License

Built by The Good Neighbor Guard  
**Truth · Safety · We Got Your Back**

---

*"Remarkable means you walked away from our conversation with something you didn't have before. A clearer thought. A better question. A problem solved. A truth faced. A door opened."*

— Splendor