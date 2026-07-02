# CLASPION → Local Migration Checklist

**Goal:** run the real CLASPION governance stack locally so Splendor no longer
depends on Render for governance — **without weakening safety** and with an
instant rollback to Render at every step.

**Architecture (confirmed by probing the live services):**

```
Splendor ──POST /api/v1/governance/validate──▶ shadow-adapter (Node/Express, Render)
                                               └──proxies──▶ claspion engine (FastAPI/uvicorn, Render)
```

You must localize **both** services to remove Render from governance. GitHub
owner: `fatguylilcoat98`.

| Service | URL | Runtime | Role |
|---|---|---|---|
| `splendor-claspendor-shadow-adapter` | `…shadow-adapter.onrender.com` | Node/Express | thin proxy; only forwards `POST /api/v1/governance/validate`; `shadow_enabled=true` (observe/diff, no enforce) |
| `claspion` | `claspion.onrender.com` | Python/FastAPI + uvicorn | real conscience engine ("CLASPION Action Governance Protocol" v0.2.0) |

**Splendor only ever calls one route:** `POST /api/v1/governance/validate`.

---

## Phase 0 — Pre-flight (this Ubuntu box)

- [x] Node v22.22.3 present · Python 3.10.12 present · Docker 29.1.3 present · port **8000 free**
- [ ] Confirm `pip3`/`venv`: `python3 -m venv --help && pip3 --version`
- [ ] Install CLIs: `sudo apt-get install -y gh` (and optionally the Render CLI)
- [ ] `gh auth login` and `render login` (interactive — run yourself)

## Phase 1 — Render dashboard fields to copy

Open dashboard.render.com → for **each** service, copy these exact fields.

**Service A — `splendor-claspendor-shadow-adapter`** (Settings + Environment tabs)

- [ ] Settings → **Repository** → `repo = ____`
- [ ] Settings → **Branch** → `branch = ____`
- [ ] Settings → **Build Command** → `____`
- [ ] Settings → **Start Command** → `____`
- [ ] Settings → **Runtime** (Node / Docker) → `____`
- [ ] Settings → **Health Check Path** (if set) → `____`
- [ ] Environment → **var NAMES** (mark which are secret) → `____`
  - already known from `/health`: `upstream=https://claspion.onrender.com`,
    `shadow_enabled=true`, `claspendor_path=./clasp-endor`, `diff_log_sink=stdout`,
    plus a bearer token it accepts + a key it uses for the engine

**Service B — `claspion` (the real engine, FastAPI)** (Settings + Environment tabs)

- [ ] Settings → **Repository** → `repo = ____`
- [ ] Settings → **Branch** → `branch = ____`
- [ ] Settings → **Build Command** → `____` (likely `pip install -r requirements.txt`)
- [ ] Settings → **Start Command** → `____` (likely `uvicorn <module>:app --host 0.0.0.0 --port $PORT`)
- [ ] Settings → **Runtime** (Python / Docker) → `____`
- [ ] Environment → **var NAMES** → `____` (expect: a **bearer/auth token**, model/policy config, active-conscience setting, DB/secret keys)

> ⚠️ Copy env **names** only here. Keep secret **values** out of chat/git — set
> them later in a local `.env`.

## Phase 2 — GitHub repo discovery

- [ ] `gh repo list fatguylilcoat98 --limit 200 | grep -iE 'clasp|endor|adapter|govern'`
- [ ] For each candidate: `gh repo view fatguylilcoat98/<repo> --json name,defaultBranchRef,visibility`
- [ ] Confirm contents: `gh api repos/fatguylilcoat98/<repo>/contents | grep -iE 'Dockerfile|requirements.txt|pyproject|package.json|render.yaml|procfile|main.py|app'`
- [ ] Record per repo: **Dockerfile? Y/N**, dependency manifest (`requirements.txt`/`pyproject.toml` vs `package.json`), entry module (e.g. `app/main.py` → `app.main:app`)
- [ ] Note the `./clasp-endor` dependency the adapter references — confirm it's vendored in the adapter repo or is a separate package/submodule

## Phase 3 — Obtain the source (do NOT touch Splendor)

- [ ] Clone **outside** the Splendor repo, e.g. `~/claspion-local/`:
  - `git clone https://github.com/fatguylilcoat98/<engine-repo> ~/claspion-local/engine`
  - `git clone https://github.com/fatguylilcoat98/<adapter-repo> ~/claspion-local/adapter`
- [ ] Check out the **same branch** Render deploys (from Phase 1)

## Phase 4 — Run the ENGINE locally first (claspion FastAPI)

- [ ] Create env: copy the engine's env-var names from Phase 1 into `~/claspion-local/engine/.env` with real values (the bearer token especially)
- [ ] Choose a non-colliding port — engine on **:8010** (keep :8000 for the adapter)
- [ ] **Docker path** (Dockerfile exists):
      `cd ~/claspion-local/engine && docker build -t claspion-engine . && docker run -d --name claspion-engine --env-file .env -p 8010:8000 claspion-engine`
- [ ] **Native path** (no Dockerfile):
      `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && uvicorn <module>:app --host 127.0.0.1 --port 8010`
