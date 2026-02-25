# minecraft-agent-cognition

A minimal, deterministic proposal-only cognition layer for Minecraft agents.

## Overview

This module reads a bounded snapshot of the game world and outputs a single typed action proposal. It does not perform orchestration, network calls, or direct world mutation.

## Architecture

- **Proposal DSL**: Typed action proposal definitions
- **Agent Profiles**: Agent capabilities and personality traits
- **Snapshot Schema**: Bounded world state schema
- **Heuristics**: Decision-making rules and evaluations
- **Propose**: Core proposal generation logic

## Usage

```javascript
import { propose } from './src/propose.js';

const snapshot = {
  agent: { id: 'agent-1', health: 20, hunger: 8 },
  nearby: [],
  inventory: []
};

const profile = {
  name: 'Miner',
  traits: { riskTolerance: 0.5 }
};

const proposal = propose(snapshot, profile);
console.log(proposal);
```

## Running Tests

```bash
npm test
```

## Project Structure

```
src/
  index.js              # Entry point
  proposalDsl.js        # Proposal type definitions
  agentProfiles.js      # Agent capability profiles
  snapshotSchema.js     # World state schema
  heuristics.js         # Decision-making heuristics
  propose.js            # Proposal generation

test/
  propose.test.js       # Proposal tests
  heuristics.test.js    # Heuristics tests
```
