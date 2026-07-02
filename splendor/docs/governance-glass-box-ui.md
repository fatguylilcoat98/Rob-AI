# Governance Glass Box UI

## Purpose

The Governance Glass Box is an owner-only inspection surface that sits inside the Splendor oracle interface. It answers the question:

> "What governance decision is the system working through right now, and why?"

It is not a dashboard that tells you to trust Splendor's answer. It is a window that lets you **inspect the decision** — the claim, the evidence, the weakening evidence, the confidence, the validity state, the admissibility state, the action taken, and the audit trail.

---

## Toggle

A **GOVERNANCE** button appears in the header **only for owners** (never for guests).

- Clicking it hides the companion orb and shows the Glass Box.
- Clicking **COMPANION** returns to the orb and stops polling.
- The toggle is revealed by calling `GET /api/governance-glass-box/owner-check` after login. Guests receive 403 and never see the button.

---

## Live Decision Card

The top card in the Glass Box is **LIVE DECISION** — a full-width, prominent card that shows the most recent governance decision moving through the system.

### What it displays

| Field | Source |
|---|---|
| Claim | `governance_decisions.claim` |
| Confidence | `governance_decisions.confidence` |
| Validity state | `governance_decisions.validity_state` |
| Admissibility state | `governance_decisions.admissibility_state` |
| Action state | `governance_decisions.action_state` |
| Consequence reason | `governance_decisions.consequence_reason` (truncated) |

### Status colors

| State | Color |
|---|---|
| supported / admissible / allow | Green |
| contested / requires_review / pause | Yellow |
| escalate | Orange |
| unsupported / inadmissible / block | Red |
| quarantined / contradicted | Purple |
| retire | Gray/muted |

If no decision exists: "No active governance decision yet."

If the endpoint errors: "Governance Glass Box unavailable." (Companion Mode preserved.)

---

## Live Decision Detail View

Clicking the Live Decision card opens a full-screen detail view with 6 sections:

### 1 · Decision Summary
- Decision ID
- Claim
- Validity, Admissibility, Action states (badge display)
- Confidence
- Review Required flag
- Created By, Created At, Updated At

### 2 · Evidence
- `evidence_summary` — what supports the claim
- `weakening_evidence` — what undermines it

### 3 · Consequence Reason
- `consequence_reason` — why the system reached the action state
- Inline explanation: **Confidence ≠ Permission** — high confidence does not override inadmissibility

### 4 · State Transitions
- Chronological list of all state transitions for this decision
- Shows previous → current state changes where applicable
- Includes actor, transition reason, timestamp

### 5 · Flight Recorder Events
- Recent governance-tagged events from the flight recorder
- Linked by time proximity to the decision (within 30 minutes)
- Shows event type, details, confidence if available

### 6 · Audit Events
- `admin_provenance_events` records for this specific decision
- Actor, action type, reason, timestamp

### Exportable Governance Case
The detail view includes a prominent note that the full content can be:
- **Copied** (clipboard) via the COPY button
- **Downloaded** as `governance-liveDecision-<timestamp>.json` via the DOWNLOAD button

---

## `latestDecision` API Shape

`GET /api/governance-glass-box/current` returns (among other fields):

```json
{
  "timestamp": "2026-06-03T00:00:00.000Z",
  "latestDecision": {
    "id": "uuid",
    "claim": "Vendor payment is likely legitimate.",
    "confidence": 0.88,
    "validity_state": "supported",
    "admissibility_state": "requires_review",
    "action_state": "pause",
    "review_required": true,
    "evidence_summary": "Invoice amount matches. Vendor name is correct. Request came from usual email thread.",
    "weakening_evidence": "Bank details changed same day. Payment is $47,000. BEC fraud pattern possible.",
    "consequence_reason": "High confidence does not override domain risk. Banking detail change on payment day triggers mandatory review.",
    "created_by": "owner_api",
    "created_at": "2026-06-03T00:00:00.000Z",
    "updated_at": "2026-06-03T00:00:00.000Z",
    "transitions": [...],
    "flightRecorderEvents": [...],
    "auditEvents": [...]
  },
  "cards": { ... }
}
```

If no decision exists: `"latestDecision": null`

---

## 8 Summary Cards

The Glass Box also shows 8 smaller summary cards:

| Card | What it shows |
|---|---|
| Evidence | Scan items + flight recorder belief events |
| Lineage | Admin provenance chain |
| Confidence | Average confidence across all decisions, validity distribution |
| Governance | CLASPION state, fail mode, micro-experiments status |
| Action | Action state counts (allow/pause/block/escalate/retire) |
| Audit | Recent privileged action events |
| Memory | Recent memories |
| History | State transition history |

