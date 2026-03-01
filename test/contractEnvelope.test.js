import assert from 'assert';
import { describe, it } from 'node:test';
import { propose } from '../src/propose.js';
import { proposalToCommand } from '../src/proposalMapping.js';
import { createDefaultSnapshot } from '../src/snapshotSchema.js';
import { mayorProfile } from '../src/agentProfiles.js';
import { SchemaVersion } from '../src/schemaVersions.js';

describe('Contract Envelope', () => {
  it('should keep snapshotHash stable for equivalent valid input', () => {
    const snapshotA = {
      schemaVersion: 'snapshot.v1',
      day: 5,
      townId: 'town-1',
      mission: null,
      sideQuests: [
        { id: 'sq-gather-wood', title: 'Gather Wood', complexity: 1 }
      ],
      pressure: {
        threat: 0.2,
        scarcity: 0.3,
        hope: 0.7,
        dread: 0.1
      },
      projects: [
        { id: 'farm', name: 'Expand Farm', progress: 0.2, status: 'active' }
      ],
      latestNetherEvent: null
    };

    const snapshotB = {
      townId: 'town-1',
      projects: [
        { status: 'active', progress: 0.2, name: 'Expand Farm', id: 'farm' }
      ],
      pressure: {
        dread: 0.1,
        hope: 0.7,
        scarcity: 0.3,
        threat: 0.2
      },
      sideQuests: [
        { complexity: 1, title: 'Gather Wood', id: 'sq-gather-wood' }
      ],
      latestNetherEvent: null,
      schemaVersion: 'snapshot.v1',
      mission: null,
      day: 5
    };

    const proposalA = propose(snapshotA, mayorProfile);
    const proposalB = propose(snapshotB, mayorProfile);

    assert.strictEqual(proposalA.snapshotHash, proposalB.snapshotHash);
    assert.strictEqual(proposalA.proposalId, proposalB.proposalId);
    assert.strictEqual(proposalA.decisionEpoch, 5);
    assert.strictEqual(proposalB.decisionEpoch, 5);
  });

  it('should expose the documented proposal envelope as the public API', () => {
    const snapshot = createDefaultSnapshot('town-1', 3);
    snapshot.sideQuests = [{ id: 'sq-1', title: 'Gather Wood', complexity: 1 }];

    const proposal = propose(snapshot, mayorProfile);

    assert.strictEqual(proposal.schemaVersion, SchemaVersion.PROPOSAL);
    assert.deepStrictEqual(
      Object.keys(proposal).sort(),
      [
        'actorId',
        'args',
        'decisionEpoch',
        'preconditions',
        'priority',
        'proposalId',
        'reason',
        'reasonTags',
        'schemaVersion',
        'snapshotHash',
        'townId',
        'type'
      ].sort()
    );
    assert.deepStrictEqual(Object.keys(proposal.args), ['missionId']);
  });

  it('should fail invalid proposals before command mapping', () => {
    const snapshot = createDefaultSnapshot('town-1', 1);
    snapshot.sideQuests = [{ id: 'sq-1', title: 'Gather Wood', complexity: 1 }];
    const proposal = propose(snapshot, mayorProfile);

    const invalidProposal = {
      ...proposal,
      args: {}
    };

    assert.throws(
      () => proposalToCommand(invalidProposal),
      /Invalid proposal envelope/
    );
  });
});
