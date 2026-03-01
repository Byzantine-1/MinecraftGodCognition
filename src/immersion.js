import { createHash } from 'crypto';
import { isValidProposal } from './proposalDsl.js';
import { isValidExecutionHandoff, isValidExecutionResult } from './executionHandoff.js';
import { SchemaVersion } from './schemaVersions.js';
import { createQwenProvider } from './immersionProviders/qwenProvider.js';

export const ImmersionArtifactType = Object.freeze([
  'leader-speech',
  'town-rumor',
  'chronicle-entry',
  'outcome-blurb'
]);

export const ImmersionStatus = Object.freeze([
  'generated',
  'fallback',
  'unavailable'
]);

const artifactGuidance = Object.freeze({
  'leader-speech': 'Write one short speech in a leader voice. Keep it grounded in the selected proposal and current town conditions.',
  'town-rumor': 'Write one short rumor that common townsfolk might repeat. Keep it suggestive, not authoritative.',
  'chronicle-entry': 'Write one short historical chronicle line using the execution outcome if present.',
  'outcome-blurb': 'Write one short narrated outcome blurb describing the attempted or completed action.'
});

const providerFactories = Object.freeze({
  qwen: createQwenProvider
});

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

function normalizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((normalized, key) => {
        if (value[key] !== undefined) {
          normalized[key] = normalizeJsonValue(value[key]);
        }
        return normalized;
      }, {});
  }

  return value;
}

function trimOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the optional provider configuration from environment-style input.
 * @param {Object} [env]
 * @returns {Object}
 */
export function resolveImmersionConfig(env = process.env) {
  return {
    provider: trimOrNull(env?.LLM_PROVIDER),
    apiKey: trimOrNull(env?.LLM_API_KEY),
    baseUrl: trimOrNull(env?.LLM_BASE_URL),
    model: trimOrNull(env?.LLM_MODEL)
  };
}

/**
 * Validate the decision inspection payload shape used by immersion prompts.
 * @param {Object} payload
 * @returns {boolean}
 */
export function isValidDecisionInspectionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.schemaVersion !== SchemaVersion.DECISION_INSPECTION) return false;
  if (!Array.isArray(payload.candidates)) return false;
  if (!isValidProposal(payload.selectedProposal)) return false;
  if (typeof payload.command !== 'string' || payload.command.length === 0) return false;
  if (!payload.reasoning || typeof payload.reasoning !== 'object' || Array.isArray(payload.reasoning)) return false;
  if (typeof payload.reasoning.reason !== 'string' || payload.reasoning.reason.length === 0) return false;
  if (!Array.isArray(payload.reasoning.reasonTags) || !payload.reasoning.reasonTags.every(tag => typeof tag === 'string')) {
    return false;
  }

  return payload.candidates.every(candidate => Boolean(
    candidate &&
    typeof candidate === 'object' &&
    !Array.isArray(candidate) &&
    Number.isInteger(candidate.rank) &&
    candidate.rank >= 1 &&
    typeof candidate.selected === 'boolean' &&
    typeof candidate.type === 'string' &&
    typeof candidate.priority === 'number' &&
    Array.isArray(candidate.reasonTags)
  ));
}

/**
 * Validate the provider interface contract.
 * @param {Object} provider
 * @returns {boolean}
 */
export function isValidImmersionProvider(provider) {
  return Boolean(
    provider &&
    typeof provider === 'object' &&
    !Array.isArray(provider) &&
    typeof provider.name === 'string' &&
    provider.name.length > 0 &&
    typeof provider.generate === 'function'
  );
}

function isValidWorldSummary(worldSummary) {
  if (worldSummary === undefined || worldSummary === null) return true;
  if (typeof worldSummary === 'string') return worldSummary.trim().length > 0;
  return typeof worldSummary === 'object' && !Array.isArray(worldSummary);
}

function summarizeDecisionInspection(payload) {
  if (!payload) return null;

  return {
    schemaVersion: payload.schemaVersion,
    candidates: payload.candidates.map(candidate => ({
      rank: candidate.rank,
      selected: candidate.selected,
      type: candidate.type,
      priority: candidate.priority,
      targetId: candidate.targetId ?? null,
      reasonTags: candidate.reasonTags
    })),
    selectedProposal: {
      proposalId: payload.selectedProposal.proposalId,
      decisionEpoch: payload.selectedProposal.decisionEpoch,
      snapshotHash: payload.selectedProposal.snapshotHash,
      type: payload.selectedProposal.type,
      actorId: payload.selectedProposal.actorId,
      townId: payload.selectedProposal.townId,
      priority: payload.selectedProposal.priority,
      args: payload.selectedProposal.args,
      reason: payload.selectedProposal.reason,
      reasonTags: payload.selectedProposal.reasonTags,
      ...(hasOwn(payload.selectedProposal, 'preconditions')
        ? { preconditions: payload.selectedProposal.preconditions }
        : {})
    },
    command: payload.command,
    reasoning: {
      reason: payload.reasoning.reason,
      reasonTags: payload.reasoning.reasonTags,
      ...(hasOwn(payload.reasoning, 'preconditions')
        ? { preconditions: payload.reasoning.preconditions }
        : {})
    }
  };
}

