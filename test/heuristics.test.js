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

describe('Governance Heuristics', () => {
  describe('evaluateMissionAcceptance', () => {
    it('should return 0 when mission is active', () => {
      const snapshot = {
        mission: { id: 'active-mission' }
      };
      const profile = {
        traits: { authority: 0.8, pragmatism: 0.8 }
      };
      
      assert.strictEqual(evaluateMissionAcceptance(snapshot, profile), 0);
    });
    
    it('should return positive score when no mission and traits are high', () => {
      const snapshot = {
        mission: null
      };
      const profile = {
        traits: { authority: 0.9, pragmatism: 0.8 }
      };
      
      const score = evaluateMissionAcceptance(snapshot, profile);
      assert(score > 0);
    });
    
    it('should scale with authority and pragmatism traits', () => {
      const snapshot = { mission: null };
      
      const authoritative = { traits: { authority: 0.9, pragmatism: 0.7 } };
      const timid = { traits: { authority: 0.2, pragmatism: 0.3 } };
      
      const authScore = evaluateMissionAcceptance(snapshot, authoritative);
      const timidScore = evaluateMissionAcceptance(snapshot, timid);
      
      assert(authScore > timidScore);
    });
  });
  
  describe('evaluateProjectAdvance', () => {
    it('should return 0 when no threat', () => {
      const snapshot = {
        pressure: { threat: 0.1 },
        projects: [{ id: 'p1', name: 'Defense Wall' }]
      };
      const profile = {
        traits: { courage: 0.9 }
      };
      
      assert.strictEqual(evaluateProjectAdvance(snapshot, profile), 0);
    });
    
    it('should return 0 when no active projects', () => {
      const snapshot = {
        pressure: { threat: 0.8 },
        projects: []
      };
      const profile = {
        traits: { courage: 0.9 }
      };
      
      assert.strictEqual(evaluateProjectAdvance(snapshot, profile), 0);
    });
    
    it('should return positive score when threat > 0.3 and projects exist', () => {
      const snapshot = {
        pressure: { threat: 0.5 },
        projects: [{ id: 'p1', name: 'Defense' }]
      };
      const profile = {
        traits: { courage: 0.8 }
      };
      
      const score = evaluateProjectAdvance(snapshot, profile);
      assert(score > 0 && score <= 1);
    });
  });
  
  describe('evaluateSalvagePlan', () => {
    it('should return 0 when strain is low', () => {
      const snapshot = {
        pressure: { scarcity: 0.2, dread: 0.1 }
      };
      const profile = {
        traits: { pragmatism: 0.9 }
      };
      
      assert.strictEqual(evaluateSalvagePlan(snapshot, profile), 0);
    });
    
    it('should return positive score when strain > 0.4', () => {
      const snapshot = {
        pressure: { scarcity: 0.7, dread: 0.5 }
      };
      const profile = {
        traits: { pragmatism: 0.9 }
      };
      
      const score = evaluateSalvagePlan(snapshot, profile);
      assert(score > 0 && score <= 1);
    });
  });
  
  describe('evaluateTownsfolkTalk', () => {
    it('should return 0.5 when hope is low', () => {
      const snapshot = {
        pressure: { hope: 0.4 }
      };
      const profile = {};
      
      assert.strictEqual(evaluateTownsfolkTalk(snapshot, profile), 0.5);
    });
    
    it('should return 0.2 when hope is adequate', () => {
      const snapshot = {
        pressure: { hope: 0.8 }
      };
      const profile = {};
      
      assert.strictEqual(evaluateTownsfolkTalk(snapshot, profile), 0.2);
    });
  });
  
  describe('evaluateGovernanceProposal', () => {
    it('should return a proposal with type and priority', () => {
      const snapshot = {
        mission: null,
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
    });
    
    it('should propose MAYOR_ACCEPT_MISSION for mayor when no mission', () => {
      const snapshot = {
        mission: null,
        pressure: { threat: 0.2, scarcity: 0.2, hope: 0.7, dread: 0.1 },
        projects: []
      };
      const profile = {
        role: 'mayor',
        traits: { authority: 0.9, pragmatism: 0.8, courage: 0.5, prudence: 0.5 }
      };
      
      const result = evaluateGovernanceProposal(snapshot, profile);
      assert.strictEqual(result.type, 'MAYOR_ACCEPT_MISSION');
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
  });
});
