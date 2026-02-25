/**
 * Agent Profiles - Capability and personality trait definitions
 */

export const Traits = {
  riskTolerance: { min: 0, max: 1, default: 0.5 },
  efficiency: { min: 0, max: 1, default: 0.5 },
  curiosity: { min: 0, max: 1, default: 0.5 },
  caution: { min: 0, max: 1, default: 0.5 }
};

export const Capabilities = {
  canMine: false,
  canPlace: false,
  canCraft: false,
  canEat: false,
  maxInventorySlots: 27
};

/**
 * @typedef {Object} AgentProfile
 * @property {string} name - Agent identifier
 * @property {Object} traits - Trait values [0, 1]
 * @property {Object} capabilities - Ability flags
 */

export const defaultProfile = {
  name: 'DefaultAgent',
  traits: {
    riskTolerance: Traits.riskTolerance.default,
    efficiency: Traits.efficiency.default,
    curiosity: Traits.curiosity.default,
    caution: Traits.caution.default
  },
  capabilities: {
    canMine: true,
    canPlace: false,
    canCraft: false,
    canEat: true,
    maxInventorySlots: 27
  }
};

export const minerProfile = {
  name: 'Miner',
  traits: {
    riskTolerance: 0.6,
    efficiency: 0.8,
    curiosity: 0.3,
    caution: 0.4
  },
  capabilities: {
    canMine: true,
    canPlace: false,
    canCraft: false,
    canEat: true,
    maxInventorySlots: 27
  }
};

export const explorerProfile = {
  name: 'Explorer',
  traits: {
    riskTolerance: 0.7,
    efficiency: 0.5,
    curiosity: 0.9,
    caution: 0.3
  },
  capabilities: {
    canMine: true,
    canPlace: false,
    canCraft: false,
    canEat: true,
    maxInventorySlots: 27
  }
};

/**
 * Validate agent profile structure
 * @param {AgentProfile} profile
 * @returns {boolean}
 */
export function isValidProfile(profile) {
  if (!profile || typeof profile !== 'object') return false;
  if (typeof profile.name !== 'string') return false;
  
  for (const [traitName, traitDef] of Object.entries(Traits)) {
    const value = profile.traits?.[traitName];
    if (typeof value !== 'number' || value < traitDef.min || value > traitDef.max) return false;
  }
  
  return true;
}
