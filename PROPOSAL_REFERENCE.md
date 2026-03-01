# Proposal Reference

This file documents the current proposal contract exactly as implemented.

## Public Proposal API

Every emitted proposal is a `proposal.v2` envelope:

```json
{
  "schemaVersion": "proposal.v2",
  "proposalId": "proposal_<sha256>",
  "snapshotHash": "<sha256>",
  "decisionEpoch": 5,
  "preconditions": [],
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

Required fields:
- `schemaVersion`
- `proposalId`
- `snapshotHash`
- `decisionEpoch`
- `type`
- `actorId`
- `townId`
- `priority`
- `reason`
- `reasonTags`
- `args`

Optional fields:
- `preconditions`

## Envelope Semantics

- `schemaVersion` must equal `proposal.v2`
- `proposalId` is a deterministic SHA-256 hash of `actorId`, `townId`, `type`, `args`, `priority`, `decisionEpoch`, and `snapshotHash`
- `snapshotHash` is deterministic and derived from the snapshot value
- `decisionEpoch` is currently equal to `snapshot.day`
- `preconditions` are advisory execution guards for downstream consumers

## Proposal Types

### 1. `MAYOR_ACCEPT_MISSION`

Emission condition:
- `snapshot.mission === null`
- `snapshot.sideQuests.length > 0`

Target selection:
- lexicographically lowest `sideQuest.id`

Args:

```json
{ "missionId": "<sideQuestId>" }
```

Preconditions:

```json
[
  { "kind": "mission_absent" },
  { "kind": "side_quest_exists", "targetId": "<sideQuestId>" }
]
```

Typical reason tags:
- `no_active_mission`

Command mapping:
- `mission accept <townId> <missionId>`

### 2. `PROJECT_ADVANCE`

Emission condition:
- `snapshot.pressure.threat > 0.3`
- `snapshot.projects.length > 0`

Target selection:
- lexicographically lowest `project.id`

Args:

```json
{ "projectId": "<projectId>" }
```

Preconditions:

```json
[
  { "kind": "project_exists", "targetId": "<projectId>" }
]
```

Typical reason tags:
- `high_threat`
- `project_available`

Command mapping:
- `project advance <townId> <projectId>`

### 3. `SALVAGE_PLAN`

Emission condition:
- `(snapshot.pressure.scarcity + snapshot.pressure.dread) / 2 > 0.4`

Target selection:
- `scarcity` when `scarcity >= dread`
- otherwise `dread`

Args:

```json
{ "focus": "scarcity" }
```

Allowed values:
- `scarcity`
- `dread`
- `general`

Preconditions:

```json
[
  { "kind": "salvage_focus_supported", "expected": "<focus>" }
]
```

Typical reason tags:
- `high_strain`

Command mapping:
- `salvage initiate <townId> <focus>`

### 4. `TOWNSFOLK_TALK`

Emission condition:
- fallback when no higher-priority role action wins

Target selection:
- `morale-boost` when `hope < 0.6`
- otherwise `casual`

Args:

```json
{ "talkType": "morale-boost" }
```

Allowed values:
- `morale-boost`
- `casual`

Preconditions:

```json
[
  { "kind": "talk_type_supported", "expected": "<talkType>" }
]
```

Typical reason tags:
- `low_hope` when `hope < 0.6`

Command mapping:
- `townsfolk talk <townId> <talkType>`

## Proposal Validation Rules

A proposal is invalid if any of the following are true:
- schema version is wrong
- `proposalId` format is wrong
- `snapshotHash` format is wrong
- `decisionEpoch` is not an integer `>= 0`
- `type` is unknown
- `priority` is outside `[0, 1]`
- `reason` is empty
- `reasonTags` contains a non-string
- `args` do not exactly match the selected proposal type

Invalid proposals must fail before command mapping.

## Determinism Rules

1. Equivalent objects with different key insertion order produce the same `snapshotHash`.
2. Equivalent emitted proposal content with different key insertion order produces the same `proposalId`.
3. Array order is preserved and remains hash-significant.
4. `decisionEpoch` changes only when `snapshot.day` changes.

## Worked Example

Input:

```json
{
  "schemaVersion": "snapshot.v1",
  "day": 1,
  "townId": "town-stable",
  "mission": null,
  "sideQuests": [
    { "id": "sq-wood-gathering", "title": "Gather Wood for Winter", "complexity": 1 }
  ],
  "pressure": {
    "threat": 0.1,
    "scarcity": 0.15,
    "hope": 0.85,
    "dread": 0.05
  },
  "projects": [
    { "id": "farmhouse", "name": "Build Farmhouse", "progress": 0.3, "status": "active" }
  ],
  "latestNetherEvent": null
}
```

Mayor result:

```json
{
  "schemaVersion": "proposal.v2",
  "proposalId": "proposal_<sha256>",
  "snapshotHash": "<sha256>",
  "decisionEpoch": 1,
  "preconditions": [
    { "kind": "mission_absent" },
    { "kind": "side_quest_exists", "targetId": "sq-wood-gathering" }
  ],
  "type": "MAYOR_ACCEPT_MISSION",
  "actorId": "mayor-1",
  "townId": "town-stable",
  "priority": 0.72,
  "reason": "No active mission. Authority level 90% ready to accept.",
  "reasonTags": ["no_active_mission"],
  "args": {
    "missionId": "sq-wood-gathering"
  }
}
```
