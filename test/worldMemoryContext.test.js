import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it } from 'node:test';
import engineExecutionStoreModule from '../../minecraft-god-mvp/src/executionStore.js';
import engineGodCommandsModule from '../../minecraft-god-mvp/src/godCommands.js';
import engineMemoryModule from '../../minecraft-god-mvp/src/memory.js';
import engineWorldMemoryContextModule from '../../minecraft-god-mvp/src/worldMemoryContext.js';
import engineSnapshotProjectionModule from '../../minecraft-god-mvp/src/worldSnapshotProjection.js';
import engineExecutionAdapterModule from '../../minecraft-god-mvp/src/executionAdapter.js';
import { mayorProfile } from '../src/agentProfiles.js';
import { inspectDecision } from '../src/decisionInspection.js';
import { createExecutionHandoff, createExecutionResult } from '../src/executionHandoff.js';
import {
  buildImmersionPrompt,
  generateImmersion,
  isValidNarrativeContext
} from '../src/immersion.js';
import {
  createNarrativeContextWithWorldMemory,
  isValidWorldMemoryContext,
  normalizeWorldMemoryContext,
  parseWorldMemoryContextLine
} from '../src/worldMemoryContext.js';
import { createDefaultSnapshot } from '../src/snapshotSchema.js';

const { createExecutionStore, createMemoryExecutionPersistence, createSqliteExecutionPersistence } = engineExecutionStoreModule;
const { createGodCommandService } = engineGodCommandsModule;
const { createMemoryStore } = engineMemoryModule;
const { createWorldMemoryContextForRequest, createWorldMemoryRequest } = engineWorldMemoryContextModule;
const { createAuthoritativeSnapshotProjection } = engineSnapshotProjectionModule;
const { createExecutionAdapter } = engineExecutionAdapterModule;

function createTempPaths(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    dir,
    memoryPath: path.join(dir, 'memory.json'),
    sqlitePath: path.join(dir, 'execution.sqlite3')
  };
}

function fixedNowFactory() {
  return () => Date.parse('2026-02-25T00:00:00.000Z');
}

function createAgents() {
  return [
    { name: 'Mara', faction: 'Pilgrims', applyGodCommand: () => {} },
    { name: 'Eli', faction: 'Pilgrims', applyGodCommand: () => {} }
  ];
}

function snapshotHashForStore(memoryStore) {
  return createAuthoritativeSnapshotProjection(memoryStore.recallWorld()).snapshotHash;
}

function createEngineContext(backendName) {
  const { memoryPath, sqlitePath } = createTempPaths(`cognition-world-memory-${backendName}-`);
  const now = fixedNowFactory();
  const memoryStore = createMemoryStore({ filePath: memoryPath, now });
  const persistenceBackend = backendName === 'sqlite'
    ? createSqliteExecutionPersistence({ dbPath: sqlitePath, now })
    : createMemoryExecutionPersistence({ memoryStore });
  const executionStore = createExecutionStore({
    memoryStore,
    persistenceBackend
  });
  const godCommandService = createGodCommandService({ memoryStore });
  const executionAdapter = createExecutionAdapter({
    memoryStore,
    godCommandService,
    executionStore
  });

  return {
    memoryStore,
    executionStore,
    godCommandService,
    executionAdapter
  };
}

function buildHandoff({
  proposalType,
  command,
  args,
  townId = 'alpha',
  actorId = 'mara',
  decisionEpoch = 1,
  snapshotHash = 'a'.repeat(64),
  preconditions = []
}) {
  const snapshot = {
    proposalType,
    command,
    args,
    townId,
    actorId,
    decisionEpoch
  };
  const proposalId = `proposal_${crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}`;
  const handoff = {
    schemaVersion: 'execution-handoff.v1',
    handoffId: `handoff_${crypto.createHash('sha256').update(JSON.stringify({ proposalId, command })).digest('hex')}`,
    advisory: true,
    proposalId,
    idempotencyKey: proposalId,
    snapshotHash,
    decisionEpoch,
    proposal: {
      schemaVersion: 'proposal.v2',
      proposalId,
      snapshotHash,
      decisionEpoch,
      type: proposalType,
      actorId,
      townId,
      priority: 0.8,
      reason: 'World memory cognition test.',
      reasonTags: ['test'],
      args
    },
    command,
    executionRequirements: {
      expectedSnapshotHash: snapshotHash,
      expectedDecisionEpoch: decisionEpoch,
      preconditions
    }
  };
  return handoff;
}

