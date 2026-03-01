/**
 * Proposal DSL - World-core governance action proposal definitions
 * Emitted by the cognition layer to recommend governance/world state changes
 */

import { SchemaVersion } from './schemaVersions.js';
import {
  isValidProposalArgs as registryIsValidProposalArgs,
  listProposalTypes,
  ProposalType
} from './proposalRegistry.js';
export { ProposalType } from './proposalRegistry.js';
export { isValidProposalArgs } from './proposalRegistry.js';

const hashPattern = /^[0-9a-f]{64}$/;
const proposalIdPattern = /^proposal_[0-9a-f]{64}$/;

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isValidPrecondition(precondition) {
  if (!precondition || typeof precondition !== 'object' || Array.isArray(precondition)) return false;
  if (typeof precondition.kind !== 'string' || precondition.kind.length === 0) return false;
  if (hasOwn(precondition, 'targetId') && (typeof precondition.targetId !== 'string' || precondition.targetId.length === 0)) return false;
  if (hasOwn(precondition, 'field') && (typeof precondition.field !== 'string' || precondition.field.length === 0)) return false;
  if (hasOwn(precondition, 'expected')) {
    const expected = precondition.expected;
    if (expected !== null && !['string', 'number', 'boolean'].includes(typeof expected)) return false;
    if (typeof expected === 'number' && !Number.isFinite(expected)) return false;
  }
  return true;
}

/**
 * @typedef {Object} Proposal
 * @property {string} schemaVersion - Proposal envelope schema version
 * @property {string} proposalId - Deterministic proposal identifier
 * @property {string} snapshotHash - Deterministic hash of the source snapshot
 * @property {number} decisionEpoch - Logical decision epoch from the snapshot
 * @property {Array<Object>} [preconditions] - Optional execution guards
 * @property {string} type - Governance action type from ProposalType
 * @property {string} actorId - ID of the actor (townsperson) proposing/executing
 * @property {string} townId - Town/settlement identifier
 * @property {number} priority - [0, 1] priority/urgency score
 * @property {string} reason - Brief human-readable rationale
 * @property {string[]} reasonTags - Array of machine-readable tags explaining rationale
 * @property {Object} args - Type-specific arguments (optional)
 */

/**
 * Validate that a proposal conforms to world-core DSL
 * @param {Proposal} proposal
 * @returns {boolean}
 */
export function isValidProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return false;
  if (proposal.schemaVersion !== SchemaVersion.PROPOSAL) return false;
  if (typeof proposal.proposalId !== 'string' || !proposalIdPattern.test(proposal.proposalId)) return false;
  if (typeof proposal.snapshotHash !== 'string' || !hashPattern.test(proposal.snapshotHash)) return false;
  if (!Number.isInteger(proposal.decisionEpoch) || proposal.decisionEpoch < 0) return false;
  if (hasOwn(proposal, 'preconditions')) {
    if (!Array.isArray(proposal.preconditions)) return false;
    for (const precondition of proposal.preconditions) {
      if (!isValidPrecondition(precondition)) return false;
    }
  }
  if (!listProposalTypes().includes(proposal.type)) return false;
  if (typeof proposal.actorId !== 'string' || proposal.actorId.length === 0) return false;
  if (typeof proposal.townId !== 'string' || proposal.townId.length === 0) return false;
  if (typeof proposal.priority !== 'number' || !Number.isFinite(proposal.priority) || proposal.priority < 0 || proposal.priority > 1) return false;
  if (typeof proposal.reason !== 'string' || proposal.reason.length === 0) return false;
  if (!Array.isArray(proposal.reasonTags)) return false;
  for (const tag of proposal.reasonTags) {
    if (typeof tag !== 'string') return false;
  }
  if (!registryIsValidProposalArgs(proposal.type, proposal.args)) return false;
  return true;
}
