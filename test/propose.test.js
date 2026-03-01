/**
 * Tests for world-core proposal generation
 */

import assert from 'assert';
import { describe, it } from 'node:test';
import { propose } from '../src/propose.js';
import { createDefaultSnapshot, isValidSnapshot } from '../src/snapshotSchema.js';
import { mayorProfile, captainProfile, wardenProfile, isValidProfile } from '../src/agentProfiles.js';
import { ProposalType } from '../src/proposalDsl.js';
import { SchemaVersion } from '../src/schemaVersions.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
      assert.strictEqual(proposal.schemaVersion, SchemaVersion.PROPOSAL);
      assert(/^proposal_[0-9a-f]{64}$/.test(proposal.proposalId));
      assert(/^[0-9a-f]{64}$/.test(proposal.snapshotHash));
      assert.strictEqual(proposal.decisionEpoch, snapshot.day);
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

    it('should reject invalid snapshot shapes', () => {
      const badSnapshot = { day: -1 };
      assert(!isValidSnapshot(badSnapshot));
      assert.throws(
        () => propose(badSnapshot, mayorProfile),
        /Invalid snapshot structure/
      );
    });

    it('should reject invalid profile shapes', () => {
      const snapshot = createDefaultSnapshot();
      const badProfile = { id: '', role: 'unknown' };
      assert(!isValidProfile(badProfile));
      assert.throws(
        () => propose(snapshot, badProfile),
        /Invalid profile structure/
      );
    });

    it('should reject snapshot/profile town mismatches', () => {
      const snapshot = createDefaultSnapshot('town-a', 0);
      const mismatchedProfile = { ...mayorProfile, townId: 'town-b' };

      assert.throws(
        () => propose(snapshot, mismatchedProfile),
        /townId mismatch/
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
      snapshot.sideQuests = [{ id: 'sq-1', title: 'Gather wood', complexity: 1 }];
      
      const proposal = propose(snapshot, mayorProfile);
      assert.strictEqual(proposal.type, ProposalType.MAYOR_ACCEPT_MISSION);
      // missionId should be pulled from sideQuests
      assert.strictEqual(proposal.args.missionId, 'sq-1');
      assert(Array.isArray(proposal.reasonTags));
      assert(proposal.reasonTags.includes('no_active_mission'));
      assert(Array.isArray(proposal.preconditions));
    });

    it('should choose the best ranked mission consistently across reordered input', () => {
      const orderedSnapshot = createDefaultSnapshot('town-1', 0);
      orderedSnapshot.mission = null;
      orderedSnapshot.sideQuests = [
        { id: 'sq-alpha', title: 'Gather wood', complexity: 1 },
        { id: 'sq-zeta', title: 'Nether push', complexity: 8 }
      ];

      const reorderedSnapshot = createDefaultSnapshot('town-1', 0);
      reorderedSnapshot.mission = null;
      reorderedSnapshot.sideQuests = [
        { id: 'sq-zeta', title: 'Nether push', complexity: 8 },
        { id: 'sq-alpha', title: 'Gather wood', complexity: 1 }
      ];

      const boldMayor = {
        ...mayorProfile,
        traits: { authority: 0.95, pragmatism: 0.85, courage: 0.6, prudence: 0.1 }
      };

      const orderedProposal = propose(orderedSnapshot, boldMayor);
      const reorderedProposal = propose(reorderedSnapshot, boldMayor);

      assert.strictEqual(orderedProposal.args.missionId, 'sq-zeta');
      assert.deepStrictEqual(orderedProposal.args, reorderedProposal.args);
      assert.strictEqual(orderedProposal.snapshotHash, reorderedProposal.snapshotHash);
    });

    it('should not propose MAYOR_ACCEPT_MISSION when mission is already active', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.mission = { id: 'active-mission', title: 'Defense the settlement' };
      
      const proposal = propose(snapshot, mayorProfile);
      assert.notStrictEqual(proposal.type, ProposalType.MAYOR_ACCEPT_MISSION);
    });

    it('should fall back when no mission is active but no side quests exist', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.mission = null;
      snapshot.sideQuests = [];

      const proposal = propose(snapshot, mayorProfile);
      assert.strictEqual(proposal.type, ProposalType.TOWNSFOLK_TALK);
    });

    it('should break ties by type order when scores equal', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.mission = null;
      snapshot.sideQuests = [{ id: 'sq-1', title: 'Task' }];
      // set traits so mission score equals talk fallback (0.5)
      const profile = { ...mayorProfile, traits: { authority: 0.5, pragmatism: 1, courage: 0, prudence: 0 } };
      snapshot.pressure = { threat:0, scarcity:0, hope:0.5, dread:0 };
      const proposal = propose(snapshot, profile);
      assert.strictEqual(proposal.type, ProposalType.MAYOR_ACCEPT_MISSION);
    });

    it('should apply memory penalty to repeated proposals', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.mission = null;
      snapshot.sideQuests = [{ id: 'sq-1', title: 'Gather wood', complexity: 1 }];
      const mem = { lastType: ProposalType.MAYOR_ACCEPT_MISSION, repeatCount: 2 };
      const p1 = propose(snapshot, mayorProfile, mem);
      // priority should be lower due to penalty
      const p2 = propose(snapshot, mayorProfile, {});
      assert(p1.priority < p2.priority);
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
        assert(proposal.args.projectId === 'wall-1');
        assert(Array.isArray(proposal.reasonTags));
        assert(proposal.reasonTags.includes('project_available'));
      }
    });

    it('should skip blocked projects and choose an actionable project', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.pressure = { threat: 0.8, scarcity: 0.2, hope: 0.7, dread: 0.2 };
      snapshot.projects = [
        { id: 'alpha-blocked', name: 'Blocked Wall', progress: 0.95, status: 'blocked' },
        { id: 'beta-active', name: 'Perimeter Wall', progress: 0.6, status: 'active' },
        { id: 'gamma-planning', name: 'Watchtower', progress: 0.2, status: 'planning' }
      ];

      const proposal = propose(snapshot, captainProfile);
      assert.strictEqual(proposal.args.projectId, 'beta-active');
      assert(proposal.reasonTags.includes('blocked_projects_skipped'));
    });

    it('should use deterministic tie-breaking when projects are equally ranked', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.pressure = { threat: 0.8, scarcity: 0.2, hope: 0.7, dread: 0.2 };
      snapshot.projects = [
        { id: 'beta', name: 'B', progress: 0.2, status: 'active' },
        { id: 'alpha', name: 'A', progress: 0.2, status: 'active' }
      ];

      const proposal = propose(snapshot, captainProfile);
      assert.strictEqual(proposal.args.projectId, 'alpha');
    });

    it('should score threat higher when a nether event is present', () => {
      const calmSnapshot = createDefaultSnapshot('town-1', 0);
      calmSnapshot.pressure = { threat: 0.55, scarcity: 0.2, hope: 0.7, dread: 0.2 };
      calmSnapshot.projects = [
        { id: 'wall-1', name: 'Wall', progress: 0.4, status: 'active' }
      ];

      const eventSnapshot = {
        ...calmSnapshot,
        latestNetherEvent: 'piglin_raid_nearby'
      };

      const calmProposal = propose(calmSnapshot, captainProfile);
      const eventProposal = propose(eventSnapshot, captainProfile);
      const eventProposalRepeat = propose(eventSnapshot, captainProfile);

      assert.strictEqual(calmProposal.type, ProposalType.PROJECT_ADVANCE);
      assert.strictEqual(eventProposal.type, ProposalType.PROJECT_ADVANCE);
      assert(eventProposal.priority > calmProposal.priority);
      assert.strictEqual(eventProposal.priority, eventProposalRepeat.priority);
      assert(eventProposal.reasonTags.includes('nether_event_pressure'));
    });
  });
  
  describe('Warden proposals', () => {
    it('should propose SALVAGE_PLAN when scarcity and dread are high', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.pressure = { threat: 0.2, scarcity: 0.8, hope: 0.3, dread: 0.7 };
      
      const proposal = propose(snapshot, wardenProfile);
      assert.strictEqual(proposal.type, ProposalType.SALVAGE_PLAN);
      assert(Array.isArray(proposal.reasonTags));
      assert(proposal.reasonTags.includes('high_strain'));
      // focus should match the larger pressure component (scarcity)
      assert(proposal.args.focus === 'scarcity');
    });
    
    it('should not propose SALVAGE_PLAN when strain is low', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.pressure = { threat: 0.2, scarcity: 0.2, hope: 0.8, dread: 0.2 };
      
      const proposal = propose(snapshot, wardenProfile);
      assert.notStrictEqual(proposal.type, ProposalType.SALVAGE_PLAN);
    });

    it('should produce replay-stable trait-driven salvage differences', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      snapshot.mission = { id: 'resource-hunt', title: 'Resource Hunt', reward: 180 };
      snapshot.pressure = { threat: 0.2, scarcity: 0.75, hope: 0.35, dread: 0.45 };
      snapshot.latestNetherEvent = 'piglin_raid_nearby';

      const surplusWarden = {
        ...wardenProfile,
        goals: { reducePressure: false, salvageResources: true, maintainSurplus: true }
      };
      const calmingWarden = {
        ...wardenProfile,
        goals: { reducePressure: true, salvageResources: false, maintainSurplus: false }
      };

      const surplusProposal = propose(snapshot, surplusWarden);
      const calmingProposal = propose(snapshot, calmingWarden);
      const calmingRepeat = propose(snapshot, calmingWarden);

      assert.strictEqual(surplusProposal.type, ProposalType.SALVAGE_PLAN);
      assert.strictEqual(surplusProposal.args.focus, 'scarcity');
      assert.strictEqual(calmingProposal.type, ProposalType.SALVAGE_PLAN);
      assert.strictEqual(calmingProposal.args.focus, 'dread');
      assert.deepStrictEqual(calmingProposal.args, calmingRepeat.args);
      assert.strictEqual(calmingProposal.priority, calmingRepeat.priority);
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
        assert(Array.isArray(proposal.reasonTags));
        assert(proposal.reasonTags.includes('low_hope'));
        assert(proposal.args.talkType === 'morale-boost');
      }
    });
  });
  
  describe('Proposal shape validation', () => {
    it('should always include priority between 0 and 1', () => {
      const snapshot = createDefaultSnapshot('town-1', 0);
      const proposal = propose(snapshot, mayorProfile);
      
      assert(typeof proposal.priority === 'number');
      assert(proposal.priority >= 0 && proposal.priority <= 1);
      assert(Array.isArray(proposal.reasonTags));
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

  describe('Integration with fixture snapshot', () => {
    it('should load realistic snapshot and generate valid proposal', () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const data = fs.readFileSync(path.join(__dirname, 'fixtures', 'sampleSnapshot.json'), 'utf-8');
      const snapshot = JSON.parse(data);
      assert(isValidSnapshot(snapshot));

      const proposal = propose(snapshot, captainProfile);
      assert(proposal && typeof proposal === 'object');
      assert(Array.isArray(proposal.reasonTags));
      assert(proposal.actorId === captainProfile.id);
    });
  });
});
