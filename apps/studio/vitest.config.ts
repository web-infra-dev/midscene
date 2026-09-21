import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@preload': path.resolve(__dirname, 'src/preload'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@midscene/playground/recorder-ui-describer$': path.resolve(
        __dirname,
        '../../packages/playground/src/recorder-ui-describer.ts',
      ),
      '@silvia-odwyer/photon': path.resolve(
        __dirname,
        'tests/fixtures/photon.ts',
      ),
    },
  },
  ssr: {
    // Shared image helpers contain a browser-only dynamic Photon import. Keep
    // it external for Node-based Studio tests, where that branch is never run.
    external: ['@silvia-odwyer/photon'],
  },
  test: {
    coverage: createCoverageConfig(__dirname),
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/theme-provider.test.ts', 'jsdom'],
      ['tests/main-content-overview.test.tsx', 'jsdom'],
    ],
    include: ['tests/**/*.test.{mjs,ts,tsx}'],
  },
});
