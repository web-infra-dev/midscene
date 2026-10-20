import { defineConfig } from '@rstest/core';
import { createCoverageConfig } from '../../scripts/rstest-coverage';
import { stubStyleRules } from '../../scripts/rstest-style-stub';

export default defineConfig({
  coverage: createCoverageConfig(__dirname),
  include: ['tests/**/*.test.{ts,tsx}'],
  tools: {
    ...stubStyleRules.tools,
    // The `.tsx` tests only `import type React`, relying on
    // `tsconfig.app.base.json`'s `"jsx": "react-jsx"`. rsbuild tooling never
    // reads tsconfig's `jsx`, so declare the runtime here.
    // (`@rsbuild/plugin-react@1.4.1` crashes on the rsbuild 2.x rstest bundles.)
    swc: {
      jsc: { transform: { react: { runtime: 'automatic' } } },
    },
  },
});
