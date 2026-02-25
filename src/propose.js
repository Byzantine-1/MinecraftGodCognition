/**
 * Propose - Core proposal generation logic
 * Reads a bounded snapshot and outputs one typed action proposal
 */

import { ProposalType, Difficulty, isValidProposal } from './proposalDsl.js';
import { calculateActionPriority } from './heuristics.js';
import { evaluateHungerNeed, evaluateRestNeed, evaluateDanger, evaluateMineOpportunity } from './heuristics.js';

/**
 * Generate a single action proposal from the current snapshot
 * @param {Object} snapshot - World state snapshot
 * @param {Object} profile - Agent profile with traits
 * @returns {Object} A typed Proposal
 * @throws {Error} If snapshot or profile is invalid
 */
export function propose(snapshot, profile) {
  if (!snapshot || !profile) {
    throw new Error('Snapshot and profile are required');
  }
  
  const { agent, nearby, environment } = snapshot;
  const { traits, capabilities } = profile;
  
  // Evaluate candidate actions
  const candidates = [];
  
  // Candidate: EAT
  const hungerScore = evaluateHungerNeed(agent.hunger);
  if (hungerScore > 0 && capabilities.canEat) {
    candidates.push({
      type: ProposalType.EAT,
      priority: hungerScore,
      difficulty: Difficulty.TRIVIAL,
      params: { targetFood: 'available' },
      rationale: `Hunger level ${agent.hunger}/10 requires immediate attention`
    });
  }
  
  // Candidate: REST
  const restScore = evaluateRestNeed(agent.health);
  if (restScore > 0 && traits.caution > 0.3) {
    const danger = evaluateDanger(nearby);
    if (danger < 0.5) {
      candidates.push({
        type: ProposalType.REST,
        priority: restScore * (1 - danger),
        difficulty: Difficulty.EASY,
        params: { duration: 30 },
        rationale: `Health at ${agent.health}/20, safe to rest`
      });
    }
  }
  
  // Candidate: MINE
  if (capabilities.canMine) {
    const mineScore = evaluateMineOpportunity(environment.light, nearby);
    if (mineScore > 0.3) {
      candidates.push({
        type: ProposalType.MINE,
        priority: mineScore * traits.efficiency,
        difficulty: Difficulty.MODERATE,
        params: { targetBlock: 'stone' },
        rationale: `Light level ${environment.light}/15 suitable for mining`
      });
    }
  }
  
  // Candidate: MOVE
  const danger = evaluateDanger(nearby);
  if (danger > 0.3) {
    candidates.push({
      type: ProposalType.MOVE,
      priority: danger * traits.caution,
      difficulty: Difficulty.EASY,
      params: { direction: 'away_from_threats', distance: 10 },
      rationale: `${danger.toFixed(2)} threat level detected, moving to safety`
    });
  } else if (traits.curiosity > 0.6) {
    candidates.push({
      type: ProposalType.MOVE,
      priority: traits.curiosity * 0.3,
      difficulty: Difficulty.EASY,
      params: { direction: 'random', distance: 5 },
      rationale: `Curiosity drives exploration`
    });
  }
  
  // Default proposal if no candidates
  if (candidates.length === 0) {
    candidates.push({
      type: ProposalType.MOVE,
      priority: 0.5,
      difficulty: Difficulty.TRIVIAL,
      params: { direction: 'idle', distance: 0 },
      rationale: `No immediate needs detected`
    });
  }
  
  // Select the highest priority candidate
  const selected = candidates.reduce((best, candidate) => 
    candidate.priority > best.priority ? candidate : best
  );
  
  // Build proposal
  const proposal = {
    type: selected.type,
    confidence: Math.min(1, selected.priority + 0.3),
    difficulty: selected.difficulty,
    params: selected.params,
    rationale: selected.rationale
  };
  
  // Validate before returning
  if (!isValidProposal(proposal)) {
    throw new Error('Generated proposal failed validation');
  }
  
  return proposal;
}
