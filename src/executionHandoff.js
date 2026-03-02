import { createHash } from 'crypto';
import { isValidProposal } from './proposalDsl.js';
import { proposalToCommand } from './proposalMapping.js';
import { SchemaVersion } from './schemaVersions.js';

const handoffIdPattern = /^handoff_[0-9a-f]{64}$/;
const resultIdPattern = /^result_[0-9a-f]{64}$/;
const hashPattern = /^[0-9a-f]{64}$/;
const proposalIdPattern = /^proposal_[0-9a-f]{64}$/;
const executionResultType = SchemaVersion.EXECUTION_RESULT;
const executionResultSchemaVersion = 1;

export const ExecutionStatus = Object.freeze([
  'executed',
  'rejected',
  'stale',
  'duplicate',
  'failed'
]);

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function hashValue(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function hasOnlyKeys(value, expectedKeys) {
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && expectedKeys.every(key => keys.includes(key));
}

function isFailureEntry(entry) {
  return Boolean(
    entry &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    typeof entry.kind === 'string' &&
    entry.kind.length > 0 &&
    typeof entry.detail === 'string' &&
    entry.detail.length > 0
  );
}

function isValidEvaluationBlock(evaluation) {
  if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation)) return false;
  if (!hasOnlyKeys(evaluation, ['preconditions', 'staleCheck', 'duplicateCheck'])) return false;

  const { preconditions, staleCheck, duplicateCheck } = evaluation;

  if (!preconditions || typeof preconditions !== 'object' || Array.isArray(preconditions)) return false;
  if (!hasOnlyKeys(preconditions, ['evaluated', 'passed', 'failures'])) return false;
  if (typeof preconditions.evaluated !== 'boolean' || typeof preconditions.passed !== 'boolean') return false;
  if (!Array.isArray(preconditions.failures) || !preconditions.failures.every(isFailureEntry)) return false;

  if (!staleCheck || typeof staleCheck !== 'object' || Array.isArray(staleCheck)) return false;
  if (!['evaluated', 'passed', 'actualSnapshotHash', 'actualDecisionEpoch'].every(key => hasOwn(staleCheck, key))) {
    return false;
  }
  if (typeof staleCheck.evaluated !== 'boolean' || typeof staleCheck.passed !== 'boolean') return false;
  if (staleCheck.actualSnapshotHash !== null && (typeof staleCheck.actualSnapshotHash !== 'string' || !hashPattern.test(staleCheck.actualSnapshotHash))) {
    return false;
  }
  if (staleCheck.actualDecisionEpoch !== null && (!Number.isInteger(staleCheck.actualDecisionEpoch) || staleCheck.actualDecisionEpoch < 0)) {
    return false;
  }

  if (!duplicateCheck || typeof duplicateCheck !== 'object' || Array.isArray(duplicateCheck)) return false;
  if (!['evaluated', 'duplicate', 'duplicateOf'].every(key => hasOwn(duplicateCheck, key))) {
    return false;
  }
  if (typeof duplicateCheck.evaluated !== 'boolean' || typeof duplicateCheck.duplicate !== 'boolean') return false;
  if (duplicateCheck.duplicateOf !== null && (typeof duplicateCheck.duplicateOf !== 'string' || duplicateCheck.duplicateOf.length === 0)) {
    return false;
  }

  return true;
}

function isValidWorldState(worldState) {
  if (worldState === undefined) return true;
  if (!worldState || typeof worldState !== 'object' || Array.isArray(worldState)) return false;
  if (!['postExecutionSnapshotHash', 'postExecutionDecisionEpoch'].every(key => hasOwn(worldState, key))) {
    return false;
  }
  if (worldState.postExecutionSnapshotHash !== null && (typeof worldState.postExecutionSnapshotHash !== 'string' || !hashPattern.test(worldState.postExecutionSnapshotHash))) {
    return false;
  }
  if (worldState.postExecutionDecisionEpoch !== null && (!Number.isInteger(worldState.postExecutionDecisionEpoch) || worldState.postExecutionDecisionEpoch < 0)) {
    return false;
  }
  return true;
}

function isValidAuthorityCommands(authorityCommands) {
  if (authorityCommands === undefined) return true;
  return Array.isArray(authorityCommands) && authorityCommands.every(command => typeof command === 'string' && command.length > 0);
}

function isValidEmbodimentBlock(embodiment) {
  if (embodiment === undefined) return true;
  if (!embodiment || typeof embodiment !== 'object' || Array.isArray(embodiment)) return false;
  if ('backendHint' in embodiment && embodiment.backendHint !== null && (typeof embodiment.backendHint !== 'string' || embodiment.backendHint.length === 0)) {
    return false;
  }
  if ('actions' in embodiment) {
    if (!Array.isArray(embodiment.actions)) return false;
    if (!embodiment.actions.every(action => action && typeof action === 'object' && !Array.isArray(action))) return false;
  }
  return true;
}

