import assert from 'assert';
import { describe, it } from 'node:test';
import { mayorProfile } from '../src/agentProfiles.js';
import { createExecutionHandoff, isValidExecutionResult } from '../src/executionHandoff.js';
import {
  createLocalExecutionState,
  executeLocalHandoff,
  isValidLocalExecutionState,
  normalizeLocalExecutionState
} from '../src/localExecutionHarness.js';
import { propose } from '../src/propose.js';
import { createDefaultSnapshot } from '../src/snapshotSchema.js';

function createMayorHandoff() {
  const snapshot = createDefaultSnapshot('town-1', 6);
  snapshot.sideQuests = [{ id: 'sq-1', title: 'Gather Wood', complexity: 1 }];
  const proposal = propose(snapshot, mayorProfile);
  return createExecutionHandoff(proposal);
}

describe('Local Execution Harness', () => {
  it('should execute a valid handoff against matching local state', () => {
    const handoff = createMayorHandoff();
    const state = createLocalExecutionState({
      snapshotHash: handoff.snapshotHash,
      decisionEpoch: handoff.decisionEpoch,
      mission: null,
      sideQuests: [{ id: 'sq-1' }]
    });

    const result = executeLocalHandoff(handoff, state);

    assert.strictEqual(result.status, 'executed');
    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.executed, true);
    assert.strictEqual(result.reasonCode, 'EXECUTED');
    assert(isValidExecutionResult(result));
    assert.strictEqual(result.evaluation.preconditions.passed, true);
    assert.strictEqual(result.evaluation.staleCheck.passed, true);
    assert.strictEqual(result.evaluation.duplicateCheck.duplicate, false);
    assert.strictEqual(result.worldState.postExecutionDecisionEpoch, handoff.decisionEpoch + 1);
  });

  it('should reject stale handoffs deterministically', () => {
    const handoff = createMayorHandoff();
    const state = createLocalExecutionState({
      snapshotHash: 'f'.repeat(64),
      decisionEpoch: handoff.decisionEpoch + 1,
      mission: null,
      sideQuests: [{ id: 'sq-1' }]
    });

    const result = executeLocalHandoff(handoff, state);

    assert.strictEqual(result.status, 'stale');
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.executed, false);
    assert.strictEqual(result.reasonCode, 'STALE_STATE');
    assert.strictEqual(result.evaluation.preconditions.evaluated, false);
    assert.strictEqual(result.evaluation.staleCheck.actualSnapshotHash, state.snapshotHash);
    assert.strictEqual(result.evaluation.staleCheck.actualDecisionEpoch, state.decisionEpoch);
    assert(isValidExecutionResult(result));
  });

  it('should reject duplicate handoffs deterministically', () => {
    const handoff = createMayorHandoff();
    const state = createLocalExecutionState({
      snapshotHash: handoff.snapshotHash,
      decisionEpoch: handoff.decisionEpoch,
      mission: null,
      sideQuests: [{ id: 'sq-1' }],
      processedResults: [
        {
          idempotencyKey: handoff.idempotencyKey,
          resultId: `result_${'a'.repeat(64)}`
        }
      ]
    });

    const result = executeLocalHandoff(handoff, state);

    assert.strictEqual(result.status, 'duplicate');
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.executed, false);
    assert.strictEqual(result.reasonCode, 'DUPLICATE_HANDOFF');
    assert.strictEqual(result.evaluation.duplicateCheck.duplicate, true);
    assert.strictEqual(result.evaluation.duplicateCheck.duplicateOf, `result_${'a'.repeat(64)}`);
    assert(isValidExecutionResult(result));
  });

  it('should reject failed preconditions without executing', () => {
    const handoff = createMayorHandoff();
    const state = createLocalExecutionState({
      snapshotHash: handoff.snapshotHash,
      decisionEpoch: handoff.decisionEpoch,
      mission: { id: 'active-mission' },
      sideQuests: []
    });

    const result = executeLocalHandoff(handoff, state);

    assert.strictEqual(result.status, 'rejected');
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.executed, false);
    assert.strictEqual(result.reasonCode, 'PRECONDITION_FAILED');
    assert.strictEqual(result.evaluation.preconditions.evaluated, true);
    assert.strictEqual(result.evaluation.preconditions.passed, false);
    assert(result.evaluation.preconditions.failures.some(failure => failure.kind === 'mission_absent'));
    assert(result.evaluation.preconditions.failures.some(failure => failure.kind === 'side_quest_exists'));
    assert(isValidExecutionResult(result));
  });

  it('should reject invalid handoffs before simulation', () => {
    const handoff = {
      ...createMayorHandoff(),
      command: 'mission accept town-1 wrong'
    };
    const state = createLocalExecutionState();

    assert.throws(
      () => executeLocalHandoff(handoff, state),
      /Invalid execution handoff/
    );
  });

  it('should return replay-stable results for the same handoff and state', () => {
    const handoff = createMayorHandoff();
    const state = createLocalExecutionState({
      snapshotHash: handoff.snapshotHash,
      decisionEpoch: handoff.decisionEpoch,
      mission: null,
      sideQuests: [{ id: 'sq-1' }]
    });

    const first = executeLocalHandoff(handoff, state);
    const second = executeLocalHandoff(handoff, normalizeLocalExecutionState(state));

    assert.deepStrictEqual(first, second);
  });

  it('should validate and normalize local state deterministically', () => {
    const state = {
      snapshotHash: 'a'.repeat(64),
      decisionEpoch: 2,
      mission: null,
      sideQuests: [{ id: 'sq-2' }, { id: 'sq-1' }],
      projects: [
        { id: 'proj-2', status: 'planning' },
        { id: 'proj-1', status: 'active' }
      ],
      supportedSalvageFocuses: ['general', 'scarcity', 'dread'],
      supportedTalkTypes: ['morale-boost', 'casual'],
      processedResults: [
        { idempotencyKey: 'proposal-b', resultId: `result_${'b'.repeat(64)}` },
        { idempotencyKey: 'proposal-a', resultId: `result_${'a'.repeat(64)}` }
      ]
    };

    assert.strictEqual(isValidLocalExecutionState(state), true);

    const normalized = normalizeLocalExecutionState(state);

    assert.deepStrictEqual(normalized.sideQuests.map(sideQuest => sideQuest.id), ['sq-1', 'sq-2']);
    assert.deepStrictEqual(normalized.projects.map(project => project.id), ['proj-1', 'proj-2']);
    assert.deepStrictEqual(normalized.processedResults.map(entry => entry.idempotencyKey), ['proposal-a', 'proposal-b']);
  });
});
