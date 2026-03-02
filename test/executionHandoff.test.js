import assert from 'assert';
import { describe, it } from 'node:test';
import { mayorProfile } from '../src/agentProfiles.js';
import {
  createExecutionHandoff,
  createExecutionResult,
  ExecutionStatus,
  isValidExecutionHandoff,
  isValidExecutionResult
} from '../src/executionHandoff.js';
import { propose } from '../src/propose.js';
import { createDefaultSnapshot } from '../src/snapshotSchema.js';
import { SchemaVersion } from '../src/schemaVersions.js';

function createMayorProposal() {
  const snapshot = createDefaultSnapshot('town-1', 4);
  snapshot.sideQuests = [{ id: 'sq-1', title: 'Gather Wood', complexity: 1 }];
  return propose(snapshot, mayorProfile);
}

describe('Execution Handoff Contract', () => {
  it('should build a stable deterministic handoff payload', () => {
    const proposal = createMayorProposal();
    const first = createExecutionHandoff(proposal);
    const second = createExecutionHandoff(proposal);

    assert.strictEqual(first.schemaVersion, SchemaVersion.HANDOFF);
    assert.strictEqual(first.handoffId, second.handoffId);
    assert.deepStrictEqual(first, second);
    assert.strictEqual(first.advisory, true);
    assert.strictEqual(first.idempotencyKey, proposal.proposalId);
    assert.strictEqual(first.command, 'mission accept town-1 sq-1');
    assert.deepStrictEqual(Object.keys(first).sort(), [
      'advisory',
      'command',
      'decisionEpoch',
      'executionRequirements',
      'handoffId',
      'idempotencyKey',
      'proposal',
      'proposalId',
      'schemaVersion',
      'snapshotHash'
    ].sort());
    assert(isValidExecutionHandoff(first));
  });

  it('should reject malformed handoff payloads', () => {
    const proposal = createMayorProposal();
    const handoff = createExecutionHandoff(proposal);
    const invalid = {
      ...handoff,
      command: 'mission accept town-1 wrong-id'
    };

    assert.strictEqual(isValidExecutionHandoff(invalid), false);
  });

  it('should build a stable executed result payload', () => {
    const proposal = createMayorProposal();
    const handoff = createExecutionHandoff(proposal);
    const first = createExecutionResult(handoff, {
      status: 'executed',
      accepted: true,
      executed: true,
      reasonCode: 'EXECUTED',
      preconditions: {
        evaluated: true,
        passed: true,
        failures: []
      },
      staleCheck: {
        evaluated: true,
        passed: true,
        actualSnapshotHash: proposal.snapshotHash,
        actualDecisionEpoch: proposal.decisionEpoch
      },
      duplicateCheck: {
        evaluated: true,
        duplicate: false,
        duplicateOf: null
      },
      worldState: {
        postExecutionSnapshotHash: proposal.snapshotHash,
        postExecutionDecisionEpoch: proposal.decisionEpoch + 1
      }
    });
    const second = createExecutionResult(handoff, {
      status: 'executed',
      accepted: true,
      executed: true,
      reasonCode: 'EXECUTED',
      preconditions: {
        evaluated: true,
        passed: true,
        failures: []
      },
      staleCheck: {
        evaluated: true,
        passed: true,
        actualSnapshotHash: proposal.snapshotHash,
        actualDecisionEpoch: proposal.decisionEpoch
      },
      duplicateCheck: {
        evaluated: true,
        duplicate: false,
        duplicateOf: null
      },
      worldState: {
        postExecutionSnapshotHash: proposal.snapshotHash,
        postExecutionDecisionEpoch: proposal.decisionEpoch + 1
      }
    });

    assert.strictEqual(first.type, SchemaVersion.EXECUTION_RESULT);
    assert.strictEqual(first.schemaVersion, 1);
    assert.strictEqual(first.executionId, second.executionId);
    assert.strictEqual(first.resultId, second.resultId);
    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(Object.keys(first).sort(), [
      'accepted',
      'actorId',
      'command',
      'decisionEpoch',
      'evaluation',
      'executionId',
      'executed',
      'handoffId',
      'idempotencyKey',
      'proposalId',
      'proposalType',
      'reasonCode',
      'resultId',
      'schemaVersion',
      'snapshotHash',
      'status',
      'townId',
      'type',
      'worldState'
    ].sort());
    assert.strictEqual(first.executionId, first.resultId);
    assert(isValidExecutionResult(first));
  });

  it('should preserve optional authority commands and embodiment metadata', () => {
    const proposal = createMayorProposal();
    const handoff = createExecutionHandoff(proposal);
    const result = createExecutionResult(handoff, {
      authorityCommands: ['mayor talk town-1', 'mayor accept town-1'],
      embodiment: {
        backendHint: 'mineflayer',
        actions: [
          {
            type: 'speech.say',
            text: 'Orders stand.'
          }
        ]
      },
      status: 'executed',
      accepted: true,
      executed: true,
      reasonCode: 'EXECUTED',
      preconditions: {
        evaluated: true,
        passed: true,
        failures: []
      },
      staleCheck: {
        evaluated: true,
        passed: true,
        actualSnapshotHash: proposal.snapshotHash,
        actualDecisionEpoch: proposal.decisionEpoch
      },
      duplicateCheck: {
        evaluated: true,
        duplicate: false,
        duplicateOf: null
      }
    });

    assert.deepStrictEqual(result.authorityCommands, ['mayor talk town-1', 'mayor accept town-1']);
    assert.deepStrictEqual(result.embodiment, {
      backendHint: 'mineflayer',
      actions: [
        {
          type: 'speech.say',
          text: 'Orders stand.'
        }
      ]
    });
    assert(isValidExecutionResult(result));
  });

  it('should reject inconsistent execution states', () => {
    const proposal = createMayorProposal();
    const handoff = createExecutionHandoff(proposal);

    assert.throws(
      () => createExecutionResult(handoff, {
        status: 'executed',
        accepted: false,
        executed: true,
        reasonCode: 'BROKEN_STATE'
      }),
      /Invalid execution outcome state/
    );
  });

  it('should support duplicate and stale result classifications', () => {
    const proposal = createMayorProposal();
    const handoff = createExecutionHandoff(proposal);

    const duplicateResult = createExecutionResult(handoff, {
      status: 'duplicate',
      accepted: false,
      executed: false,
      reasonCode: 'DUPLICATE_HANDOFF',
      preconditions: {
        evaluated: false,
        passed: false,
        failures: []
      },
      staleCheck: {
        evaluated: false,
        passed: false,
        actualSnapshotHash: null,
        actualDecisionEpoch: null
      },
      duplicateCheck: {
        evaluated: true,
        duplicate: true,
        duplicateOf: 'result_existing'
      }
    });

    const staleResult = createExecutionResult(handoff, {
      status: 'stale',
      accepted: false,
      executed: false,
      reasonCode: 'STALE_STATE',
      preconditions: {
        evaluated: false,
        passed: false,
        failures: []
      },
      staleCheck: {
        evaluated: true,
        passed: false,
        actualSnapshotHash: proposal.snapshotHash,
        actualDecisionEpoch: proposal.decisionEpoch + 1
      },
      duplicateCheck: {
        evaluated: true,
        duplicate: false,
        duplicateOf: null
      }
    });

    assert.strictEqual(ExecutionStatus.includes(duplicateResult.status), true);
    assert.strictEqual(duplicateResult.status, 'duplicate');
    assert.strictEqual(staleResult.status, 'stale');
    assert(isValidExecutionResult(duplicateResult));
    assert(isValidExecutionResult(staleResult));
  });
});
