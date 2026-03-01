# Execution Handoff Contract

This document defines the adapter seam between deterministic cognition and the authoritative world engine.

## Scope

`minecraft-agent-cognition` remains advisory only.

It may emit:
- a valid `proposal.v2` envelope
- a deterministic mapped command string
- a deterministic `execution-handoff.v1` payload for downstream transport

The world engine remains authoritative for:
- precondition evaluation
- stale checks against current world state
- duplicate and retry handling
- acceptance vs rejection of execution
- command application and post-state reporting

This repo does not execute commands.

## Handoff Payload: `execution-handoff.v1`

```json
{
  "schemaVersion": "execution-handoff.v1",
  "handoffId": "handoff_<sha256>",
  "advisory": true,
  "proposalId": "proposal_<sha256>",
  "idempotencyKey": "proposal_<sha256>",
  "snapshotHash": "<sha256>",
  "decisionEpoch": 15,
  "proposal": {
    "...": "proposal.v2 envelope"
  },
  "command": "project advance town-threatened wall-perimeter",
  "executionRequirements": {
    "expectedSnapshotHash": "<sha256>",
    "expectedDecisionEpoch": 15,
    "preconditions": [
      { "kind": "project_exists", "targetId": "wall-perimeter" }
    ]
  }
}
```

### Field Semantics

- `schemaVersion` must equal `execution-handoff.v1`
- `handoffId` is a deterministic SHA-256 hash of `proposalId` and `command`
- `advisory` is always `true`
- `proposalId` echoes the selected proposal identity
- `idempotencyKey` is currently equal to `proposalId`
- `snapshotHash` and `decisionEpoch` echo the cognition input state that produced the proposal
- `proposal` is the full selected `proposal.v2` envelope
- `command` is the deterministic command mapping for that proposal
- `executionRequirements` carries the advisory preconditions and the expected state context for stale checks

## Ownership Rules

### Preconditions

Owner: world engine

Rules:
- cognition emits advisory `preconditions`
- the world engine decides how to interpret and evaluate them
- the world engine must not assume preconditions were already checked by cognition at execution time
- precondition failure should result in a non-executed outcome payload

### Stale Checks

Owner: world engine

Rules:
- the world engine compares the incoming `expectedSnapshotHash` and `expectedDecisionEpoch` against its current authoritative state
- if the engine cannot satisfy its stale-check policy, it should return `status: "stale"`
- stale rejection is deterministic for the same handoff payload and the same authoritative state snapshot

### Retry And Duplicate Handling

Owner: world engine

Rules:
- `idempotencyKey` is the stable dedupe key
- replay of the same handoff payload must not cause duplicate mutation if the world engine has already processed that key
- duplicate replays should return `status: "duplicate"` and identify the prior accepted result if available
- dedupe retention duration is an engine policy, not a cognition concern

### Acceptance vs Rejection

Owner: world engine

Rules:
- cognition recommends; the world engine accepts or rejects
- acceptance means the engine accepted the handoff for authoritative execution handling
- rejection means the engine refused before applying the command
- a handoff may be accepted and still end in `failed` if execution could not complete

## Execution Result Payload: `execution-result.v1`

```json
{
  "schemaVersion": "execution-result.v1",
  "resultId": "result_<sha256>",
  "handoffId": "handoff_<sha256>",
  "proposalId": "proposal_<sha256>",
  "idempotencyKey": "proposal_<sha256>",
  "snapshotHash": "<sha256>",
  "decisionEpoch": 15,
  "command": "project advance town-threatened wall-perimeter",
  "status": "executed",
  "accepted": true,
  "executed": true,
  "reasonCode": "EXECUTED",
  "evaluation": {
    "preconditions": {
      "evaluated": true,
      "passed": true,
      "failures": []
    },
    "staleCheck": {
      "evaluated": true,
      "passed": true,
      "actualSnapshotHash": "<sha256>",
      "actualDecisionEpoch": 15
    },
    "duplicateCheck": {
      "evaluated": true,
      "duplicate": false,
      "duplicateOf": null
    }
  },
  "worldState": {
    "postExecutionSnapshotHash": "<sha256>",
    "postExecutionDecisionEpoch": 16
  }
}
```

### Status Semantics

Allowed `status` values:
- `executed`
- `rejected`
- `stale`
- `duplicate`
- `failed`

Rules:
- `executed` requires `accepted: true` and `executed: true`
- `failed` requires `accepted: true` and `executed: false`
- `rejected`, `stale`, and `duplicate` require `accepted: false` and `executed: false`

### Evaluation Block

- `preconditions` reports whether the engine evaluated and passed the advisory preconditions
- `staleCheck` reports whether the engine evaluated state freshness and, when known, what authoritative state it compared against
- `duplicateCheck` reports whether the handoff was treated as a replay of prior work

### Result Identity

- `resultId` is a deterministic SHA-256 hash of `handoffId`, status, booleans, reason code, evaluation block, and optional `worldState`
- repeated construction of the same result payload yields the same `resultId`

## Recommended Engine Behavior

1. Validate `execution-handoff.v1`.
2. Check `idempotencyKey`.
3. Evaluate stale state from `expectedSnapshotHash` / `expectedDecisionEpoch`.
4. Evaluate advisory preconditions against authoritative world state.
5. Accept or reject the command.
6. If accepted, attempt execution.
7. Return `execution-result.v1`.

## Intentionally Deferred

- transport protocol between cognition and world engine
- authentication and authorization
- dedupe retention window
- multi-command transactions
- partial execution semantics
- rollback behavior
- full post-state snapshot transport