async function seedEngineWorldMemory(context) {
  const agents = createAgents();
  await context.godCommandService.applyGodCommand({
    agents,
    command: 'mark add alpha_hall 0 64 0 town:alpha',
    operationId: 'cognition-world-memory:seed-town-alpha'
  });
  await context.godCommandService.applyGodCommand({
    agents,
    command: 'project start alpha lantern_line',
    operationId: 'cognition-world-memory:seed-project-alpha'
  });
  await context.memoryStore.transact((memory) => {
    memory.world.factions.iron_pact = {
      name: 'iron_pact',
      towns: ['alpha'],
      doctrine: 'Order through steel.',
      rivals: ['veil_church'],
      hostilityToPlayer: 22,
      stability: 74
    };
    memory.world.chronicle.push(
      {
        id: 'c_alpha_01',
        type: 'mission',
        msg: 'Alpha mayor briefed a new mission.',
        at: 9000000000101,
        town: 'alpha',
        meta: { factionId: 'iron_pact', missionId: 'mm_alpha_1' }
      },
      {
        id: 'c_alpha_02',
        type: 'project',
        msg: 'Alpha raised the first lantern posts.',
        at: 9000000000102,
        town: 'alpha',
        meta: { factionId: 'iron_pact', projectId: 'pr_alpha_1' }
      }
    );
  }, { eventId: 'cognition-world-memory:chronicle-seed' });

  const projectId = context.memoryStore.getSnapshot().world.projects[0].id;
  await context.executionAdapter.executeHandoff({
    agents,
    handoff: buildHandoff({
      proposalType: 'PROJECT_ADVANCE',
      command: `project advance alpha ${projectId}`,
      args: { projectId },
      snapshotHash: snapshotHashForStore(context.memoryStore),
      preconditions: [{ kind: 'project_exists', targetId: projectId }]
    })
  });
  await context.executionAdapter.executeHandoff({
    agents,
    handoff: buildHandoff({
      proposalType: 'SALVAGE_PLAN',
      command: 'salvage initiate alpha scarcity',
      args: { focus: 'scarcity' },
      decisionEpoch: 2,
      snapshotHash: snapshotHashForStore(context.memoryStore),
      preconditions: [{ kind: 'salvage_focus_supported', expected: 'scarcity' }]
    })
  });
}

function createImmersionInput(narrativeContext) {
  const snapshot = createDefaultSnapshot('alpha', 8);
  const profile = {
    ...mayorProfile,
    id: 'mayor-immersion',
    townId: 'alpha'
  };
  snapshot.sideQuests = [
    { id: 'sq-wood', title: 'Gather Wood', complexity: 1 }
  ];
  snapshot.projects = [
    { id: 'wall-east', name: 'East Wall', progress: 0.4, status: 'active' }
  ];
  snapshot.pressure = {
    threat: 0.45,
    scarcity: 0.35,
    hope: 0.55,
    dread: 0.22
  };

  const decisionInspection = inspectDecision(snapshot, profile);
  const executionHandoff = createExecutionHandoff(
    decisionInspection.selectedProposal,
    decisionInspection.command
  );
  const executionResult = createExecutionResult(executionHandoff, {
    status: 'executed',
    accepted: true,
    executed: true,
    reasonCode: 'EXECUTED',
    preconditions: {
      evaluated: true,
      passed: true,
      failures: []
    },
    staleCheck: {
      evaluated: true,
      passed: true,
      actualSnapshotHash: executionHandoff.snapshotHash,
      actualDecisionEpoch: executionHandoff.decisionEpoch
    },
    duplicateCheck: {
      evaluated: true,
      duplicate: false,
      duplicateOf: null
    },
    worldState: {
      postExecutionSnapshotHash: executionHandoff.snapshotHash,
      postExecutionDecisionEpoch: executionHandoff.decisionEpoch + 1
    }
  });

  return {
    artifactType: 'chronicle-entry',
    decisionInspection,
    executionHandoff,
    executionResult,
    narrativeContext,
    worldSummary: {
      morale: 'steady',
      weather: 'clear',
      walls: 'under repair'
    }
  };
}

