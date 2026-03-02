import assert from 'assert';
import { describe, it } from 'node:test';
import { captainProfile, mayorProfile, wardenProfile } from '../src/agentProfiles.js';
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
  selectActorContinuity,
  selectWorldMemoryForArtifact,
  selectWorldMemoryForImmersionInput,
  selectWorldMemoryForRole
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
        speakerId: 'mayor-harbor',
        register: 'plain',
        style: 'civic',
        values: ['continuity', 'order'],
        bannedPhrases: ['glorious dawn']
      },
      {
        speakerId: 'captain-immersion',
        register: 'martial',
        style: 'plain',
        values: ['readiness', 'clarity'],
        bannedPhrases: ['glorious destiny']
      },
      {
        speakerId: 'captain-harbor',
        register: 'brisk',
        style: 'field-report',
        values: ['speed', 'discipline'],
        bannedPhrases: ['eternal calm']
      },
      {
        speakerId: 'warden-immersion',
        register: 'practical',
        style: 'cautious',
        values: ['survival', 'reserve'],
        bannedPhrases: ['endless abundance']
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
        handoffId: 'handoff_mission',
        proposalType: 'MAYOR_ACCEPT_MISSION',
        command: 'mission accept town-immersion sq-wood',
        authorityCommands: ['mayor talk town-immersion', 'mayor accept town-immersion'],
        status: 'executed',
        reasonCode: 'EXECUTED',
        kind: 'execution_result',
        at: 375,
        townId: 'town-immersion',
        summary: 'The mayor accepted a timber-gathering mission for the town.'
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
      historyCount: 4,
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
      historyCount: 4,
      lastChronicleAt: 300,
      lastHistoryAt: 400,
      hostilityToPlayer: 10,
      stability: 81,
      doctrine: 'Order keeps the lamps lit.',
      rivals: ['smugglers']
    }
  };
}

function createRankingWorldMemory() {
  const worldMemory = createCanonicalWorldMemory();

  return {
    ...worldMemory,
    scope: {
      ...worldMemory.scope,
      chronicleLimit: 4,
      historyLimit: 5
    },
    recentChronicle: [
      {
        sourceRecordId: 'chronicle:c_04',
        entryType: 'speech',
        message: 'The harvest choir praised the fine weather at noon.',
        at: 500,
        townId: 'town-immersion',
        factionId: 'council',
        sourceRefId: 'speech_harvest',
        tags: ['chronicle', 'town:town-immersion', 'type:speech']
      },
      ...worldMemory.recentChronicle
    ],
    recentHistory: [
      {
        sourceType: 'execution_receipt',
        handoffId: 'handoff_trade',
        proposalType: 'MAYOR_ACCEPT_MISSION',
        command: 'mission accept town-immersion sq-market',
        authorityCommands: ['mayor talk town-immersion', 'mayor accept town-immersion'],
        status: 'executed',
        reasonCode: 'EXECUTED',
        kind: 'execution_result',
        at: 420,
        townId: 'town-immersion',
        summary: 'A market caravan accord was accepted before dusk.'
      },
      ...worldMemory.recentHistory
    ]
  };
}

