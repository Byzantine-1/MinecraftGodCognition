import { ProposalType } from './proposalDsl.js';
import { getProposalOrder } from './proposalRegistry.js';

const EventSignalKeywords = Object.freeze({
  threat: ['raid', 'ghast', 'piglin', 'blaze', 'breach', 'attack', 'wither'],
  scarcity: ['resource', 'supply', 'crop', 'food', 'famine', 'scarcity'],
  dread: ['raid', 'ghast', 'piglin', 'panic', 'fear', 'breach', 'wither', 'blaze']
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function normalizeComplexity(complexity) {
  if (typeof complexity !== 'number' || !Number.isFinite(complexity)) {
    return 0.3;
  }

  return clamp01(complexity / 10);
}

function normalizeReward(reward) {
  if (typeof reward !== 'number' || !Number.isFinite(reward) || reward <= 0) {
    return 0;
  }

  return clamp01(reward / 200);
}

function getEventSignals(latestNetherEvent) {
  if (typeof latestNetherEvent !== 'string' || latestNetherEvent.length === 0) {
    return { threat: 0, scarcity: 0, dread: 0 };
  }

  const normalizedEvent = latestNetherEvent.toLowerCase();
  const hasKeyword = keywords => keywords.some(keyword => normalizedEvent.includes(keyword));
  const genericSignal = 0.04;

  return {
    threat: genericSignal + (hasKeyword(EventSignalKeywords.threat) ? 0.12 : 0),
    scarcity: hasKeyword(EventSignalKeywords.scarcity) ? 0.12 : 0,
    dread: genericSignal + (hasKeyword(EventSignalKeywords.dread) ? 0.14 : 0)
  };
}

function selectBestOption(options) {
  if (!Array.isArray(options) || options.length === 0) return null;

  const rankedOptions = [...options];
  rankedOptions.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    return (left.targetId || '').localeCompare(right.targetId || '');
  });

  return rankedOptions[0];
}

