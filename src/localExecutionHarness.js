import { createHash } from 'crypto';
import { createExecutionResult, isValidExecutionHandoff } from './executionHandoff.js';
import { ProjectStatuses } from './schemaVersions.js';

const hashPattern = /^[0-9a-f]{64}$/;
const resultIdPattern = /^result_[0-9a-f]{64}$/;
const supportedPreconditions = new Set([
  'mission_absent',
  'side_quest_exists',
  'project_exists',
  'salvage_focus_supported',
  'talk_type_supported'
]);

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

function compareById(left, right) {
  return left.id.localeCompare(right.id);
}

function hasUniqueValues(values) {
  return new Set(values).size === values.length;
}

function hasOnlyKeys(value, expectedKeys) {
  const keys = Object.keys(value);
  return keys.every(key => expectedKeys.includes(key));
}

function isValidHistoryEntry(entry) {
  return Boolean(
    entry &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    typeof entry.idempotencyKey === 'string' &&
    entry.idempotencyKey.length > 0 &&
    typeof entry.resultId === 'string' &&
    resultIdPattern.test(entry.resultId)
  );
}

/**
 * Validate the local harness state.
 * @param {Object} state
 * @returns {boolean}
 */
export function isValidLocalExecutionState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (typeof state.snapshotHash !== 'string' || !hashPattern.test(state.snapshotHash)) return false;
  if (!Number.isInteger(state.decisionEpoch) || state.decisionEpoch < 0) return false;
  if ('mission' in state && state.mission !== null) {
    if (!state.mission || typeof state.mission !== 'object' || Array.isArray(state.mission)) return false;
    if (typeof state.mission.id !== 'string' || state.mission.id.length === 0) return false;
  }
  if ('sideQuests' in state) {
    if (!Array.isArray(state.sideQuests)) return false;
    const ids = state.sideQuests.map(sideQuest => sideQuest?.id);
    if (ids.some(id => typeof id !== 'string' || id.length === 0) || !hasUniqueValues(ids)) return false;
  }
  if ('projects' in state) {
    if (!Array.isArray(state.projects)) return false;
    const ids = state.projects.map(project => project?.id);
    if (ids.some(id => typeof id !== 'string' || id.length === 0) || !hasUniqueValues(ids)) return false;
    if (state.projects.some(project => !ProjectStatuses.includes(project.status))) return false;
  }
  if ('supportedSalvageFocuses' in state) {
    if (!Array.isArray(state.supportedSalvageFocuses)) return false;
    if (!state.supportedSalvageFocuses.every(focus => typeof focus === 'string')) return false;
  }
  if ('supportedTalkTypes' in state) {
    if (!Array.isArray(state.supportedTalkTypes)) return false;
    if (!state.supportedTalkTypes.every(talkType => typeof talkType === 'string')) return false;
  }
  if ('processedResults' in state) {
    if (!Array.isArray(state.processedResults) || !state.processedResults.every(isValidHistoryEntry)) return false;
    const keys = state.processedResults.map(entry => entry.idempotencyKey);
    if (!hasUniqueValues(keys)) return false;
  }

  return true;
}

/**
 * Create a deterministic local engine state for harness tests.
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function createLocalExecutionState(overrides = {}) {
  const baseState = {
    snapshotHash: '0'.repeat(64),
    decisionEpoch: 0,
    mission: null,
    sideQuests: [],
    projects: [],
    supportedSalvageFocuses: ['dread', 'general', 'scarcity'],
    supportedTalkTypes: ['casual', 'morale-boost'],
    processedResults: []
  };

  return normalizeLocalExecutionState({ ...baseState, ...overrides });
}

/**
 * Normalize local engine state so equivalent inputs replay identically.
 * @param {Object} state
 * @returns {Object}
 */
export function normalizeLocalExecutionState(state) {
  if (!isValidLocalExecutionState(state)) {
    throw new Error('Invalid local execution state');
  }

  return {
    snapshotHash: state.snapshotHash,
    decisionEpoch: state.decisionEpoch,
    mission: state.mission ? { id: state.mission.id } : null,
    sideQuests: [...(state.sideQuests || [])]
      .map(sideQuest => ({ id: sideQuest.id }))
      .sort(compareById),
    projects: [...(state.projects || [])]
      .map(project => ({ id: project.id, status: project.status }))
      .sort(compareById),
    supportedSalvageFocuses: [...(state.supportedSalvageFocuses || [])].sort(),
    supportedTalkTypes: [...(state.supportedTalkTypes || [])].sort(),
    processedResults: [...(state.processedResults || [])]
      .map(entry => ({ idempotencyKey: entry.idempotencyKey, resultId: entry.resultId }))
      .sort((left, right) => left.idempotencyKey.localeCompare(right.idempotencyKey))
  };
}

