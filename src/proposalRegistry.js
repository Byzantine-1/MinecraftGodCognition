function hasOnlyKeys(value, requiredKeys) {
  const keys = Object.keys(value);
  return keys.length === requiredKeys.length && requiredKeys.every(key => keys.includes(key));
}

function getLowestId(items = []) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return items
    .map(item => item.id)
    .sort()[0] || null;
}

function hasExactStringArgs(args, requiredKeys) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  if (!hasOnlyKeys(args, requiredKeys)) return false;
  return requiredKeys.every(key => typeof args[key] === 'string' && args[key].length > 0);
}

function hasExactEnumArg(args, key, allowedValues) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  if (!hasOnlyKeys(args, [key])) return false;
  return typeof args[key] === 'string' && allowedValues.includes(args[key]);
}

function buildMissionProposal({ snapshot, profile, targetId }) {
  const missionId = targetId || getLowestId(snapshot?.sideQuests);
  return {
    args: { missionId },
    reason: `No active mission. Authority level ${(profile.traits.authority * 100).toFixed(0)}% ready to accept.`,
    preconditions: [
      { kind: 'mission_absent' },
      { kind: 'side_quest_exists', targetId: missionId }
    ]
  };
}

function buildProjectAdvanceProposal({ snapshot, targetId }) {
  const projectId = targetId || getLowestId(snapshot.projects);
  return {
    args: { projectId },
    reason: `Threat level ${(snapshot.pressure.threat * 100).toFixed(0)}% demands project advancement for defense.`,
    preconditions: [{ kind: 'project_exists', targetId: projectId }]
  };
}

function buildSalvageProposal({ snapshot, targetId }) {
  const focus = targetId || 'general';
  return {
    args: { focus },
    reason: `Scarcity ${(snapshot.pressure.scarcity * 100).toFixed(0)}% and dread ${(snapshot.pressure.dread * 100).toFixed(0)}% require salvage response.`,
    preconditions: [{ kind: 'salvage_focus_supported', expected: focus }]
  };
}

function buildTownsfolkTalkProposal({ snapshot, targetId }) {
  const talkType = targetId || 'morale-boost';
  return {
    args: { talkType },
    reason: `Hope level ${(snapshot.pressure.hope * 100).toFixed(0)}%. Time to speak with townspeople.`,
    preconditions: [{ kind: 'talk_type_supported', expected: talkType }]
  };
}

const proposalDefinitions = [
  {
    type: 'MAYOR_ACCEPT_MISSION',
    order: 0,
    validateArgs: args => hasExactStringArgs(args, ['missionId']),
    buildProposal: buildMissionProposal,
    toCommand: ({ townId, args }) => `mission accept ${townId} ${args.missionId}`
  },
  {
    type: 'PROJECT_ADVANCE',
    order: 1,
    validateArgs: args => hasExactStringArgs(args, ['projectId']),
    buildProposal: buildProjectAdvanceProposal,
    toCommand: ({ townId, args }) => `project advance ${townId} ${args.projectId}`
  },
  {
    type: 'SALVAGE_PLAN',
    order: 2,
    validateArgs: args => hasExactEnumArg(args, 'focus', ['scarcity', 'dread', 'general']),
    buildProposal: buildSalvageProposal,
    toCommand: ({ townId, args }) => `salvage initiate ${townId} ${args.focus}`
  },
  {
    type: 'TOWNSFOLK_TALK',
    order: 3,
    validateArgs: args => hasExactEnumArg(args, 'talkType', ['morale-boost', 'casual']),
    buildProposal: buildTownsfolkTalkProposal,
    toCommand: ({ townId, args }) => `townsfolk talk ${townId} ${args.talkType}`
  }
];

export const proposalRegistry = Object.freeze(
  proposalDefinitions.map(definition => Object.freeze({ ...definition }))
);

export const ProposalType = Object.freeze(
  Object.fromEntries(proposalRegistry.map(definition => [definition.type, definition.type]))
);

const proposalRegistryByType = Object.freeze(
  Object.fromEntries(proposalRegistry.map(definition => [definition.type, definition]))
);

export function getProposalDefinition(type) {
  return proposalRegistryByType[type] || null;
}

export function listProposalTypes() {
  return proposalRegistry.map(definition => definition.type);
}

export function getProposalOrder(type) {
  const definition = getProposalDefinition(type);
  return definition ? definition.order : Number.MAX_SAFE_INTEGER;
}

export function isValidProposalArgs(type, args) {
  const definition = getProposalDefinition(type);
  return Boolean(definition && definition.validateArgs(args));
}

export function materializeProposalType(type, context) {
  const definition = getProposalDefinition(type);
  if (!definition) {
    throw new Error(`Unknown proposal type: ${type}`);
  }

  return definition.buildProposal(context);
}

export function mapProposalToCommand(proposal) {
  const definition = getProposalDefinition(proposal.type);
  if (!definition) {
    throw new Error(`Unknown proposal type: ${proposal.type}`);
  }

  return definition.toCommand(proposal);
}

export function isValidProposalDefinition(definition) {
  return Boolean(
    definition &&
    typeof definition.type === 'string' &&
    definition.type.length > 0 &&
    Number.isInteger(definition.order) &&
    definition.order >= 0 &&
    typeof definition.validateArgs === 'function' &&
    typeof definition.buildProposal === 'function' &&
    typeof definition.toCommand === 'function'
  );
}

export function isValidProposalRegistry(registry = proposalRegistry) {
  if (!Array.isArray(registry) || registry.length === 0) return false;

  const seenTypes = new Set();
  const seenOrders = new Set();

  for (const definition of registry) {
    if (!isValidProposalDefinition(definition)) return false;
    if (seenTypes.has(definition.type) || seenOrders.has(definition.order)) return false;
    seenTypes.add(definition.type);
    seenOrders.add(definition.order);
  }

  return true;
}

if (!isValidProposalRegistry()) {
  throw new Error('Invalid proposal registry');
}
