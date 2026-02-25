/**
 * Entry point for the minecraft-agent-cognition module
 * World-core governance cognition MVP
 */

export { propose } from './propose.js';
export { ProposalType, isValidProposal } from './proposalDsl.js';
export { 
  Roles,
  mayorProfile, 
  captainProfile, 
  wardenProfile, 
  isValidProfile 
} from './agentProfiles.js';
export { 
  createDefaultSnapshot, 
  isValidSnapshot 
} from './snapshotSchema.js';
export {
  evaluateMissionAcceptance,
  evaluateProjectAdvance,
  evaluateSalvagePlan,
  evaluateTownsfolkTalk,
  evaluateGovernanceProposal
} from './heuristics.js';