function evaluatePreconditions(preconditions, state) {
  const failures = [];

  for (const precondition of preconditions) {
    if (!supportedPreconditions.has(precondition.kind)) {
      failures.push({
        kind: precondition.kind,
        detail: 'Unsupported precondition kind'
      });
      continue;
    }

    if (precondition.kind === 'mission_absent' && state.mission !== null) {
      failures.push({
        kind: precondition.kind,
        detail: 'Mission is already active'
      });
    }

    if (precondition.kind === 'side_quest_exists' && !state.sideQuests.some(sideQuest => sideQuest.id === precondition.targetId)) {
      failures.push({
        kind: precondition.kind,
        detail: `Missing side quest: ${precondition.targetId}`
      });
    }

    if (precondition.kind === 'project_exists' && !state.projects.some(project => project.id === precondition.targetId)) {
      failures.push({
        kind: precondition.kind,
        detail: `Missing project: ${precondition.targetId}`
      });
    }

    if (precondition.kind === 'salvage_focus_supported' && !state.supportedSalvageFocuses.includes(precondition.expected)) {
      failures.push({
        kind: precondition.kind,
        detail: `Unsupported salvage focus: ${precondition.expected}`
      });
    }

    if (precondition.kind === 'talk_type_supported' && !state.supportedTalkTypes.includes(precondition.expected)) {
      failures.push({
        kind: precondition.kind,
        detail: `Unsupported talk type: ${precondition.expected}`
      });
    }
  }

  return failures;
}

function createPostExecutionSnapshotHash(handoff, state) {
  return hashValue({
    previousSnapshotHash: state.snapshotHash,
    nextDecisionEpoch: state.decisionEpoch + 1,
    command: handoff.command,
    proposalId: handoff.proposalId
  });
}

/**
 * Simulate the world-engine side of the execution seam locally.
 * @param {Object} handoff
 * @param {Object} state
 * @returns {Object}
 */
export function executeLocalHandoff(handoff, state) {
  if (!isValidExecutionHandoff(handoff)) {
    throw new Error('Invalid execution handoff');
  }

  const normalizedState = normalizeLocalExecutionState(state);
  const duplicateEntry = normalizedState.processedResults.find(
    entry => entry.idempotencyKey === handoff.idempotencyKey
  );

  if (duplicateEntry) {
    return createExecutionResult(handoff, {
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
        duplicateOf: duplicateEntry.resultId
      }
    });
  }

  const stale = (
    normalizedState.snapshotHash !== handoff.executionRequirements.expectedSnapshotHash ||
    normalizedState.decisionEpoch !== handoff.executionRequirements.expectedDecisionEpoch
  );

  if (stale) {
    return createExecutionResult(handoff, {
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
        actualSnapshotHash: normalizedState.snapshotHash,
        actualDecisionEpoch: normalizedState.decisionEpoch
      },
      duplicateCheck: {
        evaluated: true,
        duplicate: false,
        duplicateOf: null
      }
    });
  }

  const failures = evaluatePreconditions(handoff.executionRequirements.preconditions, normalizedState);

  if (failures.length > 0) {
    return createExecutionResult(handoff, {
      status: 'rejected',
      accepted: false,
      executed: false,
      reasonCode: 'PRECONDITION_FAILED',
      preconditions: {
        evaluated: true,
        passed: false,
        failures
      },
      staleCheck: {
        evaluated: true,
        passed: true,
        actualSnapshotHash: normalizedState.snapshotHash,
        actualDecisionEpoch: normalizedState.decisionEpoch
      },
      duplicateCheck: {
        evaluated: true,
        duplicate: false,
        duplicateOf: null
      }
    });
  }

  return createExecutionResult(handoff, {
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
      actualSnapshotHash: normalizedState.snapshotHash,
      actualDecisionEpoch: normalizedState.decisionEpoch
    },
    duplicateCheck: {
      evaluated: true,
      duplicate: false,
      duplicateOf: null
    },
    worldState: {
      postExecutionSnapshotHash: createPostExecutionSnapshotHash(handoff, normalizedState),
      postExecutionDecisionEpoch: normalizedState.decisionEpoch + 1
    }
  });
}
