import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';

export default defineConfig({
  ssr: {
    // Photon is browser-only. Node tests use Sharp; Vite must not try to
    // resolve the unused browser/WASM entry while collecting consumers.
    external: ['@silvia-odwyer/photon'],
  },
  test: {
    coverage: createCoverageConfig(__dirname),
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
  },
});
