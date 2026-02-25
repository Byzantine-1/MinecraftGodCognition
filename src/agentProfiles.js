/**
 * Agent Profiles - Governance role definitions for world-core cognition
 */

export const Roles = {
  MAYOR: 'mayor',
  CAPTAIN: 'captain',
  WARDEN: 'warden'
};

export const Traits = {
  authority: { min: 0, max: 1, default: 0.5 },
  pragmatism: { min: 0, max: 1, default: 0.5 },
  courage: { min: 0, max: 1, default: 0.5 },
  prudence: { min: 0, max: 1, default: 0.5 }
};

/**
 * @typedef {Object} GovernanceProfile
 * @property {string} id - Actor/townsfolk identifier
 * @property {string} role - Role from Roles enum
 * @property {string} townId - Town/settlement identifier
 * @property {Object} traits - Trait values [0, 1]
 * @property {Object} goals - Role-specific goals
 */

export const mayorProfile = {
  id: 'mayor-1',
  role: Roles.MAYOR,
  townId: 'town-1',
  traits: {
    authority: 0.9,
    pragmatism: 0.8,
    courage: 0.6,
    prudence: 0.7
  },
  goals: {
    acceptMissions: true,
    growTown: true,
    maintainMorale: true
  }
};

export const captainProfile = {
  id: 'captain-1',
  role: Roles.CAPTAIN,
  townId: 'town-1',
  traits: {
    authority: 0.7,
    pragmatism: 0.6,
    courage: 0.9,
    prudence: 0.5
  },
  goals: {
    defendAgainstThreats: true,
    advanceProjects: true,
    protectTownspeople: true
  }
};

export const wardenProfile = {
  id: 'warden-1',
  role: Roles.WARDEN,
  townId: 'town-1',
  traits: {
    authority: 0.5,
    pragmatism: 0.9,
    courage: 0.5,
    prudence: 0.9
  },
  goals: {
    reducePressure: true,
    salvageResources: true,
    maintainSurplus: true
  }
};

/**
 * Validate governance profile structure
 * @param {GovernanceProfile} profile
 * @returns {boolean}
 */
export function isValidProfile(profile) {
  if (!profile || typeof profile !== 'object') return false;
  if (typeof profile.id !== 'string' || profile.id.length === 0) return false;
  if (!Object.values(Roles).includes(profile.role)) return false;
  if (typeof profile.townId !== 'string' || profile.townId.length === 0) return false;
  
  if (!profile.traits || typeof profile.traits !== 'object') return false;
  for (const [traitName, traitDef] of Object.entries(Traits)) {
    const value = profile.traits[traitName];
    if (typeof value !== 'number' || value < traitDef.min || value > traitDef.max) return false;
  }
  
  if (!profile.goals || typeof profile.goals !== 'object') return false;
  
  return true;
}
