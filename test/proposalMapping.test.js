/**
 * Tests for proposal-to-command mapping
 */

import assert from 'assert';
import { describe, it } from 'node:test';
import { proposalToCommand, proposalToDescription, proposalsToCommands } from '../src/proposalMapping.js';
import { ProposalType } from '../src/proposalDsl.js';
import { SchemaVersion } from '../src/schemaVersions.js';

function createProposal(type, overrides = {}) {
  const baseArgs = {
    [ProposalType.MAYOR_ACCEPT_MISSION]: { missionId: 'sq-gather-stone' },
    [ProposalType.PROJECT_ADVANCE]: { projectId: 'wall-defense' },
    [ProposalType.SALVAGE_PLAN]: { focus: 'scarcity' },
    [ProposalType.TOWNSFOLK_TALK]: { talkType: 'morale-boost' }
  };

  return {
    schemaVersion: SchemaVersion.PROPOSAL,
    proposalId: `proposal_${'a'.repeat(64)}`,
    snapshotHash: 'b'.repeat(64),
    decisionEpoch: 12,
    type,
    actorId: 'actor-1',
    townId: 'town-1',
    priority: 0.75,
    reason: 'Test reason',
    reasonTags: ['test'],
    args: baseArgs[type],
    ...overrides
  };
}

describe('Proposal Mapping - World-Core Contract', () => {
  describe('proposalToCommand', () => {
    it('should map MAYOR_ACCEPT_MISSION to mission accept command', () => {
      const proposal = createProposal(ProposalType.MAYOR_ACCEPT_MISSION, {
        actorId: 'mayor-1'
      });

      const cmd = proposalToCommand(proposal);
      assert.strictEqual(cmd, 'mission accept town-1 sq-gather-stone');
    });

    it('should map PROJECT_ADVANCE to project advance command', () => {
      const proposal = createProposal(ProposalType.PROJECT_ADVANCE, {
        actorId: 'captain-1',
        townId: 'town-2'
      });

      const cmd = proposalToCommand(proposal);
      assert.strictEqual(cmd, 'project advance town-2 wall-defense');
    });

    it('should map SALVAGE_PLAN to salvage initiate command', () => {
      const proposal = createProposal(ProposalType.SALVAGE_PLAN, {
        actorId: 'warden-1'
      });

      const cmd = proposalToCommand(proposal);
      assert.strictEqual(cmd, 'salvage initiate town-1 scarcity');
    });

    it('should map TOWNSFOLK_TALK to townsfolk talk command', () => {
      const proposal = createProposal(ProposalType.TOWNSFOLK_TALK, {
        actorId: 'warden-1'
      });

      const cmd = proposalToCommand(proposal);
      assert.strictEqual(cmd, 'townsfolk talk town-1 morale-boost');
    });

    it('should reject malformed proposal args instead of generating a null command', () => {
      const proposal = createProposal(ProposalType.MAYOR_ACCEPT_MISSION, {
        args: {}
      });

      assert.throws(
        () => proposalToCommand(proposal),
        /Invalid proposal envelope/
      );
    });

    it('should reject malformed proposal metadata', () => {
      const proposal = createProposal(ProposalType.PROJECT_ADVANCE, {
        proposalId: 'bad-id'
      });

      assert.throws(
        () => proposalToCommand(proposal),
        /Invalid proposal envelope/
      );
    });

    it('should throw on invalid proposal type', () => {
      const proposal = createProposal(ProposalType.PROJECT_ADVANCE, {
        type: 'INVALID_TYPE'
      });

      assert.throws(
        () => proposalToCommand(proposal),
        /Invalid proposal envelope/
      );
    });

    it('should throw on missing proposal type', () => {
      const proposal = createProposal(ProposalType.PROJECT_ADVANCE);
      delete proposal.type;

      assert.throws(
        () => proposalToCommand(proposal),
        /Invalid proposal envelope/
      );
    });
  });

  describe('proposalToDescription', () => {
    it('should include reason and tags', () => {
      const proposal = createProposal(ProposalType.MAYOR_ACCEPT_MISSION, {
        reason: 'No active mission',
        reasonTags: ['no_active_mission', 'high_authority']
      });

      const desc = proposalToDescription(proposal);
      assert(desc.includes('MAYOR_ACCEPT_MISSION'));
      assert(desc.includes('No active mission'));
      assert(desc.includes('no_active_mission'));
      assert(desc.includes('high_authority'));
    });

    it('should handle empty tags', () => {
      const proposal = createProposal(ProposalType.PROJECT_ADVANCE, {
        reason: 'Threat detected',
        reasonTags: []
      });

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
        createProposal(ProposalType.MAYOR_ACCEPT_MISSION, {
          actorId: 'mayor-1',
          args: { missionId: 'sq-1' },
          reason: 'No mission',
          reasonTags: ['no_active_mission']
        }),
        createProposal(ProposalType.PROJECT_ADVANCE, {
          actorId: 'captain-1',
          args: { projectId: 'proj-1' },
          reason: 'High threat',
          reasonTags: ['high_threat']
        })
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