function summarizeExecutionHandoff(handoff) {
  if (!handoff) return null;

  return {
    schemaVersion: handoff.schemaVersion,
    handoffId: handoff.handoffId,
    proposalId: handoff.proposalId,
    snapshotHash: handoff.snapshotHash,
    decisionEpoch: handoff.decisionEpoch,
    command: handoff.command,
    proposal: {
      type: handoff.proposal.type,
      actorId: handoff.proposal.actorId,
      townId: handoff.proposal.townId,
      args: handoff.proposal.args
    },
    executionRequirements: handoff.executionRequirements
  };
}

function summarizeExecutionResult(result) {
  if (!result) return null;

  return {
    schemaVersion: result.schemaVersion,
    resultId: result.resultId,
    proposalId: result.proposalId,
    snapshotHash: result.snapshotHash,
    decisionEpoch: result.decisionEpoch,
    command: result.command,
    status: result.status,
    accepted: result.accepted,
    executed: result.executed,
    reasonCode: result.reasonCode,
    evaluation: result.evaluation,
    ...(hasOwn(result, 'worldState') ? { worldState: result.worldState } : {})
  };
}

/**
 * Validate the immersion input payload.
 * @param {Object} input
 * @returns {boolean}
 */
export function isValidImmersionInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  if (!ImmersionArtifactType.includes(input.artifactType)) return false;
  if (!isValidWorldSummary(input.worldSummary)) return false;

  const hasDecision = hasOwn(input, 'decisionInspection');
  const hasHandoff = hasOwn(input, 'executionHandoff');
  const hasResult = hasOwn(input, 'executionResult');

  if (!hasDecision && !hasHandoff && !hasResult) return false;
  if (hasDecision && !isValidDecisionInspectionPayload(input.decisionInspection)) return false;
  if (hasHandoff && !isValidExecutionHandoff(input.executionHandoff)) return false;
  if (hasResult && !isValidExecutionResult(input.executionResult)) return false;

  return true;
}

function buildPromptContext(input) {
  return normalizeJsonValue({
    artifactType: input.artifactType,
    worldSummary: input.worldSummary === undefined ? null : input.worldSummary,
    decisionInspection: summarizeDecisionInspection(input.decisionInspection),
    executionHandoff: summarizeExecutionHandoff(input.executionHandoff),
    executionResult: summarizeExecutionResult(input.executionResult)
  });
}

/**
 * Build a stable provider prompt from structured cognition artifacts.
 * @param {Object} input
 * @returns {Object}
 */
export function buildImmersionPrompt(input) {
  if (!isValidImmersionInput(input)) {
    throw new Error('Invalid immersion input');
  }

  const promptContext = buildPromptContext(input);
  const system = [
    'You write short immersive flavor text for a deterministic Minecraft governance simulation.',
    'You are strictly downstream and non-authoritative.',
    'Do not alter proposals, commands, execution outcomes, or world state.',
    'Do not invent missing facts.',
    'Keep the response to 2 sentences or fewer.'
  ].join(' ');
  const user = [
    `Artifact type: ${input.artifactType}`,
    `Guidance: ${artifactGuidance[input.artifactType]}`,
    'Structured context:',
    stableStringify(promptContext)
  ].join('\n');

  return {
    artifactType: input.artifactType,
    system,
    user,
    promptHash: hashValue({ system, user })
  };
}

function buildSourceSchemas(input) {
  return {
    decisionInspection: input.decisionInspection?.schemaVersion ?? null,
    executionHandoff: input.executionHandoff?.schemaVersion ?? null,
    executionResult: input.executionResult?.schemaVersion ?? null
  };
}

function selectProposal(input) {
  return input.decisionInspection?.selectedProposal ?? input.executionHandoff?.proposal ?? null;
}

function selectTownId(input) {
  return (
    selectProposal(input)?.townId ??
    input.executionHandoff?.proposal?.townId ??
    'unknown-town'
  );
}

function selectActorId(input) {
  return selectProposal(input)?.actorId ?? 'unknown-actor';
}

function selectProposalType(input) {
  return selectProposal(input)?.type ?? 'UNKNOWN_PROPOSAL';
}

function selectReason(input) {
  return (
    input.decisionInspection?.reasoning?.reason ??
    selectProposal(input)?.reason ??
    input.executionResult?.reasonCode ??
    'No official reason recorded.'
  );
}

function selectReasonTags(input) {
  return (
    input.decisionInspection?.reasoning?.reasonTags ??
    selectProposal(input)?.reasonTags ??
    []
  );
}

function selectCommand(input) {
  return (
    input.executionResult?.command ??
    input.executionHandoff?.command ??
    input.decisionInspection?.command ??
    'command unavailable'
  );
}

