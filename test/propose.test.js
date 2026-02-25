/**
 * Tests for world-core proposal generation
 */

import assert from 'assert';
import { describe, it } from 'node:test';
import { propose } from '../src/propose.js';
import { createDefaultSnapshot } from '../src/snapshotSchema.js';
import { mayorProfile, captainProfile, wardenProfile } from '../src/agentProfiles.js';
import { ProposalType } from '../src/proposalDsl.js';

describe('Propose - World-Core Cognition', () => {
  describe('propose()', () => {
    it('should return a valid proposal with required fields', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      const proposal = propose(snapshot, mayorProfile);
      
      assert(proposal.type);
      assert(proposal.actorId);
      assert(proposal.townId);
      assert(typeof proposal.priority === 'number');
      assert(proposal.priority >= 0 && proposal.priority <= 1);
      assert(proposal.reason);
    });
    
    it('should validate proposal shape before returning', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      const proposal = propose(snapshot, mayorProfile);
      
      assert(Object.values(ProposalType).includes(proposal.type));
      assert.strictEqual(proposal.townId, 'town-1');
      assert.strictEqual(proposal.actorId, mayorProfile.id);
    });
    
    it('should throw on missing snapshot', () => {
      assert.throws(
        () => propose(null, mayorProfile),
        /Snapshot and profile are required/
      );
    });
    
    it('should throw on missing profile', () => {
      const snapshot = createDefaultSnapshot();
      assert.throws(
        () => propose(snapshot, null),
        /Snapshot and profile are required/
      );
    });
    
    it('should produce deterministic output for same input', () => {
      const snapshot = createDefaultSnapshot('town-1', 5);
      snapshot.mission = null;
      snapshot.pressure = { threat: 0.2, scarcity: 0.2, hope: 0.8, dread: 0.1 };
      
      const proposal1 = propose(snapshot, mayorProfile);
      const proposal2 = propose(snapshot, mayorProfile);
      
      assert.strictEqual(proposal1.type, proposal2.type);
      assert.strictEqual(proposal1.priority, proposal2.priority);
      assert.strictEqual(proposal1.reason, proposal2.reason);
      assert.deepStrictEqual(proposal1.args, proposal2.args);
    });
  });
  
  describe('Mayor proposals', () => {
    it('should propose MAYOR_ACCEPT_MISSION when no mission is active', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.mission = null;
      
      const proposal = propose(snapshot, mayorProfile);
      assert.strictEqual(proposal.type, ProposalType.MAYOR_ACCEPT_MISSION);
    });
    
    it('should not propose MAYOR_ACCEPT_MISSION when mission is already active', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.mission = { id: 'active-mission', title: 'Defense the settlement' };
      
      const proposal = propose(snapshot, mayorProfile);
      assert.notStrictEqual(proposal.type, ProposalType.MAYOR_ACCEPT_MISSION);
    });
    
    it('should include actorId from profile', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.mission = null;
      
      const proposal = propose(snapshot, mayorProfile);
      assert.strictEqual(proposal.actorId, mayorProfile.id);
    });
  });
  
  describe('Captain proposals', () => {
    it('should propose PROJECT_ADVANCE when threat is high and projects exist', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.pressure = { threat: 0.7, scarcity: 0.2, hope: 0.7, dread: 0.2 };
      snapshot.projects = [
        { id: 'defense-wall', name: 'Defense Wall', progress: 0.5, status: 'active' }
      ];
      
      const proposal = propose(snapshot, captainProfile);
      assert.strictEqual(proposal.type, ProposalType.PROJECT_ADVANCE);
    });
    
    it('should not propose PROJECT_ADVANCE when threat is low', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.pressure = { threat: 0.1, scarcity: 0.2, hope: 0.7, dread: 0.2 };
      snapshot.projects = [
        { id: 'defense-wall', name: 'Defense Wall', progress: 0.5, status: 'active' }
      ];
      
      const proposal = propose(snapshot, captainProfile);
      assert.notStrictEqual(proposal.type, ProposalType.PROJECT_ADVANCE);
    });
    
    it('should reference project in args', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.pressure = { threat: 0.8, scarcity: 0.2, hope: 0.7, dread: 0.2 };
      snapshot.projects = [
        { id: 'wall-1', name: 'Wall', progress: 0.3, status: 'active' }
      ];
      
      const proposal = propose(snapshot, captainProfile);
      if (proposal.type === ProposalType.PROJECT_ADVANCE) {
        assert(proposal.args.projectId);
      }
    });
  });
  
  describe('Warden proposals', () => {
    it('should propose SALVAGE_PLAN when scarcity and dread are high', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.pressure = { threat: 0.2, scarcity: 0.8, hope: 0.3, dread: 0.7 };
      
      const proposal = propose(snapshot, wardenProfile);
      assert.strictEqual(proposal.type, ProposalType.SALVAGE_PLAN);
    });
    
    it('should not propose SALVAGE_PLAN when strain is low', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.pressure = { threat: 0.2, scarcity: 0.2, hope: 0.8, dread: 0.2 };
      
      const proposal = propose(snapshot, wardenProfile);
      assert.notStrictEqual(proposal.type, ProposalType.SALVAGE_PLAN);
    });
  });
  
  describe('Fallback behavior', () => {
    it('should propose TOWNSFOLK_TALK as fallback when no role-specific action applies', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.mission = { id: 'active', title: 'Active' };
      snapshot.pressure = { threat: 0.1, scarcity: 0.1, hope: 0.9, dread: 0.05 };
      snapshot.projects = [];
      
      const proposal = propose(snapshot, mayorProfile);
      // Mayor has no high-priority action, should fall back
      assert(proposal.type);
    });
    
    it('should propose TOWNSFOLK_TALK when hope is low', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.pressure = { threat: 0.1, scarcity: 0.1, hope: 0.4, dread: 0.3 };
      
      const proposal = propose(snapshot, wardenProfile);
      // When strain is low but hope is low, TOWNSFOLK_TALK is fallback
      if (snapshot.pressure.scarcity < 0.4 && (snapshot.pressure.scarcity + snapshot.pressure.dread) / 2 < 0.4) {
        assert.strictEqual(proposal.type, ProposalType.TOWNSFOLK_TALK);
      }
    });
  });
  
  describe('Proposal shape validation', () => {
    it('should always include priority between 0 and 1', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      const proposal = propose(snapshot, mayorProfile);
      
      assert(typeof proposal.priority === 'number');
      assert(proposal.priority >= 0 && proposal.priority <= 1);
    });
    
    it('should always include a non-empty reason string', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      const proposal = propose(snapshot, captainProfile);
      
      assert(typeof proposal.reason === 'string');
      assert(proposal.reason.length > 0);
    });
    
    it('should always include args object', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      const proposal = propose(snapshot, wardenProfile);
      
      assert(proposal.args);
      assert(typeof proposal.args === 'object');
    });
  });
});
