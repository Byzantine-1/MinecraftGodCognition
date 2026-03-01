import { isValidProfile } from './agentProfiles.js';
import { evaluateGovernanceCandidates } from './heuristics.js';
import { proposalToCommand } from './proposalMapping.js';
import { propose } from './propose.js';
import { SchemaVersion } from './schemaVersions.js';
import { canonicalizeSnapshot, isValidSnapshot } from './snapshotSchema.js';

export const DecisionInspectionSchemaVersion = SchemaVersion.DECISION_INSPECTION;

/**
 * Build a deterministic observability report for the current cognition cycle.
 * @param {Object} snapshot
 * @param {Object} profile
 * @param {Object} [memory]
 * @returns {Object}
 */
export function inspectDecision(snapshot, profile, memory = {}) {
  if (!isValidSnapshot(snapshot)) {
    throw new Error('Invalid snapshot structure');
  }
  if (!isValidProfile(profile)) {
    throw new Error('Invalid profile structure');
  }
  if (snapshot.townId !== profile.townId) {
    throw new Error('Snapshot and profile townId mismatch');
  }

  const canonicalSnapshot = canonicalizeSnapshot(snapshot);
  const candidates = evaluateGovernanceCandidates(canonicalSnapshot, profile, memory);
  const selectedProposal = propose(canonicalSnapshot, profile, memory);
  const command = proposalToCommand(selectedProposal);

  return {
    schemaVersion: DecisionInspectionSchemaVersion,
    candidates: candidates.map((candidate, index) => ({
      rank: index + 1,
      selected: index === 0,
      type: candidate.type,
      priority: candidate.priority,
      targetId: candidate.targetId,
      reasonTags: candidate.reasonTags
    })),
    selectedProposal,
    command,
    reasoning: {
      reason: selectedProposal.reason,
      reasonTags: selectedProposal.reasonTags,
      ...(selectedProposal.preconditions ? { preconditions: selectedProposal.preconditions } : {})
    }
  };
}
