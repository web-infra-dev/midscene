import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120_000,
  },
  define: {
    __VERSION__: `'0.999.0'`,
  },
  ssr: {
    external: ['@silvia-odwyer/photon'],
  },
});
