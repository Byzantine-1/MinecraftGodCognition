# minecraft-agent-cognition

A deterministic proposal-only cognition layer for Minecraft town governance.

## What It Does

This module accepts:
- a strict bounded snapshot (`snapshot.v1`)
- a strict governor profile (`profile.v1`)

It returns exactly one strict proposal envelope (`proposal.v2`).

The current system is a library, not a runtime service. It validates inputs, scores a small fixed set of heuristic actions, and emits a proposal that can be mapped to a world-core command string.

## Current Runtime Path

1. `propose(snapshot, profile, memory?)`
2. `isValidSnapshot(snapshot)` and `isValidProfile(profile)`
3. `canonicalizeSnapshot(snapshot)`
4. `evaluateGovernanceProposal(snapshot, profile, memory)`
5. proposal envelope construction
6. `isValidProposal(proposal)`
7. optional `proposalToCommand(proposal)`

## Versioned Schemas

### Snapshot Schema: `snapshot.v1`

```js
{
  schemaVersion: 'snapshot.v1',
  day: 0,
  townId: 'town-1',
  mission: null,
  sideQuests: [
    { id: 'sq-gather-wood', title: 'Gather Wood', complexity: 1 }
  ],
  pressure: {
    threat: 0.2,
    scarcity: 0.3,
    hope: 0.8,
    dread: 0.1
  },
  projects: [
    { id: 'farm', name: 'Expand Farm', progress: 0.2, status: 'active' }
  ],
  latestNetherEvent: null
}
```

Validation rules:
- `day` must be an integer `>= 0`
- `sideQuests.length <= 100`
- `projects.length <= 100`
- snapshot objects are closed over the documented keys
- `pressure.*` must be finite numbers in `[0, 1]`
- `mission` must be `null` or include non-empty `id` and `title`
- `sideQuests[*].id` must be unique
- `projects[*].id` must be unique
- `projects[*].status` must be one of `planning | active | blocked | complete`
- `latestNetherEvent` must be `string | null`

### Profile Schema: `profile.v1`

```js
{
  schemaVersion: 'profile.v1',
  id: 'mayor-1',
  role: 'mayor',
  townId: 'town-1',
  traits: {
    authority: 0.9,
    pragmatism: 0.8,
    courage: 0.6,
    prudence: 0.7
  },
  goals: {
    acceptMissions: true,
    growTown: true,
    maintainMorale: true
  }
}
```

Validation rules:
- `role` must be one of `mayor | captain | warden`
- every trait must be a finite number in `[0, 1]`
- `goals` must be a non-empty object of boolean flags
- `profile.townId` must match `snapshot.townId` for `propose()`

### Proposal Envelope: `proposal.v2`

```js
{
  schemaVersion: 'proposal.v2',
  proposalId: 'proposal_<sha256>',
  snapshotHash: '<sha256>',
  decisionEpoch: 5,
  preconditions: [
    { kind: 'mission_absent' },
    { kind: 'side_quest_exists', targetId: 'sq-gather-wood' }
  ],
  type: 'MAYOR_ACCEPT_MISSION',
  actorId: 'mayor-1',
  townId: 'town-1',
  priority: 0.72,
  reason: 'No active mission. Authority level 90% ready to accept.',
  reasonTags: ['no_active_mission'],
  args: { missionId: 'sq-gather-wood' }
}
```

Envelope semantics:
- `proposalId` is a deterministic SHA-256 hash of `actorId`, `townId`, `type`, `args`, `priority`, `decisionEpoch`, and `snapshotHash`
- `snapshotHash` is a deterministic SHA-256 hash of the canonicalized validated snapshot value
- `decisionEpoch` is currently `snapshot.day`
- `preconditions` are optional execution guards for downstream consumers

Strict arg rules:
- `MAYOR_ACCEPT_MISSION` -> `{ missionId: string }`
- `PROJECT_ADVANCE` -> `{ projectId: string }`
- `SALVAGE_PLAN` -> `{ focus: 'scarcity' | 'dread' | 'general' }`
- `TOWNSFOLK_TALK` -> `{ talkType: 'morale-boost' | 'casual' }`

Malformed args are rejected. Command mapping does not normalize invalid values into `null`.

## Current Heuristics

### Mayor
- Emits `MAYOR_ACCEPT_MISSION` only when there is no active mission and at least one side quest.
- Ranks side quests by complexity fit using `authority`, `pragmatism`, `prudence`, mayor goals, and `latestNetherEvent`.
- Uses lexicographic `sideQuest.id` tie-breaking when ranked mission scores are equal.

### Captain
- Emits `PROJECT_ADVANCE` when `pressure.threat > 0.3` and at least one actionable project exists.
- Treats only `active` and `planning` projects as actionable, and skips `blocked` or `complete` projects.
- Ranks actionable projects by status, progress, captain goals, and `latestNetherEvent`, then uses lexicographic `project.id` tie-breaking.

### Warden
- Emits `SALVAGE_PLAN` when strain remains high after considering scarcity, dread, hope, `latestNetherEvent`, goals, and `mission.reward` relief if present.
- Chooses `focus = 'scarcity'` or `focus = 'dread'` from the stronger deterministic signal after those adjustments.

### Fallback
- Emits `TOWNSFOLK_TALK`.
- Uses `talkType = 'morale-boost'` when `hope < 0.6`, otherwise `talkType = 'casual'`.

## Determinism

The current contract is deterministic under these rules:
- object key order does not affect `snapshotHash` or `proposalId`
- `sideQuests` are canonicalized by `id`, then `title`, then `complexity`
- `projects` are canonicalized by `id`, then `name`, then `progress`, then `status`
- reordered equivalent valid snapshots produce the same `snapshotHash`
- no randomness, timestamps, or external IO affect scoring
- the anti-repeat memory penalty is deterministic for the same memory input

## Usage

```js
import { propose } from './src/propose.js';
import { createDefaultSnapshot } from './src/snapshotSchema.js';
import { mayorProfile } from './src/agentProfiles.js';
import { proposalToCommand } from './src/proposalMapping.js';

const snapshot = createDefaultSnapshot('town-1', 5);
snapshot.sideQuests = [{ id: 'sq-gather-wood', title: 'Gather Wood', complexity: 1 }];
snapshot.pressure = { threat: 0.2, scarcity: 0.3, hope: 0.7, dread: 0.1 };

const proposal = propose(snapshot, mayorProfile);
const command = proposalToCommand(proposal);

console.log(proposal.schemaVersion);
console.log(proposal.proposalId);
console.log(proposal.snapshotHash);
console.log(command);
```

## CLI Inspection

Run:

```bash
npm run inspect -- --snapshot test/fixtures/stableSnapshot.json --profile mayor
```

Or with an explicit profile file:

```bash
npm run inspect -- --snapshot test/fixtures/stableSnapshot.json --profile test/fixtures/customMayorProfile.json
```

The CLI prints deterministic JSON with:
- the sorted scored candidate set
- the selected `proposal.v2` envelope
- the mapped command string
- `reason`, `reasonTags`, and `preconditions` when present

It never executes the command.

## Tests

Run:

```bash
npm test
```

The suite currently verifies:
- strict schema validation for snapshot, profile, and proposal
- deterministic envelope metadata
- negative cases for malformed args and mismatched `townId`
- proposal-to-command mapping only for valid envelopes

## Documentation

- [WORLD_CORE_CONTRACT.md](WORLD_CORE_CONTRACT.md)
- [PROPOSAL_REFERENCE.md](PROPOSAL_REFERENCE.md)
