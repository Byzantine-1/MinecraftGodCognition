import { SchemaVersion } from './schemaVersions.js';

export const WorldMemoryContextType = SchemaVersion.WORLD_MEMORY_CONTEXT;
export const WorldMemoryContextSchemaVersion = 1;
export const MaxWorldMemoryChronicleRecords = 5;
export const MaxWorldMemoryHistoryRecords = 5;

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnlyKeys(value, expectedKeys) {
  return Object.keys(value).every(key => expectedKeys.includes(key));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeText(value, maxLen = 240) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLen) : null;
}

function normalizeNullableInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeStringList(values = [], maxEntries = 12, maxLen = 80) {
  return values
    .map(value => normalizeText(value, maxLen))
    .filter(Boolean)
    .slice(0, maxEntries);
}

function hasUniqueNormalizedStrings(values) {
  return new Set(values.map(value => value.trim())).size === values.length;
}

function compareChronicleEntries(left, right) {
  if (left.at !== right.at) return right.at - left.at;
  return right.sourceRecordId.localeCompare(left.sourceRecordId);
}

function compareHistoryEntries(left, right) {
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

function isSortedByComparator(entries, comparator) {
  for (let index = 1; index < entries.length; index += 1) {
    if (comparator(entries[index - 1], entries[index]) > 0) {
      return false;
    }
  }
  return true;
}

function isValidChronicleEntry(value) {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ['sourceRecordId', 'entryType', 'message', 'at', 'townId', 'factionId', 'sourceRefId', 'tags'])) {
    return false;
  }
  if (!isNonEmptyString(value.sourceRecordId)) return false;
  if (!isNonEmptyString(value.entryType)) return false;
  if (!isNonEmptyString(value.message)) return false;
  if (!Number.isInteger(value.at) || value.at < 0) return false;
  if (value.townId !== null && !isNonEmptyString(value.townId)) return false;
  if (value.factionId !== null && !isNonEmptyString(value.factionId)) return false;
  if (value.sourceRefId !== null && !isNonEmptyString(value.sourceRefId)) return false;
  if (!Array.isArray(value.tags) || !value.tags.every(isNonEmptyString) || !hasUniqueNormalizedStrings(value.tags)) return false;
  return true;
}

function normalizeChronicleEntry(value) {
  return {
    sourceRecordId: normalizeText(value.sourceRecordId, 240),
    entryType: normalizeText(value.entryType, 80),
    message: normalizeText(value.message, 240),
    at: normalizeNullableInteger(value.at) ?? 0,
    townId: normalizeText(value.townId, 80),
    factionId: normalizeText(value.factionId, 80),
    sourceRefId: normalizeText(value.sourceRefId, 200),
    tags: normalizeStringList(value.tags, 12, 80)
  };
}

function isValidHistoryEntry(value) {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ['sourceType', 'handoffId', 'proposalType', 'command', 'authorityCommands', 'status', 'reasonCode', 'kind', 'at', 'townId', 'summary'])) {
    return false;
  }
  if (!isNonEmptyString(value.sourceType)) return false;
  if (value.handoffId !== null && !isNonEmptyString(value.handoffId)) return false;
  if (value.proposalType !== null && !isNonEmptyString(value.proposalType)) return false;
  if (value.command !== null && !isNonEmptyString(value.command)) return false;
  if (!Array.isArray(value.authorityCommands) || !value.authorityCommands.every(isNonEmptyString) || !hasUniqueNormalizedStrings(value.authorityCommands)) {
    return false;
  }
  if (!isNonEmptyString(value.status)) return false;
  if (!isNonEmptyString(value.reasonCode)) return false;
  if (!isNonEmptyString(value.kind)) return false;
  if (!Number.isInteger(value.at) || value.at < 0) return false;
  if (value.townId !== null && !isNonEmptyString(value.townId)) return false;
  if (!isNonEmptyString(value.summary)) return false;
  return true;
}

function normalizeHistoryEntry(value) {
  return {
    sourceType: normalizeText(value.sourceType, 40),
    handoffId: normalizeText(value.handoffId, 200),
    proposalType: normalizeText(value.proposalType, 80),
    command: normalizeText(value.command, 240),
    authorityCommands: normalizeStringList(value.authorityCommands, 8, 240),
    status: normalizeText(value.status, 40),
    reasonCode: normalizeText(value.reasonCode, 80),
    kind: normalizeText(value.kind, 80),
    at: normalizeNullableInteger(value.at) ?? 0,
    townId: normalizeText(value.townId, 80),
    summary: normalizeText(value.summary, 320)
  };
}

function isValidExecutionCounts(value) {
  return Boolean(
    isPlainObject(value) &&
    hasOnlyKeys(value, ['executed', 'rejected', 'stale', 'duplicate', 'failed']) &&
    Object.values(value).every(entry => Number.isInteger(entry) && entry >= 0)
  );
}

