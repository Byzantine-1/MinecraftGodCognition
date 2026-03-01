import assert from 'assert';
import { describe, it } from 'node:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { captainProfile, mayorProfile, wardenProfile } from '../src/agentProfiles.js';
import { ProposalType, isValidProposal } from '../src/proposalDsl.js';
import { proposalToCommand } from '../src/proposalMapping.js';
import {
  canonicalizeSnapshot,
  createDefaultSnapshot,
  isValidSnapshot
} from '../src/snapshotSchema.js';
import { SnapshotBounds } from '../src/schemaVersions.js';
import { propose } from '../src/propose.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadSnapshot(filename) {
  const data = fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf-8');
  return JSON.parse(data);
}

function profileForSnapshot(profile, snapshot) {
  return { ...profile, townId: snapshot.townId };
}

describe('Snapshot Canonicalization', () => {
  it('should canonicalize sideQuests and projects by deterministic id-first ordering', () => {
    const snapshot = createDefaultSnapshot('town-1', 5);
    snapshot.sideQuests = [
      { id: 'sq-zeta', title: 'Zeta', complexity: 3 },
      { id: 'sq-alpha', title: 'Alpha', complexity: 1 }
    ];
    snapshot.projects = [
      { id: 'watchtower', name: 'Watchtower', progress: 0.2, status: 'active' },
      { id: 'farmhouse', name: 'Farmhouse', progress: 0.8, status: 'planning' }
    ];

    const canonical = canonicalizeSnapshot(snapshot);

    assert.deepStrictEqual(
      canonical.sideQuests.map(quest => quest.id),
      ['sq-alpha', 'sq-zeta']
    );
    assert.deepStrictEqual(
      canonical.projects.map(project => project.id),
      ['farmhouse', 'watchtower']
    );
    assert.deepStrictEqual(
      snapshot.sideQuests.map(quest => quest.id),
      ['sq-zeta', 'sq-alpha']
    );
  });

  it('should choose the same mayor proposal when sideQuests are reordered', () => {
    const snapshotA = createDefaultSnapshot('town-1', 2);
    snapshotA.sideQuests = [
      { id: 'sq-zeta', title: 'Repair Walls', complexity: 2 },
      { id: 'sq-alpha', title: 'Gather Wood', complexity: 1 }
    ];

    const snapshotB = createDefaultSnapshot('town-1', 2);
    snapshotB.sideQuests = [
      { id: 'sq-alpha', title: 'Gather Wood', complexity: 1 },
      { id: 'sq-zeta', title: 'Repair Walls', complexity: 2 }
    ];

    const proposalA = propose(snapshotA, mayorProfile);
    const proposalB = propose(snapshotB, mayorProfile);

    assert.strictEqual(proposalA.type, ProposalType.MAYOR_ACCEPT_MISSION);
    assert.strictEqual(proposalA.type, proposalB.type);
    assert.deepStrictEqual(proposalA.args, proposalB.args);
    assert.strictEqual(proposalA.snapshotHash, proposalB.snapshotHash);
    assert.strictEqual(proposalA.proposalId, proposalB.proposalId);
  });

  it('should keep snapshotHash stable for reordered equivalent snapshots', () => {
    const snapshotA = {
      schemaVersion: 'snapshot.v1',
      day: 8,
      townId: 'town-1',
      mission: null,
      sideQuests: [
        { id: 'sq-b', title: 'Repair Storage', complexity: 2 },
        { id: 'sq-a', title: 'Gather Wood', complexity: 1 }
      ],
      pressure: {
        threat: 0.8,
        scarcity: 0.2,
        hope: 0.7,
        dread: 0.1
      },
      projects: [
        { id: 'wall', name: 'North Wall', progress: 0.4, status: 'active' },
        { id: 'gate', name: 'Main Gate', progress: 0.1, status: 'planning' }
      ],
      latestNetherEvent: null
    };

    const snapshotB = {
      townId: 'town-1',
      day: 8,
      schemaVersion: 'snapshot.v1',
      pressure: {
        dread: 0.1,
        hope: 0.7,
        scarcity: 0.2,
        threat: 0.8
      },
      mission: null,
      latestNetherEvent: null,
      projects: [
        { status: 'planning', progress: 0.1, name: 'Main Gate', id: 'gate' },
        { status: 'active', progress: 0.4, name: 'North Wall', id: 'wall' }
      ],
      sideQuests: [
        { complexity: 1, title: 'Gather Wood', id: 'sq-a' },
        { complexity: 2, title: 'Repair Storage', id: 'sq-b' }
      ]
    };

    const proposalA = propose(snapshotA, captainProfile);
    const proposalB = propose(snapshotB, captainProfile);

    assert.strictEqual(proposalA.snapshotHash, proposalB.snapshotHash);
    assert.strictEqual(proposalA.proposalId, proposalB.proposalId);
    assert.deepStrictEqual(proposalA.args, proposalB.args);
  });

  it('should reject snapshots that violate documented bounds and id invariants', () => {
    const tooManyQuests = createDefaultSnapshot('town-1', 1);
    tooManyQuests.sideQuests = Array.from({ length: SnapshotBounds.maxSideQuests + 1 }, (_, index) => ({
      id: `sq-${index}`,
      title: `Quest ${index}`,
      complexity: 1
    }));

    const duplicateProjectIds = createDefaultSnapshot('town-1', 1);
    duplicateProjectIds.projects = [
      { id: 'wall', name: 'North Wall', progress: 0.2, status: 'active' },
      { id: 'wall', name: 'South Wall', progress: 0.4, status: 'planning' }
    ];

    const duplicateSideQuestIds = createDefaultSnapshot('town-1', 1);
    duplicateSideQuestIds.sideQuests = [
      { id: 'sq-1', title: 'Gather Wood', complexity: 1 },
      { id: 'sq-1', title: 'Gather Stone', complexity: 2 }
    ];

    const unexpectedFieldSnapshot = {
      ...createDefaultSnapshot('town-1', 1),
      unexpected: true
    };

    assert.strictEqual(isValidSnapshot(tooManyQuests), false);
    assert.strictEqual(isValidSnapshot(duplicateSideQuestIds), false);
    assert.strictEqual(isValidSnapshot(duplicateProjectIds), false);
    assert.strictEqual(isValidSnapshot(unexpectedFieldSnapshot), false);
  });

  it('should preserve current valid outputs for stable fixture scenarios', () => {
    const stableSnapshot = loadSnapshot('stableSnapshot.json');
    const threatenedSnapshot = loadSnapshot('threatenedSnapshot.json');
    const crisisSnapshot = loadSnapshot('resourceCrisisSnapshot.json');

    const mayorProposal = propose(stableSnapshot, profileForSnapshot(mayorProfile, stableSnapshot));
    const captainProposal = propose(threatenedSnapshot, profileForSnapshot(captainProfile, threatenedSnapshot));
    const wardenProposal = propose(crisisSnapshot, profileForSnapshot(wardenProfile, crisisSnapshot));

    assert(isValidProposal(mayorProposal));
    assert(isValidProposal(captainProposal));
    assert(isValidProposal(wardenProposal));

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
