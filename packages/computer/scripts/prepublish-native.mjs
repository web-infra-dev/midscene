#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

if (process.env.CI) {
  console.log(
    '[prepublishOnly] Skipping native helper rebuild in CI. Published artifacts use the checked-in binaries under packages/computer/bin and include native sources for local rebuilds.',
  );
  process.exit(0);
}

const result = spawnSync('pnpm', ['run', 'build:native'], {
  cwd: packageRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}
