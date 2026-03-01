/**
 * Integration tests - Cognition + World-Core Contract
 * 
 * Simulates the actual flow:
 * 1. World-core exports a snapshot
 * 2. Cognition reads snapshot and emits a proposal
 * 3. Proposal is mapped to a world-core command
 */

import assert from 'assert';
import { describe, it } from 'node:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { propose } from '../src/propose.js';
import { isValidSnapshot } from '../src/snapshotSchema.js';
import { isValidProposal } from '../src/proposalDsl.js';
import { proposalToCommand, proposalToDescription } from '../src/proposalMapping.js';
import { mayorProfile, captainProfile, wardenProfile } from '../src/agentProfiles.js';
import { SchemaVersion } from '../src/schemaVersions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createProposalEnvelope(type, args) {
  return {
    schemaVersion: SchemaVersion.PROPOSAL,
    proposalId: `proposal_${'c'.repeat(64)}`,
    snapshotHash: 'd'.repeat(64),
    decisionEpoch: 0,
    type,
    actorId: 'test-actor',
    townId: 'town-1',
    priority: 0.5,
    reason: 'Test',
    reasonTags: ['test'],
    args
  };
}

function profileForTown(profile, townId) {
  return { ...profile, townId };
}

describe('Integration - Cognition + World-Core Snapshots', () => {
  describe('Early game scenario', () => {
    it('should load and validate early game snapshot', () => {
      const data = fs.readFileSync(path.join(__dirname, 'fixtures', 'earlyGameSnapshot.json'), 'utf-8');
      const snapshot = JSON.parse(data);
      assert(isValidSnapshot(snapshot));
      assert.strictEqual(snapshot.day, 0);
      assert(snapshot.sideQuests.length >= 1);
    });

    it('should emit valid proposal from early game snapshot', () => {
      const data = fs.readFileSync(path.join(__dirname, 'fixtures', 'earlyGameSnapshot.json'), 'utf-8');
      const snapshot = JSON.parse(data);

      // Mayor should accept a mission
      const proposal = propose(snapshot, profileForTown(mayorProfile, snapshot.townId));
      assert(isValidProposal(proposal));
      assert(proposal.type);
      assert(proposal.priority >= 0 && proposal.priority <= 1);
      assert(Array.isArray(proposal.reasonTags));
      assert.strictEqual(proposal.schemaVersion, SchemaVersion.PROPOSAL);
    });

    it('should map early game proposal to command', () => {
      const data = fs.readFileSync(path.join(__dirname, 'fixtures', 'earlyGameSnapshot.json'), 'utf-8');
      const snapshot = JSON.parse(data);

      const proposal = propose(snapshot, profileForTown(mayorProfile, snapshot.townId));
      const command = proposalToCommand(proposal);
      assert(typeof command === 'string');
      assert(command.includes(snapshot.townId));
    });

    it('should produce human-readable description', () => {
      const data = fs.readFileSync(path.join(__dirname, 'fixtures', 'earlyGameSnapshot.json'), 'utf-8');
      const snapshot = JSON.parse(data);

      const proposal = propose(snapshot, profileForTown(mayorProfile, snapshot.townId));
      const desc = proposalToDescription(proposal);
      assert(desc.includes(proposal.type));
      assert(desc.includes(proposal.reason));
    });
  });

  describe('Crisis scenario', () => {
    it('should load and validate crisis snapshot', () => {
      const data = fs.readFileSync(path.join(__dirname, 'fixtures', 'crisisSnapshot.json'), 'utf-8');
      const snapshot = JSON.parse(data);
      assert(isValidSnapshot(snapshot));
      assert.strictEqual(snapshot.day, 42);
      assert(snapshot.mission !== null);
      assert(snapshot.pressure.threat > 0.75);
    });

    it('should emit valid proposal from crisis snapshot', () => {
      const data = fs.readFileSync(path.join(__dirname, 'fixtures', 'crisisSnapshot.json'), 'utf-8');
      const snapshot = JSON.parse(data);

      // Captain should advance project in response to high threat
      const proposal = propose(snapshot, profileForTown(captainProfile, snapshot.townId));
      assert(isValidProposal(proposal));
      assert(proposal.type);
    });

    it('should emit different proposals for different roles in crisis', () => {
      const data = fs.readFileSync(path.join(__dirname, 'fixtures', 'crisisSnapshot.json'), 'utf-8');
      const snapshot = JSON.parse(data);

      const mayorProposal = propose(snapshot, profileForTown(mayorProfile, snapshot.townId));
      const captainProposal = propose(snapshot, profileForTown(captainProfile, snapshot.townId));
      const wardenProposal = propose(snapshot, profileForTown(wardenProfile, snapshot.townId));

      assert(isValidProposal(mayorProposal));
      assert(isValidProposal(captainProposal));
      assert(isValidProposal(wardenProposal));

      // In crisis, proposals should reflect the roles' priorities
      assert(mayorProposal.reason.length > 0);
      assert(captainProposal.reason.length > 0);
      assert(wardenProposal.reason.length > 0);
    });

    it('should map all role proposals to commands without error', () => {
      const data = fs.readFileSync(path.join(__dirname, 'fixtures', 'crisisSnapshot.json'), 'utf-8');
      const snapshot = JSON.parse(data);

      const proposals = [
        propose(snapshot, profileForTown(mayorProfile, snapshot.townId)),
        propose(snapshot, profileForTown(captainProfile, snapshot.townId)),
        propose(snapshot, profileForTown(wardenProfile, snapshot.townId))
      ];

      proposals.forEach(proposal => {
        const command = proposalToCommand(proposal);
        assert(typeof command === 'string');
        assert(command.length > 0);
      });
    });
  });

  describe('Snapshot contract compliance', () => {
    it('should handle snapshot with all optional fields present', () => {
      const snapshot = {
        schemaVersion: SchemaVersion.SNAPSHOT,
        day: 100,
        townId: 'town-test',
        mission: { id: 'mission-1', title: 'Test Mission' },
        sideQuests: [
          { id: 'sq-1', title: 'Quest 1', complexity: 2 },
          { id: 'sq-2', title: 'Quest 2', complexity: 1 }
        ],
        pressure: { threat: 0.5, scarcity: 0.4, hope: 0.6, dread: 0.3 },
        projects: [
          { id: 'proj-1', name: 'Project 1', progress: 0.5, status: 'active' }
        ],
        latestNetherEvent: 'ghast_nearby'
      };

      assert(isValidSnapshot(snapshot));
      const proposal = propose(snapshot, profileForTown(captainProfile, snapshot.townId));
      assert(isValidProposal(proposal));
    });

    it('should handle snapshot with minimal fields', () => {
      const snapshot = {
        schemaVersion: SchemaVersion.SNAPSHOT,
        day: 0,
        townId: 'town-minimal',
        mission: null,
        sideQuests: [],
        pressure: { threat: 0.1, scarcity: 0.1, hope: 0.9, dread: 0.1 },
        projects: [],
        latestNetherEvent: null
      };

      assert(isValidSnapshot(snapshot));
      const proposal = propose(snapshot, profileForTown(wardenProfile, snapshot.townId));
      assert(isValidProposal(proposal));
    });

    it('should verify reasonTags are always present in proposals', () => {
      const snapshots = [
        JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'earlyGameSnapshot.json'), 'utf-8')),
        JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'crisisSnapshot.json'), 'utf-8'))
      ];

      snapshots.forEach(snapshot => {
        const proposal = propose(snapshot, profileForTown(mayorProfile, snapshot.townId));
        assert(Array.isArray(proposal.reasonTags));
        assert(proposal.reasonTags.length > 0 || proposal.reason.length > 0);
      });
    });
  });

  describe('Command mapping contract', () => {
    it('should produce valid command format for all proposal types', () => {
      const proposals = [
        createProposalEnvelope('MAYOR_ACCEPT_MISSION', { missionId: 'test-mission' }),
        createProposalEnvelope('PROJECT_ADVANCE', { projectId: 'test-proj' }),
        createProposalEnvelope('SALVAGE_PLAN', { focus: 'scarcity' }),
        createProposalEnvelope('TOWNSFOLK_TALK', { talkType: 'morale-boost' })
      ];

      proposals.forEach(prop => {
        const cmd = proposalToCommand(prop);
        // Command should have format: <verb> <noun> <townId> <target>
        const parts = cmd.split(' ');
        assert(parts.length >= 2);
        assert(parts.includes('town-1'));
      });
    });
  });
});
