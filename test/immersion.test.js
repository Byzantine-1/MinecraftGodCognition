import assert from 'assert';
import { describe, it } from 'node:test';
import { mayorProfile } from '../src/agentProfiles.js';
import { inspectDecision } from '../src/decisionInspection.js';
import { createExecutionHandoff, createExecutionResult } from '../src/executionHandoff.js';
import {
  buildImmersionPrompt,
  generateImmersion,
  isValidDecisionInspectionPayload,
  isValidImmersionInput,
  isValidImmersionProvider,
  isValidNarrativeContext,
  normalizeNarrativeContext,
  resolveImmersionProvider,
  selectWorldMemoryForArtifact
} from '../src/immersion.js';
import { WorldMemoryContextType } from '../src/worldMemoryContext.js';
import { createDefaultSnapshot } from '../src/snapshotSchema.js';

function createNarrativeContext(overrides = {}) {
  return {
    narrativeState: {
      arcId: 'harvest-watch',
      chapterTitle: 'Walls Before Winter',
      currentBeat: 'The town prepares quietly under pressure.',
      motifs: ['lantern light', 'watchful silence']
    },
    chronicleSummary: {
      latestEntry: 'The council ordered timber and stone counted before dusk.',
      openThreads: ['east wall repairs', 'food ledger strain'],
      recentEvents: ['a patrol returned at dawn', 'a nether flare was seen last week']
    },
    factionTone: [
      { factionId: 'council', tone: 'measured resolve', stance: 'steady' },
      { factionId: 'craftsfolk', tone: 'wary optimism', stance: 'concerned' }
    ],
    speakerVoiceProfiles: [
      {
        speakerId: 'mayor-immersion',
        register: 'formal',
        style: 'measured',
        values: ['stability', 'duty'],
        bannedPhrases: ['guaranteed victory']
      },
      {
        speakerId: 'chronicler',
        register: 'archival',
        style: 'spare',
        values: ['accuracy'],
        bannedPhrases: ['miracle']
      }
    ],
    canonGuardrails: {
      immutableFacts: ['the engine remains authoritative', 'the east wall is under repair'],
      prohibitedClaims: ['the command already changed the world', 'the mayor can overrule execution rejection'],
      requiredDisclaimers: ['flavor text is advisory only']
    },
    ...overrides
  };
}

