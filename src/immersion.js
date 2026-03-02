import { createHash } from 'crypto';
import { Roles } from './agentProfiles.js';
import { isValidProposal } from './proposalDsl.js';
import { isValidExecutionHandoff, isValidExecutionResult } from './executionHandoff.js';
import { SchemaVersion } from './schemaVersions.js';
import { createQwenProvider } from './immersionProviders/qwenProvider.js';
import {
  createWorldMemoryCanonGuardrail,
  isValidWorldMemoryContext,
  normalizeWorldMemoryContext
} from './worldMemoryContext.js';

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

export const ImmersionMemoryRole = Object.freeze([
  Roles.MAYOR,
  Roles.CAPTAIN,
  Roles.WARDEN,
  'townsfolk'
]);

const narrativeContextKeys = Object.freeze([
  'narrativeState',
  'chronicleSummary',
  'factionTone',
  'speakerVoiceProfiles',
  'canonGuardrails',
  'worldMemory'
]);

const artifactGuidance = Object.freeze({
  'leader-speech': 'Write one short speech in a leader voice. Keep it grounded in the selected proposal and current town conditions.',
  'town-rumor': 'Write one short rumor that common townsfolk might repeat. Keep it suggestive, not authoritative.',
  'chronicle-entry': 'Write one short historical chronicle line using the execution outcome if present.',
  'outcome-blurb': 'Write one short narrated outcome blurb describing the attempted or completed action.'
});

const worldMemoryArtifactGuidance = Object.freeze({
  'leader-speech': 'When world memory is present, emphasize civic continuity: the town summary, the latest public chronicle lines, and the most recent executed civic result.',
  'town-rumor': 'When world memory is present, emphasize suggestive details: recent chronicle lines, unresolved or tense history, and faction mood instead of official summaries.',
  'chronicle-entry': 'When world memory is present, emphasize archival sequence: the latest receipt-grade history first, then the latest chronicle trace.',
  'outcome-blurb': 'When world memory is present, emphasize the immediate recorded outcome, its recent precedent, and one public memory cue from the town.'
});

const roleMemoryGuidance = Object.freeze({
  [Roles.MAYOR]: 'Role continuity emphasis: mayor. Favor civic duty, mission continuity, town morale, and the public obligations implied by the record.',
  [Roles.CAPTAIN]: 'Role continuity emphasis: captain. Favor defenses, works in progress, tangible progress, and the burden of immediate protection.',
  [Roles.WARDEN]: 'Role continuity emphasis: warden. Favor strain, salvage, caution, shortages, and signs that pressure is still unresolved.',
  townsfolk: 'Role continuity emphasis: townsfolk. Favor public memory, hearsay pressure, vivid common details, and what ordinary people would repeat.'
});

const proposalTypeRoleMap = Object.freeze({
  MAYOR_ACCEPT_MISSION: Roles.MAYOR,
  PROJECT_ADVANCE: Roles.CAPTAIN,
  SALVAGE_PLAN: Roles.WARDEN,
  TOWNSFOLK_TALK: 'townsfolk'
});

const officeTitleByRole = Object.freeze({
  [Roles.MAYOR]: 'Mayor',
  [Roles.CAPTAIN]: 'Captain',
  [Roles.WARDEN]: 'Warden',
  townsfolk: 'Townsfolk'
});

const roleRankingSignals = Object.freeze({
  [Roles.MAYOR]: Object.freeze({
    chronicleKeywords: Object.freeze(['civic', 'decree', 'supplies', 'order', 'trade', 'mission', 'market', 'public']),
    historyKeywords: Object.freeze(['civic', 'decree', 'supplies', 'order', 'trade', 'mission', 'market', 'public']),
    chronicleEntryTypeBoosts: Object.freeze({ mission: 14, speech: 10, project: 4 }),
    historyProposalTypeBoosts: Object.freeze({ MAYOR_ACCEPT_MISSION: 16, PROJECT_ADVANCE: 3 }),
    historyStatusBoosts: Object.freeze({ executed: 5 }),
    historyKindBoosts: Object.freeze({ execution_result: 3 }),
    historySourceTypeBoosts: Object.freeze({ execution_receipt: 2 })
  }),
  [Roles.CAPTAIN]: Object.freeze({
    chronicleKeywords: Object.freeze(['defense', 'border', 'patrol', 'threat', 'conflict', 'wall', 'guard', 'breach']),
    historyKeywords: Object.freeze(['defense', 'border', 'patrol', 'threat', 'conflict', 'wall', 'guard', 'project']),
    chronicleEntryTypeBoosts: Object.freeze({ project: 14, warning: 8 }),
    historyProposalTypeBoosts: Object.freeze({ PROJECT_ADVANCE: 16 }),
    historyStatusBoosts: Object.freeze({ executed: 7 }),
    historyKindBoosts: Object.freeze({ execution_result: 4 }),
    historySourceTypeBoosts: Object.freeze({ execution_receipt: 3 })
  }),
  [Roles.WARDEN]: Object.freeze({
    chronicleKeywords: Object.freeze(['discipline', 'crime', 'gate', 'watch', 'prison', 'ration', 'scarcity', 'salvage', 'supply']),
    historyKeywords: Object.freeze(['discipline', 'crime', 'gate', 'watch', 'scarcity', 'salvage', 'supply', 'shortage']),
    chronicleEntryTypeBoosts: Object.freeze({ warning: 14, project: 2 }),
    historyProposalTypeBoosts: Object.freeze({ SALVAGE_PLAN: 16 }),
    historyStatusBoosts: Object.freeze({ stale: 9, rejected: 7, failed: 7 }),
    historyKindBoosts: Object.freeze({ execution_result: 4 }),
    historySourceTypeBoosts: Object.freeze({ execution_receipt: 3 })
  }),
  townsfolk: Object.freeze({
    chronicleKeywords: Object.freeze(['rumor', 'loss', 'fear', 'shortage', 'market', 'daily', 'square', 'whisper', 'quiet']),
    historyKeywords: Object.freeze(['rumor', 'loss', 'fear', 'shortage', 'market', 'daily', 'whisper', 'late', 'incident']),
    chronicleEntryTypeBoosts: Object.freeze({ warning: 8, speech: 4, project: 4 }),
    historyProposalTypeBoosts: Object.freeze({ TOWNSFOLK_TALK: 8, SALVAGE_PLAN: 5 }),
    historyStatusBoosts: Object.freeze({ stale: 8, rejected: 6, failed: 6, executed: 2 }),
    historyKindBoosts: Object.freeze({ execution_result: 4, execution_started: -3 }),
    historySourceTypeBoosts: Object.freeze({ execution_receipt: 2, execution_event: 1 })
  })
});

