#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXCLUDED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'vendor',
  'vendored',
  'third_party',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'generated',
]);

const MARKER_PATTERN = /^(<<<<<<<|=======|>>>>>>>)/;

export function checkMergeMarkers(root = process.cwd()) {
  const result = spawnSync('git', ['-C', root, 'ls-files', '-z'], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const message = result.stderr?.toString('utf8').trim() || 'git ls-files failed';
    throw new Error(message);
  }

  const files = result.stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.split('/').some((part) => EXCLUDED_DIRECTORY_NAMES.has(part)));

  const findings = [];
  for (const file of files) {
    const lines = readFileSync(resolve(root, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = line.match(MARKER_PATTERN);
      if (match) findings.push({ file, line: index + 1, marker: match[1] });
    });
  }

  return findings;
}

function main() {
  const rootFlag = process.argv.indexOf('--root');
  const root = rootFlag === -1 ? process.cwd() : process.argv[rootFlag + 1];
  if (!root) {
    console.error('Usage: check-merge-markers.mjs [--root <git-worktree>]');
    process.exitCode = 2;
    return;
  }

  try {
    const findings = checkMergeMarkers(root);
    if (findings.length === 0) {
      console.log('No merge-conflict markers found in Git-tracked files.');
      return;
    }

    console.error('Merge-conflict markers found:');
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: ${finding.marker}`);
    }
    process.exitCode = 1;
  } catch (error) {
    console.error(`Unable to check merge-conflict markers: ${error.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
