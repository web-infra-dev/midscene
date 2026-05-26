import { defineConfig } from 'vitest/config';
import { createCoverageConfig } from '../../scripts/vitest-coverage';
import { version } from './package.json';

export default defineConfig({
  test: {
    coverage: createCoverageConfig(__dirname),
    globals: true,
    environment: 'node',
  },
  define: {
    __VERSION__: JSON.stringify(version),
  },
  ssr: {
    external: ['@silvia-odwyer/photon'],
  },
});