const artifactRankingSignals = Object.freeze({
  'leader-speech': Object.freeze({
    chronicleKeywords: Object.freeze(['decree', 'civic', 'public', 'reassure', 'order', 'mission']),
    historyKeywords: Object.freeze(['decree', 'civic', 'public', 'reassure', 'executed', 'mission']),
    chronicleEntryTypeBoosts: Object.freeze({ speech: 12, mission: 8, project: 4 }),
    historyStatusBoosts: Object.freeze({ executed: 9 }),
    historyKindBoosts: Object.freeze({ execution_result: 4 }),
    historySourceTypeBoosts: Object.freeze({ execution_receipt: 4 })
  }),
  'town-rumor': Object.freeze({
    chronicleKeywords: Object.freeze(['gossip', 'incident', 'unease', 'local', 'warning', 'quiet', 'fear', 'market']),
    historyKeywords: Object.freeze(['gossip', 'incident', 'unease', 'local', 'late', 'stale', 'rejected', 'failed']),
    chronicleEntryTypeBoosts: Object.freeze({ warning: 10, speech: 3, project: 3 }),
    historyStatusBoosts: Object.freeze({ stale: 10, rejected: 8, failed: 8, executed: 1 }),
    historyKindBoosts: Object.freeze({ execution_result: 4, execution_started: -4 }),
    historySourceTypeBoosts: Object.freeze({ execution_receipt: 2 })
  }),
  'chronicle-entry': Object.freeze({
    chronicleKeywords: Object.freeze(['history', 'record', 'public', 'chronicle', 'archive']),
    historyKeywords: Object.freeze(['history', 'record', 'public', 'chronicle', 'status', 'result']),
    chronicleEntryTypeBoosts: Object.freeze({ project: 4, mission: 4, warning: 4 }),
    historyStatusBoosts: Object.freeze({ executed: 7, stale: 7, rejected: 7, failed: 7 }),
    historyKindBoosts: Object.freeze({ execution_result: 9, execution_started: 1 }),
    historySourceTypeBoosts: Object.freeze({ execution_receipt: 7 })
  }),
  'outcome-blurb': Object.freeze({
    chronicleKeywords: Object.freeze(['result', 'outcome', 'public', 'aftermath', 'consequence']),
    historyKeywords: Object.freeze(['result', 'outcome', 'aftermath', 'consequence', 'executed', 'stale', 'rejected', 'failed']),
    chronicleEntryTypeBoosts: Object.freeze({ project: 4, warning: 4, mission: 3 }),
    historyStatusBoosts: Object.freeze({ executed: 8, stale: 7, rejected: 7, failed: 7 }),
    historyKindBoosts: Object.freeze({ execution_result: 10 }),
    historySourceTypeBoosts: Object.freeze({ execution_receipt: 6 })
  })
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

function hasOnlyKeys(value, expectedKeys) {
  return Object.keys(value).every(key => expectedKeys.includes(key));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringList(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function hasUniqueNormalizedStrings(values) {
  const normalized = values.map(value => value.trim());
  return new Set(normalized).size === normalized.length;
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

function normalizeStringList(values = []) {
  return [...values]
    .map(value => value.trim())
    .sort((left, right) => left.localeCompare(right));
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    if (!isNonEmptyString(value)) continue;
    const normalized = value.trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function isValidImmersionMemoryRole(role) {
  return ImmersionMemoryRole.includes(role);
}

function normalizeOptionalNarrativeObject(value, keys) {
  if (value === undefined) return undefined;
  return keys.reduce((normalized, key) => {
    if (hasOwn(value, key) && value[key] !== undefined) {
      normalized[key] = value[key];
    }
    return normalized;
  }, {});
}

function isValidNarrativeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!hasOnlyKeys(value, ['arcId', 'chapterTitle', 'currentBeat', 'motifs'])) return false;
  if (hasOwn(value, 'arcId') && !isNonEmptyString(value.arcId)) return false;
  if (hasOwn(value, 'chapterTitle') && !isNonEmptyString(value.chapterTitle)) return false;
  if (hasOwn(value, 'currentBeat') && !isNonEmptyString(value.currentBeat)) return false;
  if (hasOwn(value, 'motifs')) {
    if (!isStringList(value.motifs) || !hasUniqueNormalizedStrings(value.motifs)) return false;
  }
  return true;
}

function isValidChronicleSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!hasOnlyKeys(value, ['latestEntry', 'openThreads', 'recentEvents'])) return false;
  if (hasOwn(value, 'latestEntry') && !isNonEmptyString(value.latestEntry)) return false;
  if (hasOwn(value, 'openThreads')) {
    if (!isStringList(value.openThreads) || !hasUniqueNormalizedStrings(value.openThreads)) return false;
  }
  if (hasOwn(value, 'recentEvents')) {
    if (!isStringList(value.recentEvents) || !hasUniqueNormalizedStrings(value.recentEvents)) return false;
  }
  return true;
}

function isValidFactionToneEntry(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    hasOnlyKeys(value, ['factionId', 'tone', 'stance']) &&
    isNonEmptyString(value.factionId) &&
    isNonEmptyString(value.tone) &&
    isNonEmptyString(value.stance)
  );
}

function isValidSpeakerVoiceProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!hasOnlyKeys(value, ['speakerId', 'register', 'style', 'values', 'bannedPhrases'])) return false;
  if (!isNonEmptyString(value.speakerId)) return false;
  if (!isNonEmptyString(value.register)) return false;
  if (!isNonEmptyString(value.style)) return false;
  if (hasOwn(value, 'values')) {
    if (!isStringList(value.values) || !hasUniqueNormalizedStrings(value.values)) return false;
  }
  if (hasOwn(value, 'bannedPhrases')) {
    if (!isStringList(value.bannedPhrases) || !hasUniqueNormalizedStrings(value.bannedPhrases)) return false;
  }
  return true;
}

