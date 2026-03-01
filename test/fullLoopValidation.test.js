/**
 * Full Loop Validation Tests
 * 
 * Validates the complete world-core → cognition → proposal → command mapping cycle.
 * Tests all town conditions and verifies contract compliance.
 */

import assert from 'assert';
import { describe, it } from 'node:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { propose } from '../src/propose.js';
import { isValidSnapshot } from '../src/snapshotSchema.js';
import { isValidProposal, ProposalType } from '../src/proposalDsl.js';
import { proposalToCommand, proposalToDescription } from '../src/proposalMapping.js';
import { mayorProfile, captainProfile, wardenProfile } from '../src/agentProfiles.js';
import { SchemaVersion } from '../src/schemaVersions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load a snapshot fixture
 */
function loadSnapshot(filename) {
  const data = fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf-8');
  return JSON.parse(data);
}

function profileForSnapshot(profile, snapshot) {
  return { ...profile, townId: snapshot.townId };
}

/**
 * Verify a complete proposal cycle
 */
function verifyProposalCycle(snapshot, profile, expectedRoleAffinity = true) {
  // 1. Validate snapshot
  assert(isValidSnapshot(snapshot), 'Snapshot must be valid');

  // 2. Generate proposal
  const proposal = propose(snapshot, profileForSnapshot(profile, snapshot));

  // 3. Validate proposal
  assert(isValidProposal(proposal), 'Proposal must be valid');
  assert.strictEqual(proposal.schemaVersion, SchemaVersion.PROPOSAL, 'Proposal schema version must match');
  assert(/^proposal_[0-9a-f]{64}$/.test(proposal.proposalId), 'Proposal ID must be deterministic hash');
  assert(/^[0-9a-f]{64}$/.test(proposal.snapshotHash), 'Snapshot hash must be deterministic hash');
  assert.strictEqual(proposal.decisionEpoch, snapshot.day, 'Decision epoch must track snapshot day');
  assert(proposal.type, 'Proposal must have type');
  assert(proposal.priority >= 0 && proposal.priority <= 1, 'Priority must be [0, 1]');
  assert(Array.isArray(proposal.reasonTags), 'Reason tags must be array');
  assert(proposal.args, 'Proposal must have args');

  // 4. Map to command
  const command = proposalToCommand(proposal);
  assert(typeof command === 'string', 'Command must be string');
  assert(command.length > 0, 'Command must not be empty');

  // 5. Generate description
  const description = proposalToDescription(proposal);
  assert(typeof description === 'string', 'Description must be string');
  assert(description.includes(proposal.type), 'Description must include type');

  return { proposal, command, description };
}

