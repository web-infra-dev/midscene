import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendererDevUrl } from './renderer-dev-config.mjs';

// Spawns Electron with MIDSCENE_STUDIO_RENDERER_URL sourced from the shared
// dev config, so the port is not duplicated in package.json scripts.
const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const child = spawn(
  electronBinary,
  [path.join(rootDir, 'dist/main/main.cjs')],
  {
    env: { ...process.env, MIDSCENE_STUDIO_RENDERER_URL: rendererDevUrl },
    stdio: 'inherit',
  },
);

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