function isValidCanonGuardrails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!hasOnlyKeys(value, ['immutableFacts', 'prohibitedClaims', 'requiredDisclaimers'])) return false;
  if (hasOwn(value, 'immutableFacts')) {
    if (!isStringList(value.immutableFacts) || !hasUniqueNormalizedStrings(value.immutableFacts)) return false;
  }
  if (hasOwn(value, 'prohibitedClaims')) {
    if (!isStringList(value.prohibitedClaims) || !hasUniqueNormalizedStrings(value.prohibitedClaims)) return false;
  }
  if (hasOwn(value, 'requiredDisclaimers')) {
    if (!isStringList(value.requiredDisclaimers) || !hasUniqueNormalizedStrings(value.requiredDisclaimers)) return false;
  }
  return true;
}

/**
 * Validate optional structured narrative context for immersion prompts.
 * @param {Object} narrativeContext
 * @returns {boolean}
 */
export function isValidNarrativeContext(narrativeContext) {
  if (narrativeContext === undefined) return true;
  if (!narrativeContext || typeof narrativeContext !== 'object' || Array.isArray(narrativeContext)) return false;
  if (!hasOnlyKeys(narrativeContext, narrativeContextKeys)) return false;
  if (hasOwn(narrativeContext, 'narrativeState') && !isValidNarrativeState(narrativeContext.narrativeState)) return false;
  if (hasOwn(narrativeContext, 'chronicleSummary') && !isValidChronicleSummary(narrativeContext.chronicleSummary)) return false;
  if (hasOwn(narrativeContext, 'factionTone')) {
    if (!Array.isArray(narrativeContext.factionTone) || !narrativeContext.factionTone.every(isValidFactionToneEntry)) {
      return false;
    }
  }
  if (hasOwn(narrativeContext, 'speakerVoiceProfiles')) {
    if (!Array.isArray(narrativeContext.speakerVoiceProfiles) || !narrativeContext.speakerVoiceProfiles.every(isValidSpeakerVoiceProfile)) {
      return false;
    }
  }
  if (hasOwn(narrativeContext, 'canonGuardrails') && !isValidCanonGuardrails(narrativeContext.canonGuardrails)) return false;
  if (hasOwn(narrativeContext, 'worldMemory') && !isValidWorldMemoryContext(narrativeContext.worldMemory)) return false;

  return true;
}

/**
 * Normalize narrative context so equivalent inputs produce identical prompts.
 * @param {Object} [narrativeContext]
 * @returns {Object|undefined}
 */
