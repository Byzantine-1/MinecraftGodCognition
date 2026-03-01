import { ProposalType } from './proposalDsl.js';

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
  const { mission, sideQuests } = snapshot;
  const { authority, pragmatism } = profile.traits;

  // Mayor accepts mission if none active and a quest is available to accept.
  if (!mission && sideQuests && sideQuests.length > 0) {
    const score = authority * pragmatism;
    const targetId = sideQuests
      .map(quest => quest.id)
      .sort()[0];
    return { score, reasonTags: ['no_active_mission'], targetId };
  }
  
  return { score: 0, reasonTags: [] };
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
    const score = Math.min(1, pressure.threat * courage);
    // deterministic choose lowest-id project as "best"
    const targetId = projects
      .map(p => p.id)
      .sort()[0];
    const reasonTags = ['high_threat', 'project_available'];
    return { score, reasonTags, targetId };
  }
  
  return { score: 0, reasonTags: [] };
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
    const score = Math.min(1, strain * pragmatism);
    // pick focus based on whichever component is larger
    const focus = pressure.scarcity >= pressure.dread ? 'scarcity' : 'dread';
    return { score, reasonTags: ['high_strain'], targetId: focus };
  }
  
  return { score: 0, reasonTags: [] };
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
    return { score: 0.5, reasonTags: ['low_hope'], targetId: 'morale-boost' };
  }
  
  return { score: 0.2, reasonTags: [], targetId: 'casual' };
}

const proposalOrder = Object.freeze([
  ProposalType.MAYOR_ACCEPT_MISSION,
  ProposalType.PROJECT_ADVANCE,
  ProposalType.SALVAGE_PLAN,
  ProposalType.TOWNSFOLK_TALK
]);

function selectBestCandidate(candidates) {
  if (!candidates || candidates.length === 0) return { type: null, priority: 0 }; 
  // sort in-place because we don't care about original order
  candidates.sort((a, b) => {
    // priority descending
    if (a.priority !== b.priority) return b.priority - a.priority;
    // proposal order ascending index
    const ia = proposalOrder.indexOf(a.type);
    const ib = proposalOrder.indexOf(b.type);
    if (ia !== ib) return ia - ib;
    // final tie-break on targetId lexicographically
    const ka = (a.targetId || '').toString();
    const kb = (b.targetId || '').toString();
    return ka.localeCompare(kb);
  });
  return candidates[0];
}

function applyMemoryPenalty(candidates, memory = {}) {
  if (!memory || !memory.lastType) return;
  const penalty = 0.1;
  const count = Math.max(1, memory.repeatCount || 1);
  candidates.forEach(c => {
    if (c.type === memory.lastType) {
      if (!memory.lastTarget || memory.lastTarget === c.targetId) {
        c.priority = Math.max(0, c.priority - penalty * count);
      }
    }
  });
}

/**
 * Calculate role-specific proposal priority
 * @param {Object} snapshot - World snapshot
 * @param {Object} profile - Governor profile
 * @param {Object} memory - Optional recent proposal memory {lastType, lastTarget, repeatCount}
 * @returns {Object} { type, priority, targetId, reasonTags }
 */
export function evaluateGovernanceProposal(snapshot, profile, memory = {}) {
  const { role } = profile;
  
  let candidates = [];
  
  if (role === 'mayor') {
    const res = evaluateMissionAcceptance(snapshot, profile);
    if (res.score > 0) {
      candidates.push({ type: ProposalType.MAYOR_ACCEPT_MISSION, priority: res.score, targetId: res.targetId, reasonTags: res.reasonTags });
    }
  }
  
  if (role === 'captain') {
    const res = evaluateProjectAdvance(snapshot, profile);
    if (res.score > 0) {
      candidates.push({ type: ProposalType.PROJECT_ADVANCE, priority: res.score, targetId: res.targetId, reasonTags: res.reasonTags });
    }
  }
  
  if (role === 'warden') {
    const res = evaluateSalvagePlan(snapshot, profile);
    if (res.score > 0) {
      candidates.push({ type: ProposalType.SALVAGE_PLAN, priority: res.score, targetId: res.targetId, reasonTags: res.reasonTags });
    }
  }
  
  // Fallback is always available
  const talkRes = evaluateTownsfolkTalk(snapshot, profile);
  candidates.push({ type: ProposalType.TOWNSFOLK_TALK, priority: talkRes.score, targetId: talkRes.targetId, reasonTags: talkRes.reasonTags });
  
  // apply anti-repeat memory penalty
  applyMemoryPenalty(candidates, memory);
  
  const best = selectBestCandidate(candidates);
  return {
    type: best.type,
    priority: best.priority,
    targetId: best.targetId,
    reasonTags: best.reasonTags || []
  };
}
