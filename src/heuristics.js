/**
 * Heuristics - Decision-making rules and evaluation functions
 */

/**
 * Evaluate agent need to eat based on hunger level
 * @param {number} hunger - Hunger level [0, 10]
 * @returns {number} Score [0, 1]
 */
export function evaluateHungerNeed(hunger) {
  if (hunger >= 8) return 0;
  if (hunger >= 6) return 0.3;
  if (hunger >= 3) return 0.6;
  return 1;
}

/**
 * Evaluate agent need to rest based on health
 * @param {number} health - Health level [0, 20]
 * @returns {number} Score [0, 1]
 */
export function evaluateRestNeed(health) {
  if (health >= 18) return 0;
  if (health >= 15) return 0.3;
  if (health >= 10) return 0.6;
  return 1;
}

/**
 * Evaluate danger from nearby entities
 * @param {Array} nearby - Array of nearby entities
 * @returns {number} Score [0, 1]
 */
export function evaluateDanger(nearby) {
  const threats = nearby.filter(e => 
    e.type === 'zombie' || 
    e.type === 'creeper' || 
    e.type === 'skeleton'
  );
  
  if (threats.length === 0) return 0;
  
  const closestThreat = Math.min(...threats.map(t => t.distance));
  if (closestThreat < 5) return 1;
  if (closestThreat < 10) return 0.7;
  if (closestThreat < 15) return 0.4;
  return 0.1;
}

/**
 * Evaluate opportunity to mine based on environment
 * @param {number} light - Light level [0, 15]
 * @param {Array} nearby - Nearby entities
 * @returns {number} Score [0, 1]
 */
export function evaluateMineOpportunity(light, nearby) {
  const danger = evaluateDanger(nearby);
  if (danger > 0.5) return 0;
  
  if (light < 8) return 0.3;
  if (light < 12) return 0.7;
  return 1;
}

/**
 * Calculate action priority based on multiple heuristics
 * @param {Object} snapshot - World snapshot
 * @param {Object} profile - Agent profile
 * @param {string} actionType - Type of action to evaluate
 * @returns {number} Priority [0, 1]
 */
export function calculateActionPriority(snapshot, profile, actionType) {
  const { agent, nearby, environment } = snapshot;
  const { traits } = profile;
  
  let priority = 0;
  
  switch (actionType) {
    case 'eat':
      priority = evaluateHungerNeed(agent.hunger) * (1 - traits.efficiency);
      break;
    case 'rest':
      priority = evaluateRestNeed(agent.health) * traits.caution;
      break;
    case 'mine':
      priority = evaluateMineOpportunity(environment.light, nearby) * traits.efficiency;
      break;
    case 'move':
      priority = (evaluateDanger(nearby) * traits.caution + traits.curiosity * 0.5) * 0.5;
      break;
    default:
      priority = 0;
  }
  
  return Math.min(1, Math.max(0, priority));
}
