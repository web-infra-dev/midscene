import { beforeEach, vi } from 'vitest';

// CLI fixtures must not append simulated results to the real workflow summary.
// Reporter tests can opt in by setting their own temporary summary path.
beforeEach(() => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  Reflect.deleteProperty(process.env, 'GITHUB_STEP_SUMMARY');

  return () => {
    if (summaryPath === undefined)
      Reflect.deleteProperty(process.env, 'GITHUB_STEP_SUMMARY');
    else process.env.GITHUB_STEP_SUMMARY = summaryPath;
  };
});

// Run the real Node platform host without Vite traversing optional browser WASM.
// Individual factory unit tests can override this boundary with their own spies.
vi.mock('../src/runtime/create-yaml-player', async () => {
  const { createRequire } = await import('node:module');
  return createRequire(import.meta.url)('../dist/lib/runtime/index.js');
});
