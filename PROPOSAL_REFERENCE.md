# Proposal Reference Table

Complete reference for all proposal types, conditions, and command mappings.

## Proposal Types

### 1. MAYOR_ACCEPT_MISSION
- **Emission Condition:** No active mission (`snapshot.mission === null`) AND acceptable risk
- **Governor:** Mayor (authority-focused)
- **Command Format:** `mission accept <townId> <missionId>`
- **Args Required:** `{ missionId: string }`
- **Typical Reason Tags:** `['no_active_mission', 'acceptable_risk']`
- **Example Snapshot:** Stable conditions (low pressure)

### 2. PROJECT_ADVANCE
- **Emission Condition:** Threat present OR pragmatic play OR projects available
- **Governor:** Captain (pragmatism-focused)
- **Command Format:** `project advance <townId> <projectId>`
- **Args Required:** `{ projectId: string }`
- **Typical Reason Tags:** `['high_threat', 'project_available', 'balanced_approach']`
- **Example Snapshot:** Threatened conditions (high threat)

### 3. SALVAGE_PLAN
- **Emission Condition:** High strain (high scarcity OR high dread) AND courage > prudence
- **Governor:** Warden (courage-focused)
- **Command Format:** `salvage initiate <townId> <focus>`
- **Args Required:** `{ focus: 'scarcity' | 'dread' }`
- **Typical Reason Tags:** `['high_strain', 'dread_spike', 'resource_crisis']`
- **Example Snapshot:** Resource crisis (high scarcity + dread)

### 4. TOWNSFOLK_TALK
- **Emission Condition:** Fallback for low hope OR emotional stabilization needed
- **Governor:** Warden (prudence-focused, low-risk emotional support)
- **Command Format:** `townsfolk talk <townId> <talkType>`
- **Args Required:** `{ talkType: 'morale-boost' | 'casual' }`
- **Typical Reason Tags:** `['low_hope', 'morale_check', 'casual_interaction']`
- **Example Snapshot:** Stable/low-pressure (fallback)

---

## Snapshot Condition Reference

### Snapshot: stableSnapshot.json
- **Day:** 1
- **Town ID:** town-stable
- **Pressure:** threat 0.1, scarcity 0.15, hope 0.85, dread 0.05
- **Mission:** null
- **Projects:** 2 (farmhouse, storage)
- **Side Quests:** 1 (wood gathering)
- **Condition:** Early game, low pressure, high hope

| Governor | Typical Proposal | Command | Reason Tags |
|----------|------------------|---------|-------------|
| Mayor | MAYOR_ACCEPT_MISSION | mission accept town-stable sq-wood-gathering | `['no_active_mission']` |
| Captain | TOWNSFOLK_TALK | townsfolk talk town-stable casual | `['low_threat']` or PROJECT_ADVANCE |
| Warden | TOWNSFOLK_TALK | townsfolk talk town-stable morale-boost | `['low_strain']` |

---

### Snapshot: threatenedSnapshot.json
- **Day:** 15
- **Town ID:** town-threatened
- **Pressure:** threat 0.72, scarcity 0.45, hope 0.55, dread 0.4
- **Mission:** Active (mob-spawner-clearing)
- **Projects:** 2 (wall-perimeter 0.6, watchtower 0.2)
- **Side Quests:** 2 (food supply, materials)
- **Condition:** Mid-game threat, active mission, resource pressure

| Governor | Typical Proposal | Command | Reason Tags |
|----------|------------------|---------|-------------|
| Mayor | PROJECT_ADVANCE | project advance town-threatened wall-perimeter | `['active_mission']` (cannot accept) or PROJECT_ADVANCE |
| Captain | PROJECT_ADVANCE | project advance town-threatened wall-perimeter | `['high_threat', 'project_available']` |
| Warden | PROJECT_ADVANCE or SALVAGE_PLAN | project advance town-threatened wall-perimeter | `['balanced_approach']` or `['high_strain']` |

---

### Snapshot: resourceCrisisSnapshot.json
- **Day:** 30
- **Town ID:** town-resource-crisis
- **Pressure:** threat 0.35, scarcity 0.88, hope 0.3, dread 0.75
- **Mission:** Active (resource-hunt)
- **Projects:** 1 (mine-shaft, blocked)
- **Side Quests:** 1 (gather-sticks)
- **Condition:** Late game crisis, high scarcity + dread, low hope

| Governor | Typical Proposal | Command | Reason Tags |
|----------|------------------|---------|-------------|
| Mayor | PROJECT_ADVANCE or TOWNSFOLK_TALK | project advance town-resource-crisis mine-shaft | `['active_mission']` or TALK for morale |
| Captain | PROJECT_ADVANCE | project advance town-resource-crisis mine-shaft | `['project_available', 'balanced_approach']` |
| Warden | SALVAGE_PLAN | salvage initiate town-resource-crisis scarcity | `['high_strain', 'dread_spike', 'resource_crisis']` |

---

## Full Loop Examples