function selectDecisionEpoch(input) {
  return (
    input.executionResult?.decisionEpoch ??
    input.executionHandoff?.decisionEpoch ??
    input.decisionInspection?.selectedProposal?.decisionEpoch ??
    0
  );
}

function selectStatus(input) {
  return input.executionResult?.status ?? 'pending';
}

function selectReasonCode(input) {
  return input.executionResult?.reasonCode ?? 'PENDING';
}

function renderTagText(tags) {
  return tags.length > 0 ? tags.join(', ') : 'routine council business';
}

function buildFallbackText(input) {
  const townId = selectTownId(input);
  const actorId = selectActorId(input);
  const proposalType = selectProposalType(input);
  const command = selectCommand(input);
  const reason = selectReason(input);
  const reasonTags = renderTagText(selectReasonTags(input));
  const decisionEpoch = selectDecisionEpoch(input);
  const status = selectStatus(input);
  const reasonCode = selectReasonCode(input);

  if (input.artifactType === 'leader-speech') {
    return `${actorId} addresses ${townId}: ${reason} The council backs ${proposalType} via ${command}.`;
  }

  if (input.artifactType === 'town-rumor') {
    return `Rumor in ${townId}: ${proposalType} is the latest talk after ${reasonTags}. People whisper about ${command}.`;
  }

  if (input.artifactType === 'chronicle-entry') {
    return `Day ${decisionEpoch} in ${townId}: ${proposalType} stands recorded with status ${status}. Command noted: ${command}.`;
  }

  return `Outcome for ${townId}: ${proposalType} is marked ${status} with code ${reasonCode}. The last recorded command was ${command}.`;
}

function buildAuthorityBlock() {
  return {
    proposalSelection: false,
    commandExecution: false,
    stateMutation: false
  };
}

function createImmersionResult({
  input,
  prompt,
  status,
  requestedProvider,
  usedProvider,
  model,
  content,
  error
}) {
  return {
    schemaVersion: SchemaVersion.IMMERSION_RESULT,
    artifactType: input.artifactType,
    status,
    advisory: true,
    authority: buildAuthorityBlock(),
    provider: {
      requested: requestedProvider,
      used: usedProvider,
      model
    },
    prompt: {
      hash: prompt.promptHash
    },
    sourceSchemas: buildSourceSchemas(input),
    content,
    ...(error ? { error } : {})
  };
}

function createDegradedImmersionResult(input, prompt, config, error, degradationMode) {
  if (degradationMode === 'unavailable') {
    return createImmersionResult({
      input,
      prompt,
      status: 'unavailable',
      requestedProvider: config.provider ?? 'none',
      usedProvider: 'unavailable',
      model: config.model,
      content: null,
      error
    });
  }

  return createImmersionResult({
    input,
    prompt,
    status: 'fallback',
    requestedProvider: config.provider ?? 'none',
    usedProvider: 'fallback',
    model: null,
    content: buildFallbackText(input),
    error
  });
}

/**
 * Resolve a configured immersion provider.
 * @param {Object} [env]
 * @returns {Object|null}
 */
export function resolveImmersionProvider(env = process.env) {
  const config = hasOwn(env, 'provider') ? env : resolveImmersionConfig(env);

  if (!config.provider) {
    return null;
  }

  const createProvider = providerFactories[config.provider];
  return createProvider ? createProvider() : null;
}

/**
 * Generate downstream flavor text from stable cognition artifacts.
 * @param {Object} input
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function generateImmersion(input, options = {}) {
  if (!isValidImmersionInput(input)) {
    throw new Error('Invalid immersion input');
  }

  const prompt = buildImmersionPrompt(input);
  const config = resolveImmersionConfig(options.env);
  const degradationMode = options.degradationMode === 'unavailable' ? 'unavailable' : 'template';
  const provider = options.provider ?? resolveImmersionProvider(config);

  if (!provider) {
    return createDegradedImmersionResult(input, prompt, config, {
      code: config.provider ? 'UNSUPPORTED_PROVIDER' : 'PROVIDER_UNAVAILABLE',
      message: config.provider
        ? `Unsupported immersion provider: ${config.provider}`
        : 'No immersion provider configured'
    }, degradationMode);
  }

  if (!isValidImmersionProvider(provider)) {
    throw new Error('Invalid immersion provider');
  }

  try {
    const generation = await provider.generate({
      prompt,
      config,
      fetchImpl: options.fetchImpl
    });

    if (!generation || typeof generation.content !== 'string' || generation.content.trim().length === 0) {
      throw new Error('Provider returned empty immersion content');
    }

    return createImmersionResult({
      input,
      prompt,
      status: 'generated',
      requestedProvider: config.provider ?? provider.name,
      usedProvider: provider.name,
      model: generation.model ?? config.model,
      content: generation.content.trim()
    });
  } catch (error) {
    return createDegradedImmersionResult(input, prompt, config, {
      code: 'PROVIDER_REQUEST_FAILED',
      message: error instanceof Error ? error.message : 'Unknown provider failure'
    }, degradationMode);
  }
}
