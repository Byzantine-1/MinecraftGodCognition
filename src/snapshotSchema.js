/**
 * Snapshot Schema - Bounded world-core state for cognition layer
 * Does NOT include local player survival state, inventory, or mobs
 * Focuses on settlement governance, missions, and projects
 */

import { ProjectStatuses, SchemaVersion, SnapshotBounds } from './schemaVersions.js';

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
 * @property {number} [complexity] - Rough complexity estimate (optional)
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
 * @property {string} schemaVersion - Snapshot schema version
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

  if (snapshot.schemaVersion !== SchemaVersion.SNAPSHOT) return false;

  // Validate day
  if (!Number.isInteger(snapshot.day) || snapshot.day < 0) return false;

  // Validate townId
  if (typeof snapshot.townId !== 'string' || snapshot.townId.length === 0) return false;

  // Validate mission (must be present and either null or a typed object)
  if (!Object.prototype.hasOwnProperty.call(snapshot, 'mission')) return false;
  if (snapshot.mission !== null) {
    if (!snapshot.mission || typeof snapshot.mission !== 'object') return false;
    if (typeof snapshot.mission.id !== 'string' || snapshot.mission.id.length === 0) return false;
    if (typeof snapshot.mission.title !== 'string' || snapshot.mission.title.length === 0) return false;
    if ('description' in snapshot.mission && typeof snapshot.mission.description !== 'string') return false;
    if ('reward' in snapshot.mission) {
      if (typeof snapshot.mission.reward !== 'number' || !Number.isFinite(snapshot.mission.reward) || snapshot.mission.reward < 0) {
        return false;
      }
    }
  }

  // Validate sideQuests
  if (!Array.isArray(snapshot.sideQuests)) return false;
  if (snapshot.sideQuests.length > SnapshotBounds.maxSideQuests) return false;
  for (const quest of snapshot.sideQuests) {
    if (!quest || typeof quest !== 'object') return false;
    if (typeof quest.id !== 'string' || quest.id.length === 0) return false;
    if (typeof quest.title !== 'string' || quest.title.length === 0) return false;
    if ('complexity' in quest) {
      if (typeof quest.complexity !== 'number' || !Number.isFinite(quest.complexity) || quest.complexity < 0 || quest.complexity > 10) {
        return false;
      }
    }
  }

  // Validate pressure
  if (!snapshot.pressure || typeof snapshot.pressure !== 'object') return false;
  const { threat, scarcity, hope, dread } = snapshot.pressure;
  if (typeof threat !== 'number' || !Number.isFinite(threat) || threat < 0 || threat > 1) return false;
  if (typeof scarcity !== 'number' || !Number.isFinite(scarcity) || scarcity < 0 || scarcity > 1) return false;
  if (typeof hope !== 'number' || !Number.isFinite(hope) || hope < 0 || hope > 1) return false;
  if (typeof dread !== 'number' || !Number.isFinite(dread) || dread < 0 || dread > 1) return false;

  // Validate projects
  if (!Array.isArray(snapshot.projects)) return false;
  if (snapshot.projects.length > SnapshotBounds.maxProjects) return false;
  for (const proj of snapshot.projects) {
    if (!proj || typeof proj !== 'object') return false;
    if (typeof proj.id !== 'string' || proj.id.length === 0) return false;
    if (typeof proj.name !== 'string' || proj.name.length === 0) return false;
    if (typeof proj.progress !== 'number' || !Number.isFinite(proj.progress) || proj.progress < 0 || proj.progress > 1) return false;
    if (!ProjectStatuses.includes(proj.status)) return false;
  }

  if (!Object.prototype.hasOwnProperty.call(snapshot, 'latestNetherEvent')) return false;
  if (snapshot.latestNetherEvent !== null && typeof snapshot.latestNetherEvent !== 'string') return false;

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
    schemaVersion: SchemaVersion.SNAPSHOT,
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