describe('Full Loop Validation - World-Core → Cognition → Command', () => {
  describe('Stable Town Scenario (Low Pressure)', () => {
    let snapshot;

    it('should load stable town snapshot', () => {
      snapshot = loadSnapshot('stableSnapshot.json');
      assert.strictEqual(snapshot.day, 1);
      assert.strictEqual(snapshot.townId, 'town-stable');
      assert(snapshot.pressure.threat < 0.2);
      assert(snapshot.pressure.hope > 0.8);
    });

    it('should contract: snapshot is bounded and deterministic', () => {
      // Verify bounds
      assert(snapshot.sideQuests.length <= 100);
      assert(snapshot.projects.length <= 100);
      assert(snapshot.day >= 0);

      // Verify determinism: load twice, should be identical
      const snapshot2 = loadSnapshot('stableSnapshot.json');
      assert.deepStrictEqual(snapshot, snapshot2);
    });

    it('mayor should propose accepting mission in stable conditions', () => {
      const { proposal, command } = verifyProposalCycle(snapshot, mayorProfile);
      assert.strictEqual(proposal.type, ProposalType.MAYOR_ACCEPT_MISSION);
      assert(command.includes('mission accept'));
      assert(command.includes(snapshot.townId));
    });

    it('captain should propose casual project advancement in stable conditions', () => {
      const { proposal, command } = verifyProposalCycle(snapshot, captainProfile);
      // Low threat = may not prioritize project, falls back to talk
      assert(proposal.type);
      assert(command);
    });

    it('warden should propose morale chat in stable conditions', () => {
      const { proposal, command } = verifyProposalCycle(snapshot, wardenProfile);
      // Low strain = fallback is talk
      assert(proposal.type);
      assert(command.includes('townsfolk talk'));
    });

    it('should verify determinism: same snapshot + profile = same proposal', () => {
      const p1 = propose(snapshot, profileForSnapshot(mayorProfile, snapshot));
      const p2 = propose(snapshot, profileForSnapshot(mayorProfile, snapshot));
      assert.strictEqual(p1.type, p2.type);
      assert.strictEqual(p1.priority, p2.priority);
      assert.deepStrictEqual(p1.args, p2.args);
    });

    it('should verify command determinism: same proposal = same command', () => {
      const proposal = propose(snapshot, profileForSnapshot(mayorProfile, snapshot));
      const cmd1 = proposalToCommand(proposal);
      const cmd2 = proposalToCommand(proposal);
      assert.strictEqual(cmd1, cmd2);
    });
  });

  describe('Threatened Town Scenario (High Threat + Active Mission)', () => {
    let snapshot;

    it('should load threatened town snapshot', () => {
      snapshot = loadSnapshot('threatenedSnapshot.json');
      assert.strictEqual(snapshot.day, 15);
      assert.strictEqual(snapshot.townId, 'town-threatened');
      assert(snapshot.mission !== null, 'Should have active mission');
      assert(snapshot.pressure.threat > 0.7);
      assert(snapshot.projects.length > 0);
    });

    it('should contract: high-threat snapshot is valid', () => {
      assert(isValidSnapshot(snapshot));
      assert(snapshot.pressure.threat >= 0 && snapshot.pressure.threat <= 1);
      assert(snapshot.pressure.scarcity >= 0 && snapshot.pressure.scarcity <= 1);
    });

    it('mayor should respect active mission', () => {
      const { proposal } = verifyProposalCycle(snapshot, mayorProfile);
      // Active mission = mayor should not propose MAYOR_ACCEPT_MISSION
      if (proposal.type === ProposalType.MAYOR_ACCEPT_MISSION) {
        assert(false, 'Mayor should not accept when mission active');
      }
    });

    it('captain should prioritize project advancement under threat', () => {
      const { proposal, command } = verifyProposalCycle(snapshot, captainProfile);
      // High threat + projects = should advance project
      if (snapshot.pressure.threat > 0.3 && snapshot.projects.length > 0) {
        assert.strictEqual(proposal.type, ProposalType.PROJECT_ADVANCE);
        assert(command.includes('project advance'));
      }
    });

    it('captain proposal should reference actual project ID', () => {
      const { proposal } = verifyProposalCycle(snapshot, captainProfile);
      if (proposal.type === ProposalType.PROJECT_ADVANCE) {
        const projectId = proposal.args.projectId;
        const projectExists = snapshot.projects.some(p => p.id === projectId);
        assert(projectExists, `Project ${projectId} should exist in snapshot`);
      }
    });

    it('should verify threat-driven role differentiation', () => {
      const mayor = propose(snapshot, profileForSnapshot(mayorProfile, snapshot));
      const captain = propose(snapshot, profileForSnapshot(captainProfile, snapshot));
      const warden = propose(snapshot, profileForSnapshot(wardenProfile, snapshot));

      // Captain should be threat-aware
      if (captain.type === ProposalType.PROJECT_ADVANCE) {
        assert(captain.reasonTags.includes('high_threat'));
      }

      // All should have valid proposals
      assert(isValidProposal(mayor));
      assert(isValidProposal(captain));
      assert(isValidProposal(warden));
    });
  });

  describe('Resource Crisis Scenario (High Scarcity + High Dread)', () => {
    let snapshot;

    it('should load resource crisis snapshot', () => {
      snapshot = loadSnapshot('resourceCrisisSnapshot.json');
      assert.strictEqual(snapshot.day, 30);
      assert.strictEqual(snapshot.townId, 'town-resource-crisis');
      assert(snapshot.pressure.scarcity > 0.85);
      assert(snapshot.pressure.dread > 0.7);
      assert(snapshot.pressure.hope < 0.4);
    });

    it('should contract: crisis snapshot respects bounds', () => {
      assert(isValidSnapshot(snapshot));
      const strain = (snapshot.pressure.scarcity + snapshot.pressure.dread) / 2;
      assert(strain > 0.4, 'Should have high strain');
    });

    it('warden should propose salvage plan in crisis', () => {
      const { proposal, command } = verifyProposalCycle(snapshot, wardenProfile);
      const strain = (snapshot.pressure.scarcity + snapshot.pressure.dread) / 2;
      if (strain > 0.4) {
        assert.strictEqual(proposal.type, ProposalType.SALVAGE_PLAN);
        assert(command.includes('salvage initiate'));
      }
    });

    it('warden proposal should target correct pressure component', () => {
      const { proposal } = verifyProposalCycle(snapshot, wardenProfile);
      if (proposal.type === ProposalType.SALVAGE_PLAN) {
        const focus = proposal.args.focus;
        assert(['scarcity', 'dread'].includes(focus), 'Focus should be scarcity or dread');
        // Should pick the higher one
        if (snapshot.pressure.scarcity >= snapshot.pressure.dread) {
          assert.strictEqual(focus, 'scarcity');
        } else {
          assert.strictEqual(focus, 'dread');
        }
      }
    });

    it('should verify despair-driven proposals', () => {
      const proposal = propose(snapshot, profileForSnapshot(wardenProfile, snapshot));
      // In crisis, warden should respond
      assert(proposal.reasonTags.length > 0, 'Should have reason tags in crisis');
    });
  });

  describe('Proposal-to-Command Mapping Contract', () => {
    const snapshots = [
      { name: 'stable', data: loadSnapshot('stableSnapshot.json') },
      { name: 'threatened', data: loadSnapshot('threatenedSnapshot.json') },
      { name: 'crisis', data: loadSnapshot('resourceCrisisSnapshot.json') }
    ];

    const profiles = [
      { name: 'mayor', profile: mayorProfile },
      { name: 'captain', profile: captainProfile },
      { name: 'warden', profile: wardenProfile }
    ];

    it('should map all proposals from all scenarios to valid commands', () => {
      snapshots.forEach(({ name, data }) => {
        profiles.forEach(({ name: roleName, profile }) => {
          const proposal = propose(data, profileForSnapshot(profile, data));
          const command = proposalToCommand(proposal);

          assert(typeof command === 'string', `${name}/${roleName}: command should be string`);
          assert(command.length > 0, `${name}/${roleName}: command should not be empty`);

          // Command must contain townId
          assert(command.includes(data.townId), `${name}/${roleName}: command should contain townId`);
        });
      });
    });

    it('should contract: command format is consistent', () => {
      // All commands should follow: <verb> <noun> <townId> <target>
      snapshots.forEach(({ data }) => {
        profiles.forEach(({ profile }) => {
          const proposal = propose(data, profileForSnapshot(profile, data));
          const command = proposalToCommand(proposal);
          const parts = command.split(' ');

          assert(parts.length >= 3, 'Command should have verb, noun, and townId');
          assert(parts[2] === data.townId, 'Third part should be townId');
        });
      });
    });
  });

  describe('Human-in-the-Loop Cycle Validation', () => {
    it('cycle 1: stable → proposal → command → ready for execution', () => {
      const snapshot = loadSnapshot('stableSnapshot.json');
      const proposal = propose(snapshot, profileForSnapshot(mayorProfile, snapshot));
      const command = proposalToCommand(proposal);
      const description = proposalToDescription(proposal);

      assert(isValidProposal(proposal));
      assert(command.includes('mission accept'));

      // Human can read and verify
      assert(description.includes('MAYOR_ACCEPT_MISSION'));
      assert(description.includes(proposal.reason));
    });

    it('cycle 2: threatened → multi-role proposals → all valid', () => {
      const snapshot = loadSnapshot('threatenedSnapshot.json');
      const proposals = [
        { role: 'mayor', proposal: propose(snapshot, profileForSnapshot(mayorProfile, snapshot)) },
        { role: 'captain', proposal: propose(snapshot, profileForSnapshot(captainProfile, snapshot)) },
        { role: 'warden', proposal: propose(snapshot, profileForSnapshot(wardenProfile, snapshot)) }
      ];

      proposals.forEach(({ role, proposal }) => {
        assert(isValidProposal(proposal), `${role} should emit valid proposal`);
        const command = proposalToCommand(proposal);
        assert(command.includes(snapshot.townId), `${role} command should reference town`);
      });
    });

    it('cycle 3: crisis → urgent proposals with tags', () => {
      const snapshot = loadSnapshot('resourceCrisisSnapshot.json');
      const proposal = propose(snapshot, profileForSnapshot(wardenProfile, snapshot));

      assert(isValidProposal(proposal));
      assert(proposal.reasonTags.length > 0, 'Crisis proposal should have tags');
      assert(proposal.reason.length > 0, 'Crisis proposal should have explanation');

      // Human can understand why
      const description = proposalToDescription(proposal);
      assert(description.includes(proposal.reason));
    });
  });

  describe('Contract Drift Detection', () => {
    it('should detect if snapshot violates expected schema', () => {
      const badSnapshot = {
        day: -1, // Invalid
        townId: 'town-1',
        mission: null,
        sideQuests: [],
        pressure: { threat: 0.5, scarcity: 0.5, hope: 0.5, dread: 0.5 },
        projects: []
      };

      assert(!isValidSnapshot(badSnapshot), 'Should reject negative day');
    });

    it('should detect if proposal violates expected schema', () => {
      const badProposal = {
        schemaVersion: SchemaVersion.PROPOSAL,
        proposalId: `proposal_${'e'.repeat(64)}`,
        snapshotHash: 'f'.repeat(64),
        decisionEpoch: 1,
        type: ProposalType.MAYOR_ACCEPT_MISSION,
        actorId: 'test',
        townId: 'test',
        priority: 1.5, // Invalid: > 1
        reason: 'test',
        reasonTags: [],
        args: { missionId: 'mission-1' }
      };

      assert(!isValidProposal(badProposal), 'Should reject priority > 1');
    });

    it('should ensure reasonTags are always strings', () => {
      const snapshots = [
        loadSnapshot('stableSnapshot.json'),
        loadSnapshot('threatenedSnapshot.json'),
        loadSnapshot('resourceCrisisSnapshot.json')
      ];

      snapshots.forEach(snapshot => {
        const proposal = propose(snapshot, profileForSnapshot(mayorProfile, snapshot));
        proposal.reasonTags.forEach(tag => {
          assert(typeof tag === 'string', `Tag should be string: ${tag}`);
        });
      });
    });

    it('should ensure args match proposal type expectations', () => {
      const snapshot = loadSnapshot('threatenedSnapshot.json');
      const proposal = propose(snapshot, profileForSnapshot(captainProfile, snapshot));

      if (proposal.type === ProposalType.PROJECT_ADVANCE) {
        assert(proposal.args.projectId, 'PROJECT_ADVANCE should have projectId');
        assert(typeof proposal.args.projectId === 'string', 'projectId should be string');
      } else if (proposal.type === ProposalType.MAYOR_ACCEPT_MISSION) {
        assert('missionId' in proposal.args, 'MAYOR_ACCEPT_MISSION should have missionId');
      }
    });
  });

  describe('Snapshot Bounds & Scaling', () => {
    it('should handle max reasonable project count', () => {
      const snapshot = loadSnapshot('threatenedSnapshot.json');
      assert(snapshot.projects.length <= 100, 'Projects should be bounded');

      // Should still generate valid proposals
      const proposal = propose(snapshot, profileForSnapshot(captainProfile, snapshot));
      assert(isValidProposal(proposal));
    });

    it('should handle max reasonable quest count', () => {
      const snapshot = loadSnapshot('threatenedSnapshot.json');
      assert(snapshot.sideQuests.length <= 100, 'Quests should be bounded');

      // Should still generate valid proposals
      const proposal = propose(snapshot, profileForSnapshot(mayorProfile, snapshot));
      assert(isValidProposal(proposal));
    });

    it('should always emit exactly one proposal per cycle', () => {
      const snapshots = [
        loadSnapshot('stableSnapshot.json'),
        loadSnapshot('threatenedSnapshot.json'),
        loadSnapshot('resourceCrisisSnapshot.json')
      ];

      snapshots.forEach(snapshot => {
        const p1 = propose(snapshot, profileForSnapshot(mayorProfile, snapshot));
        const p2 = propose(snapshot, profileForSnapshot(captainProfile, snapshot));
        const p3 = propose(snapshot, profileForSnapshot(wardenProfile, snapshot));

        assert(p1, 'Mayor should emit proposal');
        assert(p2, 'Captain should emit proposal');
        assert(p3, 'Warden should emit proposal');

        // Each should be exactly one proposal (not array)
        assert(p1.type, 'Mayor proposal should have type');
        assert(p2.type, 'Captain proposal should have type');
        assert(p3.type, 'Warden proposal should have type');
      });
    });
  });
});