function createStructuredImmersionInput({
  narrativeContext = createNarrativeContext(),
  profileTemplate = mayorProfile,
  artifactType = 'chronicle-entry',
  actorId,
  pressureOverrides = {}
} = {}) {
  const snapshot = createDefaultSnapshot('town-immersion', 8);
  const profileId = ({
    mayor: 'mayor-immersion',
    captain: 'captain-immersion',
    warden: 'warden-immersion'
  })[profileTemplate.role] ?? `${profileTemplate.role}-immersion`;
  const profile = {
    ...profileTemplate,
    id: actorId ?? profileId,
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
    dread: 0.25,
    ...pressureOverrides
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
    artifactType,
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

  it('should shape shared world memory differently for mayor, captain, warden, and townsfolk roles', () => {
    const worldMemory = createCanonicalWorldMemory();

    const mayorMemory = selectWorldMemoryForRole('mayor', 'leader-speech', worldMemory);
    const captainMemory = selectWorldMemoryForRole('captain', 'leader-speech', worldMemory);
    const wardenMemory = selectWorldMemoryForRole('warden', 'outcome-blurb', worldMemory);
    const townsfolkMemory = selectWorldMemoryForRole('townsfolk', 'town-rumor', worldMemory);

    assert.strictEqual(mayorMemory.recentHistory[0].proposalType, 'MAYOR_ACCEPT_MISSION');
    assert.strictEqual(Boolean(mayorMemory.townSummary), true);
    assert.strictEqual(Boolean(mayorMemory.factionSummary), false);

    assert.strictEqual(captainMemory.recentChronicle[0].entryType, 'project');
    assert.strictEqual(captainMemory.recentHistory[0].proposalType, 'PROJECT_ADVANCE');
    assert.strictEqual(Boolean(captainMemory.townSummary), true);

    assert.strictEqual(wardenMemory.recentChronicle[0].entryType, 'warning');
    assert.strictEqual(wardenMemory.recentHistory[0].proposalType, 'SALVAGE_PLAN');
    assert.strictEqual(wardenMemory.recentHistory[0].status, 'stale');

    assert.strictEqual(Boolean(townsfolkMemory.townSummary), false);
    assert.strictEqual(Boolean(townsfolkMemory.factionSummary), true);
    assert.strictEqual(townsfolkMemory.recentHistory[0].kind, 'execution_result');
  });

  it('should rank more role-relevant world-memory items ahead of merely newer ones', () => {
    const worldMemory = createRankingWorldMemory();

    const captainMemory = selectWorldMemoryForRole('captain', 'leader-speech', worldMemory);
    const mayorMemory = selectWorldMemoryForRole('mayor', 'leader-speech', worldMemory);

    assert.strictEqual(captainMemory.recentChronicle[0].sourceRecordId, 'chronicle:c_03');
    assert.strictEqual(captainMemory.recentChronicle[0].message, 'Lantern posts rose along the east wall.');
    assert.strictEqual(mayorMemory.recentHistory[0].handoffId, 'handoff_trade');
    assert.strictEqual(mayorMemory.recentHistory[0].summary, 'A market caravan accord was accepted before dusk.');
  });

  it('should change world-memory ranking deterministically when the artifact mode changes', () => {
    const worldMemory = createRankingWorldMemory();

    const leaderMemory = selectWorldMemoryForArtifact('leader-speech', worldMemory);
    const rumorMemory = selectWorldMemoryForArtifact('town-rumor', worldMemory);
    const chronicleMemory = selectWorldMemoryForRole('captain', 'chronicle-entry', worldMemory);

    assert.strictEqual(leaderMemory.recentHistory[0].handoffId, 'handoff_trade');
    assert.strictEqual(rumorMemory.recentHistory[0].handoffId, 'handoff_salvage');
    assert.strictEqual(chronicleMemory.recentChronicle.length, 1);
    assert.strictEqual(chronicleMemory.recentChronicle[0].sourceRecordId, 'chronicle:c_03');
  });

  it('should select the same ranked world-memory slice for the same immersion input every run', () => {
    const worldMemory = createRankingWorldMemory();
    const input = createStructuredImmersionInput({
      artifactType: 'chronicle-entry',
      actorId: 'captain-harbor',
      profileTemplate: captainProfile,
      narrativeContext: createNarrativeContext({ worldMemory })
    });

    const firstSelection = selectWorldMemoryForImmersionInput(input);
    const secondSelection = selectWorldMemoryForImmersionInput(JSON.parse(JSON.stringify(input)));

    assert.deepStrictEqual(firstSelection, secondSelection);
    assert.strictEqual(firstSelection.recentChronicle.length, 1);
    assert.strictEqual(firstSelection.recentChronicle[0].sourceRecordId, 'chronicle:c_03');
    assert.strictEqual(firstSelection.recentHistory[0].handoffId, 'handoff_project');
  });

  it('should use the same ranked world-memory slice for provider-backed and fallback prompt paths', async () => {
    const input = createStructuredImmersionInput({
      artifactType: 'chronicle-entry',
      actorId: 'captain-harbor',
      profileTemplate: captainProfile,
      narrativeContext: createNarrativeContext({
        worldMemory: createRankingWorldMemory()
      })
    });
    const selectedWorldMemory = selectWorldMemoryForImmersionInput(input);
    const prompt = buildImmersionPrompt(input);
    let requestBody = null;

    const providerResult = await generateImmersion(input, {
      env: {
        LLM_PROVIDER: 'qwen',
        LLM_API_KEY: 'test-key',
        LLM_BASE_URL: 'https://llm.example/v1',
        LLM_MODEL: 'qwen-max'
      },
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: 'The captain marked the wall work in the record.'
                  }
                }
              ]
            };
          }
        };
      }
    });
    const fallbackResult = await generateImmersion(input, { env: {} });

    assert.deepStrictEqual(requestBody.messages[1].content, prompt.user);
    assert.strictEqual(providerResult.prompt.hash, prompt.promptHash);
    assert.strictEqual(fallbackResult.prompt.hash, prompt.promptHash);
    assert(prompt.user.includes(selectedWorldMemory.recentChronicle[0].message));
    assert(prompt.user.includes(selectedWorldMemory.recentHistory[0].summary));
    assert(!prompt.user.includes('The harvest choir praised the fine weather at noon.'));
  });

  it('should keep role-shaped memory slices consistent with the same shared canonical payload', () => {
    const worldMemory = createCanonicalWorldMemory();
    const roles = [
      ['mayor', 'leader-speech'],
      ['captain', 'leader-speech'],
      ['warden', 'outcome-blurb'],
      ['townsfolk', 'town-rumor']
    ];
    const baseChronicleIds = new Set(worldMemory.recentChronicle.map(entry => entry.sourceRecordId));
    const baseHistoryIds = new Set(worldMemory.recentHistory.map(entry => `${entry.handoffId}:${entry.summary}`));

    for (const [role, artifactType] of roles) {
      const shaped = selectWorldMemoryForRole(role, artifactType, worldMemory);

      assert.strictEqual(shaped.type, worldMemory.type);
      assert.strictEqual(shaped.schemaVersion, worldMemory.schemaVersion);
      assert.deepStrictEqual(shaped.scope, worldMemory.scope);
      assert(shaped.recentChronicle.every(entry => baseChronicleIds.has(entry.sourceRecordId)));
      assert(shaped.recentHistory.every(entry => baseHistoryIds.has(`${entry.handoffId}:${entry.summary}`)));
    }
  });

  it('should derive stable actor-specific continuity from the same role and memory', () => {
    const input = createStructuredImmersionInput({
      artifactType: 'leader-speech',
      actorId: 'mayor-immersion',
      narrativeContext: createNarrativeContext({
        worldMemory: createCanonicalWorldMemory()
      })
    });

    const firstContinuity = selectActorContinuity(input);
    const secondContinuity = selectActorContinuity(JSON.parse(JSON.stringify(input)));

    assert.deepStrictEqual(firstContinuity, secondContinuity);
    assert.strictEqual(firstContinuity.role, 'mayor');
    assert.strictEqual(firstContinuity.officeTitle, 'Mayor');
    assert.strictEqual(firstContinuity.speakerId, 'mayor-immersion');
    assert.strictEqual(typeof firstContinuity.recentConcern, 'string');
    assert(firstContinuity.displayName.includes('Mayor mayor-immersion'));
  });

  it('should keep actor continuity stable after ranked memory selection changes', () => {
    const input = createStructuredImmersionInput({
      artifactType: 'leader-speech',
      actorId: 'mayor-harbor',
      narrativeContext: createNarrativeContext({
        worldMemory: createRankingWorldMemory()
      })
    });

    const firstSelection = selectWorldMemoryForImmersionInput(input);
    const secondSelection = selectWorldMemoryForImmersionInput(JSON.parse(JSON.stringify(input)));
    const firstContinuity = selectActorContinuity(input);
    const secondContinuity = selectActorContinuity(JSON.parse(JSON.stringify(input)));

    assert.deepStrictEqual(firstSelection, secondSelection);
    assert.deepStrictEqual(firstContinuity, secondContinuity);
    assert.strictEqual(firstContinuity.role, 'mayor');
    assert.strictEqual(firstContinuity.speakerId, 'mayor-harbor');
  });

  it('should keep same-role actor differences bounded and actor-specific', () => {
    const worldMemory = createCanonicalWorldMemory();
    const firstInput = createStructuredImmersionInput({
      artifactType: 'leader-speech',
      actorId: 'mayor-immersion',
      narrativeContext: createNarrativeContext({ worldMemory })
    });
    const secondInput = createStructuredImmersionInput({
      artifactType: 'leader-speech',
      actorId: 'mayor-harbor',
      narrativeContext: createNarrativeContext({ worldMemory: JSON.parse(JSON.stringify(worldMemory)) })
    });

    const firstPrompt = buildImmersionPrompt(firstInput);
    const secondPrompt = buildImmersionPrompt(secondInput);
    const firstContinuity = selectActorContinuity(firstInput);
    const secondContinuity = selectActorContinuity(secondInput);

    assert.strictEqual(firstContinuity.role, secondContinuity.role);
    assert.strictEqual(firstContinuity.officeTitle, secondContinuity.officeTitle);
    assert.notStrictEqual(firstContinuity.actorId, secondContinuity.actorId);
    assert.notStrictEqual(firstContinuity.speakerId, secondContinuity.speakerId);
    assert.notDeepStrictEqual(firstPrompt, secondPrompt);
    assert(firstPrompt.user.includes('"actorId":"mayor-immersion"'));
    assert(secondPrompt.user.includes('"actorId":"mayor-harbor"'));
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

  it('should keep repeated role-aware prompts and fallback results stable for the same role and memory', async () => {
    const narrativeContext = createNarrativeContext({
      worldMemory: createCanonicalWorldMemory()
    });
    const firstInput = createStructuredImmersionInput({
      artifactType: 'leader-speech',
      profileTemplate: captainProfile,
      pressureOverrides: { threat: 0.72 },
      narrativeContext
    });
    const secondInput = createStructuredImmersionInput({
      artifactType: 'leader-speech',
      profileTemplate: captainProfile,
      pressureOverrides: { threat: 0.72 },
      narrativeContext: JSON.parse(JSON.stringify(narrativeContext))
    });

    const firstPrompt = buildImmersionPrompt(firstInput);
    const secondPrompt = buildImmersionPrompt(secondInput);
    const firstResult = await generateImmersion(firstInput, { env: {} });
    const secondResult = await generateImmersion(secondInput, { env: {} });

    assert.deepStrictEqual(firstPrompt, secondPrompt);
    assert.deepStrictEqual(firstResult, secondResult);
    assert(firstPrompt.system.includes('Role continuity emphasis: captain.'));
    assert(firstResult.content.includes('Captain captain-immersion'));
  });

  it('should keep repeated actor-specific prompts and fallback results stable', async () => {
    const narrativeContext = createNarrativeContext({
      worldMemory: createCanonicalWorldMemory()
    });
    const firstInput = createStructuredImmersionInput({
      artifactType: 'leader-speech',
      actorId: 'captain-harbor',
      profileTemplate: captainProfile,
      pressureOverrides: { threat: 0.72 },
      narrativeContext
    });
    const secondInput = createStructuredImmersionInput({
      artifactType: 'leader-speech',
      actorId: 'captain-harbor',
      profileTemplate: captainProfile,
      pressureOverrides: { threat: 0.72 },
      narrativeContext: JSON.parse(JSON.stringify(narrativeContext))
    });

    const firstPrompt = buildImmersionPrompt(firstInput);
    const secondPrompt = buildImmersionPrompt(secondInput);
    const firstResult = await generateImmersion(firstInput, { env: {} });
    const secondResult = await generateImmersion(secondInput, { env: {} });

    assert.deepStrictEqual(firstPrompt, secondPrompt);
    assert.deepStrictEqual(firstResult, secondResult);
    assert(firstPrompt.system.includes('Actor continuity anchor: Captain captain-harbor'));
    assert(firstResult.content.includes('Captain captain-harbor'));
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

  it('should keep ranked world-memory slices canonical and free of execution authority leakage', async () => {
    const input = createStructuredImmersionInput({
      artifactType: 'chronicle-entry',
      actorId: 'captain-harbor',
      profileTemplate: captainProfile,
      narrativeContext: createNarrativeContext({
        worldMemory: createRankingWorldMemory()
      })
    });
    const selectedWorldMemory = selectWorldMemoryForImmersionInput(input);
    const result = await generateImmersion(input, { env: {} });

    assert.deepStrictEqual(Object.keys(selectedWorldMemory).sort(), [
      'recentChronicle',
      'recentHistory',
      'schemaVersion',
      'scope',
      'townSummary',
      'type'
    ]);
    assert(selectedWorldMemory.recentChronicle.every(entry => !('totalScore' in entry)));
    assert(selectedWorldMemory.recentHistory.every(entry => !('totalScore' in entry)));
    assert.strictEqual('executionRequirements' in selectedWorldMemory, false);
    assert.strictEqual('authority' in selectedWorldMemory, false);
    assert.deepStrictEqual(result.authority, {
      proposalSelection: false,
      commandExecution: false,
      stateMutation: false
    });
  });

  it('should keep role-aware continuity advisory-only across mayor, captain, warden, and townsfolk paths', async () => {
    const worldMemory = createCanonicalWorldMemory();
    const inputs = [
      createStructuredImmersionInput({
        artifactType: 'leader-speech',
        profileTemplate: mayorProfile,
        narrativeContext: createNarrativeContext({ worldMemory })
      }),
      createStructuredImmersionInput({
        artifactType: 'leader-speech',
        profileTemplate: captainProfile,
        pressureOverrides: { threat: 0.72 },
        narrativeContext: createNarrativeContext({ worldMemory })
      }),
      createStructuredImmersionInput({
        artifactType: 'outcome-blurb',
        profileTemplate: wardenProfile,
        pressureOverrides: { scarcity: 0.72, dread: 0.71, hope: 0.22 },
        narrativeContext: createNarrativeContext({ worldMemory })
      }),
      createStructuredImmersionInput({
        artifactType: 'town-rumor',
        profileTemplate: mayorProfile,
        narrativeContext: createNarrativeContext({ worldMemory })
      })
    ];

    for (const input of inputs) {
      const snapshotBefore = JSON.parse(JSON.stringify(input));
      const result = await generateImmersion(input, { env: {} });

      assert.deepStrictEqual(result.authority, {
        proposalSelection: false,
        commandExecution: false,
        stateMutation: false
      });
      assert.strictEqual(result.advisory, true);
      assert.deepStrictEqual(input, snapshotBefore);
    }
  });

  it('should keep actor continuity advisory-only for repeated named officeholders', async () => {
    const input = createStructuredImmersionInput({
      artifactType: 'leader-speech',
      actorId: 'mayor-harbor',
      narrativeContext: createNarrativeContext({
        worldMemory: createCanonicalWorldMemory()
      })
    });
    const snapshotBefore = JSON.parse(JSON.stringify(input));

    const result = await generateImmersion(input, { env: {} });

    assert.deepStrictEqual(result.authority, {
      proposalSelection: false,
      commandExecution: false,
      stateMutation: false
    });
    assert.strictEqual(result.advisory, true);
    assert.deepStrictEqual(input, snapshotBefore);
  });
});
