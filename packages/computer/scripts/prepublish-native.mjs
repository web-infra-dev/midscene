#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

// Build the native helpers for whichever platform we're publishing from.
// build-native.mjs already skips targets that don't apply to the current
// platform (e.g. phased-scroll only builds on darwin), so on a linux CI
// runner this produces bin/linux/rdp-helper without touching the
// checked-in darwin artifacts.
const result = spawnSync('pnpm', ['run', 'build:native'], {
  cwd: packageRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}
