# minecraft-agent-cognition

A minimal, deterministic proposal-only cognition layer for world-core governance.

## What This Is

This module reads a **bounded world snapshot** and emits **one typed governance action proposal**. It is a cognition MVP that answers: "What should a governor do right now?"

## What This Is NOT

- ❌ A survival bot brain (no Minecraft entity state)
- ❌ An orchestrator or state machine
- ❌ An embodiment layer (doesn't perform actions)
- ❌ LLM-integrated (pure deterministic heuristics)
- ❌ Network-connected

## Core Concept

**Input:** Bounded world-core snapshot (day, mission, pressure, projects)  
**Processing:** Role-based governance heuristics  
**Output:** One typed proposal with priority and rationale

## Proposal Types

- `MAYOR_ACCEPT_MISSION` - Accept available mission
- `PROJECT_ADVANCE` - Push active project forward
- `SALVAGE_PLAN` - Respond to resource crisis
- `TOWNSFOLK_TALK` - Morale/community action

Each proposal includes:
- `type` - Governance action type
- `actorId` - Executor (governor role)
- `townId` - Town identifier
- `priority` - [0, 1] urgency
- `reason` - Human-readable rationale
- `reasonTags` - Array of machine-readable rationale tags (e.g. `no_active_mission`, `high_threat`)
- `args` - Type-specific parameters

## Governor Roles

### Mayor
- **Goal:** Accept missions and grow the town
- **Heuristic:** If no active mission → propose `MAYOR_ACCEPT_MISSION`
- **Traits:** authority, pragmatism

### Captain
- **Goal:** Defend against threats via projects
- **Heuristic:** If threat > 0.3 and projects exist → propose `PROJECT_ADVANCE`
- **Traits:** courage

### Warden
- **Goal:** Reduce scarcity and dread
- **Heuristic:** If (scarcity + dread) / 2 > 0.4 → propose `SALVAGE_PLAN`
- **Traits:** pragmatism, prudence

## Snapshot Structure

```javascript
{
  day: 0,                           // In-game day
  townId: 'town-1',                 // Settlement ID
  mission: { id, title },           // Active mission or null
  sideQuests: [],                   // Available quests (bounded)
  pressure: {                       // Ambient stressors [0, 1]
    threat,                         // External danger
    scarcity,                       // Resource shortage
    hope,                           // Morale level
    dread                           // Despair level
  },
  projects: [],                     // Active governance projects (bounded)
  latestNetherEvent: null           // Optional recent Nether event
}
```

## Determinism

**Same input → same output always.**

Input validation is strict (`isValidSnapshot`, `isValidProfile`), and invalid shapes raise errors rather than failing silently. A small, bounded memory object may be passed to `propose()` (`{lastType, lastTarget, repeatCount}`) which enforces a deterministic repetition penalty but does not affect overall determinism.

No timestamps, randomness, or external state. All heuristics are pure functions.

## Usage

```javascript
import { propose } from './src/propose.js';
import { createDefaultSnapshot } from './src/snapshotSchema.js';
import { mayorProfile } from './src/agentProfiles.js';

const snapshot = createDefaultSnapshot('town-1', 5);
snapshot.mission = null;
snapshot.pressure = { threat: 0.2, scarcity: 0.3, hope: 0.7, dread: 0.1 };

const proposal = propose(snapshot, mayorProfile);
console.log(proposal);
// Output:
// {
//   type: 'MAYOR_ACCEPT_MISSION',
//   actorId: 'mayor-1',
//   townId: 'town-1',
//   priority: 0.72,
//   reason: '...',
//   args: { ... }
// }
```

## Running Tests

```bash
npm test
```

All tests verify:
- Proposal DSL shape validation
- Deterministic behavior
- Role-specific heuristics
- Fallback proposals
- Edge cases

## Project Structure

```
src/
  index.js              # Module exports
  proposalDsl.js        # World-core proposal types
  snapshotSchema.js     # Bounded snapshot validator
  agentProfiles.js      # Governor role definitions
  heuristics.js         # Role-based decision logic
  propose.js            # Proposal generation

test/
  fixtures/             # sample snapshot JSON used by integration tests
    sampleSnapshot.json
  propose.test.js       # Proposal tests (validation, tie-break, memory, fixtures)
  heuristics.test.js    # Heuristics tests
```

## Documentation

- [**INTEGRATION_GUIDE.md**](INTEGRATION_GUIDE.md) – How to connect cognition to world-core
- [**WORLD_CORE_CONTRACT.md**](WORLD_CORE_CONTRACT.md) – Snapshot schema and command format



Proposals are mapped to world-core commands for execution (not automated):

```javascript
import { proposalToCommand, proposalToDescription } from './src/proposalMapping.js';

const proposal = propose(snapshot, mayorProfile);
const command = proposalToCommand(proposal);
const description = proposalToDescription(proposal);

console.log(description);
// Output: MAYOR_ACCEPT_MISSION: No active mission. Authority level 90% ready to accept. [no_active_mission]

console.log(command);
// Output: mission accept town-1 sq-gather-wood
```

## World-Core Integration Seam

See [WORLD_CORE_CONTRACT.md](WORLD_CORE_CONTRACT.md) for the full snapshot schema and integration guide.

**In world-core**, add a read-only command:

```bash
god snapshot <townId> --json
```

This exports a bounded snapshot matching the cognition contract. The seam is:

- **Read-only**: World-core exports only
- **Deterministic**: Same state → same snapshot
- **Bounded**: Fixed schema, no unbounded lists
- **Contract-driven**: Schema version v1 is stable


This is a foundation for:
- Integration with a live world state provider
- LLM-powered reason generation
- Multi-actor coordination
- Event-driven replanning

The current output schema (proposal contract v1) is intentionally minimal and additive; downstream consumers should expect `reasonTags` alongside existing fields and may ignore unknown `args`. This contract will remain stable until v2.

But NOT yet.

