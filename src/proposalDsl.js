/**
 * Proposal DSL - Typed action proposal definitions
 */

export const ProposalType = {
  MINE: 'mine',
  MOVE: 'move',
  PLACE: 'place',
  EAT: 'eat',
  REST: 'rest',
  CRAFT: 'craft'
};

export const Difficulty = {
  TRIVIAL: 0,
  EASY: 1,
  MODERATE: 2,
  HARD: 3,
  EXTREME: 4
};

/**
 * Represents a proposed action
 * @typedef {Object} Proposal
 * @property {string} type - Action type from ProposalType
 * @property {number} confidence - [0, 1] confidence in the proposal
 * @property {number} difficulty - Estimated difficulty from Difficulty enum
 * @property {Object} params - Action-specific parameters
 * @property {string} rationale - Human-readable explanation
 */

/**
 * Validate that a proposal conforms to the DSL
 * @param {Proposal} proposal
 * @returns {boolean}
 */
export function isValidProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return false;
  if (!Object.values(ProposalType).includes(proposal.type)) return false;
  if (typeof proposal.confidence !== 'number' || proposal.confidence < 0 || proposal.confidence > 1) return false;
  if (!Object.values(Difficulty).includes(proposal.difficulty)) return false;
  if (typeof proposal.rationale !== 'string' || proposal.rationale.length === 0) return false;
  if (!proposal.params || typeof proposal.params !== 'object') return false;
  return true;
}