function createCanonicalWorldMemory() {
  return {
    type: WorldMemoryContextType,
    schemaVersion: 1,
    scope: {
      townId: 'town-immersion',
      factionId: 'council',
      chronicleLimit: 3,
      historyLimit: 4
    },
    recentChronicle: [
      {
        sourceRecordId: 'chronicle:c_03',
        entryType: 'project',
        message: 'Lantern posts rose along the east wall.',
        at: 300,
        townId: 'town-immersion',
        factionId: 'council',
        sourceRefId: 'pr_wall_east',
        tags: ['chronicle', 'town:town-immersion', 'type:project']
      },
      {
        sourceRecordId: 'chronicle:c_02',
        entryType: 'warning',
        message: 'A quiet ration count unsettled the square.',
        at: 200,
        townId: 'town-immersion',
        factionId: 'council',
        sourceRefId: 'warning_rations',
        tags: ['chronicle', 'town:town-immersion', 'type:warning']
      },
      {
        sourceRecordId: 'chronicle:c_01',
        entryType: 'speech',
        message: 'The mayor promised timber before frost.',
        at: 100,
        townId: 'town-immersion',
        factionId: 'council',
        sourceRefId: 'speech_mayor',
        tags: ['chronicle', 'town:town-immersion', 'type:speech']
      }
    ],
    recentHistory: [
      {
        sourceType: 'execution_receipt',
        handoffId: 'handoff_project',
        proposalType: 'PROJECT_ADVANCE',
        command: 'project advance town-immersion wall-east',
        authorityCommands: ['project advance town-immersion wall-east'],
        status: 'executed',
        reasonCode: 'EXECUTED',
        kind: 'execution_result',
        at: 400,
        townId: 'town-immersion',
        summary: 'East wall repairs advanced by one stage.'
      },
      {
        sourceType: 'execution_receipt',
        handoffId: 'handoff_salvage',
        proposalType: 'SALVAGE_PLAN',
        command: 'salvage initiate town-immersion scarcity',
        authorityCommands: ['salvage plan town-immersion ruined_hamlet_supplies'],
        status: 'stale',
        reasonCode: 'STALE_DECISION_EPOCH',
        kind: 'execution_result',
        at: 350,
        townId: 'town-immersion',
        summary: 'A salvage plan arrived too late for the day clock.'
      },
      {
        sourceType: 'execution_event',
        handoffId: 'handoff_project',
        proposalType: 'PROJECT_ADVANCE',
        command: 'project advance town-immersion wall-east',
        authorityCommands: ['project advance town-immersion wall-east'],
        status: 'executed',
        reasonCode: 'EXECUTED',
        kind: 'execution_started',
        at: 325,
        townId: 'town-immersion',
        summary: 'The captain handed the wall order to the engine.'
      }
    ],
    townSummary: {
      type: 'town-history-summary.v1',
      schemaVersion: 1,
      townId: 'town-immersion',
      chronicleCount: 3,
      historyCount: 3,
      lastChronicleAt: 300,
      lastHistoryAt: 400,
      hope: 55,
      dread: 22,
      activeMajorMissionId: 'mm_watch',
      recentImpactCount: 2,
      crierQueueDepth: 1,
      activeProjectCount: 1,
      factions: ['council'],
      executionCounts: {
        executed: 1,
        rejected: 0,
        stale: 1,
        duplicate: 0,
        failed: 0
      }
    },
    factionSummary: {
      type: 'faction-history-summary.v1',
      schemaVersion: 1,
      factionId: 'council',
      towns: ['town-immersion'],
      chronicleCount: 3,
      historyCount: 3,
      lastChronicleAt: 300,
      lastHistoryAt: 400,
      hostilityToPlayer: 10,
      stability: 81,
      doctrine: 'Order keeps the lamps lit.',
      rivals: ['smugglers']
    }
  };
}