export function normalizeNarrativeContext(narrativeContext) {
  if (narrativeContext === undefined) return undefined;
  if (!isValidNarrativeContext(narrativeContext)) {
    throw new Error('Invalid narrative context');
  }

  return normalizeJsonValue({
    ...(narrativeContext.narrativeState
      ? {
          narrativeState: {
            ...normalizeOptionalNarrativeObject(narrativeContext.narrativeState, ['arcId', 'chapterTitle', 'currentBeat']),
            ...(hasOwn(narrativeContext.narrativeState, 'motifs')
              ? { motifs: normalizeStringList(narrativeContext.narrativeState.motifs) }
              : {})
          }
        }
      : {}),
    ...(narrativeContext.chronicleSummary
      ? {
          chronicleSummary: {
            ...normalizeOptionalNarrativeObject(narrativeContext.chronicleSummary, ['latestEntry']),
            ...(hasOwn(narrativeContext.chronicleSummary, 'openThreads')
              ? { openThreads: normalizeStringList(narrativeContext.chronicleSummary.openThreads) }
              : {}),
            ...(hasOwn(narrativeContext.chronicleSummary, 'recentEvents')
              ? { recentEvents: normalizeStringList(narrativeContext.chronicleSummary.recentEvents) }
              : {})
          }
        }
      : {}),
    ...(narrativeContext.factionTone
      ? {
          factionTone: [...narrativeContext.factionTone]
            .map(entry => ({
              factionId: entry.factionId.trim(),
              tone: entry.tone.trim(),
              stance: entry.stance.trim()
            }))
            .sort((left, right) => left.factionId.localeCompare(right.factionId))
        }
      : {}),
    ...(narrativeContext.speakerVoiceProfiles
      ? {
          speakerVoiceProfiles: [...narrativeContext.speakerVoiceProfiles]
            .map(profile => ({
              speakerId: profile.speakerId.trim(),
              register: profile.register.trim(),
              style: profile.style.trim(),
              ...(hasOwn(profile, 'values') ? { values: normalizeStringList(profile.values) } : {}),
              ...(hasOwn(profile, 'bannedPhrases') ? { bannedPhrases: normalizeStringList(profile.bannedPhrases) } : {})
            }))
            .sort((left, right) => left.speakerId.localeCompare(right.speakerId))
        }
      : {}),
    ...(narrativeContext.canonGuardrails
      ? {
          canonGuardrails: {
            ...(hasOwn(narrativeContext.canonGuardrails, 'immutableFacts')
              ? { immutableFacts: normalizeStringList(narrativeContext.canonGuardrails.immutableFacts) }
              : {}),
            ...(hasOwn(narrativeContext.canonGuardrails, 'prohibitedClaims')
              ? { prohibitedClaims: normalizeStringList(narrativeContext.canonGuardrails.prohibitedClaims) }
              : {}),
            ...(hasOwn(narrativeContext.canonGuardrails, 'requiredDisclaimers')
              ? { requiredDisclaimers: normalizeStringList(narrativeContext.canonGuardrails.requiredDisclaimers) }
              : {})
          }
        }
      : {})
    ,
    ...(narrativeContext.worldMemory
      ? { worldMemory: normalizeWorldMemoryContext(narrativeContext.worldMemory) }
      : {})
  });
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

/**
 * Validate an immersion result payload.
 * @param {Object} result
 * @returns {boolean}
 */
export function isValidImmersionResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  if (result.schemaVersion !== SchemaVersion.IMMERSION_RESULT) return false;
  if (!ImmersionArtifactType.includes(result.artifactType)) return false;
  if (!ImmersionStatus.includes(result.status)) return false;
  if (result.advisory !== true) return false;
  if (!result.authority || typeof result.authority !== 'object' || Array.isArray(result.authority)) return false;
  if (result.authority.proposalSelection !== false) return false;
  if (result.authority.commandExecution !== false) return false;
  if (result.authority.stateMutation !== false) return false;
  if (!result.provider || typeof result.provider !== 'object' || Array.isArray(result.provider)) return false;
  if (typeof result.provider.requested !== 'string' || result.provider.requested.length === 0) return false;
  if (typeof result.provider.used !== 'string' || result.provider.used.length === 0) return false;
  if (result.provider.model !== null && !isNonEmptyString(result.provider.model)) return false;
  if (!result.prompt || typeof result.prompt !== 'object' || Array.isArray(result.prompt)) return false;
  if (!isNonEmptyString(result.prompt.hash)) return false;
  if (!result.sourceSchemas || typeof result.sourceSchemas !== 'object' || Array.isArray(result.sourceSchemas)) return false;
  if (result.content !== null && !isNonEmptyString(result.content)) return false;
  if (hasOwn(result, 'error')) {
    if (!result.error || typeof result.error !== 'object' || Array.isArray(result.error)) return false;
    if (!isNonEmptyString(result.error.code) || !isNonEmptyString(result.error.message)) return false;
  }

  if (result.status === 'generated' && !isNonEmptyString(result.content)) return false;
  if (result.status === 'fallback' && !isNonEmptyString(result.content)) return false;
  if (result.status === 'unavailable' && result.content !== null) return false;

  return true;
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
    type: result.type,
    schemaVersion: result.schemaVersion,
    executionId: result.executionId,
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
  if (!isValidNarrativeContext(input.narrativeContext)) return false;

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
  const narrativeContext = normalizeNarrativeContext(input.narrativeContext);
  const focusedWorldMemory = selectWorldMemoryForImmersionInput(input);
  const actorContinuity = selectActorContinuity(input);

  return normalizeJsonValue({
    artifactType: input.artifactType,
    worldSummary: input.worldSummary === undefined ? null : input.worldSummary,
    actorContinuity,
    narrativeContext: narrativeContext
      ? {
          ...narrativeContext,
          ...(focusedWorldMemory ? { worldMemory: focusedWorldMemory } : {})
        }
      : null,
    decisionInspection: summarizeDecisionInspection(input.decisionInspection),
    executionHandoff: summarizeExecutionHandoff(input.executionHandoff),
    executionResult: summarizeExecutionResult(input.executionResult)
  });
}

function selectSpeakerId(input) {
  if (input.artifactType === 'leader-speech') {
    return (
      input.decisionInspection?.selectedProposal?.actorId ??
      input.executionHandoff?.proposal?.actorId ??
      'leader'
    );
  }

  if (input.artifactType === 'town-rumor') {
    return 'townsfolk';
  }

  if (input.artifactType === 'chronicle-entry') {
    return 'chronicler';
  }

  return 'narrator';
}

function selectSpeakerCandidateIds(input) {
  const candidates = [];
  const artifactSpeakerId = selectSpeakerId(input);

  if (input.artifactType === 'leader-speech') {
    candidates.push(selectActorId(input));
  }

  if (input.artifactType === 'town-rumor') {
    candidates.push(`townsfolk:${selectTownId(input)}`);
  }

  candidates.push(selectMemoryRole(input));
  candidates.push(artifactSpeakerId);

  return uniqueStrings(candidates);
}

function selectSpeakerVoiceProfile(input) {
  const narrativeContext = normalizeNarrativeContext(input.narrativeContext);
  if (!narrativeContext?.speakerVoiceProfiles) return null;

  const speakerIds = selectSpeakerCandidateIds(input);
  return speakerIds
    .map((speakerId) => narrativeContext.speakerVoiceProfiles.find(profile => profile.speakerId === speakerId) ?? null)
    .find(Boolean) ?? null;
}