function normalizeExecutionCounts(value) {
  return {
    executed: Number(value?.executed) || 0,
    rejected: Number(value?.rejected) || 0,
    stale: Number(value?.stale) || 0,
    duplicate: Number(value?.duplicate) || 0,
    failed: Number(value?.failed) || 0
  };
}

function isValidTownSummary(value) {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ['type', 'schemaVersion', 'townId', 'chronicleCount', 'historyCount', 'lastChronicleAt', 'lastHistoryAt', 'hope', 'dread', 'activeMajorMissionId', 'recentImpactCount', 'crierQueueDepth', 'activeProjectCount', 'factions', 'executionCounts'])) {
    return false;
  }
  if (value.type !== 'town-history-summary.v1') return false;
  if (value.schemaVersion !== 1) return false;
  if (!isNonEmptyString(value.townId)) return false;
  if (!Number.isInteger(value.chronicleCount) || value.chronicleCount < 0) return false;
  if (!Number.isInteger(value.historyCount) || value.historyCount < 0) return false;
  if (value.lastChronicleAt !== null && (!Number.isInteger(value.lastChronicleAt) || value.lastChronicleAt < 0)) return false;
  if (value.lastHistoryAt !== null && (!Number.isInteger(value.lastHistoryAt) || value.lastHistoryAt < 0)) return false;
  if (value.hope !== null && !Number.isFinite(value.hope)) return false;
  if (value.dread !== null && !Number.isFinite(value.dread)) return false;
  if (value.activeMajorMissionId !== null && !isNonEmptyString(value.activeMajorMissionId)) return false;
  if (!Number.isInteger(value.recentImpactCount) || value.recentImpactCount < 0) return false;
  if (!Number.isInteger(value.crierQueueDepth) || value.crierQueueDepth < 0) return false;
  if (!Number.isInteger(value.activeProjectCount) || value.activeProjectCount < 0) return false;
  if (!Array.isArray(value.factions) || !value.factions.every(isNonEmptyString) || !hasUniqueNormalizedStrings(value.factions)) return false;
  if (!isValidExecutionCounts(value.executionCounts)) return false;
  return true;
}

function normalizeTownSummary(value) {
  return {
    type: 'town-history-summary.v1',
    schemaVersion: 1,
    townId: normalizeText(value.townId, 80),
    chronicleCount: Number(value.chronicleCount) || 0,
    historyCount: Number(value.historyCount) || 0,
    lastChronicleAt: normalizeNullableInteger(value.lastChronicleAt),
    lastHistoryAt: normalizeNullableInteger(value.lastHistoryAt),
    hope: value.hope === null ? null : Number(value.hope),
    dread: value.dread === null ? null : Number(value.dread),
    activeMajorMissionId: normalizeText(value.activeMajorMissionId, 200),
    recentImpactCount: Number(value.recentImpactCount) || 0,
    crierQueueDepth: Number(value.crierQueueDepth) || 0,
    activeProjectCount: Number(value.activeProjectCount) || 0,
    factions: normalizeStringList(value.factions, 12, 80).sort((left, right) => left.localeCompare(right)),
    executionCounts: normalizeExecutionCounts(value.executionCounts)
  };
}

function isValidFactionSummary(value) {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ['type', 'schemaVersion', 'factionId', 'towns', 'chronicleCount', 'historyCount', 'lastChronicleAt', 'lastHistoryAt', 'hostilityToPlayer', 'stability', 'doctrine', 'rivals'])) {
    return false;
  }
  if (value.type !== 'faction-history-summary.v1') return false;
  if (value.schemaVersion !== 1) return false;
  if (!isNonEmptyString(value.factionId)) return false;
  if (!Array.isArray(value.towns) || !value.towns.every(isNonEmptyString) || !hasUniqueNormalizedStrings(value.towns)) return false;
  if (!Number.isInteger(value.chronicleCount) || value.chronicleCount < 0) return false;
  if (!Number.isInteger(value.historyCount) || value.historyCount < 0) return false;
  if (value.lastChronicleAt !== null && (!Number.isInteger(value.lastChronicleAt) || value.lastChronicleAt < 0)) return false;
  if (value.lastHistoryAt !== null && (!Number.isInteger(value.lastHistoryAt) || value.lastHistoryAt < 0)) return false;
  if (value.hostilityToPlayer !== null && !Number.isFinite(value.hostilityToPlayer)) return false;
  if (value.stability !== null && !Number.isFinite(value.stability)) return false;
  if (value.doctrine !== null && !isNonEmptyString(value.doctrine)) return false;
  if (!Array.isArray(value.rivals) || !value.rivals.every(isNonEmptyString) || !hasUniqueNormalizedStrings(value.rivals)) return false;
  return true;
}

