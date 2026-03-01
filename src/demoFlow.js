import { isValidProfile } from './agentProfiles.js';
import { inspectDecision, DecisionInspectionSchemaVersion } from './decisionInspection.js';
import { createEmbodimentRequestPreview, isValidEmbodimentRequestPreview } from './embodimentPreview.js';
import { createExecutionHandoff, isValidExecutionHandoff, isValidExecutionResult } from './executionHandoff.js';
import { generateImmersion, isValidImmersionResult } from './immersion.js';
import {
  createLocalExecutionState,
  executeLocalHandoff,
  isValidLocalExecutionState
} from './localExecutionHarness.js';
import { SchemaVersion } from './schemaVersions.js';
import { canonicalizeSnapshot, isValidSnapshot } from './snapshotSchema.js';

const defaultImmersionArtifactType = 'outcome-blurb';

function buildAuthorityBoundary() {
  return {
    realCommandExecution: false,
    realWorldMutation: false,
    liveBotRequired: false,
    cognition: 'deterministic-advisory',
    execution: 'local-simulated',
    immersion: 'downstream-advisory',
    embodiment: 'preview-only'
  };
}

function buildLocalStateFromSnapshot(snapshot, handoff) {
  return createLocalExecutionState({
    snapshotHash: handoff.snapshotHash,
    decisionEpoch: handoff.decisionEpoch,
    mission: snapshot.mission ? { id: snapshot.mission.id } : null,
    sideQuests: snapshot.sideQuests.map(sideQuest => ({ id: sideQuest.id })),
    projects: snapshot.projects.map(project => ({ id: project.id, status: project.status }))
  });
}

/**
 * Validate the deterministic demo report shape.
 * @param {Object} report
 * @returns {boolean}
 */
export function isValidDemoFlowReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  if (report.schemaVersion !== SchemaVersion.DEMO_FLOW) return false;
  if (report.demoMode !== 'deterministic-local') return false;
  if (!report.input || typeof report.input !== 'object' || Array.isArray(report.input)) return false;
  if (report.input.immersionArtifactType !== defaultImmersionArtifactType && typeof report.input.immersionArtifactType !== 'string') {
    return false;
  }
  if (!report.authorityBoundary || typeof report.authorityBoundary !== 'object' || Array.isArray(report.authorityBoundary)) {
    return false;
  }
  if (report.authorityBoundary.realCommandExecution !== false) return false;
  if (report.authorityBoundary.realWorldMutation !== false) return false;
  if (report.authorityBoundary.liveBotRequired !== false) return false;
  if (report.decisionInspection?.schemaVersion !== DecisionInspectionSchemaVersion) return false;
  if (!isValidExecutionHandoff(report.executionHandoff)) return false;
  if (!isValidExecutionResult(report.executionResult)) return false;
  if (!isValidImmersionResult(report.immersionResult)) return false;
  if (report.embodimentPreview !== null && !isValidEmbodimentRequestPreview(report.embodimentPreview)) return false;

  return true;
}

/**
 * Build a deterministic end-to-end demo report across the current stack.
 * @param {Object} snapshot
 * @param {Object} profile
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function runDemoFlow(snapshot, profile, options = {}) {
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
  const decisionInspection = inspectDecision(canonicalSnapshot, profile, options.memory);
  const executionHandoff = createExecutionHandoff(
    decisionInspection.selectedProposal,
    decisionInspection.command
  );
  const localExecutionState = options.localExecutionState
    ? options.localExecutionState
    : buildLocalStateFromSnapshot(canonicalSnapshot, executionHandoff);

  if (!isValidLocalExecutionState(localExecutionState)) {
    throw new Error('Invalid local execution state');
  }

  const executionResult = executeLocalHandoff(executionHandoff, localExecutionState);
  const immersionResult = await generateImmersion({
    artifactType: options.immersionArtifactType ?? defaultImmersionArtifactType,
    decisionInspection,
    executionHandoff,
    executionResult,
    narrativeContext: options.narrativeContext,
    worldSummary: options.worldSummary
  }, options.immersionOptions);
  const embodimentPreview = executionResult.accepted
    ? createEmbodimentRequestPreview(decisionInspection, executionResult, immersionResult)
    : null;

  const report = {
    schemaVersion: SchemaVersion.DEMO_FLOW,
    demoMode: 'deterministic-local',
    authorityBoundary: buildAuthorityBoundary(),
    input: {
      townId: canonicalSnapshot.townId,
      profileId: profile.id,
      role: profile.role,
      immersionArtifactType: options.immersionArtifactType ?? defaultImmersionArtifactType,
      narrativeContext: options.narrativeContext ? 'provided' : 'absent',
      worldSummary: options.worldSummary ? 'provided' : 'absent'
    },
    decisionInspection,
    executionHandoff,
    executionResult,
    immersionResult,
    embodimentPreview
  };

  if (!isValidDemoFlowReport(report)) {
    throw new Error('Invalid demo flow report');
  }

  return report;
}
