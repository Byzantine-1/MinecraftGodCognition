/**
 * Proposal-to-Command Mapping
 * 
 * Maps proposals to world-core command strings for testing and reference.
 * This is a manual, non-orchestrating layer for demonstrating the contract.
 * 
 * No execution, no world mutation—just the mapping interface.
 */

import { isValidProposal } from './proposalDsl.js';
import { mapProposalToCommand } from './proposalRegistry.js';

/**
 * Map a proposal to a world-core command string
 * @param {Object} proposal - Proposal from propose()
 * @returns {string} World-core command (not executed)
 */
export function proposalToCommand(proposal) {
  if (!isValidProposal(proposal)) {
    throw new Error('Invalid proposal envelope');
  }

  return mapProposalToCommand(proposal);
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