function normalizeFactionSummary(value) {
  return {
    type: 'faction-history-summary.v1',
    schemaVersion: 1,
    factionId: normalizeText(value.factionId, 80),
    towns: normalizeStringList(value.towns, 12, 80).sort((left, right) => left.localeCompare(right)),
    chronicleCount: Number(value.chronicleCount) || 0,
    historyCount: Number(value.historyCount) || 0,
    lastChronicleAt: normalizeNullableInteger(value.lastChronicleAt),
    lastHistoryAt: normalizeNullableInteger(value.lastHistoryAt),
    hostilityToPlayer: value.hostilityToPlayer === null ? null : Number(value.hostilityToPlayer),
    stability: value.stability === null ? null : Number(value.stability),
    doctrine: normalizeText(value.doctrine, 240),
    rivals: normalizeStringList(value.rivals, 12, 80).sort((left, right) => left.localeCompare(right))
  };
}

export function isValidWorldMemoryContext(value) {
  if (!isPlainObject(value)) return false;
  if (!hasOnlyKeys(value, ['type', 'schemaVersion', 'scope', 'recentChronicle', 'recentHistory', 'townSummary', 'factionSummary'])) {
    return false;
  }
  if (value.type !== WorldMemoryContextType) return false;
  if (value.schemaVersion !== WorldMemoryContextSchemaVersion) return false;
  if (!isPlainObject(value.scope) || !hasOnlyKeys(value.scope, ['townId', 'factionId', 'chronicleLimit', 'historyLimit'])) return false;
  if (value.scope.townId !== null && !isNonEmptyString(value.scope.townId)) return false;
  if (value.scope.factionId !== null && !isNonEmptyString(value.scope.factionId)) return false;
  if (!Number.isInteger(value.scope.chronicleLimit) || value.scope.chronicleLimit < 1 || value.scope.chronicleLimit > MaxWorldMemoryChronicleRecords) {
    return false;
  }
  if (!Number.isInteger(value.scope.historyLimit) || value.scope.historyLimit < 1 || value.scope.historyLimit > MaxWorldMemoryHistoryRecords) {
    return false;
  }
  if (!Array.isArray(value.recentChronicle) || value.recentChronicle.length > value.scope.chronicleLimit) return false;
  if (!value.recentChronicle.every(isValidChronicleEntry) || !isSortedByComparator(value.recentChronicle, compareChronicleEntries)) return false;
  if (!Array.isArray(value.recentHistory) || value.recentHistory.length > value.scope.historyLimit) return false;
  if (!value.recentHistory.every(isValidHistoryEntry) || !isSortedByComparator(value.recentHistory, compareHistoryEntries)) return false;
  if (hasOwn(value, 'townSummary') && value.townSummary !== undefined && value.townSummary !== null && !isValidTownSummary(value.townSummary)) {
    return false;
  }
  if (hasOwn(value, 'factionSummary') && value.factionSummary !== undefined && value.factionSummary !== null && !isValidFactionSummary(value.factionSummary)) {
    return false;
  }
  return true;
}

export function normalizeWorldMemoryContext(value) {
  if (value === undefined) return undefined;
  if (!isValidWorldMemoryContext(value)) {
    throw new Error('Invalid world memory context');
  }

  const chronicleLimit = Math.min(value.scope.chronicleLimit, MaxWorldMemoryChronicleRecords);
  const historyLimit = Math.min(value.scope.historyLimit, MaxWorldMemoryHistoryRecords);

  return {
    type: WorldMemoryContextType,
    schemaVersion: WorldMemoryContextSchemaVersion,
    scope: {
      townId: normalizeText(value.scope.townId, 80),
      factionId: normalizeText(value.scope.factionId, 80),
      chronicleLimit,
      historyLimit
    },
    recentChronicle: value.recentChronicle
      .map(normalizeChronicleEntry)
      .sort(compareChronicleEntries)
      .slice(0, chronicleLimit),
    recentHistory: value.recentHistory
      .map(normalizeHistoryEntry)
      .sort(compareHistoryEntries)
      .slice(0, historyLimit),
    ...(value.townSummary ? { townSummary: normalizeTownSummary(value.townSummary) } : {}),
    ...(value.factionSummary ? { factionSummary: normalizeFactionSummary(value.factionSummary) } : {})
  };
}

export function parseWorldMemoryContextLine(line) {
  if (typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!isValidWorldMemoryContext(parsed)) {
    return null;
  }

  return normalizeWorldMemoryContext(parsed);
}

export function createNarrativeContextWithWorldMemory(narrativeContext = {}, worldMemory) {
  if (narrativeContext === undefined) {
    return worldMemory === undefined
      ? undefined
      : { worldMemory: normalizeWorldMemoryContext(worldMemory) };
  }

  if (!isPlainObject(narrativeContext)) {
    throw new Error('Invalid narrative context shell');
  }

  return {
    ...narrativeContext,
    ...(worldMemory === undefined
      ? {}
      : { worldMemory: normalizeWorldMemoryContext(worldMemory) })
  };
}

export function createWorldMemoryCanonGuardrail(worldMemoryContext) {
  const normalized = normalizeWorldMemoryContext(worldMemoryContext);
  return `Historical context is a bounded advisory slice from ${SchemaVersion.EXECUTION_RESULT} and chronicle records via ${normalized.type}.`;
}
