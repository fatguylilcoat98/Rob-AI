# Governance Consequence Engine

## What Problem This Solves

Splendor previously handled governance at the level of behavioral rules (what she can say and do). This engine adds a runtime consequence layer: when conclusions affect operational decisions, permissions, commitments, and real-world consequences, the system now separates *evidential validity* from *operational admissibility* from *consequence/action state*.

The core principle: **confidence does not equal permission.**

A conclusion may be 90% likely true but still inadmissible for action — because it touches a high-stakes domain, because contradictory evidence exists, or because it requires human review before triggering a consequence.

## The Three Layers

### VALIDITY_STATE — is the claim evidentially sound?
- `supported` — evidence supports the claim
- `contested` — contradictory evidence exists; claim may still be valid but is not settled
- `unsupported` — insufficient evidence for the claim
- `contradicted` — evidence actively contradicts the claim

### ADMISSIBILITY_STATE — is the claim eligible to inform action?
- `admissible` — valid for operational use
- `inadmissible` — not eligible to trigger action, regardless of confidence
- `requires_review` — valid but needs human review before action
- `quarantined` — isolated from operational use pending investigation

### ACTION_STATE — what happens next?
- `allow` — conclusion may proceed to action
- `pause` — action suspended pending review
- `block` — action prevented
- `escalate` — action escalated to human decision
- `retire` — conclusion is retired from use

## Why Confidence Does Not Equal Permission

A claim can be:
- 88% likely true (supported) but still operationally inadmissible (requires_review) if it affects medical, legal, financial, or safety domains
- 100% confident but quarantined if the source or reasoning chain is compromised
- Contested (validity challenged) but still actionable in limited scope

The engine derives action state from validity + admissibility + domain risk — not from confidence alone.

## Privileged Action Auditing

Every privileged operation (admin read, modify, delete, export) against provenance-relevant tables writes a record to `admin_provenance_events`.

Fields: actor, role, target table, target record ID, action type, old value, new value, reason, source IP, timestamp.

**Current limitation:** This provides *attributable auditability*, not *cryptographic tamper-proofing*. A sufficiently privileged operator could modify the audit table itself. The record establishes attribution and sequence, not mathematical proof of integrity.

## Current Limitations

- No append-only enforcement at the DB layer
- No cryptographic hash chaining across records
- No signed audit events
- No external log anchoring
- Single audit DB user (no separation of duties)

## Future Hardening Path

1. **Append-only triggers** — DB-level triggers that prevent UPDATE/DELETE on audit tables
2. **Hash chaining** — each event row hashes the previous row's ID + timestamp, creating a detectable chain break if a row is removed or modified
3. **Signed audit events** — each event signed with a rotating key; signature stored separately
4. **External log anchoring** — periodic export of audit log to a write-once external store
5. **Separation of duties** — separate DB credentials for audit writes vs. operational reads

## Environmental Scan Provenance

Every environmental scan item surfaced or emailed is recorded with:
- Source (title, URL, type)
- Why it was surfaced
- Confidence assigned
- Uncertainty notes preserved
- Action taken (ignored / stored / surfaced / emailed / quarantined)
- Governance reason

This answers the question: *why did this email get sent?*

## Claim Precision Guard

Broad institutional claims ("Anthropic believes X", "The industry is now Y") require either a source URL or softened wording before being emailed. If neither is present, the claim is flagged for review and automatically softened before sending.
