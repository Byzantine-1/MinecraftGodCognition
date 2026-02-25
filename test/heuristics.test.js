/**
 * Tests for heuristics module
 */

import assert from 'assert';
import { describe, it } from 'node:test';
import {
  evaluateHungerNeed,
  evaluateRestNeed,
  evaluateDanger,
  evaluateMineOpportunity,
  calculateActionPriority
} from '../src/heuristics.js';

describe('Heuristics', () => {
  describe('evaluateHungerNeed', () => {
    it('should return 0 when hunger is full (8+)', () => {
      assert.strictEqual(evaluateHungerNeed(10), 0);
      assert.strictEqual(evaluateHungerNeed(8), 0);
    });
    
    it('should return increasing scores as hunger drops', () => {
      assert(evaluateHungerNeed(6) > 0);
      assert(evaluateHungerNeed(3) > evaluateHungerNeed(6));
      assert(evaluateHungerNeed(0) === 1);
    });
  });
  
  describe('evaluateRestNeed', () => {
    it('should return 0 when health is full (18+)', () => {
      assert.strictEqual(evaluateRestNeed(20), 0);
      assert.strictEqual(evaluateRestNeed(18), 0);
    });
    
    it('should return increasing scores as health drops', () => {
      assert(evaluateRestNeed(15) > 0);
      assert(evaluateRestNeed(10) > evaluateRestNeed(15));
      assert(evaluateRestNeed(1) === 1);
    });
  });
  
  describe('evaluateDanger', () => {
    it('should return 0 when no threats nearby', () => {
      const nearby = [
        { type: 'sheep', distance: 5 },
        { type: 'cow', distance: 10 }
      ];
      assert.strictEqual(evaluateDanger(nearby), 0);
    });
    
    it('should return high score for nearby threats', () => {
      const nearby = [
        { type: 'zombie', distance: 3 }
      ];
      assert.strictEqual(evaluateDanger(nearby), 1);
    });
    
    it('should scale danger by distance', () => {
      const close = evaluateDanger([{ type: 'creeper', distance: 3 }]);
      const far = evaluateDanger([{ type: 'creeper', distance: 20 }]);
      assert(close > far);
    });
  });
  
  describe('evaluateMineOpportunity', () => {
    it('should return 0 when danger is high', () => {
      const nearby = [{ type: 'skeleton', distance: 2 }];
      assert.strictEqual(evaluateMineOpportunity(15, nearby), 0);
    });
    
    it('should return low score when light is dim', () => {
      const score = evaluateMineOpportunity(5, []);
      assert(score > 0 && score < 0.5);
    });
    
    it('should return high score with good light and no danger', () => {
      const score = evaluateMineOpportunity(14, []);
      assert(score > 0.7);
    });
  });
  
  describe('calculateActionPriority', () => {
    const baseSnapshot = {
      agent: { id: 'test', health: 20, hunger: 10 },
      nearby: [],
      environment: { light: 15 }
    };
    
    const baseProfile = {
      traits: {
        efficiency: 0.5,
        caution: 0.5,
        curiosity: 0.5
      }
    };
    
    it('should calculate eat priority based on hunger', () => {
      const hungry = { ...baseSnapshot, agent: { ...baseSnapshot.agent, hunger: 2 } };
      const priority = calculateActionPriority(hungry, baseProfile, 'eat');
      assert(priority > 0);
    });
    
    it('should increase caution-based rest priority with low health', () => {
      const injured = { ...baseSnapshot, agent: { ...baseSnapshot.agent, health: 5 } };
      const priority = calculateActionPriority(injured, baseProfile, 'rest');
      assert(priority > 0);
    });
    
    it('should return valid priority scores [0, 1]', () => {
      for (const action of ['eat', 'rest', 'mine', 'move']) {
        const priority = calculateActionPriority(baseSnapshot, baseProfile, action);
        assert(priority >= 0 && priority <= 1);
      }
    });
  });
});
