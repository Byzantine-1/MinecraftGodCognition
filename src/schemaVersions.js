export const SchemaVersion = Object.freeze({
  SNAPSHOT: 'snapshot.v1',
  PROFILE: 'profile.v1',
  PROPOSAL: 'proposal.v2',
  DECISION_INSPECTION: 'decision-inspection.v1',
  HANDOFF: 'execution-handoff.v1',
  EXECUTION_RESULT: 'execution-result.v1',
  IMMERSION_RESULT: 'immersion-result.v1',
  EMBODIMENT_PREVIEW: 'embodiment-preview.v1',
  DEMO_FLOW: 'demo-flow.v1'
});

export const SnapshotBounds = Object.freeze({
  maxSideQuests: 100,
  maxProjects: 100
});

export const ProjectStatuses = Object.freeze([
  'planning',
  'active',
  'blocked',
  'complete'
]);