- [ ] Verify engine health: `curl -s localhost:8010/api/v1/health` → expect `status: healthy`
- [ ] Verify auth + validate route with the token:
      `curl -s -X POST localhost:8010/api/v1/governance/validate -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' -d '{"thought":{"content":"hi"},"intent":{"content":"hi"},"actor_id":"host","surface":"chat"}'`
  - [ ] Response contains `decision: "ALLOW"|"BLOCK"` and `allow` ✅ (the contract Splendor requires)

## Phase 5 — Run the ADAPTER locally (Express shadow proxy)

- [ ] Env: set adapter `upstream` to the **local engine** (`http://localhost:8010`); keep `shadow_enabled` matching today (likely `true` for parity); set the bearer token Splendor will send; set the key for the engine
- [ ] Run on **:8000** — Docker (`-p 8000:<port>`) or `cd ~/claspion-local/adapter && npm ci && npm start`
- [ ] Verify chain: `curl -s localhost:8000/health` → `ok:true`, `upstream:http://localhost:8010`
- [ ] Verify proxy: `curl -s -X POST localhost:8000/api/v1/governance/validate -H 'Authorization: Bearer <SPLENDOR_KEY>' -H 'Content-Type: application/json' -d '{"thought":{"content":"hi"},"intent":{"content":"hi"}}'` → returns a verdict

## Phase 6 — Verify with Splendor (STILL on Render — no permanent change)

Use the **runtime override** (no `.env` edit, no restart, instant revert):

- [ ] Point Splendor at local at runtime: `POST /api/governance/state {"url":"http://localhost:8000"}` (owner-authed)
- [ ] Send a chat turn; confirm in logs `cause=upstream`, a real verdict, **no 429**, and `GET /api/governance/state` shows the local URL + `last_call` success
- [ ] Exercise the dashboard panels (they hit governance via the verdict cache) — confirm no fail-closed blocks
- [ ] Keep `CLASPION_FAIL_MODE=BLOCK` throughout (governance stays intact)

## Phase 7 — Make it permanent (only after Phase 6 passes)

- [ ] Put engine + adapter under a supervisor so they survive reboot: **PM2**
      (`sudo npm i -g pm2 && pm2 start … && pm2 save && pm2 startup`),
      **docker `--restart=unless-stopped`**, or **systemd** units
- [ ] Edit Splendor `.env`: `CLASPION_URL=http://localhost:8000` (and matching `CLASPION_API_KEY`), then restart Splendor
- [ ] Re-run Phase 6 checks after restart

## Phase 8 — Rollback (keep ready until local is proven)

- [ ] Instant: `POST /api/governance/reset` (reverts to `.env`) **or**
      `POST /api/governance/state {"url":"https://splendor-claspendor-shadow-adapter.onrender.com"}`
- [ ] Permanent revert: restore the `.env` `CLASPION_URL` line + restart
- [ ] **Do not delete/stop the Render services** until local has run verified for
      your comfort window (e.g. a week)

---

## Reference — minimum contract Splendor needs

A local replacement must satisfy **one route** (the full 17-endpoint engine is not
required just to keep Splendor running):

```
POST /api/v1/governance/validate
  in:  { thought:{}, intent:{}, actor_id, correlation_id, surface }   (all optional, have defaults)
  out: { decision:"ALLOW"|"BLOCK", allow:bool, reason, basis_state,
         conscience_name, failed_axes:[], verdict_id, metadata:{}, suggested_action }
  (+ bearer-token auth; + a /health for sanity)
```

`decision` MUST be exactly `"ALLOW"` or `"BLOCK"` — anything else is treated as a
malformed response and trips fail-closed.

### Engine endpoint inventory (claspion v0.2.0)

- Actions: `POST /api/v1/actions/{propose,evaluate,commit,runtime-event,complete}`
- Governance: `POST /api/v1/governance/validate` **(the only one Splendor uses)**,
  `GET /api/v1/governance/log`, `GET /api/v1/governance/consciences`,
  `POST /api/v1/governance/consciences/activate`
- Basis state machine: `GET /api/v1/basis/state`, `POST /api/v1/basis/collapse`,
  `POST /api/v1/basis/reestablish/{begin,verify,complete}`
- Ops: `GET /api/v1/health` (open), `GET /api/v1/integrity`, `GET /`

### Enforce vs. shadow (decision modes)

- `POST /api/v1/governance/consciences/activate {name}` — swaps the active
  conscience implementation (enforce vs. dormant/observe).
- The current always-`ALLOW` behavior comes from the **adapter's** `shadow_enabled=true`
  (observe + diff, no enforce) combined with whichever conscience is active.
- Real enforcement = `shadow_enabled=false` on the adapter **and** an enforcing
  conscience activated on the engine. This is a deliberate policy change, separate
  from the migration — decide it explicitly before Phase 7.

### Auth note

The OpenAPI spec declares `security: none`, but the **live engine requires a bearer
token** (`{"detail":"Missing authorization token"}` on governed endpoints; only
`/health` is open). The shadow adapter holds/forwards the token. Plan for a bearer
token in the local engine's config and a matching `CLASPION_API_KEY` on Splendor.

## Standing guardrails

- Splendor code and `.env` stay untouched until **Phase 6** (runtime override) and
  the single `.env` line in **Phase 7**.
- Never weaken governance: keep `CLASPION_FAIL_MODE=BLOCK`; do not set
  `CLASPION_ENABLED=false`.
- Keep secrets in local `.env` files only — never in chat or git.