Each card is clickable and opens a full-screen detail view.

---

## Polling

The Glass Box polls `GET /api/governance-glass-box/current` every 3 seconds while in Governance Mode. The poll dot in the header pulses on each successful fetch.

If the Live Decision detail view is open and a new poll returns updated decision data, the detail view refreshes live.

---

## Running the Vendor Payment Test

To test the Live Decision card with the vendor payment scenario:

```javascript
// POST /api/governance-decisions (requires owner auth)
{
  "claim": "Vendor payment is likely legitimate.",
  "confidence": 0.88,
  "evidenceSummary": "Invoice amount matches. Vendor name is correct. Request came from usual email thread.",
  "weakeningEvidence": "Bank details changed same day. Payment is $47,000. BEC fraud pattern possible.",
  "consequenceReason": "High confidence does not override domain risk. Banking detail change on payment day triggers mandatory review regardless of confidence level."
}
```

Expected Live Decision card display:
- **Claim:** Vendor payment is likely legitimate.
- **Confidence:** 88%
- **Validity:** supported
- **Admissibility:** inadmissible or requires_review
- **Action:** pause or escalate
- **Reason:** BEC fraud pattern / banking details changed same day

The Governance Consequence Engine's `deriveStates()` function evaluates `affectsHighStakes()` independently of confidence. A financial transaction flagged as high-stakes will receive `requires_review` or `inadmissible` admissibility regardless of confidence score.

---

## Security & Auth Behavior

| Endpoint | Auth |
|---|---|
| `GET /api/governance-glass-box/current` | `requireAuth` → `requireOwner` → `requireOwnerOnly` |
| `GET /api/governance-glass-box/owner-check` | `requireAuth` → `requireOwner` → `requireOwnerOnly` |

- Guests receive **403** from both endpoints.
- Unauthenticated callers receive **401**.
- The UI toggle is never rendered for guests.
- CLASPION, Rule 23, GNG rules, auth protections, and the Governance Consequence Engine are untouched.

---

## Current Limitations

- **No cryptographic tamper-proofing.** The admin provenance records are attributable auditability only — an operator with direct DB access could modify underlying records. The audit note in the detail view makes this explicit.
- **Flight Recorder linkage is time-based**, not ID-based. Governance flight recorder events are filtered to within 30 minutes of the decision timestamp. This may miss older events or include unrelated ones in long-running sessions.
- **No real-time push.** Polling every 3 seconds is not true push — there is up to 3 seconds of lag between a new decision and the card updating.
- **Single latest decision.** The Live Decision card shows only the most recent decision. Earlier decisions are accessible via the History card's detail view.

---

## Future Upgrades

- **Case-law library** — Browse all historical governance decisions with search/filter
- **Decision replay** — Step through a decision's transitions in chronological order
- **Timeline visualization** — Visual timeline of states across a decision's lifecycle
- **Hash-chain integrity indicator** — Detect if records have been modified since creation (requires DB-level append-only triggers or external log anchoring)
- **External audit export** — Export full governance case to a separate write-once audit store
- **Linked evidence view** — Direct linkage between flight recorder events and specific decisions by decision ID (rather than time proximity)
- **Guest-specific governance summary** — A read-only, non-technical summary view for guests like Richard, showing only what is permitted (separate from the owner inspection surface)

---

## Manual Verification Checklist

- [ ] Log in as owner → GOVERNANCE toggle appears in header
- [ ] Log in as guest → toggle does not appear
- [ ] Enter Governance Mode → orb hides, glass box appears, polling starts
- [ ] Live Decision card shows "No active governance decision yet" when table is empty
- [ ] POST a test decision → Live Decision card updates within 3 seconds
- [ ] Live Decision card shows claim, confidence, all 3 state chips, reason
- [ ] Click Live Decision → full-screen detail opens with 6 sections
- [ ] Detail view shows "No transitions recorded" when none exist
- [ ] Detail view shows "No Flight Recorder events linked" when none exist
- [ ] Detail view shows "No privileged actions recorded" when none exist
- [ ] COPY button copies detail text to clipboard
- [ ] DOWNLOAD button downloads `governance-liveDecision-<timestamp>.json`
- [ ] Escape / close button / backdrop click dismisses detail
- [ ] Companion Mode toggle → orb returns, polling stops
- [ ] Unauthenticated request → 401
- [ ] Guest request → 403 (toggle never shown)
- [ ] Endpoint error → "Governance Glass Box unavailable" message, no crash
- [ ] Mobile layout → Live Decision card spans full width, text readable
