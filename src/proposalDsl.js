/**
 * Proposal DSL - World-core governance action proposal definitions
 * Emitted by the cognition layer to recommend governance/world state changes
 */

export const ProposalType = {
  MAYOR_ACCEPT_MISSION: 'MAYOR_ACCEPT_MISSION',
  PROJECT_ADVANCE: 'PROJECT_ADVANCE',
  SALVAGE_PLAN: 'SALVAGE_PLAN',
  TOWNSFOLK_TALK: 'TOWNSFOLK_TALK'
};

/**
 * @typedef {Object} Proposal
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
  if (!Object.values(ProposalType).includes(proposal.type)) return false;
  if (typeof proposal.actorId !== 'string' || proposal.actorId.length === 0) return false;
  if (typeof proposal.townId !== 'string' || proposal.townId.length === 0) return false;
  if (typeof proposal.priority !== 'number' || proposal.priority < 0 || proposal.priority > 1) return false;
  if (typeof proposal.reason !== 'string' || proposal.reason.length === 0) return false;
  if (!Array.isArray(proposal.reasonTags)) return false;
  for (const tag of proposal.reasonTags) {
    if (typeof tag !== 'string') return false;
  }
  return true;
}
