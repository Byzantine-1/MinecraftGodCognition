# World-Core Contract

This document defines the strict integration seam between `world-core` and `minecraft-agent-cognition`.

## Contract Surface

`world-core` provides:
- a read-only snapshot in `snapshot.v1`

`minecraft-agent-cognition` provides:
- a deterministic proposal envelope in `proposal.v2`
- an optional command string derived from a valid proposal envelope

## World-Core Snapshot Schema: `snapshot.v1`

### Command Shape

```bash
god snapshot <townId> --json
```

### JSON Shape

```json
{
  "schemaVersion": "snapshot.v1",
  "day": 0,
  "townId": "town-1",
  "mission": null,
  "sideQuests": [],
  "pressure": {
    "threat": 0.2,
    "scarcity": 0.3,
    "hope": 0.8,
    "dread": 0.1
  },
  "projects": [],
  "latestNetherEvent": null
}
```

### Required Field Rules

#### `schemaVersion`
- must equal `"snapshot.v1"`

#### `day`
- integer
- `>= 0`

#### `townId`
- non-empty string

#### `mission`
- `null`, or:

```json
{
  "id": "mission-1",
  "title": "Defend the Settlement",
  "description": "optional string",
  "reward": 100
}
```

Rules:
- `id` required, non-empty string
- `title` required, non-empty string
- `description` optional string
- `reward` optional finite number `>= 0`
- no additional keys allowed

#### `sideQuests`
- array, length `<= 100`
- each item:

```json
{
  "id": "sq-gather-wood",
  "title": "Gather Wood",
  "complexity": 1
}
```

Rules:
- `id` required, non-empty string
- `title` required, non-empty string
- `complexity` optional finite number in `[0, 10]`
- no additional keys allowed
- `id` values must be unique within the array

#### `pressure`

```json
{
  "threat": 0.2,
  "scarcity": 0.3,
  "hope": 0.8,
  "dread": 0.1
}
```

Rules:
- all fields required
- all values finite numbers in `[0, 1]`
- no additional keys allowed

#### `projects`
- array, length `<= 100`
- each item:

```json
{
  "id": "wall",
  "name": "Build North Wall",
  "progress": 0.7,
  "status": "active"
}
```

Rules:
- `id` required, non-empty string
- `name` required, non-empty string
- `progress` required, finite number in `[0, 1]`
- `status` required, one of:
  - `planning`
  - `active`
  - `blocked`
  - `complete`
- no additional keys allowed
- `id` values must be unique within the array

#### `latestNetherEvent`
- required field
- value must be `string | null`

Top-level rule:
- no additional snapshot keys allowed beyond the documented `snapshot.v1` fields

## Cognition Profile Schema: `profile.v1`

This is not exported by `world-core`, but it is part of the public contract consumed by `propose()`.

```json
{
  "schemaVersion": "profile.v1",
  "id": "mayor-1",
  "role": "mayor",
  "townId": "town-1",
  "traits": {
    "authority": 0.9,
    "pragmatism": 0.8,
    "courage": 0.6,
    "prudence": 0.7
  },
  "goals": {
    "acceptMissions": true,
    "growTown": true,
    "maintainMorale": true
  }
}
```

Rules:
- `schemaVersion` must equal `"profile.v1"`
- `id` non-empty string
- `role` one of `mayor | captain | warden`
- `townId` non-empty string
- every trait required and finite in `[0, 1]`
- `goals` must be a non-empty object of boolean flags
- `profile.townId` must equal `snapshot.townId`

## Proposal Envelope Schema: `proposal.v2`

`propose(snapshot, profile, memory?)` returns:

