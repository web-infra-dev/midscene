import path from 'node:path';
import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { stubStyleRules } from '../../scripts/rstest-style-stub';

const sharedAlias = {
  '@midscene/shared/constants': path.resolve(
    __dirname,
    '../shared/src/constants/index.ts',
  ),
};

export default defineConfig({
  resolve: { alias: sharedAlias },
  coverage: createCoverageConfig(__dirname),
  include: ['tests/**/*.test.ts'],
  ...stubStyleRules,
});
