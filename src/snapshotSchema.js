/**
 * Snapshot Schema - Defines the bounded world state structure
 */

/**
 * @typedef {Object} Agent
 * @property {string} id - Agent identifier
 * @property {number} health - [0, 20] health points
 * @property {number} hunger - [0, 10] hunger level
 * @property {number} x - X position
 * @property {number} y - Y position
 * @property {number} z - Z position
 */

/**
 * @typedef {Object} Entity
 * @property {string} type - Entity type (e.g., 'zombie', 'creeper', 'item')
 * @property {number} distance - Distance from agent
 * @property {number} health - Current health if applicable
 */

/**
 * @typedef {Object} Item
 * @property {string} id - Item type identifier
 * @property {number} count - Stack count
 * @property {number} slot - Inventory slot [0, 26]
 */

/**
 * @typedef {Object} Snapshot
 * @property {Agent} agent - Agent state
 * @property {Entity[]} nearby - Entities within perception range
 * @property {Item[]} inventory - Current inventory
 * @property {Object} environment - Environmental conditions
 * @property {number} environment.light - Light level [0, 15]
 * @property {boolean} environment.raining - Whether it's raining
 * @property {number} timestamp - Unix timestamp (ms)
 */

/**
 * Validate snapshot structure
 * @param {Snapshot} snapshot
 * @returns {boolean}
 */
export function isValidSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  
  // Validate agent
  if (!snapshot.agent || typeof snapshot.agent !== 'object') return false;
  const { agent } = snapshot;
  if (typeof agent.id !== 'string' || typeof agent.health !== 'number' || agent.health < 0 || agent.health > 20) return false;
  if (typeof agent.hunger !== 'number' || agent.hunger < 0 || agent.hunger > 10) return false;
  
  // Validate nearby entities
  if (!Array.isArray(snapshot.nearby)) return false;
  for (const entity of snapshot.nearby) {
    if (typeof entity.type !== 'string' || typeof entity.distance !== 'number') return false;
  }
  
  // Validate inventory
  if (!Array.isArray(snapshot.inventory)) return false;
  for (const item of snapshot.inventory) {
    if (typeof item.id !== 'string' || typeof item.count !== 'number') return false;
  }
  
  // Validate environment
  if (!snapshot.environment || typeof snapshot.environment !== 'object') return false;
  if (typeof snapshot.environment.light !== 'number' || snapshot.environment.light < 0 || snapshot.environment.light > 15) return false;
  if (typeof snapshot.environment.raining !== 'boolean') return false;
  
  return true;
}

/**
 * Create a default minimal snapshot
 * @param {string} agentId
 * @returns {Snapshot}
 */
export function createDefaultSnapshot(agentId = 'agent-1') {
  return {
    agent: {
      id: agentId,
      health: 20,
      hunger: 10,
      x: 0,
      y: 64,
      z: 0
    },
    nearby: [],
    inventory: [],
    environment: {
      light: 15,
      raining: false
    },
    timestamp: Date.now()
  };
}
