import MidsceneReporter from '@midscene/rstest/reporter';
import { defineConfig } from '@rstest/core';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

export default defineConfig({
  include: ['*.test.ts'],
  testTimeout: 1_800_000,
  hookTimeout: 60_000,
  reporters: ['default', new MidsceneReporter()],
});
