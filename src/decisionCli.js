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
import {
  DecisionInspectionSchemaVersion,
  inspectDecision
} from './decisionInspection.js';
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
    schemaVersion: DecisionInspectionSchemaVersion,
    error: {
      code,
      message,
      ...(Object.keys(details).length > 0 ? { details } : {})
    }
  };
}

export function getCliUsage() {
  return [
    'Usage:',
    '  node src/decisionCli.js --snapshot <snapshot.json> --profile <mayor|captain|warden|profile.json>',
    '',
    'Examples:',
    '  node src/decisionCli.js --snapshot test/fixtures/stableSnapshot.json --profile mayor',
    '  node src/decisionCli.js --snapshot snapshot.json --profile customProfile.json'
  ].join('\n');
}

export function runDecisionCli(argv, io = {}, options = {}) {
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
    stdout.write(`${getCliUsage()}\n`);
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

  if (snapshot.townId !== resolvedProfile.profile.townId) {
    stderr.write(
      `${JSON.stringify(
        createErrorOutput('PROFILE_TOWN_MISMATCH', 'Snapshot and profile townId mismatch', {
          snapshotTownId: snapshot.townId,
          profileTownId: resolvedProfile.profile.townId
        }),
        null,
        2
      )}\n`
    );
    return 1;
  }

  const report = inspectDecision(snapshot, resolvedProfile.profile);
  stdout.write(
    `${JSON.stringify(
      {
        ...report,
        input: {
          snapshotPath,
          profile: resolvedProfile.source
        }
      },
      null,
      2
    )}\n`
  );
  return 0;
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  process.exitCode = runDecisionCli(process.argv.slice(2));
}
