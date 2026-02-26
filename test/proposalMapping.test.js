/**
 * Tests for proposal-to-command mapping
 */

import assert from 'assert';
import { describe, it } from 'node:test';
import { proposalToCommand, proposalToDescription, proposalsToCommands } from '../src/proposalMapping.js';
import { ProposalType } from '../src/proposalDsl.js';

describe('Proposal Mapping - World-Core Contract', () => {
  describe('proposalToCommand', () => {
    it('should map MAYOR_ACCEPT_MISSION to mission accept command', () => {
      const proposal = {
        type: ProposalType.MAYOR_ACCEPT_MISSION,
        actorId: 'mayor-1',
        townId: 'town-1',
        args: { missionId: 'sq-gather-stone' },
        reason: 'No active mission'
      };

      const cmd = proposalToCommand(proposal);
      assert.strictEqual(cmd, 'mission accept town-1 sq-gather-stone');
    });

    it('should map PROJECT_ADVANCE to project advance command', () => {
      const proposal = {
        type: ProposalType.PROJECT_ADVANCE,
        actorId: 'captain-1',
        townId: 'town-2',
        args: { projectId: 'wall-defense' },
        reason: 'Threat is high'
      };

      const cmd = proposalToCommand(proposal);
      assert.strictEqual(cmd, 'project advance town-2 wall-defense');
    });

    it('should map SALVAGE_PLAN to salvage initiate command', () => {
      const proposal = {
        type: ProposalType.SALVAGE_PLAN,
        actorId: 'warden-1',
        townId: 'town-1',
        args: { focus: 'scarcity' },
        reason: 'Resource shortage'
      };

      const cmd = proposalToCommand(proposal);
      assert.strictEqual(cmd, 'salvage initiate town-1 scarcity');
    });

    it('should map TOWNSFOLK_TALK to townsfolk talk command', () => {
      const proposal = {
        type: ProposalType.TOWNSFOLK_TALK,
        actorId: 'warden-1',
        townId: 'town-1',
        args: { talkType: 'morale-boost' },
        reason: 'Low morale'
      };

      const cmd = proposalToCommand(proposal);
      assert.strictEqual(cmd, 'townsfolk talk town-1 morale-boost');
    });

    it('should handle missing args gracefully', () => {
      const proposal = {
        type: ProposalType.MAYOR_ACCEPT_MISSION,
        actorId: 'mayor-1',
        townId: 'town-1',
        args: {},
        reason: 'No active mission'
      };

      const cmd = proposalToCommand(proposal);
      assert(cmd.includes('mission accept'));
      assert(cmd.includes('null'));
    });

    it('should throw on invalid proposal type', () => {
      const proposal = {
        type: 'INVALID_TYPE',
        actorId: 'test',
        townId: 'town-1',
        args: {},
        reason: 'test'
      };

      assert.throws(
        () => proposalToCommand(proposal),
        /Unknown proposal type/
      );
    });

    it('should throw on missing proposal type', () => {
      const proposal = {
        actorId: 'test',
        townId: 'town-1',
        args: {},
        reason: 'test'
      };

      assert.throws(
        () => proposalToCommand(proposal),
        /Invalid proposal/
      );
    });
  });

  describe('proposalToDescription', () => {
    it('should include reason and tags', () => {
      const proposal = {
        type: ProposalType.MAYOR_ACCEPT_MISSION,
        reason: 'No active mission',
        reasonTags: ['no_active_mission', 'high_authority']
      };

      const desc = proposalToDescription(proposal);
      assert(desc.includes('MAYOR_ACCEPT_MISSION'));
      assert(desc.includes('No active mission'));
      assert(desc.includes('no_active_mission'));
      assert(desc.includes('high_authority'));
    });

    it('should handle empty tags', () => {
      const proposal = {
        type: ProposalType.PROJECT_ADVANCE,
        reason: 'Threat detected',
        reasonTags: []
      };

      const desc = proposalToDescription(proposal);
      assert(desc.includes('PROJECT_ADVANCE'));
      assert(desc.includes('Threat detected'));
      assert(!desc.includes('[]'));
    });

    it('should handle missing proposal gracefully', () => {
      const desc = proposalToDescription(null);
      assert.strictEqual(desc, 'Unknown proposal');
    });
  });

  describe('proposalsToCommands', () => {
    it('should batch map multiple proposals', () => {
      const proposals = [
        {
          type: ProposalType.MAYOR_ACCEPT_MISSION,
          actorId: 'mayor-1',
          townId: 'town-1',
          args: { missionId: 'sq-1' },
          reason: 'No mission',
          reasonTags: ['no_active_mission']
        },
        {
          type: ProposalType.PROJECT_ADVANCE,
          actorId: 'captain-1',
          townId: 'town-1',
          args: { projectId: 'proj-1' },
          reason: 'High threat',
          reasonTags: ['high_threat']
        }
      ];

      const mapped = proposalsToCommands(proposals);
      assert.strictEqual(mapped.length, 2);
      assert(mapped[0].command.includes('mission accept'));
      assert(mapped[1].command.includes('project advance'));
      assert(mapped[0].description.includes('no_active_mission'));
      assert(mapped[1].description.includes('high_threat'));
    });

    it('should throw on non-array input', () => {
      assert.throws(
        () => proposalsToCommands('not an array'),
        /Expected array/
      );
    });
  });
});
