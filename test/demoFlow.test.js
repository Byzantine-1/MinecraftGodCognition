import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'url';
import { mayorProfile } from '../src/agentProfiles.js';
import { isValidDemoFlowReport, runDemoFlow } from '../src/demoFlow.js';
import { isValidEmbodimentRequestPreview } from '../src/embodimentPreview.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readFixture(filename) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf8'));
}

function createStableDemoInputs() {
  const snapshot = readFixture('stableSnapshot.json');
  const narrativeContext = readFixture('demoNarrativeContext.json');
  const worldSummary = readFixture('demoWorldSummary.json');
  const profile = {
    ...mayorProfile,
    townId: snapshot.townId
  };

  return { snapshot, profile, narrativeContext, worldSummary };
}

describe('Deterministic Demo Flow', () => {
  it('should produce a stable end-to-end output shape for the fixture path', async () => {
    const { snapshot, profile, narrativeContext, worldSummary } = createStableDemoInputs();

    const report = await runDemoFlow(snapshot, profile, {
      narrativeContext,
      worldSummary,
      immersionOptions: { env: {} }
    });

    assert.strictEqual(report.schemaVersion, 'demo-flow.v1');
    assert.deepStrictEqual(Object.keys(report).sort(), [
      'authorityBoundary',
      'decisionInspection',
      'demoMode',
      'embodimentPreview',
      'executionHandoff',
      'executionResult',
      'immersionResult',
      'input',
      'schemaVersion'
    ].sort());
    assert.strictEqual(report.demoMode, 'deterministic-local');
    assert.strictEqual(report.decisionInspection.schemaVersion, 'decision-inspection.v1');
    assert.strictEqual(report.executionHandoff.schemaVersion, 'execution-handoff.v1');
    assert.strictEqual(report.executionResult.schemaVersion, 'execution-result.v1');
    assert.strictEqual(report.immersionResult.schemaVersion, 'immersion-result.v1');
    assert.strictEqual(report.embodimentPreview.schemaVersion, 'embodiment-preview.v1');
    assert.strictEqual(report.executionHandoff.advisory, true);
    assert.strictEqual(report.executionResult.status, 'executed');
    assert.strictEqual(report.executionResult.accepted, true);
    assert.strictEqual(report.immersionResult.status, 'fallback');
    assert.strictEqual(report.embodimentPreview.status, 'ready');
    assert.strictEqual(report.executionHandoff.command, 'mission accept town-stable sq-wood-gathering');
    assert.strictEqual(isValidDemoFlowReport(report), true);
    assert.strictEqual(isValidEmbodimentRequestPreview(report.embodimentPreview), true);
  });

  it('should be replay-stable for the same fixture inputs', async () => {
    const { snapshot, profile, narrativeContext, worldSummary } = createStableDemoInputs();

    const first = await runDemoFlow(snapshot, profile, {
      narrativeContext,
      worldSummary,
      immersionOptions: { env: {} }
    });
    const second = await runDemoFlow(snapshot, profile, {
      narrativeContext,
      worldSummary,
      immersionOptions: { env: {} }
    });

    assert.deepStrictEqual(first, second);
  });

  it('should degrade gracefully when the configured llm provider is unavailable', async () => {
    const { snapshot, profile, narrativeContext, worldSummary } = createStableDemoInputs();

    const report = await runDemoFlow(snapshot, profile, {
      narrativeContext,
      worldSummary,
      immersionOptions: {
        env: {
          LLM_PROVIDER: 'qwen',
          LLM_API_KEY: 'test-key',
          LLM_BASE_URL: 'https://llm.example/v1',
          LLM_MODEL: 'qwen-max'
        },
        fetchImpl: async () => {
          throw new Error('provider offline');
        }
      }
    });

    assert.strictEqual(report.executionResult.accepted, true);
    assert.strictEqual(report.immersionResult.status, 'fallback');
    assert.strictEqual(report.immersionResult.error.code, 'PROVIDER_REQUEST_FAILED');
    assert.strictEqual(typeof report.embodimentPreview.utterance.text, 'string');
  });

  it('should preserve authority boundaries across the full pipeline', async () => {
    const { snapshot, profile, narrativeContext, worldSummary } = createStableDemoInputs();

    const report = await runDemoFlow(snapshot, profile, {
      narrativeContext,
      worldSummary,
      immersionOptions: { env: {} }
    });

    assert.deepStrictEqual(report.authorityBoundary, {
      realCommandExecution: false,
      realWorldMutation: false,
      liveBotRequired: false,
      cognition: 'deterministic-advisory',
      execution: 'local-simulated',
      immersion: 'downstream-advisory',
      embodiment: 'preview-only'
    });
    assert.strictEqual(report.executionHandoff.advisory, true);
    assert.deepStrictEqual(report.immersionResult.authority, {
      proposalSelection: false,
      commandExecution: false,
      stateMutation: false
    });
    assert.deepStrictEqual(report.embodimentPreview.authority, {
      botControl: false,
      commandExecution: false,
      stateMutation: false
    });
    assert.deepStrictEqual(report.embodimentPreview.constraints, {
      previewOnly: true,
      requireLiveBot: false,
      executeRealCommand: false
    });
  });
});
