# CLASPION Verdict Bridge

**Purpose:** connect CLASPION runtime enforcement verdicts to the Governance Glass Box without weakening enforcement.

## Background

The system maintains two separate governance ledgers:

| Table | Written by | Purpose |
|---|---|---|
| `governance_verdicts` | `lib/claspion-governance.js` | Raw CLASPION runtime ledger — every enforcement event |
| `governance_decisions` | `lib/governance-consequence-engine.js` | Normalized consequence ledger — readable by the Glass Box |

Before this bridge, the Glass Box always showed "No active governance decision yet" because the `governance_decisions` table was only populated via explicit `POST /api/governance-decisions` API calls. Runtime CLASPION evaluations (chat, memory writes, admin operations) wrote only to `governance_verdicts`, which the Glass Box does not query.

## What the bridge does

`lib/claspion-verdict-to-decision.js` translates a CLASPION verdict into a normalized `governance_decisions` row after each enforcement event.

The bridge is called from `ClaspionGovernance._persistVerdict()` in `lib/claspion-governance.js`. It runs fire-and-forget after the `governance_verdicts` insert is kicked off. The enforcement verdict is already returned to the middleware before any bridge I/O begins.

## Enforcement guarantee

**A bridge failure cannot delay, alter, or bypass any CLASPION decision.**

- The bridge runs `async` with no `await` at the call site.
- All errors are caught and logged once per error code (deduped).
- `CLASPION_FAIL_MODE=block`, Rule 23, and GNG enforcement are unmodified.
- The bridge is never in the hot path of any request.

## Dormant verdicts

The bridge skips verdicts where `dormant === true`. Dormant verdicts fire on every governed request when `CLASPION_ENABLED=false` and carry no enforcement signal. Bridging them would flood `governance_decisions` with meaningless rows.

## Field mapping

| `governance_decisions` field | Source | Logic |
|---|---|---|
| `claim` | `intent_type` | `"CLASPION validation for {intent_type}"` |
| `confidence` | — | always `null` (CLASPION does not produce a confidence score) |
| `evidence_summary` | `basis_state`, `outcome`, `outcome_cause`, `allow`, `latency_ms`, `correlation_id` | structured summary string |
| `weakening_evidence` | `reason`, `failed_axes`, `basis_state`, `outcome` | set only when `allow=false` |
| `validity_state` | `decision`, `allow`, `basis_state`, `failed_axes` | see table below |
| `admissibility_state` | `allow`, `decision`, `outcome` | see table below |
| `action_state` | `allow`, `decision` | see table below |
| `consequence_reason` | `reason` | falls back to `"CLASPION runtime verdict: {decision} / {outcome} / {basis_state}"` |
| `review_required` | `decision`, `allow` | `true` when not `ALLOW`/`allow=true` |
| `created_by` | — | `"claspion_bridge"` |
| `source_type` | — | `"claspion_verdict"` |
| `source_correlation_id` | `correlation_id` | used for deduplication |

### State mapping rules

**validity_state:**

| Condition | Value |
|---|---|
| `decision=ALLOW` and `allow=true` | `supported` |
| `decision=BLOCK` and `basis_state=UNREACHABLE` | `unsupported` |
| `decision=BLOCK` and `failed_axes` non-empty | `contradicted` |
| any other BLOCK | `contested` |

**admissibility_state:**

| Condition | Value |
|---|---|
| `allow=true` | `admissible` |
| `decision=BLOCK` or `outcome=fail_closed` | `inadmissible` |
| otherwise | `requires_review` |

**action_state:**

| Condition | Value |
|---|---|
| `allow=true` | `allow` |
| `decision=BLOCK` | `block` |
| otherwise | `pause` |

## Deduplication

Two layers prevent duplicate `governance_decisions` rows for the same CLASPION verdict:

1. **In-process LRU set** (`_seenCorrelations`): fast path, no DB round-trip. Capped at 5000 entries.
2. **Partial unique index** on `(source_type, source_correlation_id) WHERE source_correlation_id IS NOT NULL`: DB-enforced dedup, safe against multi-process deployments (Render, etc.).

## Side effects per bridged verdict

Each bridged verdict also creates:

1. **`governance_state_transitions` row** — initial transition with `from_*` fields set to `null`, recording the verdict's mapped states and labelled `actor='claspion_bridge'`.
2. **Flight recorder event** (best-effort) — only written if `userId` is a valid UUID; silently skipped for bridge-originated rows since there is no user UUID in a runtime verdict.

## Migration

`sql/add_source_provenance_to_governance_decisions` adds to `governance_decisions`:

```sql
ALTER TABLE governance_decisions
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_correlation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_governance_decisions_source_correlation
  ON governance_decisions (source_type, source_correlation_id)
  WHERE source_correlation_id IS NOT NULL;
```

Owner-API rows (source_correlation_id IS NULL) are unaffected by the partial index.

## Glass Box display

`GET /api/governance-glass-box/current` already queries `governance_decisions` with no filter on `source_type`, so bridged rows appear automatically in:

- **Live Decision** card (most recent row by `created_at`)
- **Action** card counters (`action_state` values)
- **Confidence** card (`validity_state` counts)
- **Governance** card (`admissibility_state` counts)
- **History** card (via `governance_state_transitions` linked to `decision_id`)

No UI changes are required.

## Limitations

- Flight recorder events are not written for bridge rows (no valid user UUID).
- `confidence` is always `null` — CLASPION verdicts have no confidence score.
- `user_id` is always `null` — runtime verdicts are not scoped to a user session.
- The bridge does not retroactively populate `governance_decisions` for verdicts written before deployment.