function validateExecutionState(result) {
  if (typeof result.accepted !== 'boolean' || typeof result.executed !== 'boolean') return false;
  if (!ExecutionStatus.includes(result.status)) return false;
  if (typeof result.reasonCode !== 'string' || result.reasonCode.length === 0) return false;

  if (result.executed && !result.accepted) return false;
  if (result.status === 'executed' && (!result.accepted || !result.executed)) return false;
  if (result.status === 'failed' && (!result.accepted || result.executed)) return false;
  if (['rejected', 'stale', 'duplicate'].includes(result.status) && (result.accepted || result.executed)) return false;

  return true;
}

function normalizePreconditions(proposal) {
  return proposal.preconditions ? proposal.preconditions : [];
}

/**
 * Create the deterministic handoff payload for a selected proposal and mapped command.
 * @param {Object} proposal
 * @param {string} [command]
 * @returns {Object}
 */
export function createExecutionHandoff(proposal, command = proposalToCommand(proposal)) {
  if (!isValidProposal(proposal)) {
    throw new Error('Invalid proposal envelope');
  }
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error('Invalid command text');
  }
  if (proposalToCommand(proposal) !== command) {
    throw new Error('Command does not match proposal mapping');
  }

  const handoffId = `handoff_${hashValue({ proposalId: proposal.proposalId, command })}`;
  const preconditions = normalizePreconditions(proposal);

  return {
    schemaVersion: SchemaVersion.HANDOFF,
    handoffId,
    advisory: true,
    proposalId: proposal.proposalId,
    idempotencyKey: proposal.proposalId,
    snapshotHash: proposal.snapshotHash,
    decisionEpoch: proposal.decisionEpoch,
    proposal,
    command,
    executionRequirements: {
      expectedSnapshotHash: proposal.snapshotHash,
      expectedDecisionEpoch: proposal.decisionEpoch,
      preconditions
    }
  };
}

/**
 * Validate the execution handoff payload.
 * @param {Object} handoff
 * @returns {boolean}
 */
export function isValidExecutionHandoff(handoff) {
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) return false;
  if (handoff.schemaVersion !== SchemaVersion.HANDOFF) return false;
  if (typeof handoff.handoffId !== 'string' || !handoffIdPattern.test(handoff.handoffId)) return false;
  if (handoff.advisory !== true) return false;
  if (typeof handoff.proposalId !== 'string' || !proposalIdPattern.test(handoff.proposalId)) return false;
  if (handoff.idempotencyKey !== handoff.proposalId) return false;
  if (typeof handoff.snapshotHash !== 'string' || !hashPattern.test(handoff.snapshotHash)) return false;
  if (!Number.isInteger(handoff.decisionEpoch) || handoff.decisionEpoch < 0) return false;
  if (!isValidProposal(handoff.proposal)) return false;
  if (handoff.proposal.proposalId !== handoff.proposalId) return false;
  if (handoff.proposal.snapshotHash !== handoff.snapshotHash) return false;
  if (handoff.proposal.decisionEpoch !== handoff.decisionEpoch) return false;
  if (typeof handoff.command !== 'string' || handoff.command.length === 0) return false;
  let mappedCommand;
  try {
    mappedCommand = proposalToCommand(handoff.proposal);
  } catch {
    return false;
  }
  if (mappedCommand !== handoff.command) return false;
  if (!handoff.executionRequirements || typeof handoff.executionRequirements !== 'object' || Array.isArray(handoff.executionRequirements)) {
    return false;
  }

  const { expectedSnapshotHash, expectedDecisionEpoch, preconditions } = handoff.executionRequirements;
  if (expectedSnapshotHash !== handoff.snapshotHash) return false;
  if (expectedDecisionEpoch !== handoff.decisionEpoch) return false;
  if (!Array.isArray(preconditions)) return false;

  const expectedHandoffId = `handoff_${hashValue({ proposalId: handoff.proposalId, command: handoff.command })}`;
  if (handoff.handoffId !== expectedHandoffId) return false;

  return true;
}

/**
 * Create the deterministic execution result payload after a world-engine attempt.
 * @param {Object} handoff
 * @param {Object} outcome
 * @returns {Object}
 */
