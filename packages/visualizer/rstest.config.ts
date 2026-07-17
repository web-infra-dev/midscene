import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { stubStyleRules } from '../../scripts/rstest-style-stub';

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  include: ['tests/**/*.test.ts'],
  ...stubStyleRules,
});
