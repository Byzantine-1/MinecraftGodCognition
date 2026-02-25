/**
 * Heuristics - World-core governance decision logic
 * Evaluate conditions and pressures to determine proposal priority
 */

/**
 * Evaluate if a mission should be accepted
 * @param {Object} snapshot - World snapshot
 * @param {Object} profile - Governor profile
 * @returns {number} Score [0, 1]
 */
export function evaluateMissionAcceptance(snapshot, profile) {
  const { mission } = snapshot;
  const { authority, pragmatism } = profile.traits;
  
  // Mayor accepts mission if none active
  if (!mission) {
    return authority * pragmatism;
  }
  
  return 0;
}

/**
 * Evaluate if projects should advance (threat-driven)
 * @param {Object} snapshot - World snapshot
 * @param {Object} profile - Governor profile
 * @returns {number} Score [0, 1]
 */
export function evaluateProjectAdvance(snapshot, profile) {
  const { pressure, projects } = snapshot;
  const { courage } = profile.traits;
  
  // Captain advances projects if threat exists and projects are available
  if (pressure.threat > 0.3 && projects.length > 0) {
    return Math.min(1, pressure.threat * courage);
  }
  
  return 0;
}

/**
 * Evaluate if salvage/scarcity response should be triggered
 * @param {Object} snapshot - World snapshot
 * @param {Object} profile - Governor profile
 * @returns {number} Score [0, 1]
 */
export function evaluateSalvagePlan(snapshot, profile) {
  const { pressure } = snapshot;
  const { pragmatism } = profile.traits;
  
  // Warden responds to scarcity and dread
  const strain = (pressure.scarcity + pressure.dread) / 2;
  
  if (strain > 0.4) {
    return Math.min(1, strain * pragmatism);
  }
  
  return 0;
}

/**
 * Fallback: casual talk/morale action
 * @param {Object} snapshot - World snapshot
 * @param {Object} profile - Governor profile
 * @returns {number} Score [0, 1]
 */
export function evaluateTownsfolkTalk(snapshot, profile) {
  const { pressure } = snapshot;
  
  // Propose talk if morale is low
  if (pressure.hope < 0.6) {
    return 0.5;
  }
  
  return 0.2;
}

/**
 * Calculate role-specific proposal priority
 * @param {Object} snapshot - World snapshot
 * @param {Object} profile - Governor profile
 * @returns {Object} { proposalType, priority }
 */
export function evaluateGovernanceProposal(snapshot, profile) {
  const { role } = profile;
  
  let candidates = [];
  
  if (role === 'mayor') {
    const missionScore = evaluateMissionAcceptance(snapshot, profile);
    if (missionScore > 0) {
      candidates.push({ type: 'MAYOR_ACCEPT_MISSION', priority: missionScore });
    }
  }
  
  if (role === 'captain') {
    const projectScore = evaluateProjectAdvance(snapshot, profile);
    if (projectScore > 0) {
      candidates.push({ type: 'PROJECT_ADVANCE', priority: projectScore });
    }
  }
  
  if (role === 'warden') {
    const salvageScore = evaluateSalvagePlan(snapshot, profile);
    if (salvageScore > 0) {
      candidates.push({ type: 'SALVAGE_PLAN', priority: salvageScore });
    }
  }
  
  // Fallback is always available
  const talkScore = evaluateTownsfolkTalk(snapshot, profile);
  candidates.push({ type: 'TOWNSFOLK_TALK', priority: talkScore });
  
  // Select highest priority
  return candidates.reduce((best, cand) =>
    cand.priority > best.priority ? cand : best
  );
}