export function createExecutionResult(handoff, outcome) {
  if (!isValidExecutionHandoff(handoff)) {
    throw new Error('Invalid execution handoff');
  }
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
    throw new Error('Execution outcome is required');
  }

  const evaluation = {
    preconditions: {
      evaluated: outcome.preconditions?.evaluated ?? false,
      passed: outcome.preconditions?.passed ?? false,
      failures: outcome.preconditions?.failures ?? []
    },
    staleCheck: {
      evaluated: outcome.staleCheck?.evaluated ?? false,
      passed: outcome.staleCheck?.passed ?? false,
      actualSnapshotHash: outcome.staleCheck?.actualSnapshotHash ?? null,
      actualDecisionEpoch: outcome.staleCheck?.actualDecisionEpoch ?? null
    },
    duplicateCheck: {
      evaluated: outcome.duplicateCheck?.evaluated ?? false,
      duplicate: outcome.duplicateCheck?.duplicate ?? false,
      duplicateOf: outcome.duplicateCheck?.duplicateOf ?? null
    }
  };

  const result = {
    type: executionResultType,
    schemaVersion: executionResultSchemaVersion,
    executionId: '',
    resultId: '',
    handoffId: handoff.handoffId,
    proposalId: handoff.proposalId,
    idempotencyKey: handoff.idempotencyKey,
    snapshotHash: handoff.snapshotHash,
    decisionEpoch: handoff.decisionEpoch,
    actorId: handoff.proposal.actorId,
    townId: handoff.proposal.townId,
    proposalType: handoff.proposal.type,
    command: handoff.command,
    ...(hasOwn(outcome, 'authorityCommands')
      ? {
          authorityCommands: [...(outcome.authorityCommands || [])]
        }
      : {}),
    status: outcome.status,
    accepted: outcome.accepted,
    executed: outcome.executed,
    reasonCode: outcome.reasonCode,
    evaluation,
    ...(hasOwn(outcome, 'worldState')
      ? {
          worldState: {
            postExecutionSnapshotHash: outcome.worldState?.postExecutionSnapshotHash ?? null,
            postExecutionDecisionEpoch: outcome.worldState?.postExecutionDecisionEpoch ?? null
          }
        }
      : {}),
    ...(hasOwn(outcome, 'embodiment')
      ? {
          embodiment: {
            ...(outcome.embodiment?.backendHint === undefined ? {} : { backendHint: outcome.embodiment?.backendHint ?? null }),
            ...(Array.isArray(outcome.embodiment?.actions) ? { actions: outcome.embodiment.actions } : {})
          }
        }
      : {})
  };

  if (!validateExecutionState(result)) {
    throw new Error('Invalid execution outcome state');
  }
  if (!isValidEvaluationBlock(result.evaluation)) {
    throw new Error('Invalid execution evaluation block');
  }
  if (!isValidWorldState(result.worldState)) {
    throw new Error('Invalid execution world state');
  }
  if (!isValidAuthorityCommands(result.authorityCommands)) {
    throw new Error('Invalid authority commands');
  }
  if (!isValidEmbodimentBlock(result.embodiment)) {
    throw new Error('Invalid execution embodiment block');
  }

  result.resultId = `result_${hashValue({
    type: result.type,
    schemaVersion: result.schemaVersion,
    handoffId: result.handoffId,
    proposalId: result.proposalId,
    actorId: result.actorId,
    townId: result.townId,
    proposalType: result.proposalType,
    command: result.command,
    authorityCommands: result.authorityCommands,
    status: result.status,
    accepted: result.accepted,
    executed: result.executed,
    reasonCode: result.reasonCode,
    evaluation: result.evaluation,
    worldState: result.worldState,
    embodiment: result.embodiment
  })}`;
  result.executionId = result.resultId;

  return result;
}

/**
 * Validate the execution result payload.
 * @param {Object} result
 * @returns {boolean}
 */
export function isValidExecutionResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  if (result.type !== executionResultType) return false;
  if (result.schemaVersion !== executionResultSchemaVersion) return false;
  if (typeof result.executionId !== 'string' || !resultIdPattern.test(result.executionId)) return false;
  if (typeof result.resultId !== 'string' || !resultIdPattern.test(result.resultId)) return false;
  if (result.executionId !== result.resultId) return false;
  if (typeof result.handoffId !== 'string' || !handoffIdPattern.test(result.handoffId)) return false;
  if (typeof result.proposalId !== 'string' || !proposalIdPattern.test(result.proposalId)) return false;
  if (result.idempotencyKey !== result.proposalId) return false;
  if (typeof result.snapshotHash !== 'string' || !hashPattern.test(result.snapshotHash)) return false;
  if (!Number.isInteger(result.decisionEpoch) || result.decisionEpoch < 0) return false;
  if (typeof result.actorId !== 'string' || result.actorId.length === 0) return false;
  if (typeof result.townId !== 'string' || result.townId.length === 0) return false;
  if (typeof result.proposalType !== 'string' || result.proposalType.length === 0) return false;
  if (typeof result.command !== 'string' || result.command.length === 0) return false;
  if (!isValidAuthorityCommands(result.authorityCommands)) return false;
  if (!validateExecutionState(result)) return false;
  if (!isValidEvaluationBlock(result.evaluation)) return false;
  if (!isValidWorldState(result.worldState)) return false;
  if (!isValidEmbodimentBlock(result.embodiment)) return false;

  const expectedResultId = `result_${hashValue({
    type: result.type,
    schemaVersion: result.schemaVersion,
    handoffId: result.handoffId,
    proposalId: result.proposalId,
    actorId: result.actorId,
    townId: result.townId,
    proposalType: result.proposalType,
    command: result.command,
    authorityCommands: result.authorityCommands,
    status: result.status,
    accepted: result.accepted,
    executed: result.executed,
    reasonCode: result.reasonCode,
    evaluation: result.evaluation,
    worldState: result.worldState,
    embodiment: result.embodiment
  })}`;

  return result.resultId === expectedResultId;
}