```json
{
  "schemaVersion": "proposal.v2",
  "proposalId": "proposal_<sha256>",
  "snapshotHash": "<sha256>",
  "decisionEpoch": 5,
  "preconditions": [
    { "kind": "mission_absent" },
    { "kind": "side_quest_exists", "targetId": "sq-gather-wood" }
  ],
  "type": "MAYOR_ACCEPT_MISSION",
  "actorId": "mayor-1",
  "townId": "town-1",
  "priority": 0.72,
  "reason": "No active mission. Authority level 90% ready to accept.",
  "reasonTags": ["no_active_mission"],
  "args": {
    "missionId": "sq-gather-wood"
  }
}
```

### Envelope Rules

#### `schemaVersion`
- must equal `"proposal.v2"`

#### `proposalId`
- non-empty string
- format: `proposal_<64 lowercase hex chars>`
- deterministic SHA-256 hash of `actorId`, `townId`, `type`, `args`, `priority`, `decisionEpoch`, and `snapshotHash`

#### `snapshotHash`
- non-empty string
- format: `64 lowercase hex chars`
- deterministic SHA-256 hash of the snapshot value
- computed from the canonicalized validated snapshot value

#### `decisionEpoch`
- integer
- currently equal to `snapshot.day`

#### `preconditions`
- optional array
- each item must include non-empty `kind`
- optional `targetId` must be a non-empty string
- optional `field` must be a non-empty string
- optional `expected` must be `string | number | boolean | null`

#### Core Proposal Fields
- `type` must be one of:
  - `MAYOR_ACCEPT_MISSION`
  - `PROJECT_ADVANCE`
  - `SALVAGE_PLAN`
  - `TOWNSFOLK_TALK`
- `actorId` non-empty string
- `townId` non-empty string
- `priority` finite number in `[0, 1]`
- `reason` non-empty string
- `reasonTags` array of strings

#### Type-Specific Args

`MAYOR_ACCEPT_MISSION`

```json
{ "missionId": "sq-gather-wood" }
```

`PROJECT_ADVANCE`

```json
{ "projectId": "wall" }
```

`SALVAGE_PLAN`

```json
{ "focus": "scarcity" }
```

Allowed `focus` values:
- `scarcity`
- `dread`
- `general`

`TOWNSFOLK_TALK`

```json
{ "talkType": "morale-boost" }
```

Allowed `talkType` values:
- `morale-boost`
- `casual`

Malformed args are invalid. Downstream consumers should reject them rather than coerce them.

## Proposal-to-Command Mapping

Only valid `proposal.v2` envelopes may be mapped.

| Proposal Type | Command Format |
|---|---|
| `MAYOR_ACCEPT_MISSION` | `mission accept <townId> <missionId>` |
| `PROJECT_ADVANCE` | `project advance <townId> <projectId>` |
| `SALVAGE_PLAN` | `salvage initiate <townId> <focus>` |
| `TOWNSFOLK_TALK` | `townsfolk talk <townId> <talkType>` |

If the proposal envelope is invalid, command mapping must fail fast.

## Determinism Notes

- Object key order does not affect `snapshotHash` or `proposalId`.
- `sideQuests` are canonicalized by `id`, then `title`, then `complexity`.
- `projects` are canonicalized by `id`, then `name`, then `progress`, then `status`.
- Reordered equivalent valid snapshots produce the same `snapshotHash`.
- `decisionEpoch` currently has day-level granularity because it is set from `snapshot.day`.
- The optional `memory` input changes proposal selection deterministically when its value changes.

## Integration Constraints

### For World-Core

1. Export `snapshot.v1` only.
2. Keep the snapshot read-only and side-effect free.
3. Keep `sideQuests` and `projects` bounded to `<= 100`.
4. Keep `sideQuests[*].id` and `projects[*].id` unique within each snapshot.
5. Do not add timestamps, random fields, or undocumented snapshot keys.

### For Downstream Proposal Consumers

1. Validate `proposal.v2` before execution.
2. Treat `preconditions` as execution guards.
3. Do not assume malformed args can be normalized.
4. Do not assume `decisionEpoch` is finer-grained than `day` yet.
