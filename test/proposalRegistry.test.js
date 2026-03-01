import assert from 'assert';
import { describe, it } from 'node:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { captainProfile, mayorProfile, wardenProfile } from '../src/agentProfiles.js';
import { ProposalType, isValidProposal } from '../src/proposalDsl.js';
import { proposalToCommand } from '../src/proposalMapping.js';
import {
  getProposalDefinition,
  getProposalOrder,
  isValidProposalDefinition,
  isValidProposalRegistry,
  listProposalTypes,
  mapProposalToCommand,
  materializeProposalType,
  proposalRegistry
} from '../src/proposalRegistry.js';
import { SchemaVersion } from '../src/schemaVersions.js';
import { propose } from '../src/propose.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadSnapshot(filename) {
  const data = fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf-8');
  return JSON.parse(data);
}

function createEnvelope(type, args, reason, preconditions = [], actorId = 'actor-1', townId = 'town-1') {
  return {
    schemaVersion: SchemaVersion.PROPOSAL,
    proposalId: `proposal_${'a'.repeat(64)}`,
    snapshotHash: 'b'.repeat(64),
    decisionEpoch: 7,
    ...(preconditions.length > 0 ? { preconditions } : {}),
    type,
    actorId,
    townId,
    priority: 0.5,
    reason,
    reasonTags: ['test'],
    args
  };
}

function createContextForType(type) {
  const snapshot = {
    schemaVersion: 'snapshot.v1',
    day: 7,
    townId: 'town-1',
    mission: null,
    sideQuests: [{ id: 'sq-1', title: 'Quest 1', complexity: 1 }],
    pressure: { threat: 0.8, scarcity: 0.8, hope: 0.4, dread: 0.7 },
    projects: [{ id: 'proj-1', name: 'Project 1', progress: 0.3, status: 'active' }],
    latestNetherEvent: null
  };

  const contexts = {
    [ProposalType.MAYOR_ACCEPT_MISSION]: {
      snapshot,
      profile: mayorProfile,
      targetId: 'sq-1'
    },
    [ProposalType.PROJECT_ADVANCE]: {
      snapshot,
      profile: captainProfile,
      targetId: 'proj-1'
    },
    [ProposalType.SALVAGE_PLAN]: {
      snapshot,
      profile: wardenProfile,
      targetId: 'scarcity'
    },
    [ProposalType.TOWNSFOLK_TALK]: {
      snapshot,
      profile: mayorProfile,
      targetId: 'morale-boost'
    }
  };

  return contexts[type];
}

describe('Proposal Registry', () => {
  it('should define a valid contract for every registered proposal type', () => {
    assert(isValidProposalRegistry(proposalRegistry));

    const registeredTypes = proposalRegistry.map(definition => definition.type);
    const exportedTypes = Object.values(ProposalType);
    const orders = proposalRegistry.map(definition => definition.order);

    proposalRegistry.forEach(definition => {
      assert(isValidProposalDefinition(definition));
      assert(getProposalDefinition(definition.type));
    });

    assert.deepStrictEqual(registeredTypes, exportedTypes);
    assert.deepStrictEqual(registeredTypes, listProposalTypes());
    assert.deepStrictEqual(orders, [0, 1, 2, 3]);
    assert.strictEqual(new Set(orders).size, orders.length);
  });

  it('should validate and map every registered proposal type consistently', () => {
    listProposalTypes().forEach(type => {
      const context = createContextForType(type);
      const materialized = materializeProposalType(type, context);
      const envelope = createEnvelope(
        type,
        materialized.args,
        materialized.reason,
        materialized.preconditions,
        context.profile.id,
        context.snapshot.townId
      );

      assert(isValidProposal(envelope));
      assert.strictEqual(proposalToCommand(envelope), mapProposalToCommand(envelope));
      assert.strictEqual(proposalToCommand(envelope), getProposalDefinition(type).toCommand(envelope));
    });
  });

  it('should use the registry as the single proposal type definition source', () => {
    Object.values(ProposalType).forEach(type => {
      assert(getProposalDefinition(type), `Missing registry definition for ${type}`);
      assert.notStrictEqual(getProposalOrder(type), Number.MAX_SAFE_INTEGER);
    });

    assert.strictEqual(proposalRegistry.length, Object.values(ProposalType).length);
  });

  it('should preserve existing behavior for current proposal outputs', () => {
    const stableSnapshot = loadSnapshot('stableSnapshot.json');
    const threatenedSnapshot = loadSnapshot('threatenedSnapshot.json');
    const crisisSnapshot = loadSnapshot('resourceCrisisSnapshot.json');

    const mayorProposal = propose(stableSnapshot, { ...mayorProfile, townId: stableSnapshot.townId });
    const captainProposal = propose(threatenedSnapshot, { ...captainProfile, townId: threatenedSnapshot.townId });
    const wardenProposal = propose(crisisSnapshot, { ...wardenProfile, townId: crisisSnapshot.townId });

    assert.strictEqual(mayorProposal.type, ProposalType.MAYOR_ACCEPT_MISSION);
    assert.deepStrictEqual(mayorProposal.args, { missionId: 'sq-wood-gathering' });
    assert.strictEqual(proposalToCommand(mayorProposal), 'mission accept town-stable sq-wood-gathering');

    assert.strictEqual(captainProposal.type, ProposalType.PROJECT_ADVANCE);
    assert.deepStrictEqual(captainProposal.args, { projectId: 'wall-perimeter' });
    assert.strictEqual(proposalToCommand(captainProposal), 'project advance town-threatened wall-perimeter');

    assert.strictEqual(wardenProposal.type, ProposalType.SALVAGE_PLAN);
    assert.deepStrictEqual(wardenProposal.args, { focus: 'scarcity' });
    assert.strictEqual(proposalToCommand(wardenProposal), 'salvage initiate town-resource-crisis scarcity');
  });
});
