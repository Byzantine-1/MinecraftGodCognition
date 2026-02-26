# Integration Guide: Cognition + World-Core

## Quick Start

### 1. World-Core Exports Snapshot

Implement a read-only command in world-core:

```bash
god snapshot <townId> --json
```

Must output JSON matching the schema in [WORLD_CORE_CONTRACT.md](WORLD_CORE_CONTRACT.md).

### 2. Cognition Reads & Processes

```javascript
import { propose } from 'minecraft-agent-cognition';
import { proposalToCommand } from 'minecraft-agent-cognition';
import { mayorProfile } from 'minecraft-agent-cognition';

// Load snapshot from world-core
const snapshot = /* from god snapshot town-1 --json */;

// Generate proposal
const proposal = propose(snapshot, mayorProfile);

// Map to command (for reference/testing)
const command = proposalToCommand(proposal);
console.log(command);
// Output: mission accept town-1 sq-gather-wood
```

### 3. Dispatcher Executes Command (Future)

The proposal-to-command mapping is **informational**. A downstream command dispatcher handles execution:

```javascript
// Pseudo-code (not implemented yet)
const dispatcher = new WorldCoreDispatcher(world);
const result = await dispatcher.execute(command);
// Executes: mission accept town-1 sq-gather-wood
```

## Test Data

Two realistic fixture snapshots are included:

- `test/fixtures/earlyGameSnapshot.json` - Day 0, no threats
- `test/fixtures/crisisSnapshot.json` - Day 42, high threat + dread

Run integration tests:

```bash
npm test -- --grep "Integration"
```

## Contract v1 Features

✅ **Deterministic**: Same snapshot always → same proposal  
✅ **Bounded**: Fixed schema, no unbounded lists  
✅ **Read-only**: No world mutations from cognition  
✅ **Serializable**: Pure JSON, no circular refs  
✅ **Versioned**: Contract v1 is stable  

## Proposal Outputs

### MAYOR_ACCEPT_MISSION

**When:** No active mission + mayor role  
**Command:** `mission accept <townId> <missionId>`  
**Args:** `{ missionId }` (from sideQuests)  
**Tags:** `no_active_mission`  

### PROJECT_ADVANCE

**When:** High threat (> 0.3) + projects available + captain role  
**Command:** `project advance <townId> <projectId>`  
**Args:** `{ projectId }` (deterministically lowest ID)  
**Tags:** `high_threat`, `project_available`  

### SALVAGE_PLAN

**When:** High strain (> 0.4) + warden role  
**Command:** `salvage initiate <townId> <focus>`  
**Args:** `{ focus }` (scarcity or dread, whichever is higher)  
**Tags:** `high_strain`  

### TOWNSFOLK_TALK

**When:** Any role, low hope (< 0.6), or fallback  
**Command:** `townsfolk talk <townId> <talkType>`  
**Args:** `{ talkType }` (morale-boost or casual)  
**Tags:** `low_hope` (if triggered by hope threshold)  

## Key Constraints

### For World-Core

- **No imports from cognition** - Keep them decoupled
- **Bounded snapshots** - Max 100 projects/quests each
- **Deterministic export** - No timestamps, no randomness
- **Schema strict** - Use exactly the contract schema
- **Read-only** - No side-effects from snapshot export

### For Cognition

- **Always validate** snapshots with `isValidSnapshot()`
- **Never mutate** world-core state
- **Always emit one proposal** per `propose()` call
- **Deterministic** - Same snapshot = same proposal (unless memory differs)
- **Proposal-only** - No embodiment, no movement, no crafting

## Testing the Seam

### Manual Test Loop

```bash
# 1. Export snapshot from world-core
god snapshot town-1 --json > snapshot.json

# 2. Feed to cognition (test tool)
node -e "
const fs = require('fs');
const { propose } = require('minecraft-agent-cognition');
const { mayorProfile } = require('minecraft-agent-cognition');
const snapshot = JSON.parse(fs.readFileSync('snapshot.json', 'utf-8'));
const proposal = propose(snapshot, mayorProfile);
console.log(JSON.stringify(proposal, null, 2));
"

# 3. Verify proposal structure
# - type is valid
# - priority is [0, 1]
# - reasonTags is array
# - args matches type
```

### Automated Test

```bash
npm test -- --grep "Integration - Cognition"
```

This runs 15 tests covering:
- Early game and crisis scenarios
- Role differentiation
- Command mapping
- Schema compliance
- Error handling

## Next Steps

### Phase 2: Command Dispatcher

Create a command dispatcher that reads proposals and executes them:

```javascript
// Not yet implemented
class WorldCoreDispatcher {
  async execute(command) {
    const [verb, noun, townId, target] = command.split(' ');
    switch (verb) {
      case 'mission': return this.mission[noun](townId, target);
      case 'project': return this.project[noun](townId, target);
      case 'salvage': return this.salvage[noun](townId, target);
      case 'townsfolk': return this.townsfolk[noun](townId, target);
    }
  }
}
```

### Phase 3: Advanced Cognition Features

- [ ] Deeper role weighting
- [ ] Better anti-repeat logic (3-turn memory window)
- [ ] LLM explanation text (optional, non-authoritative)
- [ ] Confidence scores on proposals

### Phase 4: Embodiment

- [ ] Mineflayer integration
- [ ] Execute proposals in real Minecraft
- [ ] Feedback loop (world state → new snapshot → new proposal)

## Files Reference

| File | Purpose |
|------|---------|
| [WORLD_CORE_CONTRACT.md](WORLD_CORE_CONTRACT.md) | Full snapshot schema & command format |
| [src/proposalMapping.js](src/proposalMapping.js) | Maps proposals to commands |
| [test/integration.test.js](test/integration.test.js) | Integration tests with fixtures |
| [test/fixtures/earlyGameSnapshot.json](test/fixtures/earlyGameSnapshot.json) | Early game test data |
| [test/fixtures/crisisSnapshot.json](test/fixtures/crisisSnapshot.json) | Crisis test data |

## Troubleshooting

### Snapshot Invalid

```
Error: Invalid snapshot structure
```

Check against [WORLD_CORE_CONTRACT.md](WORLD_CORE_CONTRACT.md). Required fields:
- `day` (number ≥ 0)
- `townId` (non-empty string)
- `mission` (object or null)
- `sideQuests` (array of objects)
- `pressure` (object with threat, scarcity, hope, dread all [0,1])
- `projects` (array of objects)

### No Proposal Emitted

Cognition always emits exactly one proposal. If none is returned, `propose()` threw an error. Check:

1. Is snapshot valid? Use `isValidSnapshot(snapshot)`
2. Is profile valid? Use `isValidProfile(profile)`
3. Is profile.role in ['mayor', 'captain', 'warden']?

### Command Not Recognized

Each proposal type maps to a specific command format. Check [WORLD_CORE_CONTRACT.md](WORLD_CORE_CONTRACT.md) command mapping table.

## Questions?

See the comments in:
- `src/propose.js` - Proposal generation logic
- `src/heuristics.js` - Evaluation heuristics
- `src/proposalMapping.js` - Command mapping
- `test/integration.test.js` - Real examples