### Example 1: Early Game (Stable)
```
Input:  stableSnapshot.json + mayorProfile
   ↓
Evaluation:
  - evaluateMissionAcceptance() → {score: 0.8, reasonTags: ['no_active_mission'], targetId: 'sq-wood'}
  - evaluateProjectAdvance() → {score: 0.3, reasonTags: ['low_threat'], targetId: 'farm'}
  - evaluateSalvagePlan() → {score: 0.1, reasonTags: [], targetId: 'scarcity'}
  - evaluateTownsfolkTalk() → {score: 0.2, reasonTags: [], targetId: 'casual'}
   ↓
Tie-breaking: MAYOR_ACCEPT_MISSION wins (highest score 0.8)
   ↓
Output: {
  type: 'MAYOR_ACCEPT_MISSION',
  actorId: 'mayor',
  townId: 'town-stable',
  priority: 0.8,
  reason: 'No active mission and quest is available',
  reasonTags: ['no_active_mission'],
  args: { missionId: 'sq-wood-gathering' }
}
   ↓
Command: "mission accept town-stable sq-wood-gathering"
```

### Example 2: Threat (Threatened)
```
Input:  threatenedSnapshot.json + captainProfile
   ↓
Evaluation:
  - evaluateMissionAcceptance() → {score: 0, reasonTags: ['active_mission'], targetId: null}
  - evaluateProjectAdvance() → {score: 0.85, reasonTags: ['high_threat', 'project_available'], targetId: 'wall-perimeter'}
  - evaluateSalvagePlan() → {score: 0.5, reasonTags: ['high_strain'], targetId: 'scarcity'}
  - evaluateTownsfolkTalk() → {score: 0.2, reasonTags: [], targetId: 'casual'}
   ↓
Tie-breaking: PROJECT_ADVANCE wins (highest score 0.85)
   ↓
Output: {
  type: 'PROJECT_ADVANCE',
  actorId: 'captain',
  townId: 'town-threatened',
  priority: 0.85,
  reason: 'Threat detected; advancing defensive wall',
  reasonTags: ['high_threat', 'project_available'],
  args: { projectId: 'wall-perimeter' }
}
   ↓
Command: "project advance town-threatened wall-perimeter"
```

### Example 3: Crisis (Resource Crisis)
```
Input:  resourceCrisisSnapshot.json + wardenProfile
   ↓
Evaluation:
  - evaluateMissionAcceptance() → {score: 0, reasonTags: ['active_mission'], targetId: null}
  - evaluateProjectAdvance() → {score: 0.4, reasonTags: ['project_available'], targetId: 'mine-shaft'}
  - evaluateSalvagePlan() → {score: 0.9, reasonTags: ['high_strain', 'dread_spike'], targetId: 'dread'}
  - evaluateTownsfolkTalk() → {score: 0.3, reasonTags: ['low_hope'], targetId: 'morale-boost'}
   ↓
Tie-breaking: SALVAGE_PLAN wins (highest score 0.9)
   ↓
Output: {
  type: 'SALVAGE_PLAN',
  actorId: 'warden',
  townId: 'town-resource-crisis',
  priority: 0.9,
  reason: 'Resource crisis and despair spike detected; salvage critical',
  reasonTags: ['high_strain', 'dread_spike', 'resource_crisis'],
  args: { focus: 'dread' }
}
   ↓
Command: "salvage initiate town-resource-crisis dread"
```

---

## Proposal Validation Checklist

Every proposal MUST satisfy:
- ✅ Type is one of 4 valid ProposalType values
- ✅ actorId matches governor role
- ✅ townId matches snapshot townId
- ✅ priority ∈ [0, 1]
- ✅ reason is non-empty string
- ✅ reasonTags is array of strings
- ✅ args object exists and contains type-specific fields:
  - `MAYOR_ACCEPT_MISSION` → `{ missionId }`
  - `PROJECT_ADVANCE` → `{ projectId }`
  - `SALVAGE_PLAN` → `{ focus }`
  - `TOWNSFOLK_TALK` → `{ talkType }`

---

## Command Mapping Contract

**Format:** `<verb> <noun> <townId> <target>`

| Proposal Type | Verb | Noun | Target |
|---------------|------|------|--------|
| MAYOR_ACCEPT_MISSION | mission | accept | missionId |
| PROJECT_ADVANCE | project | advance | projectId |
| SALVAGE_PLAN | salvage | initiate | focus |
| TOWNSFOLK_TALK | townsfolk | talk | talkType |

---

## Anti-Repeat Memory Behavior

The optional `memory` parameter allows tracking repeated proposals:

```javascript
// First proposal
const p1 = propose(snapshot, profile);
// { type: 'MAYOR_ACCEPT_MISSION', priority: 0.8, ... }

// If same proposal repeated:
const memory = { lastType: 'MAYOR_ACCEPT_MISSION', lastTarget: 'sq-wood', repeatCount: 1 };
const p2 = propose(snapshot, profile, memory);
// Priority penalized: 0.8 - (0.1 * 1) = 0.7
// If other proposals are now higher, they win in tie-breaking
```

---

## Determinism Guarantees

1. **Snapshot Determinism:** Same snapshot JSON always produces same proposal
2. **Profile Determinism:** Same profile always produces same evaluation scores
3. **Tie-Breaking Determinism:** Identical scores always break by: priority desc → type index → targetId lexicographic
4. **Memory Determinism:** Same memory state always produces same penalty
5. **Command Determinism:** Same proposal always produces same command string

---

## Test Coverage

- **95 tests** across 5 test files:
  - `hardening.test.js` (41 tests) - Input validation, tie-breaking, metadata
  - `proposalMapping.test.js` (13 tests) - Proposal-to-command mapping
  - `integration.test.js` (15 tests) - Full loop with fixtures
  - `fullLoopValidation.test.js` (26 tests) - World-core contract validation
  - `propose.test.js` (varies) - Core propose() behavior

All tests passing ✅
