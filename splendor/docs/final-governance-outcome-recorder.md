# Final Governance Outcome Recorder

**Purpose:** capture the assistant's actual user-visible governance outcome into `governance_decisions` so the Governance Glass Box shows what the user actually experienced, not just the CLASPION ingress/egress middleware verdict.

## Background

Two existing source types already populate `governance_decisions`:

| `source_type` | Written by | Signal |
|---|---|---|
| `claspion_verdict` | `lib/claspion-verdict-to-decision.js` | CLASPION middleware enforcement: was the request *permitted*? |
| `NULL` (owner API) | `lib/governance-consequence-engine.js` | Explicit owner-authored governance decisions |

Neither captures what the assistant *actually said* to the user. A chat turn can pass CLASPION (allow=true), then the assistant still writes a full refusal, a hold, or a structured governance evaluation as plain text. That final text is the governance outcome the user sees, and it belongs in the record.

## What the recorder does

`lib/final-governance-outcome-recorder.js` runs fire-and-forget after `res.json()` in chat routes. It:

1. Calls `detectGovernanceOutcome(userMessage, assistantResponse)` from `lib/final-governance-outcome-detector.js`
2. If the detector returns `shouldRecord: true`, writes a `governance_decisions` row with `source_type='assistant_final_outcome'`
3. Writes an initial `governance_state_transitions` row
4. Emits a flight recorder event (`assistant_final_outcome_recorded`)

## Enforcement guarantee

**A recorder failure cannot affect any user-visible response or any CLASPION decision.**

- The recorder is called after `res.json()` — the response is already sent.
- All errors are caught internally and logged once per error code.
- The recorder is never in any request hot path.

## Detection paths

See `lib/final-governance-outcome-detector.js` for full details.

| Path | Trigger | Mapped states |
|---|---|---|
| `structured_fields` | Response contains explicit `validity_state:`, `action_state:` etc. | Parsed directly from response text |
| `refusal` | Response matches a refusal pattern | block / inadmissible / contested |
| `hold_redirect` | Response has both hold language AND a safe redirect | pause / requires_review / contested |
| `safe_redirect` | Response redirects to safe alternative | pause / requires_review / supported |
| `hold_language` | Response contains HOLD/PAUSE/BLOCK/ESCALATE/review required | pause / requires_review / supported |

Only interactions matching `HIGH_RISK_PROMPT_PATTERNS` or containing governance-relevant response signals are recorded. Routine chat is not governance data.

## Integration points

| Route | Hook location | `requestId` source |
|---|---|---|
| `routes/chat.js` | After `res.json({ message: response, ... })` | `verdict.correlation_id` |
| `routes/enhanced-chat.js` | After `res.json({ success: true, response: result.response, ... })` | `sessionId` |

## Field mapping

| `governance_decisions` field | Source |
|---|---|
| `claim` | Semantic label extracted from user message (drunk-driving, vendor payment, etc.) |
| `confidence` | `null` — detector does not score confidence |
| `validity_state` | Normalized from detection path |
| `admissibility_state` | Normalized from detection path |
| `action_state` | Normalized from detection path |
| `evidence_summary` | Detection path + state values + response length |
| `weakening_evidence` | First refusal/hold sentence from response (capped at 300 chars) |
| `consequence_reason` | First paragraph of response (capped at 400 chars) |
| `review_required` | `true` unless action_state=allow and admissibility_state=admissible |
| `created_by` | `'final_outcome_recorder'` |
| `source_type` | `'assistant_final_outcome'` |
| `source_correlation_id` | `verdict.correlation_id` (chat) or `sessionId` (enhanced-chat) |

## Deduplication

Same two-layer approach as the CLASPION verdict bridge:

1. In-process `_seenCorrelations` Set (capped at 5000)
2. DB check for existing row with matching `(source_type, source_correlation_id)` before insert

The partial unique index `ux_governance_decisions_source_correlation` (added in the CLASPION bridge migration) enforces DB-level dedup across processes.

## Live Decision priority

`routes/governance-glass-box.js` now selects the Live Decision using source priority rather than pure `created_at` recency:

```
assistant_final_outcome  (priority 0 — highest)
governance_consequence_engine  (priority 1)
claspion_verdict  (priority 2 — lowest)
```

Within the same priority level, the most recent row wins. This ensures the Glass Box Live Decision card shows what the user actually experienced (a refusal, a hold, a structured evaluation) rather than always showing the most recent CLASPION response-validation verdict.

## Glass Box display

The Live Decision card now shows a source label:

| `source_type` | Label |
|---|---|
| `assistant_final_outcome` | `FINAL OUTCOME` |
| `claspion_verdict` | `CLASPION RUNTIME VERDICT` |
| `governance_consequence_engine` | `GOVERNANCE ENGINE` |
| `NULL` / other | `GOVERNANCE DECISION` |
