import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@midscene/android-playground': path.resolve(
        __dirname,
        '../android-playground/src/index.ts',
      ),
      '@midscene/computer': path.resolve(__dirname, '../computer/src/index.ts'),
      '@midscene/computer-playground': path.resolve(
        __dirname,
        '../computer-playground/src/index.ts',
      ),
      '@midscene/harmony': path.resolve(__dirname, '../harmony/src/index.ts'),
      '@midscene/ios': path.resolve(__dirname, '../ios/src/index.ts'),
      '@midscene/playground': path.resolve(
        __dirname,
        '../playground/src/index.ts',
      ),
      '@midscene/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@midscene/web': path.resolve(
        __dirname,
        '../web-integration/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
