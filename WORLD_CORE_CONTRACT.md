# World-Core Snapshot Contract v1

## Overview

This document specifies how `world-core` should export bounded snapshots for consumption by `minecraft-agent-cognition`. The seam is:

- **Read-only**: World-core exports only, no imports from cognition
- **Deterministic**: Same world state always produces same snapshot
- **Bounded**: Fixed schema, no unbounded lists or nested structures
- **Serializable**: Valid JSON, no circular references

## Command in World-Core

```bash
god snapshot <townId> --json
```

Outputs a JSON snapshot matching the schema below. Use this in tests and integration.

## Snapshot Schema v1

```json
{
  "day": <number>,
  "townId": "<string>",
  "mission": <Mission | null>,
  "sideQuests": [<SideQuest>, ...],
  "pressure": <Pressure>,
  "projects": [<Project>, ...],
  "latestNetherEvent": "<string | null>"
}
```

### Mission

```json
{
  "id": "<string>",
  "title": "<string>",
  "description": "<string (optional)>",
  "reward": "<number (optional)>"
}
```

- `id`: Unique mission identifier
- `title`: Human-readable mission name
- `description`, `reward`: Optional metadata

**Null if no active mission.**

### SideQuest

```json
{
  "id": "<string>",
  "title": "<string>",
  "complexity": <number (optional, 0-10)>
}
```

- `id`: Quest identifier
- `title`: Quest name
- `complexity`: Estimated difficulty (optional)

### Pressure

```json
{
  "threat": <number>,      // [0, 1]
  "scarcity": <number>,    // [0, 1]
  "hope": <number>,        // [0, 1]
  "dread": <number>        // [0, 1]
}
```

All values must be in [0, 1]. Describes ambient world conditions:

- **threat**: External danger level (mobs, raids, disasters)
- **scarcity**: Resource shortage (hunger, material depletion)
- **hope**: Community morale (1 = optimistic, 0 = despair)
- **dread**: Despair/fear (counterpoint to hope, different axis)

### Project

```json
{
  "id": "<string>",
  "name": "<string>",
  "progress": <number>,    // [0, 1]
  "status": "<string>"     // "planning" | "active" | "blocked" | "complete"
}
```

- `id`: Project identifier (used for targeting in proposals)
- `name`: Human-readable project name
- `progress`: Completion ratio [0, 1]
- `status`: Current phase

### latestNetherEvent

Optional string describing recent Nether/world event:

```json
"latestNetherEvent": "piglin_raid_nearby"
```

Or null if no recent event.

## Constraints

### For World-Core Implementers

1. **No cognition import**: World-core must not import from cognition module
2. **Bounded lists**: Keep `sideQuests` and `projects` to < 100 items each
3. **Determinism**: Same world state → same JSON output (no random fields, no timestamps)
4. **Snapshot size**: Keep total JSON < 10 KB for performance
5. **Read-only**: Snapshot export is query-only, no side-effects

### For Cognition

- Always validate with `isValidSnapshot(snapshot)`
- Never mutate world-core through snapshot data
- Treat snapshot as a single moment in time (bounded to this turn/tick)
- Always emit one proposal per `propose()` call

## Example: Early Game

```json
{
  "day": 0,
  "townId": "town-1",
  "mission": null,
  "sideQuests": [
    {"id": "sq-gather-wood", "title": "Gather Wood", "complexity": 1}
  ],
  "pressure": {
    "threat": 0.2,
    "scarcity": 0.3,
    "hope": 0.8,
    "dread": 0.1
  },
  "projects": [
    {"id": "farm", "name": "Expand Farm", "progress": 0.2, "status": "active"}
  ],
  "latestNetherEvent": null
}
```

**Expected cognition response:**
- Mayor proposes accepting the side-quest
- Captain proposes advancing the farm project
- Warden proposes casual morale talk

## Example: Crisis

```json
{
  "day": 42,
  "townId": "town-1",
  "mission": {
    "id": "defend-settlement",
    "title": "Defend the Settlement"
  },
  "sideQuests": [],
  "pressure": {
    "threat": 0.85,
    "scarcity": 0.6,
    "hope": 0.4,
    "dread": 0.7
  },
  "projects": [
    {"id": "wall", "name": "Build North Wall", "progress": 0.7, "status": "active"}
  ],
  "latestNetherEvent": "piglin_raid_nearby"
}
```

**Expected cognition response:**
- Mayor respects active mission, proposes morale support
- Captain proposes advancing wall project to completion
- Warden proposes resource salvage

## Proposal-to-Command Mapping

Cognition emits proposals, which map to world-core commands:

| Proposal Type | Command Format | Example |
|---|---|---|
| `MAYOR_ACCEPT_MISSION` | `mission accept <townId> <missionId>` | `mission accept town-1 sq-gather-wood` |
| `PROJECT_ADVANCE` | `project advance <townId> <projectId>` | `project advance town-1 farm` |
| `SALVAGE_PLAN` | `salvage initiate <townId> <focus>` | `salvage initiate town-1 scarcity` |
| `TOWNSFOLK_TALK` | `townsfolk talk <townId> <talkType>` | `townsfolk talk town-1 morale-boost` |

**Note:** This mapping is **informational** for testing. It is not executed automatically. Downstream integration (e.g., command dispatcher) is responsible for execution.

## Testing

### In Cognition Tests

```javascript
import { propose } from './src/propose.js';
import { proposalToCommand } from './src/proposalMapping.js';

const snapshot = /* from god snapshot <townId> --json */;
const proposal = propose(snapshot, mayorProfile);
const command = proposalToCommand(proposal);
// command ready for world-core dispatcher (not auto-executed)
```

### In World-Core Tests

```bash
# Export a snapshot
god snapshot town-1 --json > snapshot.json

# Pass to cognition (external tool or test)
# Verify one proposal is always emitted
# Verify proposal maps to a valid command
```

## Future Directions

- Add `latestNetherEvent` enum for stronger typing
- Add role-specific commands (only captain can execute project commands, etc.)
- Add confidence scores to proposals (optional)
- Add LLM-generated explanation text as non-authoritative field
