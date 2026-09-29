import { vi } from 'vitest';

// Run the real Node platform host without Vite traversing optional browser WASM.
// Individual factory unit tests can override this boundary with their own spies.
vi.mock('../src/runtime/create-yaml-player', async () => {
  const { createRequire } = await import('node:module');
  return createRequire(import.meta.url)('../dist/lib/runtime/index.js');
});
