/**
 * Proposal-to-Command Mapping
 * 
 * Maps proposals to world-core command strings for testing and reference.
 * This is a manual, non-orchestrating layer for demonstrating the contract.
 * 
 * No execution, no world mutation—just the mapping interface.
 */

import { ProposalType } from './proposalDsl.js';

/**
 * Map a proposal to a world-core command string
 * @param {Object} proposal - Proposal from propose()
 * @returns {string} World-core command (not executed)
 */
export function proposalToCommand(proposal) {
  if (!proposal || !proposal.type) {
    throw new Error('Invalid proposal: missing type');
  }

  const { type, actorId, townId, args, reason } = proposal;

  switch (type) {
    case ProposalType.MAYOR_ACCEPT_MISSION:
      // Command: accept mission
      const missionId = args?.missionId || null;
      return `mission accept ${townId} ${missionId}`;

    case ProposalType.PROJECT_ADVANCE:
      // Command: advance project
      const projectId = args?.projectId || null;
      return `project advance ${townId} ${projectId}`;

    case ProposalType.SALVAGE_PLAN:
      // Command: initiate salvage
      const focus = args?.focus || 'general';
      return `salvage initiate ${townId} ${focus}`;

    case ProposalType.TOWNSFOLK_TALK:
      // Command: talk to townsfolk
      const talkType = args?.talkType || 'morale-boost';
      return `townsfolk talk ${townId} ${talkType}`;

    default:
      throw new Error(`Unknown proposal type: ${type}`);
  }
}

/**
 * Extract human-readable command description for logging/testing
 * @param {Object} proposal
 * @returns {string} Human-readable description
 */
export function proposalToDescription(proposal) {
  if (!proposal || !proposal.type) return 'Unknown proposal';

  const { type, reason, reasonTags } = proposal;
  const tags = reasonTags && reasonTags.length > 0 ? ` [${reasonTags.join(', ')}]` : '';

  return `${type}: ${reason}${tags}`;
}

/**
 * Batch map multiple proposals to commands
 * @param {Array<Object>} proposals - Array of proposals
 * @returns {Array<{proposal, command, description}>}
 */
export function proposalsToCommands(proposals) {
  if (!Array.isArray(proposals)) {
    throw new Error('Expected array of proposals');
  }

  return proposals.map(proposal => ({
    proposal,
    command: proposalToCommand(proposal),
    description: proposalToDescription(proposal)
  }));
}
