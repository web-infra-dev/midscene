import { rs } from '@rstest/core';

// Run the real Node platform host without bundling optional browser WASM.
// Individual factory unit tests can override this boundary with their own spies.
rs.mock('../src/runtime/create-yaml-player', () =>
  rs.requireActual('../dist/lib/runtime/index.js'),
);
