import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ path: fileURLToPath(new URL('.env', import.meta.url)) });

export default defineConfig({
  test: { testTimeout: 180_000 },
});
