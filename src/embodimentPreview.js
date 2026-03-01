import { createHash } from 'crypto';
import { isValidDecisionInspectionPayload } from './immersion.js';
import { isValidExecutionResult } from './executionHandoff.js';
import { SchemaVersion } from './schemaVersions.js';

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

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function selectFocusTarget(args = {}) {
  const keys = Object.keys(args).sort();
  if (keys.length === 0) return null;
  const value = args[keys[0]];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function selectGestureCue(type) {
  if (type === 'MAYOR_ACCEPT_MISSION') return 'announce-order';
  if (type === 'PROJECT_ADVANCE') return 'survey-site';
  if (type === 'SALVAGE_PLAN') return 'urgent-brief';
  return 'gather-crowd';
}

function buildAuthority() {
  return {
    botControl: false,
    commandExecution: false,
    stateMutation: false
  };
}

/**
 * Create a preview-only embodiment request from accepted execution output.
 * @param {Object} decisionInspection
 * @param {Object} executionResult
 * @param {Object} immersionResult
 * @returns {Object}
 */
export function createEmbodimentRequestPreview(decisionInspection, executionResult, immersionResult) {
  if (!isValidDecisionInspectionPayload(decisionInspection)) {
    throw new Error('Invalid decision inspection payload');
  }
  if (!isValidExecutionResult(executionResult)) {
    throw new Error('Invalid execution result payload');
  }

  const selectedProposal = decisionInspection.selectedProposal;
  const acceptedExecution = executionResult.accepted === true;
  const utterance = immersionResult?.content
    ? {
        artifactType: immersionResult.artifactType,
        status: immersionResult.status,
        text: immersionResult.content
      }
    : null;
  const preview = {
    schemaVersion: SchemaVersion.EMBODIMENT_PREVIEW,
    previewId: '',
    status: acceptedExecution ? 'ready' : 'blocked',
    advisory: true,
    authority: buildAuthority(),
    sourceSchemas: {
      decisionInspection: decisionInspection.schemaVersion,
      executionResult: executionResult.schemaVersion,
      immersionResult: immersionResult?.schemaVersion ?? null
    },
    proposalId: selectedProposal.proposalId,
    resultId: executionResult.resultId,
    townId: selectedProposal.townId,
    actorId: selectedProposal.actorId,
    acceptedExecution,
    executed: executionResult.executed,
    command: executionResult.command,
    behavior: {
      gestureCue: selectGestureCue(selectedProposal.type),
      focusTarget: selectFocusTarget(selectedProposal.args),
      commandEcho: executionResult.command
    },
    utterance,
    constraints: {
      previewOnly: true,
      requireLiveBot: false,
      executeRealCommand: false
    },
    ...(acceptedExecution ? {} : { blockedBy: executionResult.reasonCode })
  };

  preview.previewId = `embody_${hashValue({
    status: preview.status,
    proposalId: preview.proposalId,
    resultId: preview.resultId,
    command: preview.command,
    behavior: preview.behavior,
    utterance: preview.utterance,
    blockedBy: preview.blockedBy
  })}`;

  return preview;
}

/**
 * Validate the embodiment preview contract.
 * @param {Object} preview
 * @returns {boolean}
 */
export function isValidEmbodimentRequestPreview(preview) {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return false;
  if (preview.schemaVersion !== SchemaVersion.EMBODIMENT_PREVIEW) return false;
  if (!isNonEmptyString(preview.previewId) || !/^embody_[0-9a-f]{64}$/.test(preview.previewId)) return false;
  if (!['ready', 'blocked'].includes(preview.status)) return false;
  if (preview.advisory !== true) return false;
  if (!preview.authority || typeof preview.authority !== 'object' || Array.isArray(preview.authority)) return false;
  if (preview.authority.botControl !== false) return false;
  if (preview.authority.commandExecution !== false) return false;
  if (preview.authority.stateMutation !== false) return false;
  if (!preview.sourceSchemas || typeof preview.sourceSchemas !== 'object' || Array.isArray(preview.sourceSchemas)) return false;
  if (!isNonEmptyString(preview.proposalId)) return false;
  if (!isNonEmptyString(preview.resultId)) return false;
  if (!isNonEmptyString(preview.townId)) return false;
  if (!isNonEmptyString(preview.actorId)) return false;
  if (typeof preview.acceptedExecution !== 'boolean') return false;
  if (typeof preview.executed !== 'boolean') return false;
  if (!isNonEmptyString(preview.command)) return false;
  if (!preview.behavior || typeof preview.behavior !== 'object' || Array.isArray(preview.behavior)) return false;
  if (!isNonEmptyString(preview.behavior.gestureCue)) return false;
  if (!isNonEmptyString(preview.behavior.commandEcho)) return false;
  if (preview.behavior.focusTarget !== null && !isNonEmptyString(preview.behavior.focusTarget)) return false;
  if (preview.utterance !== null) {
    if (!preview.utterance || typeof preview.utterance !== 'object' || Array.isArray(preview.utterance)) return false;
    if (!isNonEmptyString(preview.utterance.artifactType)) return false;
    if (!isNonEmptyString(preview.utterance.status)) return false;
    if (!isNonEmptyString(preview.utterance.text)) return false;
  }
  if (!preview.constraints || typeof preview.constraints !== 'object' || Array.isArray(preview.constraints)) return false;
  if (preview.constraints.previewOnly !== true) return false;
  if (preview.constraints.requireLiveBot !== false) return false;
  if (preview.constraints.executeRealCommand !== false) return false;
  if (preview.status === 'ready' && hasOwn(preview, 'blockedBy')) return false;
  if (preview.status === 'blocked' && !isNonEmptyString(preview.blockedBy)) return false;

  const expectedId = `embody_${hashValue({
    status: preview.status,
    proposalId: preview.proposalId,
    resultId: preview.resultId,
    command: preview.command,
    behavior: preview.behavior,
    utterance: preview.utterance,
    blockedBy: preview.blockedBy
  })}`;

  return preview.previewId === expectedId;
}
