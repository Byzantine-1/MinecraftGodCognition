/**
 * Snapshot Schema - Bounded world-core state for cognition layer
 * Does NOT include local player survival state, inventory, or mobs
 * Focuses on settlement governance, missions, and projects
 */

/**
 * @typedef {Object} Mission
 * @property {string} id - Mission identifier
 * @property {string} title - Mission title
 * @property {string} description - Brief mission description
 * @property {number} reward - Estimated value/reward
 */

/**
 * @typedef {Object} SideQuest
 * @property {string} id - Quest identifier
 * @property {string} title - Quest title
 * @property {number} complexity - Rough complexity estimate
 */

/**
 * @typedef {Object} Pressure
 * @property {number} threat - [0, 1] external threat level
 * @property {number} scarcity - [0, 1] resource scarcity level
 * @property {number} hope - [0, 1] morale/hope level
 * @property {number} dread - [0, 1] dread/despair level
 */

/**
 * @typedef {Object} Project
 * @property {string} id - Project identifier
 * @property {string} name - Project name
 * @property {number} progress - [0, 1] completion progress
 * @property {string} status - 'planning', 'active', 'blocked', 'complete'
 */

/**
 * @typedef {Object} Snapshot
 * @property {number} day - In-game day counter (0+)
 * @property {string} townId - Town/settlement identifier
 * @property {Mission|null} mission - Currently active mission, or null
 * @property {SideQuest[]} sideQuests - Bounded list of available side quests
 * @property {Pressure} pressure - Ambient pressure/stress summary
 * @property {Project[]} projects - Bounded list of active/priority projects
 * @property {string|null} latestNetherEvent - Optional recent Nether event summary
 */

/**
 * Validate snapshot structure
 * @param {Snapshot} snapshot
 * @returns {boolean}
 */
export function isValidSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  
  // Validate day
  if (typeof snapshot.day !== 'number' || snapshot.day < 0) return false;
  
  // Validate townId
  if (typeof snapshot.townId !== 'string' || snapshot.townId.length === 0) return false;
  
  // Validate mission (can be null or object with id/title)
  if (snapshot.mission !== null && snapshot.mission !== undefined) {
    if (typeof snapshot.mission !== 'object' || typeof snapshot.mission.id !== 'string') return false;
  }
  
  // Validate sideQuests
  if (!Array.isArray(snapshot.sideQuests)) return false;
  for (const quest of snapshot.sideQuests) {
    if (typeof quest.id !== 'string' || typeof quest.title !== 'string') return false;
  }
  
  // Validate pressure
  if (!snapshot.pressure || typeof snapshot.pressure !== 'object') return false;
  const { threat, scarcity, hope, dread } = snapshot.pressure;
  if (typeof threat !== 'number' || threat < 0 || threat > 1) return false;
  if (typeof scarcity !== 'number' || scarcity < 0 || scarcity > 1) return false;
  if (typeof hope !== 'number' || hope < 0 || hope > 1) return false;
  if (typeof dread !== 'number' || dread < 0 || dread > 1) return false;
  
  // Validate projects
  if (!Array.isArray(snapshot.projects)) return false;
  for (const proj of snapshot.projects) {
    if (typeof proj.id !== 'string' || typeof proj.name !== 'string') return false;
    if (typeof proj.progress !== 'number' || proj.progress < 0 || proj.progress > 1) return false;
  }
  
  return true;
}

/**
 * Create a default minimal snapshot (deterministic, no timestamps)
 * @param {string} townId
 * @param {number} day
 * @returns {Snapshot}
 */
export function createDefaultSnapshot(townId = 'town-1', day = 0) {
  return {
    day,
    townId,
    mission: null,
    sideQuests: [],
    pressure: {
      threat: 0.3,
      scarcity: 0.2,
      hope: 0.7,
      dread: 0.2
    },
    projects: [],
    latestNetherEvent: null
  };
}
