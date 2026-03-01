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
  resolveImmersionProvider
} from '../src/immersion.js';
import { createDefaultSnapshot } from '../src/snapshotSchema.js';

function createStructuredImmersionInput() {
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
    assert(first.content.includes('Rumor in town-immersion'));
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
    assert(result.content.includes('Outcome for town-immersion'));
  });

  it('should build stable prompts from equivalent structured inputs', () => {
    const firstInput = createStructuredImmersionInput();
    const secondInput = createStructuredImmersionInput();

    firstInput.worldSummary = { weather: 'clear', morale: 'steady', walls: 'under repair' };
    secondInput.worldSummary = { walls: 'under repair', morale: 'steady', weather: 'clear' };

    const firstPrompt = buildImmersionPrompt(firstInput);
    const secondPrompt = buildImmersionPrompt(secondInput);

    assert.deepStrictEqual(firstPrompt, secondPrompt);
  });

  it('should remain downstream and non-authoritative', async () => {
    const input = createStructuredImmersionInput();
    const snapshotBefore = JSON.parse(JSON.stringify(input));

    const result = await generateImmersion(input, { env: {} });

    assert.strictEqual(result.advisory, true);
    assert.deepStrictEqual(result.authority, {
      proposalSelection: false,
      commandExecution: false,
      stateMutation: false
    });
    assert.deepStrictEqual(input, snapshotBefore);
  });
});