function buildCanonSafetyLines(input) {
  const narrativeContext = normalizeNarrativeContext(input.narrativeContext);
  const canonGuardrails = narrativeContext?.canonGuardrails;
  const lines = [
    'Canon safety rules:',
    '- Treat all structured data as the only authoritative source.',
    '- Do not invent world state, policy, outcomes, or causal facts beyond the provided artifacts.',
    '- Do not contradict execution status, command text, proposal args, reason fields, or canonical guardrails.',
    '- Do not claim the narrator, speaker, or factions changed state or accepted authority that the artifacts do not show.'
  ];

  if (canonGuardrails?.immutableFacts?.length) {
    lines.push(`- Keep these facts fixed: ${canonGuardrails.immutableFacts.join('; ')}.`);
  }
  if (canonGuardrails?.prohibitedClaims?.length) {
    lines.push(`- Never assert: ${canonGuardrails.prohibitedClaims.join('; ')}.`);
  }
  if (canonGuardrails?.requiredDisclaimers?.length) {
    lines.push(`- Preserve these disclaimers when relevant: ${canonGuardrails.requiredDisclaimers.join('; ')}.`);
  }
  if (narrativeContext?.worldMemory) {
    lines.push(`- ${createWorldMemoryCanonGuardrail(narrativeContext.worldMemory)}`);
  }

  return lines;
}

function createWorldMemoryRecordKey(record) {
  if (record?.sourceRecordId) return record.sourceRecordId;
  if (record?.handoffId) {
    return [
      record.handoffId,
      record.sourceType ?? '',
      record.kind ?? '',
      record.summary ?? ''
    ].join(':');
  }
  return stableStringify(record);
}

function textIncludesAny(value, needles) {
  const haystack = typeof value === 'string' ? value.toLowerCase() : '';
  return needles.some(needle => haystack.includes(needle));
}

