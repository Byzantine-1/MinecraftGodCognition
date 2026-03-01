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
        sideQuests: [{ id: 'sq-1', title: 'Quest 1' }]
      };
      const profile = {
        traits: { authority: 0.9, pragmatism: 0.8 }
      };
      
      const res = evaluateMissionAcceptance(snapshot, profile);
      assert(res.score > 0);
      assert(Array.isArray(res.reasonTags));
      assert(res.reasonTags.includes('no_active_mission'));
    });
    
    it('should scale with authority and pragmatism traits', () => {
      const snapshot = { mission: null, sideQuests: [{ id: 'sq-1', title: 'Quest 1' }] };
      
      const authoritative = { traits: { authority: 0.9, pragmatism: 0.7 } };
      const timid = { traits: { authority: 0.2, pragmatism: 0.3 } };
      
      const authScore = evaluateMissionAcceptance(snapshot, authoritative).score;
      const timidScore = evaluateMissionAcceptance(snapshot, timid).score;
      
      assert(authScore > timidScore);
    });

    it('should return zero when no mission is active but no side quests exist', () => {
      const snapshot = { mission: null, sideQuests: [] };
      const profile = {
        traits: { authority: 0.9, pragmatism: 0.8 }
      };

      const res = evaluateMissionAcceptance(snapshot, profile);
      assert.strictEqual(res.score, 0);
    });
  });
  
  describe('evaluateProjectAdvance', () => {
    it('should return zero when no threat', () => {
      const snapshot = {
        pressure: { threat: 0.1 },
        projects: [{ id: 'p1', name: 'Defense Wall' }]
      };
      const profile = {
        traits: { courage: 0.9 }
      };
      
      const res = evaluateProjectAdvance(snapshot, profile);
      assert.strictEqual(res.score, 0);
    });
    
    it('should return zero when no active projects', () => {
      const snapshot = {
        pressure: { threat: 0.8 },
        projects: []
      };
      const profile = {
        traits: { courage: 0.9 }
      };
      
      const res = evaluateProjectAdvance(snapshot, profile);
      assert.strictEqual(res.score, 0);
    });
    
    it('should return positive score when threat > 0.3 and projects exist', () => {
      const snapshot = {
        pressure: { threat: 0.5 },
        projects: [{ id: 'p1', name: 'Defense' }]
      };
      const profile = {
        traits: { courage: 0.8 }
      };
      
      const res = evaluateProjectAdvance(snapshot, profile);
      assert(res.score > 0 && res.score <= 1);
      assert(Array.isArray(res.reasonTags));
      assert(res.reasonTags.includes('project_available'));
      assert(res.targetId === 'p1');
    });
  });
  
  describe('evaluateSalvagePlan', () => {
    it('should return zero when strain is low', () => {
      const snapshot = {
        pressure: { scarcity: 0.2, dread: 0.1 }
      };
      const profile = {
        traits: { pragmatism: 0.9 }
      };
      
      const res = evaluateSalvagePlan(snapshot, profile);
      assert.strictEqual(res.score, 0);
    });
    
    it('should return positive score when strain > 0.4', () => {
      const snapshot = {
        pressure: { scarcity: 0.7, dread: 0.5 }
      };
      const profile = {
        traits: { pragmatism: 0.9 }
      };
      
      const res = evaluateSalvagePlan(snapshot, profile);
      assert(res.score > 0 && res.score <= 1);
      assert(Array.isArray(res.reasonTags));
      assert(res.reasonTags.includes('high_strain'));
      assert(res.targetId === 'scarcity' || res.targetId === 'dread');
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
        sideQuests: [{ id: 'sq-1', title: 'Quest 1' }],
        pressure: { threat: 0.2, scarcity: 0.2, hope: 0.7, dread: 0.1 },
        projects: []
      };
      const profile = {
        role: 'mayor',
        traits: { authority: 0.9, pragmatism: 0.8, courage: 0.5, prudence: 0.5 }
      };
      
      const result = evaluateGovernanceProposal(snapshot, profile);
      assert.strictEqual(result.type, ProposalType.MAYOR_ACCEPT_MISSION);
    });
    
    it('should propose PROJECT_ADVANCE for captain when threat is high', () => {
      const snapshot = {
        mission: null,
        pressure: { threat: 0.7, scarcity: 0.2, hope: 0.7, dread: 0.1 },
        projects: [{ id: 'defense', name: 'Defense Wall' }]
      };
      const profile = {
        role: 'captain',
        traits: { authority: 0.5, pragmatism: 0.5, courage: 0.9, prudence: 0.5 }
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
        traits: { authority: 0.5, pragmatism: 0.9, courage: 0.5, prudence: 0.9 }
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
      const snapshot = { mission: null, sideQuests: [{ id: 'sq-1', title: 'Quest 1' }], pressure: { threat: 0, scarcity: 0, hope: 0.5, dread: 0 }, projects: [] };
      const profile = { role: 'mayor', traits: { authority: 0.5, pragmatism: 1, courage: 0, prudence: 0 } };
      const base = evaluateGovernanceProposal(snapshot, profile);
      // Pass memory matching the proposal we got
      const mem = { lastType: base.type, lastTarget: base.targetId, repeatCount: 3 };
      const penalized = evaluateGovernanceProposal(snapshot, profile, mem);
      // Same type with repeat memory should have lower priority
      assert(penalized.priority <= base.priority);
    });

    it('should respect tie-breaker ordering when priorities equal', () => {
      const snapshot = { mission: null, sideQuests: [{ id: 'sq-1', title: 'Quest 1' }], pressure: { threat: 0, scarcity: 0, hope: 0.5, dread: 0 }, projects: [] };
      const profile = { role: 'mayor', traits: { authority: 0.5, pragmatism: 1, courage: 0, prudence: 0 } };
      // mission and talk both score 0.5
      const result = evaluateGovernanceProposal(snapshot, profile);
      assert.strictEqual(result.type, ProposalType.MAYOR_ACCEPT_MISSION);
    });
  });
});
