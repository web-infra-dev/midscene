import 'dotenv/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    reporters: ['./src/reporter.ts'],
  },
  ssr: {
    external: ['@silvia-odwyer/photon'],
  },
});
