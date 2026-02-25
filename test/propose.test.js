/**
 * Tests for propose module
 */

import assert from 'assert';
import { describe, it } from 'node:test';
import { propose } from '../src/propose.js';
import { createDefaultSnapshot } from '../src/snapshotSchema.js';
import { defaultProfile, minerProfile } from '../src/agentProfiles.js';
import { ProposalType } from '../src/proposalDsl.js';

describe('Propose', () => {
  describe('propose()', () => {
    it('should return a valid proposal', () => {
      const snapshot = createDefaultSnapshot();
      const proposal = propose(snapshot, defaultProfile);
      
      assert(proposal.type);
      assert(typeof proposal.confidence === 'number');
      assert(proposal.confidence >= 0 && proposal.confidence <= 1);
      assert(typeof proposal.difficulty === 'number');
      assert(proposal.params);
      assert(proposal.rationale);
    });
    
    it('should throw on missing snapshot', () => {
      assert.throws(() => propose(null, defaultProfile), /Snapshot and profile are required/);
    });
    
    it('should throw on missing profile', () => {
      const snapshot = createDefaultSnapshot();
      assert.throws(() => propose(snapshot, null), /Snapshot and profile are required/);
    });
    
    it('should propose EAT when hungry', () => {
      const snapshot = createDefaultSnapshot();
      snapshot.agent.hunger = 2;
      
      const proposal = propose(snapshot, defaultProfile);
      assert.strictEqual(proposal.type, ProposalType.EAT);
    });
    
    it('should propose REST when injured and safe', () => {
      const snapshot = createDefaultSnapshot();
      snapshot.agent.health = 5;
      snapshot.nearby = [];
      
      const proposal = propose(snapshot, defaultProfile);
      assert.strictEqual(proposal.type, ProposalType.REST);
    });
    
    it('should propose MOVE when in danger', () => {
      const snapshot = createDefaultSnapshot();
      snapshot.nearby = [
        { type: 'zombie', distance: 4, health: 20 }
      ];
      
      const proposal = propose(snapshot, defaultProfile);
      assert.strictEqual(proposal.type, ProposalType.MOVE);
    });
    
    it('should respect agent capabilities', () => {
      const snapshot = createDefaultSnapshot();
      const noCraftProfile = { ...defaultProfile, capabilities: { ...defaultProfile.capabilities, canMine: false } };
      
      const proposal = propose(snapshot, noCraftProfile);
      assert.notStrictEqual(proposal.type, ProposalType.MINE);
    });
    
    it('should factor in profile traits', () => {
      const snapshot = createDefaultSnapshot();
      
      const cautious = { ...defaultProfile, traits: { ...defaultProfile.traits, caution: 0.9 } };
      const adventurous = { ...defaultProfile, traits: { ...defaultProfile.traits, caution: 0.1 } };
      
      const proposal1 = propose(snapshot, cautious);
      const proposal2 = propose(snapshot, adventurous);
      
      // Both should be valid
      assert(proposal1.type);
      assert(proposal2.type);
    });
    
    it('should always select exactly one action', () => {
      const snapshot = createDefaultSnapshot();
      snapshot.agent.hunger = 5;
      snapshot.agent.health = 10;
      snapshot.nearby = [{ type: 'zombie', distance: 3 }];
      
      const proposal = propose(snapshot, defaultProfile);
      assert(Object.values(ProposalType).includes(proposal.type));
    });
    
    it('should produce deterministic output for same input', () => {
      const snapshot = createDefaultSnapshot();
      snapshot.agent.hunger = 4;
      
      const proposal1 = propose(snapshot, minerProfile);
      const proposal2 = propose(snapshot, minerProfile);
      
      assert.strictEqual(proposal1.type, proposal2.type);
      assert.strictEqual(proposal1.confidence, proposal2.confidence);
      assert.strictEqual(proposal1.rationale, proposal2.rationale);
    });
  });
});
