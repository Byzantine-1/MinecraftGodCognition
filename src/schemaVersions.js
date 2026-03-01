export const SchemaVersion = Object.freeze({
  SNAPSHOT: 'snapshot.v1',
  PROFILE: 'profile.v1',
  PROPOSAL: 'proposal.v2'
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