function createStructuredImmersionInput({ narrativeContext = createNarrativeContext() } = {}) {
  const snapshot = createDefaultSnapshot('town-immersion', 8);
  const profile = {
    ...mayorProfile,
    id: 'mayor-immersion',
    townId: 'town-immersion'
  };
  snapshot.sideQuests = [
    { id: 'sq-wood', title: 'Gather Wood', complexity: 1 },
    { id: 'sq-stone', title: 'Gather Stone', complexity: 2 }
  ];
  snapshot.pressure = {
    threat: 0.35,
    scarcity: 0.4,
    hope: 0.55,
    dread: 0.25
  };
  snapshot.projects = [
    { id: 'wall-east', name: 'East Wall', progress: 0.4, status: 'active' }
  ];

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

describe('Immersion Adapter', () => {
  it('should expose a provider-agnostic adapter contract for qwen', async () => {
    const input = createStructuredImmersionInput();
    input.artifactType = 'leader-speech';

    assert.strictEqual(isValidDecisionInspectionPayload(input.decisionInspection), true);
    assert.strictEqual(isValidNarrativeContext(input.narrativeContext), true);
    assert.strictEqual(isValidImmersionInput(input), true);

    const provider = resolveImmersionProvider({
      LLM_PROVIDER: 'qwen',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://llm.example/v1/',
      LLM_MODEL: 'qwen-max'
    });
    const prompt = buildImmersionPrompt(input);
    let requestedUrl = null;
    let requestBody = null;

    assert.strictEqual(isValidImmersionProvider(provider), true);

    const result = await generateImmersion(input, {
      env: {
        LLM_PROVIDER: 'qwen',
        LLM_API_KEY: 'test-key',
        LLM_BASE_URL: 'https://llm.example/v1/',
        LLM_MODEL: 'qwen-max'
      },
      fetchImpl: async (url, init) => {
        requestedUrl = url;
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: 'The mayor spoke from the square, steady and precise.'
                  }
                }
              ]
            };
          }
        };
      }
    });

    assert.strictEqual(result.schemaVersion, 'immersion-result.v1');
    assert.deepStrictEqual(Object.keys(result).sort(), [
      'advisory',
      'artifactType',
      'authority',
      'content',
      'prompt',
      'provider',
      'schemaVersion',
      'sourceSchemas',
      'status'
    ].sort());
    assert.strictEqual(result.status, 'generated');
    assert.strictEqual(result.provider.used, 'qwen');
    assert.strictEqual(result.provider.model, 'qwen-max');
    assert.strictEqual(result.content, 'The mayor spoke from the square, steady and precise.');
    assert.strictEqual(requestedUrl, 'https://llm.example/v1/chat/completions');
    assert.strictEqual(requestBody.model, 'qwen-max');
    assert.deepStrictEqual(requestBody.messages, [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]);
  });

  it('should use a deterministic fallback path when no provider is configured', async () => {
    const input = createStructuredImmersionInput();
    input.artifactType = 'town-rumor';

    const first = await generateImmersion(input, { env: {} });
    const second = await generateImmersion(input, { env: {} });

    assert.deepStrictEqual(first, second);
    assert.strictEqual(first.status, 'fallback');
    assert.strictEqual(first.provider.requested, 'none');
    assert.strictEqual(first.provider.used, 'fallback');
    assert.strictEqual(typeof first.content, 'string');
    assert(first.content.toLowerCase().includes('town-immersion'));
    assert(first.content.toLowerCase().includes('rumor'));
    assert.strictEqual(first.error.code, 'PROVIDER_UNAVAILABLE');
  });

  it('should degrade gracefully when the provider request fails', async () => {
    const input = createStructuredImmersionInput();
    input.artifactType = 'outcome-blurb';

    const result = await generateImmersion(input, {
      env: {
        LLM_PROVIDER: 'qwen',
        LLM_API_KEY: 'test-key',
        LLM_BASE_URL: 'https://llm.example/v1',
        LLM_MODEL: 'qwen-max'
      },
      fetchImpl: async () => {
        throw new Error('socket timeout');
      }
    });

    assert.strictEqual(result.status, 'fallback');
    assert.strictEqual(result.provider.requested, 'qwen');
    assert.strictEqual(result.provider.used, 'fallback');
    assert.strictEqual(result.error.code, 'PROVIDER_REQUEST_FAILED');
    assert(result.content.toLowerCase().includes('town-immersion'));
    assert(result.content.toLowerCase().includes('outcome'));
  });

  it('should build stable prompts from equivalent structured inputs', () => {
    const firstInput = createStructuredImmersionInput({
      narrativeContext: createNarrativeContext({
        factionTone: [
          { factionId: 'craftsfolk', tone: 'wary optimism', stance: 'concerned' },
          { factionId: 'council', tone: 'measured resolve', stance: 'steady' }
        ],
        speakerVoiceProfiles: [
          {
            speakerId: 'chronicler',
            register: 'archival',
            style: 'spare',
            values: ['accuracy'],
            bannedPhrases: ['miracle']
          },
          {
            speakerId: 'mayor-immersion',
            register: 'formal',
            style: 'measured',
            values: ['duty', 'stability'],
            bannedPhrases: ['guaranteed victory']
          }
        ],
        canonGuardrails: {
          immutableFacts: ['the east wall is under repair', 'the engine remains authoritative'],
          prohibitedClaims: ['the mayor can overrule execution rejection', 'the command already changed the world'],
          requiredDisclaimers: ['flavor text is advisory only']
        }
      })
    });
    const secondInput = createStructuredImmersionInput({
      narrativeContext: createNarrativeContext({
        factionTone: [
          { factionId: 'council', tone: 'measured resolve', stance: 'steady' },
          { factionId: 'craftsfolk', tone: 'wary optimism', stance: 'concerned' }
        ],
        speakerVoiceProfiles: [
          {
            speakerId: 'mayor-immersion',
            register: 'formal',
            style: 'measured',
            values: ['stability', 'duty'],
            bannedPhrases: ['guaranteed victory']
          },
          {
            speakerId: 'chronicler',
            register: 'archival',
            style: 'spare',
            values: ['accuracy'],
            bannedPhrases: ['miracle']
          }
        ],
        canonGuardrails: {
          immutableFacts: ['the engine remains authoritative', 'the east wall is under repair'],
          prohibitedClaims: ['the command already changed the world', 'the mayor can overrule execution rejection'],
          requiredDisclaimers: ['flavor text is advisory only']
        }
      })
    });

    firstInput.worldSummary = { weather: 'clear', morale: 'steady', walls: 'under repair' };
    secondInput.worldSummary = { walls: 'under repair', morale: 'steady', weather: 'clear' };

    assert.deepStrictEqual(
      normalizeNarrativeContext(firstInput.narrativeContext),
      normalizeNarrativeContext(secondInput.narrativeContext)
    );

    const firstPrompt = buildImmersionPrompt(firstInput);
    const secondPrompt = buildImmersionPrompt(secondInput);

    assert.deepStrictEqual(firstPrompt, secondPrompt);
  });

  it('should let voice profiles change downstream flavor without changing authority', async () => {
    const formalInput = createStructuredImmersionInput({
      narrativeContext: createNarrativeContext({
        speakerVoiceProfiles: [
          {
            speakerId: 'mayor-immersion',
            register: 'formal',
            style: 'measured',
            values: ['stability'],
            bannedPhrases: ['guaranteed victory']
          }
        ]
      })
    });
    const plainInput = createStructuredImmersionInput({
      narrativeContext: createNarrativeContext({
        speakerVoiceProfiles: [
          {
            speakerId: 'mayor-immersion',
            register: 'plain',
            style: 'direct',
            values: ['clarity'],
            bannedPhrases: ['glorious destiny']
          }
        ]
      })
    });
    formalInput.artifactType = 'leader-speech';
    plainInput.artifactType = 'leader-speech';

    const formalPrompt = buildImmersionPrompt(formalInput);
    const plainPrompt = buildImmersionPrompt(plainInput);
    const formalResult = await generateImmersion(formalInput, { env: {} });
    const plainResult = await generateImmersion(plainInput, { env: {} });

    assert.notDeepStrictEqual(formalPrompt, plainPrompt);
    assert.notStrictEqual(formalResult.content, plainResult.content);
    assert.deepStrictEqual(formalResult.authority, plainResult.authority);
  });

  it('should shape canonical world memory differently for each immersion mode', () => {
    const worldMemory = createCanonicalWorldMemory();

    const leaderMemory = selectWorldMemoryForArtifact('leader-speech', worldMemory);
    const rumorMemory = selectWorldMemoryForArtifact('town-rumor', worldMemory);
    const chronicleMemory = selectWorldMemoryForArtifact('chronicle-entry', worldMemory);
    const outcomeMemory = selectWorldMemoryForArtifact('outcome-blurb', worldMemory);

    assert.strictEqual(leaderMemory.recentChronicle.length, 2);
    assert.strictEqual(leaderMemory.recentHistory.length, 1);
    assert.strictEqual(leaderMemory.recentHistory[0].status, 'executed');
    assert.strictEqual(Boolean(leaderMemory.townSummary), true);
    assert.strictEqual(Boolean(leaderMemory.factionSummary), false);

    assert.strictEqual(rumorMemory.recentChronicle.length, 2);
    assert.strictEqual(rumorMemory.recentHistory.length, 1);
    assert.strictEqual(rumorMemory.recentHistory[0].status, 'stale');
    assert.strictEqual(Boolean(rumorMemory.townSummary), false);
    assert.strictEqual(Boolean(rumorMemory.factionSummary), true);

    assert.strictEqual(chronicleMemory.recentChronicle.length, 1);
    assert.strictEqual(chronicleMemory.recentHistory.length, 2);
    assert.strictEqual(chronicleMemory.recentHistory[0].sourceType, 'execution_receipt');
    assert.strictEqual(Boolean(chronicleMemory.townSummary), true);

    assert.strictEqual(outcomeMemory.recentChronicle.length, 1);
    assert.strictEqual(outcomeMemory.recentHistory.length, 2);
    assert.strictEqual(outcomeMemory.recentHistory[0].summary, 'East wall repairs advanced by one stage.');
    assert.strictEqual(Boolean(outcomeMemory.townSummary), true);
  });

  it('should build stable mode-specific prompts from equivalent retrieved world memory', () => {
    const worldMemory = createCanonicalWorldMemory();
    const firstInput = createStructuredImmersionInput({
      narrativeContext: createNarrativeContext({
        worldMemory
      })
    });
    const secondInput = createStructuredImmersionInput({
      narrativeContext: createNarrativeContext({
        worldMemory: JSON.parse(JSON.stringify(worldMemory))
      })
    });
    firstInput.artifactType = 'town-rumor';
    secondInput.artifactType = 'town-rumor';

    const firstPrompt = buildImmersionPrompt(firstInput);
    const secondPrompt = buildImmersionPrompt(secondInput);

    assert.deepStrictEqual(firstPrompt, secondPrompt);
    assert(firstPrompt.system.includes('suggestive details'));
    assert(firstPrompt.user.includes('A salvage plan arrived too late for the day clock.'));
    assert(firstPrompt.user.includes('Order keeps the lamps lit.'));
    assert(!firstPrompt.user.includes('"townSummary"'));
  });

  it('should fall back safely when narrative context is absent', async () => {
    const input = createStructuredImmersionInput({ narrativeContext: undefined });

    assert.strictEqual(isValidNarrativeContext(input.narrativeContext), true);

    const prompt = buildImmersionPrompt(input);
    const result = await generateImmersion(input, { env: {} });

    assert.strictEqual(typeof prompt.system, 'string');
    assert.strictEqual(result.status, 'fallback');
    assert.strictEqual(typeof result.content, 'string');
    assert.strictEqual(result.authority.commandExecution, false);
  });

  it('should fall back safely when world-memory context is absent from an otherwise valid narrative context', async () => {
    const input = createStructuredImmersionInput({
      narrativeContext: createNarrativeContext()
    });
    input.artifactType = 'leader-speech';

    const prompt = buildImmersionPrompt(input);
    const result = await generateImmersion(input, { env: {} });

    assert.strictEqual(typeof prompt.system, 'string');
    assert(!prompt.system.includes('When world memory is present'));
    assert.strictEqual(result.status, 'fallback');
    assert(result.content.includes('The council backs'));
    assert.strictEqual(result.authority.stateMutation, false);
  });

  it('should remain downstream and non-authoritative', async () => {
    const input = createStructuredImmersionInput({
      narrativeContext: createNarrativeContext({
        worldMemory: createCanonicalWorldMemory()
      })
    });
    const snapshotBefore = JSON.parse(JSON.stringify(input));

    const result = await generateImmersion(input, { env: {} });

    assert.strictEqual(result.advisory, true);
    assert.deepStrictEqual(result.authority, {
      proposalSelection: false,
      commandExecution: false,
      stateMutation: false
    });
    assert.strictEqual(result.sourceSchemas.decisionInspection, 'decision-inspection.v1');
    assert.strictEqual(result.sourceSchemas.executionHandoff, 'execution-handoff.v1');
    assert.strictEqual(result.sourceSchemas.executionResult, 'execution-result.v1');
    assert.deepStrictEqual(input, snapshotBefore);
  });
});