function getPressureValues(pressure = {}) {
  return {
    threat: typeof pressure.threat === 'number' ? pressure.threat : 0,
    scarcity: typeof pressure.scarcity === 'number' ? pressure.scarcity : 0,
    hope: typeof pressure.hope === 'number' ? pressure.hope : 0.7,
    dread: typeof pressure.dread === 'number' ? pressure.dread : 0
  };
}

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
  const {
    mission = null,
    sideQuests = [],
    pressure = {},
    latestNetherEvent = null
  } = snapshot;
  const {
    authority = 0,
    pragmatism = 0,
    prudence = 0.5
  } = profile.traits || {};
  const goals = profile.goals || {};
  const pressureValues = getPressureValues(pressure);

  // Mayor accepts mission if none active and a quest is available to accept.
  if (!mission && sideQuests && sideQuests.length > 0) {
    const eventSignals = getEventSignals(latestNetherEvent);
    const preferredComplexity = clamp01(
      0.05 +
      authority * 0.1 +
      pragmatism * 0.15 +
      (1 - prudence) * 0.45 -
      eventSignals.threat * 0.4
    );
    const goalBonus =
      (goals.acceptMissions ? 0.1 : -0.1) +
      (goals.growTown ? 0.05 : 0) +
      (goals.maintainMorale && pressureValues.hope < 0.6 ? 0.05 : 0);
    const baseScore = authority * 0.3 + pragmatism * 0.2 + goalBonus;
    const bestQuest = selectBestOption(sideQuests.map(quest => {
      const complexity = normalizeComplexity(quest.complexity);
      const complexityFit = 1 - Math.abs(complexity - preferredComplexity);
      const eventReadiness = eventSignals.threat * prudence * (1 - complexity);

      return {
        score: clamp01(baseScore + complexityFit * 0.3 + eventReadiness * 0.15),
        targetId: quest.id
      };
    }));
    const reasonTags = ['no_active_mission', 'mission_ranked'];
    if (eventSignals.threat > 0) {
      reasonTags.push('nether_event_pressure');
    }

    return { score: bestQuest.score, reasonTags, targetId: bestQuest.targetId };
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
  const {
    pressure = {},
    projects = [],
    latestNetherEvent = null
  } = snapshot;
  const { courage = 0, prudence = 0.5 } = profile.traits || {};
  const goals = profile.goals || {};
  const pressureValues = getPressureValues(pressure);
  const actionableProjects = projects.filter(project => project.status === 'active' || project.status === 'planning');
  const hasBlockedProjects = projects.some(project => project.status === 'blocked');
  
  // Captain advances projects if threat exists and projects are available
  if (pressureValues.threat > 0.3 && actionableProjects.length > 0) {
    const eventSignals = getEventSignals(latestNetherEvent);
    const baseThreat = clamp01(pressureValues.threat + eventSignals.threat);
    const goalBonus =
      (goals.defendAgainstThreats ? 0.08 : 0) +
      (goals.advanceProjects ? 0.05 : -0.05) +
      (goals.protectTownspeople ? 0.07 : 0);
    const baseScore = baseThreat * (0.45 + courage * 0.35 + prudence * 0.1) + goalBonus;
    const bestProject = selectBestOption(actionableProjects.map(project => {
      const statusBonus = project.status === 'active' ? 0.12 : 0.05;
      const progressBonus = project.progress * (0.08 + prudence * 0.08);
      const eventBonus = eventSignals.threat > 0 && project.status === 'active' ? 0.03 : 0;

      return {
        score: clamp01(baseScore + statusBonus + progressBonus + eventBonus),
        targetId: project.id
      };
    }));
    const reasonTags = ['high_threat', 'project_available'];
    if (eventSignals.threat > 0) {
      reasonTags.push('nether_event_pressure');
    }
    if (hasBlockedProjects) {
      reasonTags.push('blocked_projects_skipped');
    }
    return { score: bestProject.score, reasonTags, targetId: bestProject.targetId };
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
  const {
    mission = null,
    pressure = {},
    latestNetherEvent = null
  } = snapshot;
  const { pragmatism = 0, prudence = 0.5 } = profile.traits || {};
  const goals = profile.goals || {};
  const pressureValues = getPressureValues(pressure);
  const eventSignals = getEventSignals(latestNetherEvent);
  const missionRelief = normalizeReward(mission?.reward) * 0.2;
  
  // Warden responds to scarcity and dread
  const scarcitySignal = clamp01(
    pressureValues.scarcity +
    eventSignals.scarcity +
    (goals.salvageResources ? 0.08 : 0) +
    (goals.maintainSurplus ? 0.07 : 0) -
    missionRelief
  );
  const dreadSignal = clamp01(
    pressureValues.dread +
    eventSignals.dread +
    (1 - pressureValues.hope) * 0.1 +
    (goals.reducePressure ? 0.08 : 0)
  );
  const strain = Math.max((pressureValues.scarcity + pressureValues.dread) / 2, scarcitySignal, dreadSignal);
  
  if (strain > 0.4) {
    const focus = scarcitySignal > dreadSignal
      ? 'scarcity'
      : dreadSignal > scarcitySignal
        ? 'dread'
        : (pressureValues.scarcity >= pressureValues.dread ? 'scarcity' : 'dread');
    const focusBonus = focus === 'scarcity'
      ? (goals.salvageResources ? 0.05 : 0) + (goals.maintainSurplus ? 0.04 : 0)
      : (goals.reducePressure ? 0.06 : 0);
    const score = clamp01(
      strain * (0.45 + pragmatism * 0.3 + prudence * 0.15) +
      focusBonus +
      (focus === 'dread' ? eventSignals.dread * 0.1 : eventSignals.scarcity * 0.08)
    );
    const reasonTags = ['high_strain'];
    if (eventSignals.dread > 0 || eventSignals.scarcity > 0) {
      reasonTags.push('nether_event_pressure');
    }
    if (missionRelief > 0) {
      reasonTags.push('mission_relief_expected');
    }
    return { score, reasonTags, targetId: focus };
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
  const { pressure = {} } = snapshot;
  const pressureValues = getPressureValues(pressure);
  
  // Propose talk if morale is low
  if (pressureValues.hope < 0.6) {
    return { score: 0.5, reasonTags: ['low_hope'], targetId: 'morale-boost' };
  }
  
  return { score: 0.2, reasonTags: [], targetId: 'casual' };
}

function selectBestCandidate(candidates) {
  if (!candidates || candidates.length === 0) return { type: null, priority: 0 }; 
  // sort in-place because we don't care about original order
  candidates.sort((a, b) => {
    // priority descending
    if (a.priority !== b.priority) return b.priority - a.priority;
    // proposal order ascending index
    const ia = getProposalOrder(a.type);
    const ib = getProposalOrder(b.type);
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
