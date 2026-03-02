/**
 * Entry point for the minecraft-agent-cognition module
 * World-core governance cognition MVP
 */

export { propose } from './propose.js';
export { ProposalType, isValidProposal, isValidProposalArgs } from './proposalDsl.js';
export {
  getProposalDefinition,
  getProposalOrder,
  isValidProposalDefinition,
  isValidProposalRegistry,
  listProposalTypes,
  mapProposalToCommand,
  materializeProposalType,
  proposalRegistry
} from './proposalRegistry.js';
export { 
  Roles,
  mayorProfile, 
  captainProfile, 
  wardenProfile, 
  isValidProfile 
} from './agentProfiles.js';
export { 
  canonicalizeSnapshot,
  createDefaultSnapshot, 
  isValidSnapshot 
} from './snapshotSchema.js';
export {
  evaluateMissionAcceptance,
  evaluateProjectAdvance,
  evaluateSalvagePlan,
  evaluateTownsfolkTalk,
  evaluateGovernanceProposal
} from './heuristics.js';
export {
  proposalToCommand,
  proposalToDescription,
  proposalsToCommands
} from './proposalMapping.js';
export {
  createExecutionHandoff,
  createExecutionResult,
  ExecutionStatus,
  isValidExecutionHandoff,
  isValidExecutionResult
} from './executionHandoff.js';
export {
  createLocalExecutionState,
  executeLocalHandoff,
  isValidLocalExecutionState,
  normalizeLocalExecutionState
} from './localExecutionHarness.js';
export {
  buildImmersionPrompt,
  generateImmersion,
  ImmersionArtifactType,
  ImmersionStatus,
  isValidDecisionInspectionPayload,
  isValidImmersionInput,
  isValidImmersionProvider,
  isValidImmersionResult,
  isValidNarrativeContext,
  normalizeNarrativeContext,
  resolveImmersionConfig,
  resolveImmersionProvider,
  selectWorldMemoryForArtifact
} from './immersion.js';
export {
  createNarrativeContextWithWorldMemory,
  isValidWorldMemoryContext,
  MaxWorldMemoryChronicleRecords,
  MaxWorldMemoryHistoryRecords,
  normalizeWorldMemoryContext,
  parseWorldMemoryContextLine,
  WorldMemoryContextSchemaVersion,
  WorldMemoryContextType
} from './worldMemoryContext.js';
export {
  createEmbodimentRequestPreview,
  isValidEmbodimentRequestPreview
} from './embodimentPreview.js';
export {
  isValidDemoFlowReport,
  runDemoFlow
} from './demoFlow.js';
export {
  ProjectStatuses,
  SchemaVersion,
  SnapshotBounds
} from './schemaVersions.js';
