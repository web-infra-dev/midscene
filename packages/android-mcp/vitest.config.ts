import { defineConfig } from 'vitest/config';
import { version } from './package.json';

export default defineConfig({
  test: {
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
