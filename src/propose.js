/**
 * Propose - Core world-core proposal generation logic
 * Reads a bounded world snapshot and outputs one governance action proposal
 */

import { ProposalType, isValidProposal } from './proposalDsl.js';
import { evaluateGovernanceProposal } from './heuristics.js';
import { isValidSnapshot } from './snapshotSchema.js';
import { isValidProfile } from './agentProfiles.js';

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

  const { townId, day, mission, pressure, projects } = snapshot;
  const { id: actorId, role } = profile;
  
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
      // use a deterministic mission id from evaluation (e.g. best side quest)
      args = { missionId: targetId || null };
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
  }
  
  // Build proposal
  const proposal = {
    type: proposalType,
    actorId,
    townId,
    priority,
    reason,
    reasonTags,
    args
  };
  
  // Validate before returning
  if (!isValidProposal(proposal)) {
    throw new Error('Generated proposal failed validation');
  }
  
  return proposal;
}
