/**
 * Propose - Core world-core proposal generation logic
 * Reads a bounded world snapshot and outputs one governance action proposal
 */

import { createHash } from 'crypto';
import { isValidProposal } from './proposalDsl.js';
import { evaluateGovernanceProposal } from './heuristics.js';
import { canonicalizeSnapshot, isValidSnapshot } from './snapshotSchema.js';
import { isValidProfile } from './agentProfiles.js';
import { materializeProposalType } from './proposalRegistry.js';
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

  const canonicalSnapshot = canonicalizeSnapshot(snapshot);
  const { townId, day } = canonicalSnapshot;
  const { id: actorId } = profile;

  // Evaluate proposal for this role (may include memory for anti-repeat)
  const evaluation = evaluateGovernanceProposal(canonicalSnapshot, profile, memory);
  const proposalType = evaluation.type;
  const priority = evaluation.priority;
  const targetId = evaluation.targetId;
  const reasonTags = evaluation.reasonTags || [];

  const materialized = materializeProposalType(proposalType, {
    snapshot: canonicalSnapshot,
    profile,
    targetId,
    priority,
    reasonTags
  });
  const args = materialized.args;
  const reason = materialized.reason;
  const preconditions = materialized.preconditions || [];

  const snapshotHash = hashValue(canonicalSnapshot);
  const decisionEpoch = day;

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
