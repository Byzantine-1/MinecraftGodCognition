/**
 * Propose - Core world-core proposal generation logic
 * Reads a bounded world snapshot and outputs one governance action proposal
 */

import { ProposalType, isValidProposal } from './proposalDsl.js';
import { evaluateGovernanceProposal } from './heuristics.js';

/**
 * Generate a single governance action proposal from the current world snapshot
 * Deterministic: same input always produces same output
 * @param {Object} snapshot - World state snapshot
 * @param {Object} profile - Governor profile with role and traits
 * @returns {Object} A typed world-core Proposal
 * @throws {Error} If snapshot or profile is invalid
 */
export function propose(snapshot, profile) {
  if (!snapshot || !profile) {
    throw new Error('Snapshot and profile are required');
  }
  
  const { townId, day, mission, pressure, projects } = snapshot;
  const { id: actorId, role } = profile;
  
  // Evaluate proposal for this role
  const evaluation = evaluateGovernanceProposal(snapshot, profile);
  const proposalType = evaluation.type;
  const priority = evaluation.priority;
  
  // Build type-specific arguments
  let args = {};
  let reason = '';
  
  switch (proposalType) {
    case ProposalType.MAYOR_ACCEPT_MISSION:
      args = { missionId: 'pending' };
      reason = `No active mission. Authority level ${(profile.traits.authority * 100).toFixed(0)}% ready to accept.`;
      break;
      
    case ProposalType.PROJECT_ADVANCE:
      args = { projectId: projects.length > 0 ? projects[0].id : 'primary' };
      reason = `Threat level ${(pressure.threat * 100).toFixed(0)}% demands project advancement for defense.`;
      break;
      
    case ProposalType.SALVAGE_PLAN:
      args = { targetScarcity: 'general' };
      reason = `Scarcity ${(pressure.scarcity * 100).toFixed(0)}% and dread ${(pressure.dread * 100).toFixed(0)}% require salvage response.`;
      break;
      
    case ProposalType.TOWNSFOLK_TALK:
      args = { talkType: 'morale-boost' };
      reason = `Hope level ${(pressure.hope * 100).toFixed(0)}%. Time to speak with townspeople.`;
      break;
  }
  
  // Build proposal
  const proposal = {
    type: proposalType,
    actorId,
    townId,
    priority,
    reason,
    args
  };
  
  // Validate before returning
  if (!isValidProposal(proposal)) {
    throw new Error('Generated proposal failed validation');
  }
  
  return proposal;
}
