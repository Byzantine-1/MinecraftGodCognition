#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  captainProfile,
  isValidProfile,
  mayorProfile,
  wardenProfile
} from './agentProfiles.js';
import { runDemoFlow } from './demoFlow.js';
import { SchemaVersion } from './schemaVersions.js';
import { isValidSnapshot } from './snapshotSchema.js';

const builtinProfiles = Object.freeze({
  mayor: mayorProfile,
  captain: captainProfile,
  warden: wardenProfile
});

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }

    args[token.slice(2)] = value;
    index += 1;
  }

  return args;
}

function resolveJsonPath(inputPath, cwd) {
  return path.resolve(cwd, inputPath);
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function resolveProfile(profileInput, snapshotTownId, cwd) {
  if (builtinProfiles[profileInput]) {
    return {
      profile: { ...builtinProfiles[profileInput], townId: snapshotTownId },
      source: {
        kind: 'builtin',
        name: profileInput
      }
    };
  }

  const profilePath = resolveJsonPath(profileInput, cwd);
  const profile = readJsonFile(profilePath);

  return {
    profile,
    source: {
      kind: 'file',
      path: profilePath
    }
  };
}

function createErrorOutput(code, message, details = {}) {
  return {
    schemaVersion: SchemaVersion.DEMO_FLOW,
    error: {
      code,
      message,
      ...(Object.keys(details).length > 0 ? { details } : {})
    }
  };
}

export function getDemoCliUsage() {
  return [
    'Usage:',
    '  node src/demoCli.js --snapshot <snapshot.json> --profile <mayor|captain|warden|profile.json> [--narrative <narrative.json>] [--world-summary <worldSummary.json>] [--artifact-type <type>]',
    '',
    'Example:',
    '  node src/demoCli.js --snapshot test/fixtures/stableSnapshot.json --profile mayor --narrative test/fixtures/demoNarrativeContext.json --world-summary test/fixtures/demoWorldSummary.json'
  ].join('\n');
}

export async function runDemoCli(argv, io = {}, options = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const cwd = options.cwd || process.cwd();

  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr.write(`${JSON.stringify(createErrorOutput('USAGE', error.message), null, 2)}\n`);
    return 1;
  }

  if (args.help) {
    stdout.write(`${getDemoCliUsage()}\n`);
    return 0;
  }

  if (!args.snapshot || !args.profile) {
    stderr.write(
      `${JSON.stringify(
        createErrorOutput('USAGE', 'Both --snapshot and --profile are required'),
        null,
        2
      )}\n`
    );
    return 1;
  }

  const snapshotPath = resolveJsonPath(args.snapshot, cwd);
  let snapshot;
  try {
    snapshot = readJsonFile(snapshotPath);
  } catch (error) {
    const code = error instanceof SyntaxError ? 'INVALID_JSON' : 'READ_ERROR';
    stderr.write(
      `${JSON.stringify(
        createErrorOutput(code, error.message, { path: snapshotPath, field: 'snapshot' }),
        null,
        2
      )}\n`
    );
    return 1;
  }

  if (!isValidSnapshot(snapshot)) {
    stderr.write(
      `${JSON.stringify(
        createErrorOutput('INVALID_SNAPSHOT', 'Invalid snapshot structure', { path: snapshotPath }),
        null,
        2
      )}\n`
    );
    return 1;
  }

  let resolvedProfile;
  try {
    resolvedProfile = resolveProfile(args.profile, snapshot.townId, cwd);
  } catch (error) {
    const code = error instanceof SyntaxError ? 'INVALID_JSON' : 'READ_ERROR';
    stderr.write(
      `${JSON.stringify(
        createErrorOutput(code, error.message, { input: args.profile, field: 'profile' }),
        null,
        2
      )}\n`
    );
    return 1;
  }

  if (!isValidProfile(resolvedProfile.profile)) {
    stderr.write(
      `${JSON.stringify(
        createErrorOutput('INVALID_PROFILE', 'Invalid profile structure', resolvedProfile.source),
        null,
        2
      )}\n`
    );
    return 1;
  }

  let narrativeContext;
  if (args.narrative) {
    try {
      narrativeContext = readJsonFile(resolveJsonPath(args.narrative, cwd));
    } catch (error) {
      const code = error instanceof SyntaxError ? 'INVALID_JSON' : 'READ_ERROR';
      stderr.write(
        `${JSON.stringify(
          createErrorOutput(code, error.message, { input: args.narrative, field: 'narrative' }),
          null,
          2
        )}\n`
      );
      return 1;
    }
  }

  let worldSummary;
  if (args['world-summary']) {
    try {
      worldSummary = readJsonFile(resolveJsonPath(args['world-summary'], cwd));
    } catch (error) {
      const code = error instanceof SyntaxError ? 'INVALID_JSON' : 'READ_ERROR';
      stderr.write(
        `${JSON.stringify(
          createErrorOutput(code, error.message, { input: args['world-summary'], field: 'worldSummary' }),
          null,
          2
        )}\n`
      );
      return 1;
    }
  }

  try {
    const report = await runDemoFlow(snapshot, resolvedProfile.profile, {
      immersionArtifactType: args['artifact-type'],
      narrativeContext,
      worldSummary
    });

    stdout.write(
      `${JSON.stringify(
        {
          ...report,
          inputPaths: {
            snapshot: snapshotPath,
            profile: resolvedProfile.source,
            narrative: args.narrative ? resolveJsonPath(args.narrative, cwd) : null,
            worldSummary: args['world-summary'] ? resolveJsonPath(args['world-summary'], cwd) : null
          }
        },
        null,
        2
      )}\n`
    );
    return 0;
  } catch (error) {
    stderr.write(
      `${JSON.stringify(
        createErrorOutput('DEMO_FAILED', error.message),
        null,
        2
      )}\n`
    );
    return 1;
  }
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  runDemoCli(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  });
}
