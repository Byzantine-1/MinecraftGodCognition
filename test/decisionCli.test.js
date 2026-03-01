import assert from 'assert';
import { describe, it } from 'node:test';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'src', 'decisionCli.js');

function fixturePath(filename) {
  return path.join(__dirname, 'fixtures', filename);
}

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
}

function parseJsonOutput(output) {
  return JSON.parse(output);
}

describe('Decision CLI', () => {
  it('should emit a stable machine-readable report for a valid builtin profile input', () => {
    const firstRun = runCli([
      '--snapshot',
      fixturePath('stableSnapshot.json'),
      '--profile',
      'mayor'
    ]);
    const secondRun = runCli([
      '--snapshot',
      fixturePath('stableSnapshot.json'),
      '--profile',
      'mayor'
    ]);

    assert.strictEqual(firstRun.status, 0);
    assert.strictEqual(secondRun.status, 0);
    assert.strictEqual(firstRun.stderr, '');
    assert.strictEqual(firstRun.stdout, secondRun.stdout);

    const report = parseJsonOutput(firstRun.stdout);

    assert.strictEqual(report.schemaVersion, 'decision-inspection.v1');
    assert.deepStrictEqual(Object.keys(report).sort(), [
      'candidates',
      'command',
      'input',
      'reasoning',
      'schemaVersion',
      'selectedProposal'
    ].sort());
    assert.strictEqual(report.input.profile.kind, 'builtin');
    assert.strictEqual(report.input.profile.name, 'mayor');
    assert(path.isAbsolute(report.input.snapshotPath));
    assert(Array.isArray(report.candidates));
    assert(report.candidates.length >= 1);
    assert.deepStrictEqual(Object.keys(report.candidates[0]).sort(), [
      'priority',
      'rank',
      'reasonTags',
      'selected',
      'targetId',
      'type'
    ].sort());
    assert.strictEqual(report.candidates[0].selected, true);
    assert.strictEqual(report.selectedProposal.type, 'MAYOR_ACCEPT_MISSION');
    assert.strictEqual(report.candidates[0].type, report.selectedProposal.type);
    assert.strictEqual(report.command, 'mission accept town-stable sq-wood-gathering');
    assert.strictEqual(report.reasoning.reason, report.selectedProposal.reason);
    assert.deepStrictEqual(report.reasoning.reasonTags, report.selectedProposal.reasonTags);
    assert.deepStrictEqual(report.reasoning.preconditions, report.selectedProposal.preconditions);
  });

  it('should accept a profile file input', () => {
    const result = runCli([
      '--snapshot',
      fixturePath('stableSnapshot.json'),
      '--profile',
      fixturePath('customMayorProfile.json')
    ]);

    assert.strictEqual(result.status, 0);
    const report = parseJsonOutput(result.stdout);
    assert.strictEqual(report.input.profile.kind, 'file');
    assert.strictEqual(report.selectedProposal.actorId, 'mayor-custom');
    assert.strictEqual(report.selectedProposal.townId, 'town-stable');
  });

  it('should reject malformed snapshot JSON with a stable error payload', () => {
    const result = runCli([
      '--snapshot',
      fixturePath('malformedSnapshot.json'),
      '--profile',
      'mayor'
    ]);

    assert.notStrictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');

    const error = parseJsonOutput(result.stderr);
    assert.strictEqual(error.schemaVersion, 'decision-inspection.v1');
    assert.strictEqual(error.error.code, 'INVALID_JSON');
    assert.strictEqual(error.error.details.field, 'snapshot');
  });

  it('should reject invalid snapshot contracts before running cognition', () => {
    const result = runCli([
      '--snapshot',
      fixturePath('invalidSnapshot.json'),
      '--profile',
      'mayor'
    ]);

    assert.notStrictEqual(result.status, 0);
    const error = parseJsonOutput(result.stderr);
    assert.strictEqual(error.error.code, 'INVALID_SNAPSHOT');
  });

  it('should reject invalid profile contracts before running cognition', () => {
    const result = runCli([
      '--snapshot',
      fixturePath('stableSnapshot.json'),
      '--profile',
      fixturePath('invalidProfile.json')
    ]);

    assert.notStrictEqual(result.status, 0);
    const error = parseJsonOutput(result.stderr);
    assert.strictEqual(error.error.code, 'INVALID_PROFILE');
  });

  it('should include candidates, selected proposal, command, and reasoning for captain flows', () => {
    const result = runCli([
      '--snapshot',
      fixturePath('threatenedSnapshot.json'),
      '--profile',
      'captain'
    ]);

    assert.strictEqual(result.status, 0);
    const report = parseJsonOutput(result.stdout);

    assert(Array.isArray(report.candidates));
    assert(report.candidates.some(candidate => candidate.type === 'PROJECT_ADVANCE'));
    assert(report.selectedProposal);
    assert.strictEqual(typeof report.command, 'string');
    assert.strictEqual(typeof report.reasoning.reason, 'string');
    assert(Array.isArray(report.reasoning.reasonTags));
  });
});