function buildWorldMemorySearchText(parts) {
  return parts
    .filter((part) => part !== null && part !== undefined)
    .flatMap((part) => Array.isArray(part) ? part : [part])
    .map((part) => String(part).trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function countKeywordHits(text, keywords = []) {
  if (!text) {
    return 0;
  }

  return uniqueStrings(keywords).reduce((count, keyword) => (
    text.includes(keyword.toLowerCase()) ? count + 1 : count
  ), 0);
}

function scoreLookup(boosts, key) {
  if (!boosts || key === null || key === undefined) {
    return 0;
  }

  return Number(boosts[key] ?? 0);
}

function compareWorldMemoryChronicleEntries(left, right) {
  if (left.at !== right.at) return right.at - left.at;
  return right.sourceRecordId.localeCompare(left.sourceRecordId);
}

function compareWorldMemoryHistoryEntries(left, right) {
  if (left.at !== right.at) return right.at - left.at;
  return [
    right.sourceType,
    right.kind,
    right.proposalType ?? '',
    right.status,
    right.handoffId ?? ''
  ].join(':').localeCompare([
    left.sourceType,
    left.kind,
    left.proposalType ?? '',
    left.status,
    left.handoffId ?? ''
  ].join(':'));
}

function buildChronicleRankingText(record) {
  return buildWorldMemorySearchText([
    record.entryType,
    record.message,
    record.townId,
    record.factionId,
    record.sourceRefId,
    record.tags
  ]);
}

function buildHistoryRankingText(record) {
  return buildWorldMemorySearchText([
    record.sourceType,
    record.proposalType,
    record.command,
    record.authorityCommands,
    record.status,
    record.reasonCode,
    record.kind,
    record.townId,
    record.summary
  ]);
}

function scoreChronicleRecord(record, { role, artifactType }) {
  const roleSignals = role ? roleRankingSignals[role] : null;
  const artifactSignals = artifactRankingSignals[artifactType];
  const text = buildChronicleRankingText(record);

  return (
    countKeywordHits(text, roleSignals?.chronicleKeywords) * 5 +
    countKeywordHits(text, artifactSignals?.chronicleKeywords) * 4 +
    scoreLookup(roleSignals?.chronicleEntryTypeBoosts, record.entryType) +
    scoreLookup(artifactSignals?.chronicleEntryTypeBoosts, record.entryType)
  );
}

function scoreHistoryRecord(record, { role, artifactType }) {
  const roleSignals = role ? roleRankingSignals[role] : null;
  const artifactSignals = artifactRankingSignals[artifactType];
  const text = buildHistoryRankingText(record);

  return (
    countKeywordHits(text, roleSignals?.historyKeywords) * 5 +
    countKeywordHits(text, artifactSignals?.historyKeywords) * 4 +
    scoreLookup(roleSignals?.historyProposalTypeBoosts, record.proposalType) +
    scoreLookup(roleSignals?.historyStatusBoosts, record.status) +
    scoreLookup(roleSignals?.historyKindBoosts, record.kind) +
    scoreLookup(roleSignals?.historySourceTypeBoosts, record.sourceType) +
    scoreLookup(artifactSignals?.historyStatusBoosts, record.status) +
    scoreLookup(artifactSignals?.historyKindBoosts, record.kind) +
    scoreLookup(artifactSignals?.historySourceTypeBoosts, record.sourceType)
  );
}

function selectWorldMemoryRecencyWeight({ recordKind, artifactType }) {
  if (recordKind === 'chronicle' && artifactType === 'chronicle-entry') {
    return 16;
  }

  return 4;
}

function rankWorldMemoryRecords(records, {
  recordKind,
  role,
  artifactType
}) {
  const normalizedRecords = Array.isArray(records) ? records.slice() : [];
  const comparator = recordKind === 'chronicle'
    ? compareWorldMemoryChronicleEntries
    : compareWorldMemoryHistoryEntries;
  const recencyWeight = selectWorldMemoryRecencyWeight({
    recordKind,
    artifactType
  });
  const recencyOrder = [...normalizedRecords].sort(comparator);
  const recencyBonusByKey = new Map(
    recencyOrder.map((record, index) => [
      createWorldMemoryRecordKey(record),
      (recencyOrder.length - index) * recencyWeight
    ])
  );

  return normalizedRecords
    .map((record, originalIndex) => {
      const relevanceScore = recordKind === 'chronicle'
        ? scoreChronicleRecord(record, { role, artifactType })
        : scoreHistoryRecord(record, { role, artifactType });
      const recencyScore = recencyBonusByKey.get(createWorldMemoryRecordKey(record)) ?? 0;
      return {
        record,
        originalIndex,
        totalScore: relevanceScore + recencyScore
      };
    })
    .sort((left, right) => {
      if (left.totalScore !== right.totalScore) {
        return right.totalScore - left.totalScore;
      }

      const canonicalCompare = comparator(left.record, right.record);
      if (canonicalCompare !== 0) {
        return canonicalCompare;
      }

      return left.originalIndex - right.originalIndex;
    })
    .map((entry) => entry.record);
}

function selectRankedWorldMemoryRecords(records, {
  recordKind,
  role,
  artifactType,
  limit
}) {
  if (!Number.isInteger(limit) || limit <= 0) {
    return [];
  }

  return rankWorldMemoryRecords(records, {
    recordKind,
    role,
    artifactType
  }).slice(0, limit);
}

function buildWorldMemorySubset(worldMemory, {
  recentChronicle,
  recentHistory,
  includeTownSummary,
  includeFactionSummary
}) {
  return normalizeJsonValue({
    type: worldMemory.type,
    schemaVersion: worldMemory.schemaVersion,
    scope: worldMemory.scope,
    recentChronicle: recentChronicle.map((record) => ({ ...record })),
    recentHistory: recentHistory.map((record) => ({ ...record })),
    ...(includeTownSummary && worldMemory.townSummary ? { townSummary: worldMemory.townSummary } : {}),
    ...(includeFactionSummary && worldMemory.factionSummary ? { factionSummary: worldMemory.factionSummary } : {})
  });
}

export function selectWorldMemoryForArtifact(artifactType, worldMemoryContext) {
  if (worldMemoryContext === undefined) {
    return undefined;
  }
  if (!ImmersionArtifactType.includes(artifactType)) {
    throw new Error('Invalid immersion artifact type');
  }

  const worldMemory = normalizeWorldMemoryContext(worldMemoryContext);
  const chronicleLimit = artifactType === 'leader-speech' || artifactType === 'town-rumor' ? 2 : 1;
  const historyLimit = artifactType === 'leader-speech' || artifactType === 'town-rumor' ? 1 : 2;

  if (artifactType === 'leader-speech') {
    return buildWorldMemorySubset(worldMemory, {
      recentChronicle: selectRankedWorldMemoryRecords(worldMemory.recentChronicle, {
        recordKind: 'chronicle',
        role: null,
        artifactType,
        limit: chronicleLimit
      }),
      recentHistory: selectRankedWorldMemoryRecords(worldMemory.recentHistory, {
        recordKind: 'history',
        role: null,
        artifactType,
        limit: historyLimit
      }),
      includeTownSummary: true,
      includeFactionSummary: false
    });
  }

  if (artifactType === 'town-rumor') {
    return buildWorldMemorySubset(worldMemory, {
      recentChronicle: selectRankedWorldMemoryRecords(worldMemory.recentChronicle, {
        recordKind: 'chronicle',
        role: null,
        artifactType,
        limit: chronicleLimit
      }),
      recentHistory: selectRankedWorldMemoryRecords(worldMemory.recentHistory, {
        recordKind: 'history',
        role: null,
        artifactType,
        limit: historyLimit
      }),
      includeTownSummary: false,
      includeFactionSummary: true
    });
  }

  if (artifactType === 'chronicle-entry') {
    return buildWorldMemorySubset(worldMemory, {
      recentChronicle: selectRankedWorldMemoryRecords(worldMemory.recentChronicle, {
        recordKind: 'chronicle',
        role: null,
        artifactType,
        limit: chronicleLimit
      }),
      recentHistory: selectRankedWorldMemoryRecords(worldMemory.recentHistory, {
        recordKind: 'history',
        role: null,
        artifactType,
        limit: historyLimit
      }),
      includeTownSummary: true,
      includeFactionSummary: false
    });
  }

  return buildWorldMemorySubset(worldMemory, {
    recentChronicle: selectRankedWorldMemoryRecords(worldMemory.recentChronicle, {
      recordKind: 'chronicle',
      role: null,
      artifactType,
      limit: chronicleLimit
    }),
    recentHistory: selectRankedWorldMemoryRecords(worldMemory.recentHistory, {
      recordKind: 'history',
      role: null,
      artifactType,
      limit: historyLimit
    }),
    includeTownSummary: true,
    includeFactionSummary: false
  });
}

export function selectWorldMemoryForRole(role, artifactType, worldMemoryContext) {
  if (worldMemoryContext === undefined) {
    return undefined;
  }
  if (!isValidImmersionMemoryRole(role)) {
    throw new Error('Invalid immersion memory role');
  }
  if (!ImmersionArtifactType.includes(artifactType)) {
    throw new Error('Invalid immersion artifact type');
  }

  const sourceWorldMemory = normalizeWorldMemoryContext(worldMemoryContext);
  const artifactScopedWorldMemory = selectWorldMemoryForArtifact(artifactType, sourceWorldMemory);
  const chronicleLimit = artifactScopedWorldMemory.recentChronicle.length;
  const historyLimit = artifactScopedWorldMemory.recentHistory.length;

  if (role === Roles.MAYOR) {
    return buildWorldMemorySubset(sourceWorldMemory, {
      recentChronicle: selectRankedWorldMemoryRecords(sourceWorldMemory.recentChronicle, {
        recordKind: 'chronicle',
        role,
        artifactType,
        limit: chronicleLimit
      }),
      recentHistory: selectRankedWorldMemoryRecords(sourceWorldMemory.recentHistory, {
        recordKind: 'history',
        role,
        artifactType,
        limit: historyLimit
      }),
      includeTownSummary: true,
      includeFactionSummary: false
    });
  }

  if (role === Roles.CAPTAIN) {
    return buildWorldMemorySubset(sourceWorldMemory, {
      recentChronicle: selectRankedWorldMemoryRecords(sourceWorldMemory.recentChronicle, {
        recordKind: 'chronicle',
        role,
        artifactType,
        limit: chronicleLimit
      }),
      recentHistory: selectRankedWorldMemoryRecords(sourceWorldMemory.recentHistory, {
        recordKind: 'history',
        role,
        artifactType,
        limit: historyLimit
      }),
      includeTownSummary: true,
      includeFactionSummary: false
    });
  }

  if (role === Roles.WARDEN) {
    return buildWorldMemorySubset(sourceWorldMemory, {
      recentChronicle: selectRankedWorldMemoryRecords(sourceWorldMemory.recentChronicle, {
        recordKind: 'chronicle',
        role,
        artifactType,
        limit: chronicleLimit
      }),
      recentHistory: selectRankedWorldMemoryRecords(sourceWorldMemory.recentHistory, {
        recordKind: 'history',
        role,
        artifactType,
        limit: historyLimit
      }),
      includeTownSummary: true,
      includeFactionSummary: false
    });
  }

  return buildWorldMemorySubset(sourceWorldMemory, {
    recentChronicle: selectRankedWorldMemoryRecords(sourceWorldMemory.recentChronicle, {
      recordKind: 'chronicle',
      role,
      artifactType,
      limit: chronicleLimit
    }),
    recentHistory: selectRankedWorldMemoryRecords(sourceWorldMemory.recentHistory, {
      recordKind: 'history',
      role,
      artifactType,
      limit: historyLimit
    }),
    includeTownSummary: false,
    includeFactionSummary: Boolean(sourceWorldMemory.factionSummary)
  });
}

function inferRoleFromActorId(actorId) {
  if (typeof actorId !== 'string') {
    return null;
  }

  const normalized = actorId.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.includes('mayor')) return Roles.MAYOR;
  if (normalized.includes('captain')) return Roles.CAPTAIN;
  if (normalized.includes('warden')) return Roles.WARDEN;
  if (normalized.includes('townsfolk')) return 'townsfolk';
  return null;
}

function selectMemoryRole(input) {
  if (input.artifactType === 'town-rumor') {
    return 'townsfolk';
  }

  const actorRole = inferRoleFromActorId(selectActorId(input));
  if (actorRole) {
    return actorRole;
  }

  const proposalRole = proposalTypeRoleMap[selectProposalType(input)];
  if (proposalRole) {
    return proposalRole;
  }

  return 'townsfolk';
}

function selectFocusedWorldMemory(input) {
  const narrativeContext = normalizeNarrativeContext(input.narrativeContext);
  return selectWorldMemoryForRole(selectMemoryRole(input), input.artifactType, narrativeContext?.worldMemory);
}

export function selectWorldMemoryForImmersionInput(input) {
  if (!ImmersionArtifactType.includes(input.artifactType)) {
    throw new Error('Invalid immersion artifact type');
  }

  return selectFocusedWorldMemory(input);
}

function buildWorldMemoryGuidanceLines(input) {
  const focusedWorldMemory = selectFocusedWorldMemory(input);
  if (!focusedWorldMemory) {
    return [];
  }

  return [
    worldMemoryArtifactGuidance[input.artifactType],
    roleMemoryGuidance[selectMemoryRole(input)]
  ];
}

function buildActorContinuityConcernCandidates(worldMemory) {
  if (!worldMemory) {
    return [];
  }

  return uniqueStrings([
    ...worldMemory.recentHistory.map((record) => record.summary),
    ...worldMemory.recentChronicle.map((record) => record.message),
    buildTownMemoryCue(worldMemory.townSummary),
    buildFactionMemoryCue(worldMemory.factionSummary)
  ]).slice(0, 4);
}

function selectStableActorConcern(actorId, role, candidates) {
  if (!candidates.length) {
    return null;
  }

  const hash = hashValue({
    actorId,
    role,
    candidates
  });
  const index = Number.parseInt(hash.slice(0, 8), 16) % candidates.length;
  return candidates[index] ?? null;
}

export function selectActorContinuity(input) {
  if (!ImmersionArtifactType.includes(input.artifactType)) {
    throw new Error('Invalid immersion artifact type');
  }

  const role = selectMemoryRole(input);
  const townId = selectTownId(input);
  const actorId = role === 'townsfolk'
    ? `townsfolk:${townId}`
    : selectActorId(input);
  const officeTitle = officeTitleByRole[role] ?? 'Speaker';
  const speakerProfile = selectSpeakerVoiceProfile(input);
  const speakerId = speakerProfile?.speakerId ?? selectSpeakerCandidateIds(input)[0] ?? selectSpeakerId(input);
  const worldMemory = selectFocusedWorldMemory(input);
  const recentConcern = selectStableActorConcern(
    actorId,
    role,
    buildActorContinuityConcernCandidates(worldMemory)
  );

  return normalizeJsonValue({
    actorId,
    role,
    officeTitle,
    officeholderId: role === 'townsfolk' ? `townsfolk:${townId}` : `${role}:${townId}`,
    displayName: role === 'townsfolk' ? `Townsfolk of ${townId}` : `${officeTitle} ${actorId}`,
    speakerId,
    recentConcern
  });
}

function buildActorContinuityLines(input) {
  const actorContinuity = selectActorContinuity(input);
  const lines = [
    `Actor continuity anchor: ${actorContinuity.displayName} is the recurring ${actorContinuity.role} perspective for ${selectTownId(input)}.`
  ];

  if (actorContinuity.recentConcern) {
    lines.push(`Actor recent concern: ${actorContinuity.recentConcern}.`);
  }

  return lines;
}

function buildVoiceGuidanceLines(input) {
  const voiceProfile = selectSpeakerVoiceProfile(input);
  if (!voiceProfile) return [];

  const lines = [
    `Speaker voice profile for ${voiceProfile.speakerId}: register=${voiceProfile.register}; style=${voiceProfile.style}.`
  ];

  if (voiceProfile.values?.length) {
    lines.push(`Emphasize these values when naturally supported: ${voiceProfile.values.join(', ')}.`);
  }
  if (voiceProfile.bannedPhrases?.length) {
    lines.push(`Avoid these phrases exactly: ${voiceProfile.bannedPhrases.join(', ')}.`);
  }

  return lines;
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
    'Do not alter proposals, commands, execution outcomes, canon, or world state.',
    'Keep the response to 2 sentences or fewer.'
  ]
    .concat(buildCanonSafetyLines(input))
    .concat(buildWorldMemoryGuidanceLines(input))
    .concat(buildActorContinuityLines(input))
    .concat(buildVoiceGuidanceLines(input))
    .join(' ');
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
    executionResult: input.executionResult?.type ?? input.executionResult?.schemaVersion ?? null
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

function buildVoiceLead(input) {
  const voiceProfile = selectSpeakerVoiceProfile(input);
  if (!voiceProfile) return null;

  return `In a ${voiceProfile.register} ${voiceProfile.style} voice`;
}

function selectMemoryChronicleMessage(worldMemory) {
  return worldMemory?.recentChronicle?.[0]?.message ?? null;
}

function selectMemoryHistorySummary(worldMemory) {
  return worldMemory?.recentHistory?.[0]?.summary ?? null;
}

function buildTownMemoryCue(summary) {
  if (!summary) return null;

  const parts = [];
  if (summary.activeProjectCount > 0) {
    parts.push(`${summary.activeProjectCount} active project${summary.activeProjectCount === 1 ? '' : 's'}`);
  }
  if (summary.activeMajorMissionId) {
    parts.push(`mission ${summary.activeMajorMissionId} remains active`);
  }
  if (summary.hope !== null && summary.dread !== null) {
    parts.push(`hope ${summary.hope} and dread ${summary.dread}`);
  }

  return parts.length > 0 ? parts.slice(0, 2).join('; ') : null;
}

function buildFactionMemoryCue(summary) {
  if (!summary) return null;
  if (summary.doctrine) return summary.doctrine;
  if (summary.rivals?.length) return `rivalries with ${summary.rivals.join(', ')}`;
  return summary.factionId ? `the ${summary.factionId} remain a live concern` : null;
}

function buildFallbackText(input) {
  const actorContinuity = selectActorContinuity(input);
  const townId = selectTownId(input);
  const actorId = selectActorId(input);
  const proposalType = selectProposalType(input);
  const command = selectCommand(input);
  const reason = selectReason(input);
  const reasonTags = renderTagText(selectReasonTags(input));
  const decisionEpoch = selectDecisionEpoch(input);
  const status = selectStatus(input);
  const reasonCode = selectReasonCode(input);
  const voiceLead = buildVoiceLead(input);
  const worldMemory = selectFocusedWorldMemory(input);
  const memoryChronicle = selectMemoryChronicleMessage(worldMemory);
  const memoryHistory = selectMemoryHistorySummary(worldMemory);
  const townCue = buildTownMemoryCue(worldMemory?.townSummary);
  const factionCue = buildFactionMemoryCue(worldMemory?.factionSummary);
  const recentConcern = actorContinuity.recentConcern;

  if (input.artifactType === 'leader-speech') {
    const followup = recentConcern
      ? `Their recent concern remains ${recentConcern}.`
      : memoryChronicle
      ? `Recent memory holds: ${memoryChronicle}.`
      : townCue
        ? `Town memory marks ${townCue}.`
        : `The council backs ${proposalType} via ${command}.`;
    return `${voiceLead ? `${voiceLead}, ` : ''}${actorContinuity.displayName} addresses ${townId}: ${reason}. ${followup}`;
  }

  if (input.artifactType === 'town-rumor') {
    const opener = memoryChronicle ?? `${proposalType} is the latest talk after ${reasonTags}`;
    const followup = recentConcern
      ? `One recurring worry is ${recentConcern}.`
      : memoryHistory
      ? `People tie it to ${memoryHistory}.`
      : factionCue
        ? `People keep naming ${factionCue}.`
        : `People whisper about ${command}.`;
    return `${voiceLead ? `${voiceLead}, ` : ''}rumor in ${townId}: ${opener}. ${followup}`;
  }

  if (input.artifactType === 'chronicle-entry') {
    const opener = recentConcern ?? memoryHistory ?? `${proposalType} stands recorded with status ${status}`;
    const followup = memoryChronicle
      ? `Chronicle remembers: ${memoryChronicle}.`
      : `Command noted: ${command}.`;
    return `${voiceLead ? `${voiceLead}, ` : ''}day ${decisionEpoch} in ${townId}: ${opener}. ${followup}`;
  }

  const opener = recentConcern ?? memoryHistory ?? `${proposalType} is marked ${status} with code ${reasonCode}`;
  const followup = memoryChronicle
    ? `Public memory still holds ${memoryChronicle}.`
    : townCue
      ? `Town memory marks ${townCue}.`
      : `The last recorded command was ${command}.`;
  return `${voiceLead ? `${voiceLead}, ` : ''}outcome for ${townId}: ${opener}. ${followup}`;
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
