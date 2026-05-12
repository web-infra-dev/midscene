import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendererDevUrl } from './renderer-dev-config.mjs';
import { buildStudioRuntimeEnv } from './runtime-env.mjs';

// Spawns Electron with MIDSCENE_STUDIO_RENDERER_URL sourced from the shared
// dev config, so the port is not duplicated in package.json scripts.
const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

// Enable Node inspector on the Electron main process in dev so external
// profilers (chrome://inspect, CDP clients) can attach for a V8 CPU
// profile. Set MIDSCENE_STUDIO_MAIN_INSPECT=0 to disable, or a custom port
// like `9230` to override; default 9229 matches Node's own default.
const inspectSetting = process.env.MIDSCENE_STUDIO_MAIN_INSPECT ?? '9229';
const electronArgs = [path.join(rootDir, 'dist/main/main.cjs')];
if (inspectSetting !== '0' && inspectSetting !== 'false') {
  electronArgs.unshift(`--inspect=${inspectSetting}`);
}

const child = spawn(electronBinary, electronArgs, {
  env: buildStudioRuntimeEnv({
    baseEnv: process.env,
    overrides: { MIDSCENE_STUDIO_RENDERER_URL: rendererDevUrl },
    studioRootDir: rootDir,
  }),
  stdio: 'inherit',
});

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