describe('World Memory Narrative Context', () => {
  it('should normalize stable world-memory context shape from memory and sqlite-backed engine state', async () => {
    const memoryContext = createEngineContext('memory');
    const sqliteContext = createEngineContext('sqlite');

    await seedEngineWorldMemory(memoryContext);
    await seedEngineWorldMemory(sqliteContext);
    const request = createWorldMemoryRequest({
      townId: 'alpha',
      factionId: 'iron_pact',
      chronicleLimit: 2,
      historyLimit: 3
    });

    const memoryWorldMemory = parseWorldMemoryContextLine(JSON.stringify(createWorldMemoryContextForRequest({
      executionStore: memoryContext.executionStore,
      request
    })));
    const sqliteWorldMemory = parseWorldMemoryContextLine(JSON.stringify(createWorldMemoryContextForRequest({
      executionStore: sqliteContext.executionStore,
      request
    })));

    assert.strictEqual(isValidWorldMemoryContext(memoryWorldMemory), true);
    assert.strictEqual(isValidWorldMemoryContext(sqliteWorldMemory), true);
    assert.deepStrictEqual(
      normalizeWorldMemoryContext(sqliteWorldMemory),
      normalizeWorldMemoryContext(memoryWorldMemory)
    );
  });

  it('should parse canonical engine world-memory payload lines directly', async () => {
    const engineContext = createEngineContext('memory');
    await seedEngineWorldMemory(engineContext);
    const request = createWorldMemoryRequest({
      townId: 'alpha',
      factionId: 'iron_pact',
      chronicleLimit: 2,
      historyLimit: 3
    });
    const line = JSON.stringify(createWorldMemoryContextForRequest({
      executionStore: engineContext.executionStore,
      request
    }));

    const parsed = parseWorldMemoryContextLine(line);

    assert.strictEqual(isValidWorldMemoryContext(parsed), true);
    assert.strictEqual(parsed.scope.townId, 'alpha');
    assert.strictEqual(parsed.recentChronicle.length, 2);
    assert.strictEqual(parsed.recentHistory.length, 3);
    assert.strictEqual(parseWorldMemoryContextLine('not json'), null);
  });

  it('should enrich immersion prompt context with real retrieved history while remaining advisory-only', async () => {
    const engineContext = createEngineContext('memory');
    await seedEngineWorldMemory(engineContext);
    const request = createWorldMemoryRequest({
      townId: 'alpha',
      factionId: 'iron_pact',
      chronicleLimit: 2,
      historyLimit: 3
    });
    const worldMemory = parseWorldMemoryContextLine(JSON.stringify(createWorldMemoryContextForRequest({
      executionStore: engineContext.executionStore,
      request
    })));

    const narrativeContext = createNarrativeContextWithWorldMemory({
      narrativeState: {
        arcId: 'harvest-watch',
        chapterTitle: 'Walls Before Winter',
        currentBeat: 'The town prepares quietly under pressure.',
        motifs: ['lantern light', 'watchful silence']
      },
      canonGuardrails: {
        immutableFacts: ['the engine remains authoritative'],
        prohibitedClaims: ['flavor text can execute commands'],
        requiredDisclaimers: ['flavor text is advisory only']
      }
    }, worldMemory);

    assert.strictEqual(isValidNarrativeContext(narrativeContext), true);

    const input = createImmersionInput(narrativeContext);
    const snapshotBefore = JSON.parse(JSON.stringify(input));
    const prompt = buildImmersionPrompt(input);
    const result = await generateImmersion(input, { env: {} });

    assert(prompt.user.includes('world-memory-context.v1'));
    assert(prompt.user.includes('Alpha raised the first lantern posts.'));
    assert(prompt.user.includes('STALE_DECISION_EPOCH'));
    assert(prompt.user.includes('iron_pact'));
    assert.strictEqual(result.authority.commandExecution, false);
    assert.strictEqual(result.authority.stateMutation, false);
    assert.deepStrictEqual(input, snapshotBefore);
  });
});
