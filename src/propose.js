/**
 * Propose - Core world-core proposal generation logic
 * Reads a bounded world snapshot and outputs one governance action proposal
 */

import { createHash } from 'crypto';
import { ProposalType, isValidProposal } from './proposalDsl.js';
import { evaluateGovernanceProposal } from './heuristics.js';
import { isValidSnapshot } from './snapshotSchema.js';
import { isValidProfile } from './agentProfiles.js';
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

function createProposalId(payload) {
  return `proposal_${hashValue(payload)}`;
}

function buildPreconditions(proposalType, args) {
  switch (proposalType) {
    case ProposalType.MAYOR_ACCEPT_MISSION:
      return [
        { kind: 'mission_absent' },
        { kind: 'side_quest_exists', targetId: args.missionId }
      ];
    case ProposalType.PROJECT_ADVANCE:
      return [{ kind: 'project_exists', targetId: args.projectId }];
    case ProposalType.SALVAGE_PLAN:
      return [{ kind: 'salvage_focus_supported', expected: args.focus }];
    case ProposalType.TOWNSFOLK_TALK:
      return [{ kind: 'talk_type_supported', expected: args.talkType }];
    default:
      return [];
  }
}

/**
 * Generate a single governance action proposal from the current world snapshot
 * Deterministic: same input always produces same output
 * 
 * Optional memory may be provided to discourage repeating the same action
 * too frequently (anti-repeat penalty). The memory object is bounded and
 * replay-safe, e.g. `{lastType, lastTarget, repeatCount}`.
 *
 * @param {Object} snapshot - World state snapshot
 * @param {Object} profile - Governor profile with role and traits
 * @param {Object} [memory] - Optional recent proposal memory for penalty
 * @returns {Object} A typed world-core Proposal
 * @throws {Error} If snapshot or profile is invalid
 */
export function propose(snapshot, profile, memory = {}) {
  if (!snapshot || !profile) {
    throw new Error('Snapshot and profile are required');
  }
  if (!isValidSnapshot(snapshot)) {
    throw new Error('Invalid snapshot structure');
  }
  if (!isValidProfile(profile)) {
    throw new Error('Invalid profile structure');
  }
  if (snapshot.townId !== profile.townId) {
    throw new Error('Snapshot and profile townId mismatch');
  }

  const { townId, day, mission, pressure, projects } = snapshot;
  const { id: actorId } = profile;

  // Evaluate proposal for this role (may include memory for anti-repeat)
  const evaluation = evaluateGovernanceProposal(snapshot, profile, memory);
  const proposalType = evaluation.type;
  const priority = evaluation.priority;
  const targetId = evaluation.targetId;
  const reasonTags = evaluation.reasonTags || [];

  // Build type-specific arguments
  let args = {};
  let reason = '';

  switch (proposalType) {
    case ProposalType.MAYOR_ACCEPT_MISSION:
      args = { missionId: targetId };
      reason = `No active mission. Authority level ${(profile.traits.authority * 100).toFixed(0)}% ready to accept.`;
      break;

    case ProposalType.PROJECT_ADVANCE:
      args = { projectId: targetId || (projects.length > 0 ? projects[0].id : null) };
      reason = `Threat level ${(pressure.threat * 100).toFixed(0)}% demands project advancement for defense.`;
      break;

    case ProposalType.SALVAGE_PLAN:
      args = { focus: targetId || 'general' };
      reason = `Scarcity ${(pressure.scarcity * 100).toFixed(0)}% and dread ${(pressure.dread * 100).toFixed(0)}% require salvage response.`;
      break;

    case ProposalType.TOWNSFOLK_TALK:
      args = { talkType: targetId || 'morale-boost' };
      reason = `Hope level ${(pressure.hope * 100).toFixed(0)}%. Time to speak with townspeople.`;
      break;

    default:
      throw new Error(`Unsupported proposal type: ${proposalType}`);
  }

  const snapshotHash = hashValue(snapshot);
  const decisionEpoch = day;
  const preconditions = buildPreconditions(proposalType, args);

  // Build proposal
  const proposal = {
    schemaVersion: SchemaVersion.PROPOSAL,
    proposalId: createProposalId({
      actorId,
      townId,
      type: proposalType,
      args,
      priority,
      decisionEpoch,
      snapshotHash
    }),
    snapshotHash,
    decisionEpoch,
    type: proposalType,
    actorId,
    townId,
    priority,
    reason,
    reasonTags,
    args,
    ...(preconditions.length > 0 ? { preconditions } : {})
  };

  // Validate before returning
  if (!isValidProposal(proposal)) {
    throw new Error('Generated proposal failed validation');
  }

  return proposal;
}
