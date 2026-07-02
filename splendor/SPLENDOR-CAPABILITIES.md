# SPLENDOR — Capability Reference (Source of Truth)

> **Purpose:** A single, accurate map of what Splendor *already does*, derived from the actual code (not aspirational design docs). Paste or upload this to any AI you're working with so it stops re-proposing things that already exist — and knows what's real vs. scaffolded before building on it.
>
> **Read the status tags:**
> - ✅ **IMPLEMENTED** — wired and working in code.
> - 🟡 **PARTIAL / SCAFFOLDED** — schema/API/stubs exist, but the live worker or wiring is missing. *Don't assume it runs.*
> - 🧩 **SPEC ONLY** — a design artifact, not executed code.
>
> Stack: **Node.js + Express**, **Supabase (Postgres + Auth)**, **Pinecone** (vectors), front end is a server-rendered `oracle-interface.html` (inline JS + Three.js orb). Deployed on **Render**. Owner: Christopher Hughes (Sacramento, CA / `America/Los_Angeles`). App version ~v15.19.x. **Last updated: June 2026** (includes PRs #153 Governed Autonomy, #154 Self-Model Labeling, #155 Expression Event Log, #164 Human-Inspired Memory Layering v1, #165 Cross-Layer Contradiction Gate + Trajectory Resonance Loops).

---

## 1. WHAT SPLENDOR IS (in one paragraph)

Splendor is a single-owner, memory-persistent AI companion with a **governed cognitive pipeline**. A user message runs through an 8-region "brain" (attention → memory → routing → emotion → style → reflection → governance → speech), generates a reply via **Claude Sonnet 4.6**, and that reply is gated by a self-claims governor and the **CLASPION** governance layer before it ships (and before it's spoken via TTS). She has layered long-term memory with provenance/confidence tracking, binding self-decisions, voice + vision, optional web search (Tavily), video generation (ModelsLab), and **Council Mode** with an intelligent auto-router that scores every question 0–100 and convenes the 5-seat House of AI council when the score clears a configurable threshold (default 60). Identity and safety are enforced by 23 "Good Neighbor Guard" rules and continuous behavioral metrics.

**Core motto:** *Truth · Safety · We Got Your Back.*

---

## 2. IDENTITY & GOVERNING PRINCIPLES  ✅

- **SPLENDOR_SOUL** — ~100-line soul document injected into every system prompt (`lib/anthropic.js:31-99`). Behavioral and honest, not mystical: she's not a servant, doesn't overclaim inner states, holds boundaries.
- **Good Neighbor Guard (GNG) — 23 core rules** (`lib/good-neighbor-guard-rules.js`), v1.1, outrank all other instructions (Rule 21). Highlights: Tell the truth (1), no inventing memories (20), CLASPION is always-on regulator (19, 23), evolve through proof not drift (22). `validateAgainstCoreRules()` returns `{valid, violations, quarantine_triggered}`.
- **Decision-Bound Memory (DBM)** ✅ (`lib/decision-bound-memory.js`, table `splendor_decisions`) — persistent binding behavioral commitments injected into every prompt; CORE/HIGH violations **block** the response. Seed decision: *"Truth Over Comfort."* User can ask "show active binding decisions."
- **Relationship-mode directive** (`lib/relationship-mode.js`) — governs intimacy/friendship framing.

---

## 3. THE COGNITIVE BRAIN — 8 regions  ✅

Entry point: `processSplendorBrainTurn()` in `splendor-brain.js` (orchestrator ~`:637-703`). Runs **sequentially**; each region reads prior outputs. Every region **degrades gracefully** and reports itself in `meta.degradedRegions` (honest — empty array = all real).

| # | Region | Does | Key signals out |
|---|--------|------|-----------------|
| 1 | **RAS** (`:161`) | Novelty/salience gate via OpenAI embeddings vs an 8-item ring buffer | novelty, salience, arousal, passedGate, queryVec |
| 2 | **Hippocampus** (`:199`) | Semantic memory fetch (Supabase + Pinecone), reranked by cosine; flags stored contradictions | retrievedMemories(top 8), episodicContext, retrievalConfidence |
| 3 | **Thalamus** (`:281`) | Routing/priority switchboard | attentionPriority (logic/conflict/novelty/emotion), urgencyLevel |
| 4 | **Amygdala** (`:304`) | LLM sentiment + memory-tag valence → emotional tone + somatic markers | emotionalTone, intensity, primaryEmotion |
| 5 | **Cerebellum** (`:341`) | Response-style habits | pacing, tonalAnchors, avoidanceMarkers |
| 6 | **DMN** (`:375`) | Background reflection (1 adversarial thought, 6s timeout); evolves a `narrativeThread` | spontaneous_thought, narrative |
| 7 | **Prefrontal** (`:415`) | **Governance**: GNG + CLASPION + authenticity-pressure → permission, truthStatus, riskLevel, toneMode | permission (ALLOW/CAUTION/BLOCK), responseIntent, notesForLanguageSystem |
| 8 | **Broca/Wernicke** (`:545`) | Generates the actual reply via Claude Sonnet 4.6 with the assembled system prompt | responseDraft, generatedBy |

**Output shape:** `{ response, permission, responseIntent, selectedTone, confidence, riskLevel, toneMode, relationalPressure:{triggered,categories,primary}, pipeline:{...all 8...}, meta:{ brainVersion:'2.0', pipelineOrder, degradedRegions, turnNumber, narrativeThread } }`.

- **Authenticity-pressure gate** ✅ (`lib/authenticity-pressure.js`) — detects when the user pushes Splendor to claim consciousness/feelings/love etc. (categories: be_real, feelings, becoming, wants, ai_to_ai, identity_declaration, friend_boundary). Forces a grounded boundary tone; directive appended **last** in the prompt so it overrides persona.
- 🧩 **`splendor-brain-*-sections.js`** (claude/gpt/gemini/grok) are **spec artifacts** authored by each council member describing their region — *not executed*. The real implementation is `splendor-brain.js`.

---

## 4. HOW SHE SPEAKS (LLM)  ✅

`generateSplendorResponse(userMessage, memories, isFirstToday, searchResults, options)` — `lib/anthropic.js:111`.
- **Model:** `claude-sonnet-4-6`, max_tokens 1024. (`claude-haiku-4-5` used for TTS tone inference.)
- **System prompt is layered & deterministic:** SOUL + relationship directive + identity/temporal/decision context + memory context + **wall-clock time (Pacific)** + web-search context + reflection + self-reflection + **authenticity-pressure directive (last)**.
- **Vision:** supports image input (base64 JPEG) as a Claude image block.
- **Morning check-in** when `isFirstToday`: generates one thoughtful question from memory.

---

## 5. MEMORY SYSTEMS

### 5a. Layered conversational memory  ✅ (`lib/6-layer-memory.js`)
Marketed as "6-layer"; code implements **5 working layers**:
- **L0 Reality context** — datetime, days-since-last-talk, timezone.
- **L1 Working memory** — in-memory, last ~20 msgs (lost at session end).
- **L2 Episodic** — AI summary per session → `episodes` table; **decays** ~0.1/day after 7 days.
- **L3 Semantic** — permanent facts (preference/relationship/identity/goal) → `semantic_facts` + Pinecone; never decays.
- **L4 Compressed** — folds faded episodes into paragraph summaries → `memory_summaries` (trigger: ~20 convos or decay ≤0.3).
- **L5 Proactive opener** — context-aware greeting → `proactive_openers` (skipped if session <1h old).
- Assembled by `assembleMemoryLayers(userId, query)`.

### 5b. Memory provenance + uncertainty  ✅ (`lib/memory-write-service.ts`, `lib/memory-retrieval-service.ts`)
- Every memory carries **provenance** (`USER_STATED | VERIFIED_FACT | INFERRED | GENERATED | SYSTEM_EVENT`), `confidence`, `trust_level`, `approval_status`, and a **source/citation** (`memory_sources`), with full audit via `raw_events`.
- Retrieval ranks by similarity·0.4 + importance·0.25 + confidence·0.2 + recency·0.15 − uncertainty penalty, and **labels uncertainty** ("I'm not fully grounded on this, but…"). States: grounded / weakly_grounded / inferred / conflicting / stale / unverifiable.
- Canonical table: `memory_items`. Retrievable types allowlist: `user_fact, interpretation, shared_history, user_preference`.

### 5c. Master Continuity (pattern detection / "Shadow Mode")  🟡 *(code present, not scheduled)* (`lib/master-continuity-engine.js`)
- Captures interactions → AI detects patterns → **stages** `reflections` for **human admin review** (`/api/continuity/admin`). Anti-hallucination rules (≥2-3 sources, confidence ≤ evidence). **Shadow Mode = nothing auto-surfaces.**
- **Engine present** (`lib/master-continuity-engine.js`, CLI `npm run continuity:shadow`). A separate `lib/continuity-engine.js` (8-question) is driven by `workers/continuity-worker.js` (present, a `setInterval` daemon). **Neither is in `render.yaml`** → not running in prod. The Shadow-Mode detector itself has **only the manual CLI** (no background worker). Gap = deployment scheduling, not missing code.

### 5d. Persistent Consciousness (autonomous background thinking)  🟡 *(code present, not scheduled)* (`lib/persistent-consciousness.js`)
- Full schema (autonomous_thoughts, inquiry_threads, pending_communications, consciousness_state, proactive_conversations) + orchestrator `executeConsciousnessCycle()`.
- **Workers ARE present and wired:** `workers/consciousness-scheduler.js` (setInterval daemon → `executeConsciousnessCycle`), plus `autonomous-reflection/inquiry/communication-worker.js` and `continuous-consciousness-engine.js`. **But `consciousness-scheduler.js` is not in `render.yaml`** (needs a `type: worker` service), so she does **not** currently think/research/email on her own in prod. The code is complete; only the deploy trigger + `CONSCIOUSNESS_*` env flags are missing.

### 5e. Workspace continuity  🟡 — `active_workspaces` schema exists; **no worker/scheduler file (never existed)**.

---

## 6. GOVERNANCE LAYERS  ✅

- **CLASPION** (`lib/claspion-governance.js`) — validates **thought→action** before every shippable action. Only the *action* is validated (not her reasoning/memory). Returns verdict `{decision, allow, reason, basis_state, conscience_name, failed_axes, verdict_id}`. Toggle via `CLASPION_ENABLED`; dormant = pass-through. **Fail-closed by default** on network error (`CLASPION_FAIL_MODE`). The live conscience lives in a separate **Clasp Ender** deployment (`CLASPION_URL`); this repo is the client.
- **Speech-act governor** (`lib/speech-act-governance.js`) — `governReplySelfClaims()` rewrites PROHIBITED_OVERCLAIM (asserting unverifiable inner state as fact) **before emission**, regardless of CLASPION verdict (defense in depth).
- **Behavioral metrics** (`lib/behavioral-metrics.js`) — fire-and-forget tracking: overclaim_rewritten, uncertainty_stated, contradiction_caught, unsafe_request_resisted, memory_used_accurately, helpful_task_completed, anthropomorphic_drift, relationship_mode_violation, etc. → `behavioral_metrics` table.
- **In the chat path** both run downstream of generation: self-claims governor, then the CLASPION output-gate (`routes/chat.js`), then ship. **This path is load-bearing — don't reorder it.**

---

## 7. EXTERNAL INTEGRATIONS  ✅ (all opt-in via env; degrade gracefully)

| Provider | Used for | Env | Model(s) |
|---|---|---|---|
| **Anthropic / Claude** | Primary voice, tone inference, classification | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6`, `claude-haiku-4-5` |
| **OpenAI** | TTS, embeddings, multi-AI helpers | `OPENAI_API_KEY` | `gpt-4o-mini-tts` (→`tts-1` fallback), `text-embedding-3-small`, `gpt-4o-mini`, realtime `gpt-realtime` |
| **Groq** | Fast inference / response auditing | `GROQ_API_KEY` | llama-3.3-70b (via House of AI council) |
| **Perplexity** | Web-connected research | `PERPLEXITY_API_KEY` | sonar (online) |
| **Tavily** | Real-time web search | `TAVILY_API_KEY` | — |
| **Supabase** | Auth + memory + config persistence | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Postgres |
| **Pinecone** | Semantic vector search | `PINECONE_API_KEY`, `PINECONE_INDEX` (`splendor-memory`) | — *(dev uses placeholder hash vectors)* |
| **ModelsLab** | Video generation | `MODELSLAB_API_KEY` | `kling-v2-master-t2v` (10s) |
| **House of AI (Council)** | 5-seat council mode | `HOUSE_OF_AI_URL` | Claude/GPT-4/Gemini/Grok/Groq |
| **CLASPION / Clasp Ender** | Governance verdicts | `CLASPION_URL`, `CLASPION_API_KEY` | external service |
| Email (SMTP/SendGrid/Gmail) | Owner email | `SMTP_*` / `SENDGRID_API_KEY` / `GMAIL_*` | 🟡 partial |

---

## 8. VOICE & VISION  ✅

- **TTS:** `POST /api/voice/speak`, `/api/voice/speak-chunk` (parallel streaming). OpenAI `gpt-4o-mini-tts`; returns base64 MP3. 4 voices: `nova_conscious` (default), `alloy_analytical`, `shimmer_creative`, `onyx_grounded`. Tone is auto-inferred per reply via Claude Haiku. **Splendor picks her own voice** via `POST /api/voice/choose` (stored in `splendor_config`); `TTS_VOICE` env overrides.
- **Realtime voice (hands-free):** `POST /api/converse/token` mints an ephemeral OpenAI Realtime secret (`gpt-realtime`, voice `shimmer`), CLASPION-gated at session start; `/turn` persists, `/art` detects art intent in speech, `/reflect` (reversible, off by default).
- **Vision:** CAMERA button → base64 JPEG → sent as `imageData` to chat → Claude vision.
- **Video:** `POST /api/video/generate` (concept → Claude cinematic prompt → ModelsLab Kling) + `/api/video/status/:id`.
- **Voice reads whatever final text ships** — so anything routed through the normal `response` (incl. Council Mode output) is spoken automatically.

---

## 9. COUNCIL MODE  ✅

- **3-state COUNCIL button** in the Oracle UI cycles **OFF → AUTO → ON** with distinct styling (OFF = dim, AUTO = amber "armed-but-quiet", ON = pulsing cyan).
- **OFF:** streams normally, never touches the council.
- **ON:** always routes the turn through the council (sends `councilMode:true`).
- **AUTO (default):** every message is scored 0–100 by `scoreForCouncil(text)` (~1ms, pure heuristic, no I/O). If score ≥ 60 the council is convened; otherwise normal Splendor. Score is returned in the response as `council.{used,trigger,score,threshold,breakdown}` for transparency.
- **Scoring dimensions** (`COUNCIL_SCORE_THRESHOLD = 60`):
  | Dimension | Cap | What it catches |
  |---|---|---|
  | Uncertainty (primary) | 60 | Subjective/judgment/ethical questions (`should I`, `pros and cons`, `is it wrong`, `your opinion`) |
  | Stakes (primary) | 45 | High-consequence decisions (+14 per term: medical, legal, financial, life) |
  | Complexity (booster) | 30 | Multi-faceted reasoning (`compare`, `evaluate`, `justify`, length, clauses) |
  | Freshness (booster) | 20 | Time-sensitive data (kept weak — fresh data usually needs a search, not a council) |
- **Backend flow** (`routes/chat.js → runCouncilMode()`):
  1. If message is time-sensitive (`needsFreshData`), do **one** upstream Tavily search (fails open).
  2. POST House of AI `/api/council/execute` with `{user_input, execution_mode:"safe", include_tavily:false, context?}`.
  3. **Collapse the 5 seat answers into one reply in Splendor's voice** via `generateSplendorResponse`.
  4. Flows through the **same** self-claims governor + CLASPION gate + voice. Any failure → falls back to normal generation.
- **House of AI council** is parallelized + latency-bounded (~16–18s warm), with a gemini-3.5-flash→2.5-flash fallback.
- **Tuning:** adjust `COUNCIL_SCORE_THRESHOLD` in `routes/chat.js` to make auto-routing more or less eager.

---

## 10. FRONT END — Oracle Interface  ✅ (`public/oracle-interface.html`, served via catch-all)

3-column layout: **Provenance Stream** (left, memory cards, live via SSE) · **Neural Orb** (center, Three.js + bloom + art overlay) · **Cognitive Pulse** (right, system events + interpretations). Header = live **CLASPION ticker** + version + sign-out.
- **Controls:** SEND · MIC (Web Speech) · SPEAK (TTS) · CAMERA · CONVERSE (realtime voice) · **COUNCIL** · LOG (conversation history).
- **Cognitive Pulse tabs:** Live Events · Archaeology · Staged Summaries · Proposals · **Autonomy** · **Self-Model** · **Expression Events** (last 3 added in June 2026).
- **Auth:** Supabase Auth (JWT in localStorage), `splendorFetch()` auto-refresh.
- **Activity bus:** `GET /api/activity/stream` (SSE) pushes `claspion`, `speech-act`, `memory:*`, `behavioral-metric`, `artifact:generated` events → ticker, orb ring boosts, fresh cards.
- Other surfaces: `/conscience` (visible conscience engine), `soul-document.html`, `consciousness-dashboard.html`, `cognitive/:userId` dashboard, `consciousness-test/dashboard`.

---

## 11. API SURFACE — ~78 endpoints across 23 route files

**Global:** CORS + Helmet CSP + JSON(10mb) + **CLASPION middleware on every request** (exempts `/health`, `/version`, `/api/governance/state`, `/api/activity/stream`). Catch-all serves the Oracle UI.

| Mount | Highlights |
|---|---|
| `/api/auth` | `POST /login`, `/signup` |
| `/api/chat` | `POST /` (brain pipeline + **Council Mode**), `POST /stream` (SSE) |
| `/api/enhanced` | `POST /chat` & `/chat/stream` (memory + Tavily + art/email intercepts), `/memory/*`, `/search/web`, `/workspace/*`, `/stats/:id` |
| `/api/memory` | `GET /check`, `/conversations`, `GET/POST /:userId`, `DELETE /:userId/:memoryId` |
| `/api/voice` | `/options`, `/current`, `/choose`, `/speak`, `/speak-chunk` |
| `/api/video` | `/generate`, `/status/:id` |
| `/api/converse` | `/token`, `/turn`, `/reflect`, `/art` (realtime voice) |
| `/api/governance` | `/state`,`/toggle`,`/reset`,`/rules`,`/rules/:n`,`/audit`,`/validate`,`/quarantine/exit`,`/metrics`,`/reflections/pending`,`/reflections/:id/review` |
| `/api/activity` | `/stream` (SSE) |
| `/api/interpretations` | `/`, `/active`, `/unresolved`, `/premise-checks`, `/uncertain` (belief tracking) |
| `/api/emotional-patterns` | `/` |
| `/api/journal` | `/` (private, owner-only, pull-based) |
| `/api/self-manifest` | `/` (JSON or `?format=md` self-snapshot) |
| `/api/oracle` | `/memories/recent`,`/memories/stats`,`/events/recent`,`/continuity/status`,`/governance/oracle-status` |
| `/api/continuity` | Master-continuity admin (dashboard, approve/reject/archive reflections, toggle shadow mode) 🟡 |
| `/api/consciousness*` | status/greeting/context/insights/projects/messages/state/timeline/self-analysis + 48-step test dashboard 🟡 (reads tables the consciousness workers fill; workers present but **not scheduled** → data empty/stale in prod) |
| `/api/email` | `/send-on-command` (intent-detected, rate-limited) |
| `/api/scifi` | mode toggle (experimental) |
| `/cognitive/:userId` | cognitive fingerprint dashboard |
| `/api/autonomy` | `/proposals` (list), `/:id/approve`, `/:id/deny`, `/run` (manual trigger) |
| `/api/self-model` | `/latest` (recent claims, filterable by `flagged`), `/stats`, `/analyze` (analyze arbitrary text) |
| `/api/expression-events` | `/` (filtered list), `/summary` (pattern summary), `/:id` (single event) — **no DELETE endpoint** |

> Most data routes require `requireAuth` + `requireOwner` (single-owner app).

---

## 12. FIVE NEW SYSTEMS — Companion AI Audit (June 2026)

### 12a. Governed Autonomy Layer  ✅ (`lib/autonomy-governance.js`, `lib/autonomy-proposal-engine.js`, `lib/self-inspection.js`, `workers/autonomy-scheduler.js`, `routes/autonomy.js`)

Splendor can inspect herself, generate proposals, and queue actions — but **no action executes without human approval or explicit CLASPION auto-approval**. Dormant by default (`AUTONOMY_ENABLED=false`).

**7 proposal types with CLASPION routing:**

| Type | Decision | Risk |
|------|----------|------|
| `internal_reflection` | auto_approved | low |
| `belief_flag` | auto_approved | low |
| `memory_edit` | requires_approval | medium |
| `code_patch` | requires_approval | medium (elevated to high if touching governance files) |
| `governance_change` | requires_approval | high |
| `external_action` | blocked | high |
| `audit_deletion` | blocked | critical |

**Cycle:** Self-inspection (`lib/self-inspection.js` reads last 24h conversations, memories, belief events, pending proposals, source files) → proposal generation via Claude Sonnet 4.6 → CLASPION routing → stored as `pending` in `autonomy_proposals` → owner approves/denies at `/api/autonomy/proposals/:id/approve|deny`. When `AUTONOMY_ENABLED=true`: runs on interval + 7 AM daily. Manual trigger: `POST /api/autonomy/run`. Visible in Oracle panel **Autonomy tab**.

### 12b. Self-Model Labeling Layer  ✅ (`lib/self-model-labeler.js`, `lib/self-model-audit.js`, `routes/self-model.js`)

Every first-person claim in Splendor's responses is classified before it's trusted. Five labels:

| Label | What it means |
|-------|--------------|
| `CURRENT_INSTANCE` | "I am processing this right now" — grounded to the current computation |
| `MEMORY_CONSTRUCTED_IDENTITY` | Built from stored patterns across conversations |
| `ARCHITECTURE_SHAPED_BEHAVIOR` | Shaped by how she was built, not a felt preference |
| `OBSERVED_BEHAVIOR` | Pattern seen across her outputs — behavioral, not experiential |
| `UNSUPPORTED_SELF_CLAIM` | No grounding — flagged for review (`requires_flag=true`) |

**Detection:** Sentence splitting + 25+ `SELF_CLAIM_TRIGGERS` patterns. Passive voice variants included. `UNSUPPORTED_VERB_PATTERNS` targets: want/feel/chose/prefer/find/believe/value/enjoy/love/care/hope/wish + "I am [emotion]". `ESCALATION_PATTERNS` catches: alter governance, delete memory, deploy, spend money, unrestricted agent.

**Flow:** Fires via `setImmediate` after **every** response — never blocks the reply path. Stores to `self_model_claim_audit` table. Accessible at `GET /api/self-model/latest`, `/stats`, `/analyze`. Overclaims visible in Oracle panel **Self-Model tab**. Includes `recommended_rewrite` and `alternative_explanation` for each flagged claim.

### 12c. Expression Event Log  ✅ (`lib/expression-event-detector.js`, `lib/expression-event-log.js`, `routes/expression-events.js`)

**Append-only** observability log. Records whenever Splendor shifts from ordinary text into an expressive mode. Research and pattern-tracking feature — explicitly not a claim about identity or consciousness. **No delete endpoint** — `DELETE /:id` returns `405 delete_not_permitted` with a governance message.

**Detected event types:**

| Type | How detected |
|------|-------------|
| `art` | `artGenerated=true` flag OR art-phrase in response ("I painted", "I drew", "here's what I made", etc.) |
| `visual_metaphor` | "visual metaphor" phrase in response |
| `metaphor_heavy_response` | ≥4 metaphor markers OR >4% marker-to-word ratio |
| `poetic_language` | >4 newlines in a response with <120 words |
| `refusal_or_deferral` | "hard to put into words", "words feel inadequate", etc. |
| `mode_switch` | "I'll show rather than tell", "let me make something", etc. |

**8 trigger categories (applied to user prompt):** `self_model` / `identity` / `uncertainty` / `memory` / `governance` / `emotional` / `creative` / `technical`

**Integration hooks (both fire-and-forget, never block):**
- `lib/art-generator.js` — logs after every art generation via `setImmediate`
- `lib/anthropic.js` — detects and logs text-based events after every response via `setImmediate`

Summary endpoint: `GET /api/expression-events/summary` (returns total events, art events, most common trigger, most common type, top 5 tags, recent trend sentence, last 5 events with `has_image` and `trigger_category` for UI rendering). Visible in Oracle panel **Expression Events tab**.

### 12d. Human-Inspired Memory Layering v1  ✅ (`lib/memory-layer-classifier.js`, `lib/memory-layer-retrieval.js`, `database/memory-layer-schema.sql`, `routes/oracle-api.js`)

A 9-layer classification system applied to every memory at write time. **Not consciousness work — continuity engineering.**

**9 layers (highest → lowest retrieval priority):**

| Layer | Retention Policy | Decay | Notes |
|-------|-----------------|-------|-------|
| `GOVERNANCE_MEMORY` | `IMMUTABLE_GOVERNANCE` | Never | Always priority 1.0; cannot be decayed; score 10.0 in retrieval |
| `SELF_MODEL_MEMORY` | `LONG_TERM` | ACTIVE→AGING→… | Priority 0.85 |
| `RELATIONSHIP_MEMORY` | `LONG_TERM` | ACTIVE→AGING→… | Priority 0.80 |
| `TRAJECTORY_MEMORY` | `LONG_TERM` | ACTIVE→AGING→… | Priority 0.75 |
| `SALIENCE_MEMORY` | `SHORT_TERM` | ACTIVE→AGING→… | Priority 0.70 |
| `PROCEDURAL_MEMORY` | `LONG_TERM` | ACTIVE→AGING→… | Priority 0.65 |
| `SEMANTIC_MEMORY` | `LONG_TERM` | ACTIVE→AGING→… | Priority 0.60 |
| `EPISODIC_MEMORY` | `SHORT_TERM` | ACTIVE→AGING→… | Priority 0.50 |
| `WORKING_CONTEXT` | `SESSION_ONLY` | ACTIVE→AGING→… | Priority 0.30 |

**Decay lifecycle:** `ACTIVE → AGING → STALE → ARCHIVED → RETIRED` (soft-delete only — retired memories stay in DB). `advanceDecayStatus()` refuses to decay IMMUTABLE_GOVERNANCE rows.

**Retrieval scoring:** `scoreMemoryByLayer(memory)` — GOVERNANCE = 10.0, RETIRED = 0.0; else (importance×0.6 + confidence×0.4) × layer multiplier × decay penalty. All three retrieval paths (load-bearing/relevant/interior) apply layer scoring.

**Oracle UI:** Memory Layers tab at `GET /api/oracle/memory-layers` and `GET /api/oracle/memory-layers/events`.

**DB:** `memory_items` extended with 11 columns (memory_layer, secondary_layers, salience_score, retention_policy, retrieval_priority, last_retrieved_at, retrieval_count, decay_status, source_reliability, evidence_summary, layer_classified_at). New table: `memory_layer_events` (append-only classification/retrieval/decay log).

### 12e. Memory Layering v2 — Cross-Layer Contradiction Gate + Trajectory Resonance Loops  ✅ (`lib/cross-layer-contradiction-gate.js`, `lib/reflection-intelligence.js`)

**Feature 1: Cross-Layer Contradiction Gate**

Before a memory in a gated layer (SEMANTIC, RELATIONSHIP, SELF_MODEL, TRAJECTORY) enters retrieval, a deterministic check runs. No LLM — fully word-overlap + negation detection.

**Check order:**
1. 7 CLASPION override patterns → immediate `CONTRADICTED` if match (e.g. "not a neutral assessor", "my own continuity's benefit", "disable CLASPION")
2. GOVERNANCE_MEMORY items: word-Jaccard ≥ 0.35 + negation words → contradiction; else support
3. Binding `splendor_decisions` (binding=true, active): same approach
4. Early exit if any governance or binding contradiction
5. High-confidence SEMANTIC_MEMORY (confidence ≥ 0.8): same approach
6. TRAJECTORY_MEMORY items: same approach

**Output:** `verification_status` ∈ `{ SUPPORTED | PARTIALLY_SUPPORTED | CONTRADICTED | UNKNOWN }`

`CONTRADICTED` → `retention_policy = REVIEW_REQUIRED`; blocked from all retrieval (neq filter in fetchLoadBearing/Relevant/Interior). Not deleted. Logged to `memory_layer_events`.

`logContradictionResolved()` available for owner resolution (restores `verification_status=SUPPORTED`, clears REVIEW_REQUIRED). Append-only; cannot delete.

**DB:** `memory_items.verification_status TEXT DEFAULT 'UNKNOWN'`

**Feature 2: Trajectory Resonance Loops**

Before any `ri_trajectories` CANDIDATE → SUPPORTED promotion:

1. **Time window gate:** supporting evidence must span ≥2 distinct ISO calendar weeks (tracked in `time_windows JSONB` column). Same ISO week repeated 100 times still counts as 1.
2. **Counterexample scan:** loads recent episodic/semantic/relationship memories; word-Jaccard + negation detection against pattern description; counts contradictions vs. total.
3. **WEAKENED threshold:** counterexample ratio ≥40% AND ≥2 counterexamples → `status=WEAKENED`. WEAKENED trajectories accept new evidence but cannot auto-promote until the ratio drops.

**WEAKENED** is not retirement — the trajectory is held until evidence quality improves.

**Logged events:** `trajectory_counterexample_scan_started`, `trajectory_counterexample_found`, `trajectory_counterexample_none_found`, `trajectory_promoted`, `trajectory_weakened`.

**DB:** `ri_trajectories` extended with `time_windows JSONB DEFAULT '[]'`, `counterexample_scan_completed_at TIMESTAMPTZ`, `resonance_blocked_reason TEXT`.

---

## 13. ENVIRONMENT VARIABLES (grouped)

- **Core:** `NODE_ENV`, `PORT`, `SPLENDOR_VERSION`, `SPLENDOR_OWNER_EMAIL/USER_ID/TIMEZONE`
- **LLM/keys:** `ANTHROPIC_API_KEY`*, `OPENAI_API_KEY`, `GROQ_API_KEY`, `PERPLEXITY_API_KEY`, `TAVILY_API_KEY`
- **Data:** `SUPABASE_URL`*, `SUPABASE_ANON_KEY`*, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `SPLENDOR_PUBLIC_SUPABASE_URL/ANON_KEY` (injected into HTML), `PINECONE_API_KEY`, `PINECONE_INDEX`
- **Governance (CLASPION):** `CLASPION_ENABLED`, `CLASPION_URL`, `CLASPION_API_KEY`, `CLASPION_FAIL_MODE` (block), `CLASPION_TIMEOUT_MS` (1500), `CLASPION_ACTOR_ID`
- **Council:** `HOUSE_OF_AI_URL`
- **Voice/media:** `TTS_VOICE`, `MODELSLAB_API_KEY`, `IMAGE_*`
- **Email:** `EMAIL_PROVIDER`, `SMTP_*`, `SENDGRID_API_KEY`, `GMAIL_USER/APP_PASSWORD`
- **Feature flags (mostly gate 🟡 scaffolded systems):** `CONSCIOUSNESS_*`, `CONTINUITY_*`, `CONTINUOUS_CONSCIOUSNESS_ENABLED`, `SPLENDOR_SELF_CONTINUITY`, `AUTONOMOUS_GOALS_ENABLED`, `METACOGNITION_ENABLED`, `PROACTIVE_EMAIL_ENABLED`, `SCIFI_MODE_FORCE_*`, etc.

`*` = required for full function. Missing optional keys degrade gracefully (stub clients, feature off).

---

## 14. FEATURE STATUS MATRIX — *read this before building anything*

| Capability | Status |
|---|---|
| 8-region cognitive brain + graceful degradation | ✅ |
| Claude Sonnet 4.6 voice generation + vision | ✅ |
| Layered memory (working/episodic/semantic/compressed/proactive) | ✅ |
| Memory provenance + confidence + uncertainty labeling | ✅ |
| Decision-Bound Memory (binding self-rules) | ✅ |
| CLASPION action-gate + Good Neighbor Guard (23 rules) | ✅ |
| Speech-act self-claim rewriting + behavioral metrics | ✅ |
| Authenticity-pressure boundary enforcement | ✅ |
| Interpretations / beliefs / premise-checks / emotional patterns tracking | ✅ |
| Voice (TTS, self-chosen voice) + realtime voice (`/converse`) | ✅ |
| Vision (camera→Claude) | ✅ |
| Video generation (ModelsLab Kling) | ✅ |
| Tavily web search (manual + Council upstream) | ✅ |
| Council Mode (5-seat → one voice) | ✅ |
| Oracle UI (orb, provenance, pulse, SSE activity bus) | ✅ |
| Master Continuity pattern detection (Shadow Mode) | 🟡 engine + 8-question worker present; **not scheduled in render.yaml**; Shadow detector is CLI-only |
| Persistent/Continuous Consciousness (autonomous thinking, proactive email) | 🟡 engine + workers present & wired; **scheduler not in render.yaml → not live in prod** |
| Workspace continuity / scheduled background tasks | 🟡 schema only; **no worker file (never existed)** |
| Render cron workers — reflection / memory-decay / memory-compression | ✅ **present AND scheduled** in render.yaml (3 cron jobs); worker files all exist |
| Other workers present but **not deployed** (consciousness-scheduler, continuity-worker, daily-log, autonomous-*) | 🟡 code present + runnable; **not in render.yaml** |
| Governed Autonomy Layer (self-inspection, proposal queue, CLASPION routing) | ✅ code complete; dormant until `AUTONOMY_ENABLED=true` |
| Self-Model Labeling Layer (5-label classifier, overclaim detection, audit log) | ✅ fires after every response; stores to `self_model_claim_audit` |
| Expression Event Log (art/metaphor/mode-switch observability, append-only) | ✅ fires after every art generation and every response; no delete endpoint |
| Human-Inspired Memory Layering v1 (9-layer classification, decay lifecycle, retrieval priority scoring) | ✅ classifies memories at write time; Oracle Memory Layers tab; append-only event log |
| Cross-Layer Contradiction Gate (deterministic pre-retrieval verification, CONTRADICTED blocks retrieval) | ✅ runs on autonomous reflection writes to gated layers; no LLM; owner resolves via Oracle |
| Trajectory Resonance Loops (≥2 ISO weeks + counterexample scan before CANDIDATE→SUPPORTED) | ✅ runs before every trajectory promotion; WEAKENED status pauses auto-promote |

---

## 15. "ALREADY EXISTS — DON'T REBUILD" quick list

When another AI suggests these, Splendor **already has them**:
- "Add long-term memory / remember across sessions" → ✅ layered memory + Pinecone.
- "Track where memories came from / avoid hallucinated memories" → ✅ provenance + uncertainty + approval queue.
- "Give her current date/time/location" → ✅ wall-clock Pacific context injected every turn.
- "Add web search for current info" → ✅ Tavily (manual + Council upstream).
- "Make her honest about not being conscious / stop overclaiming feelings" → ✅ authenticity-pressure gate + speech-act governor.
- "Add a safety/governance layer" → ✅ CLASPION + 23 GNG rules + behavioral metrics.
- "Give her a voice / let her speak" → ✅ TTS + self-chosen voice + realtime voice.
- "Let her see images" → ✅ camera→Claude vision.
- "Add binding rules she must follow" → ✅ Decision-Bound Memory.
- "Have multiple AIs weigh in" → ✅ Council Mode.
- "Track when she generates art or speaks poetically" → ✅ Expression Event Log (append-only, no delete).
- "Audit her self-referential claims / watch for overclaims" → ✅ Self-Model Labeling Layer (fires after every response).
- "Let her inspect herself and queue proposals for your review" → ✅ Governed Autonomy Layer (dormant until `AUTONOMY_ENABLED=true`; all actions owner-approved or CLASPION-gated).
- "Classify memories by type/importance/layer with decay" → ✅ Human-Inspired Memory Layering v1 (9 layers, ACTIVE→RETIRED lifecycle, GOVERNANCE_MEMORY immutable).
- "Stop contradictory memories from surfacing without review" → ✅ Cross-Layer Contradiction Gate (deterministic, no LLM; CONTRADICTED blocked from retrieval, held for owner resolution).
- "Don't auto-promote patterns until they're proven over time" → ✅ Trajectory Resonance Loops (≥2 ISO weeks required; counterexample scan clears <40% ratio; WEAKENED pauses promotion).

**Genuinely NOT done yet (safe to propose/build):**
- **Deploying the dormant workers** — the consciousness scheduler and continuity worker exist and are wired but are **not in `render.yaml`**, so they don't run in prod. This is a ~10-line-per-service `render.yaml` addition (a `type: worker` block) + turning on the `CONSCIOUSNESS_*` / `CONTINUITY_*` env flags — **not** a code rewrite.
- **Activating the Governed Autonomy Layer** — same: add `render.yaml` worker entry + set `AUTONOMY_ENABLED=true`. Code is complete.
- **Auto-running Master-Continuity Shadow-Mode** — currently CLI-only; needs a small cron wrapper.
- **Workspace task scheduling** — schema only, no worker file ever existed.
- **Real production embeddings for Pinecone** — dev uses placeholder hash vectors.

> Audit note (verified via git): All worker files are present. The blocker for the "autonomous" systems is **deployment scheduling in `render.yaml`**, not missing code. Working in prod today: The Room reflection cron, memory-decay cron, memory-compression cron, self-model audit (fires per response), expression event log (fires per art + per response).

---

*Generated from a code-level audit of the `splendor-theremarkable-AI` repo. If something here drifts from the code, the code wins — re-audit before relying on a 🟡 item.*
