/**
 * Tests for world-core governance heuristics
 */

import assert from 'assert';
import { describe, it } from 'node:test';
import {
  evaluateMissionAcceptance,
  evaluateProjectAdvance,
  evaluateSalvagePlan,
  evaluateTownsfolkTalk,
  evaluateGovernanceProposal
} from '../src/heuristics.js';
import { ProposalType } from '../src/proposalDsl.js';

describe('Governance Heuristics', () => {
  describe('evaluateMissionAcceptance', () => {
    it('should return zero score when mission is active', () => {
      const snapshot = {
        mission: { id: 'active-mission' }
      };
      const profile = {
        traits: { authority: 0.8, pragmatism: 0.8 }
      };
      
      const res = evaluateMissionAcceptance(snapshot, profile);
      assert.strictEqual(res.score, 0);
    });
    
    it('should return positive score when no mission and traits are high', () => {
      const snapshot = {
        mission: null,
        sideQuests: [{ id: 'sq-1', title: 'Quest 1', complexity: 2 }],
        pressure: { hope: 0.7 }
      };
      const profile = {
        traits: { authority: 0.9, pragmatism: 0.8, prudence: 0.6 },
        goals: { acceptMissions: true, growTown: true, maintainMorale: true }
      };
      
      const res = evaluateMissionAcceptance(snapshot, profile);
      assert(res.score > 0);
      assert(Array.isArray(res.reasonTags));
      assert(res.reasonTags.includes('no_active_mission'));
    });
    
    it('should scale with authority and pragmatism traits', () => {
      const snapshot = {
        mission: null,
        sideQuests: [{ id: 'sq-1', title: 'Quest 1', complexity: 2 }],
        pressure: { hope: 0.7 }
      };
      
      const authoritative = {
        traits: { authority: 0.9, pragmatism: 0.7, prudence: 0.4 },
        goals: { acceptMissions: true }
      };
      const timid = {
        traits: { authority: 0.2, pragmatism: 0.3, prudence: 0.8 },
        goals: { acceptMissions: true }
      };
      
      const authScore = evaluateMissionAcceptance(snapshot, authoritative).score;
      const timidScore = evaluateMissionAcceptance(snapshot, timid).score;
      
      assert(authScore > timidScore);
    });

    it('should return zero when no mission is active but no side quests exist', () => {
      const snapshot = { mission: null, sideQuests: [] };
      const profile = {
        traits: { authority: 0.9, pragmatism: 0.8, prudence: 0.6 }
      };

      const res = evaluateMissionAcceptance(snapshot, profile);
      assert.strictEqual(res.score, 0);
    });

    it('should rank missions by trait-fit instead of lowest id', () => {
      const snapshot = {
        mission: null,
        sideQuests: [
          { id: 'sq-alpha', title: 'Gather Wood', complexity: 1 },
          { id: 'sq-zeta', title: 'Explore Bastion', complexity: 8 }
        ],
        pressure: { hope: 0.7 },
        latestNetherEvent: null
      };
      const boldProfile = {
        traits: { authority: 0.95, pragmatism: 0.85, prudence: 0.1 },
        goals: { acceptMissions: true, growTown: true }
      };
      const prudentProfile = {
        traits: { authority: 0.8, pragmatism: 0.8, prudence: 0.95 },
        goals: { acceptMissions: true, maintainMorale: true }
      };

      const boldResult = evaluateMissionAcceptance(snapshot, boldProfile);
      const prudentResult = evaluateMissionAcceptance(snapshot, prudentProfile);

      assert.strictEqual(boldResult.targetId, 'sq-zeta');
      assert.strictEqual(prudentResult.targetId, 'sq-alpha');
    });
  });
  
  describe('evaluateProjectAdvance', () => {
    it('should return zero when no threat', () => {
      const snapshot = {
        pressure: { threat: 0.1 },
        projects: [{ id: 'p1', name: 'Defense Wall', progress: 0.4, status: 'active' }]
      };
      const profile = {
        traits: { courage: 0.9, prudence: 0.5 }
      };
      
      const res = evaluateProjectAdvance(snapshot, profile);
      assert.strictEqual(res.score, 0);
    });
    
    it('should return zero when no actionable projects', () => {
      const snapshot = {
        pressure: { threat: 0.8 },
        projects: [
          { id: 'blocked-wall', name: 'Blocked Wall', progress: 0.9, status: 'blocked' },
          { id: 'done-wall', name: 'Done Wall', progress: 1, status: 'complete' }
        ]
      };
      const profile = {
        traits: { courage: 0.9, prudence: 0.5 }
      };
      
      const res = evaluateProjectAdvance(snapshot, profile);
      assert.strictEqual(res.score, 0);
    });
    
    it('should return positive score when threat > 0.3 and projects exist', () => {
      const snapshot = {
        pressure: { threat: 0.5 },
        projects: [{ id: 'p1', name: 'Defense', progress: 0.4, status: 'active' }]
      };
      const profile = {
        traits: { courage: 0.8, prudence: 0.6 },
        goals: { defendAgainstThreats: true, advanceProjects: true, protectTownspeople: true }
      };
      
      const res = evaluateProjectAdvance(snapshot, profile);
      assert(res.score > 0 && res.score <= 1);
      assert(Array.isArray(res.reasonTags));
      assert(res.reasonTags.includes('project_available'));
      assert(res.targetId === 'p1');
    });

    it('should skip blocked projects and choose the best actionable project', () => {
      const snapshot = {
        pressure: { threat: 0.8 },
        projects: [
          { id: 'alpha-blocked', name: 'Blocked Wall', progress: 0.95, status: 'blocked' },
          { id: 'beta-planning', name: 'Watchtower', progress: 0.2, status: 'planning' },
          { id: 'gamma-active', name: 'Perimeter Wall', progress: 0.6, status: 'active' }
        ]
      };
      const profile = {
        traits: { courage: 0.9, prudence: 0.8 },
        goals: { defendAgainstThreats: true, advanceProjects: true, protectTownspeople: true }
      };

      const res = evaluateProjectAdvance(snapshot, profile);

      assert.strictEqual(res.targetId, 'gamma-active');
      assert(res.reasonTags.includes('blocked_projects_skipped'));
    });

    it('should score nether-event threat deterministically', () => {
      const baseSnapshot = {
        pressure: { threat: 0.55 },
        projects: [{ id: 'wall', name: 'Wall', progress: 0.4, status: 'active' }]
      };
      const profile = {
        traits: { courage: 0.8, prudence: 0.6 },
        goals: { defendAgainstThreats: true, advanceProjects: true, protectTownspeople: true }
      };

      const base = evaluateProjectAdvance(baseSnapshot, profile);
      const eventDriven = evaluateProjectAdvance(
        { ...baseSnapshot, latestNetherEvent: 'piglin_raid_nearby' },
        profile
      );
      const eventDrivenRepeat = evaluateProjectAdvance(
        { ...baseSnapshot, latestNetherEvent: 'piglin_raid_nearby' },
        profile
      );

      assert(eventDriven.score > base.score);
      assert.strictEqual(eventDriven.score, eventDrivenRepeat.score);
      assert(eventDriven.reasonTags.includes('nether_event_pressure'));
    });
  });
  
  describe('evaluateSalvagePlan', () => {
    it('should return zero when strain is low', () => {
      const snapshot = {
        pressure: { scarcity: 0.2, dread: 0.1, hope: 0.8 }
      };
      const profile = {
        traits: { pragmatism: 0.9, prudence: 0.8 }
      };
      
      const res = evaluateSalvagePlan(snapshot, profile);
      assert.strictEqual(res.score, 0);
    });
    
    it('should return positive score when strain > 0.4', () => {
      const snapshot = {
        pressure: { scarcity: 0.7, dread: 0.5, hope: 0.4 }
      };
      const profile = {
        traits: { pragmatism: 0.9, prudence: 0.8 },
        goals: { reducePressure: true, salvageResources: true, maintainSurplus: true }
      };
      
      const res = evaluateSalvagePlan(snapshot, profile);
      assert(res.score > 0 && res.score <= 1);
      assert(Array.isArray(res.reasonTags));
      assert(res.reasonTags.includes('high_strain'));
      assert(res.targetId === 'scarcity' || res.targetId === 'dread');
    });

    it('should use mission reward and goals to adjust salvage focus deterministically', () => {
      const snapshot = {
        mission: { id: 'resource-hunt', title: 'Resource Hunt', reward: 180 },
        pressure: { scarcity: 0.75, dread: 0.45, hope: 0.35 },
        latestNetherEvent: 'piglin_raid_nearby'
      };
      const surplusProfile = {
        traits: { pragmatism: 0.9, prudence: 0.95 },
        goals: { reducePressure: false, salvageResources: true, maintainSurplus: true }
      };
      const pressureProfile = {
        traits: { pragmatism: 0.9, prudence: 0.95 },
        goals: { reducePressure: true, salvageResources: false, maintainSurplus: false }
      };

      const surplusResult = evaluateSalvagePlan(snapshot, surplusProfile);
      const pressureResult = evaluateSalvagePlan(snapshot, pressureProfile);
      const pressureRepeat = evaluateSalvagePlan(snapshot, pressureProfile);

      assert.strictEqual(surplusResult.targetId, 'scarcity');
      assert.strictEqual(pressureResult.targetId, 'dread');
      assert.strictEqual(pressureResult.score, pressureRepeat.score);
      assert(pressureResult.reasonTags.includes('nether_event_pressure'));
      assert(pressureResult.reasonTags.includes('mission_relief_expected'));
    });
  });
  
  describe('evaluateTownsfolkTalk', () => {
    it('should return 0.5 when hope is low', () => {
      const snapshot = {
        pressure: { hope: 0.4 }
      };
      const profile = {};
      
      const res = evaluateTownsfolkTalk(snapshot, profile);
      assert.strictEqual(res.score, 0.5);
      assert(Array.isArray(res.reasonTags));
      assert(res.reasonTags.includes('low_hope'));
      assert(res.targetId === 'morale-boost');
    });
    
    it('should return 0.2 when hope is adequate', () => {
      const snapshot = {
        pressure: { hope: 0.8 }
      };
      const profile = {};
      
      const res = evaluateTownsfolkTalk(snapshot, profile);
      assert.strictEqual(res.score, 0.2);
      assert(res.targetId === 'casual');
    });
  });
  
  describe('evaluateGovernanceProposal', () => {
    it('should return a proposal object with required fields', () => {
      const snapshot = {
        mission: null,
        sideQuests: [{ id: 'sq-1', title: 'Quest 1' }],
        pressure: { threat: 0.2, scarcity: 0.2, hope: 0.7, dread: 0.1 },
        projects: []
      };
      const profile = {
        role: 'mayor',
        traits: { authority: 0.8, pragmatism: 0.8, courage: 0.5, prudence: 0.5 }
      };
      
      const result = evaluateGovernanceProposal(snapshot, profile);
      assert(result.type);
      assert(typeof result.priority === 'number');
      assert(result.priority >= 0 && result.priority <= 1);
      assert(Array.isArray(result.reasonTags));
    });
    
    it('should propose MAYOR_ACCEPT_MISSION for mayor when no mission', () => {
      const snapshot = {
        mission: null,
        sideQuests: [{ id: 'sq-1', title: 'Quest 1', complexity: 2 }],
        pressure: { threat: 0.2, scarcity: 0.2, hope: 0.7, dread: 0.1 },
        projects: []
      };
      const profile = {
        role: 'mayor',
        traits: { authority: 0.9, pragmatism: 0.8, courage: 0.5, prudence: 0.5 },
        goals: { acceptMissions: true }
      };
      
      const result = evaluateGovernanceProposal(snapshot, profile);
      assert.strictEqual(result.type, ProposalType.MAYOR_ACCEPT_MISSION);
    });
    
    it('should propose PROJECT_ADVANCE for captain when threat is high', () => {
      const snapshot = {
        mission: null,
        pressure: { threat: 0.7, scarcity: 0.2, hope: 0.7, dread: 0.1 },
        projects: [{ id: 'defense', name: 'Defense Wall', progress: 0.5, status: 'active' }]
      };
      const profile = {
        role: 'captain',
        traits: { authority: 0.5, pragmatism: 0.5, courage: 0.9, prudence: 0.5 },
        goals: { defendAgainstThreats: true, advanceProjects: true, protectTownspeople: true }
      };
      
      const result = evaluateGovernanceProposal(snapshot, profile);
      assert.strictEqual(result.type, 'PROJECT_ADVANCE');
    });
    
    it('should propose SALVAGE_PLAN for warden when strain is high', () => {
      const snapshot = {
        mission: null,
        pressure: { threat: 0.2, scarcity: 0.8, hope: 0.3, dread: 0.7 },
        projects: []
      };
      const profile = {
        role: 'warden',
        traits: { authority: 0.5, pragmatism: 0.9, courage: 0.5, prudence: 0.9 },
        goals: { reducePressure: true, salvageResources: true, maintainSurplus: true }
      };
      
      const result = evaluateGovernanceProposal(snapshot, profile);
      assert.strictEqual(result.type, 'SALVAGE_PLAN');
    });
    
    it('should always return a proposal (fallback to TOWNSFOLK_TALK)', () => {
      const snapshot = {
        mission: { id: 'active' },
        pressure: { threat: 0.1, scarcity: 0.1, hope: 0.9, dread: 0.1 },
        projects: []
      };
      const profile = {
        role: 'unknown',
        traits: { authority: 0.5, pragmatism: 0.5, courage: 0.5, prudence: 0.5 }
      };
      
      const result = evaluateGovernanceProposal(snapshot, profile);
      assert(result.type);
      assert(result.priority >= 0 && result.priority <= 1);
    });

    it('should penalize repeated type in memory', () => {
      const snapshot = { mission: null, sideQuests: [{ id: 'sq-1', title: 'Quest 1', complexity: 2 }], pressure: { threat: 0, scarcity: 0, hope: 0.5, dread: 0 }, projects: [] };
      const profile = {
        role: 'mayor',
        traits: { authority: 0.5, pragmatism: 1, courage: 0, prudence: 0 },
        goals: { acceptMissions: true }
      };
      const base = evaluateGovernanceProposal(snapshot, profile);
      // Pass memory matching the proposal we got
      const mem = { lastType: base.type, lastTarget: base.targetId, repeatCount: 3 };
      const penalized = evaluateGovernanceProposal(snapshot, profile, mem);
      // Same type with repeat memory should have lower priority
      assert(penalized.priority <= base.priority);
    });

    it('should respect tie-breaker ordering when priorities equal', () => {
      const snapshot = { mission: null, sideQuests: [{ id: 'sq-1', title: 'Quest 1', complexity: 2 }], pressure: { threat: 0, scarcity: 0, hope: 0.5, dread: 0 }, projects: [] };
      const profile = {
        role: 'mayor',
        traits: { authority: 0.5, pragmatism: 1, courage: 0, prudence: 0 },
        goals: { acceptMissions: true }
      };
      const result = evaluateGovernanceProposal(snapshot, profile);
      assert.strictEqual(result.type, ProposalType.MAYOR_ACCEPT_MISSION);
    });
  });
});
