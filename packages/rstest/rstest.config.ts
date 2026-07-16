import { defineConfig } from '@rstest/core';

// SMOKE=true switches to the browser-launching fixture smoke suite, which is
// kept out of the default (CI) run — same env-gating convention as AITEST in
// the vitest-based packages.
const enableSmokeTest = Boolean(process.env.SMOKE);

export default defineConfig({
  include: enableSmokeTest
    ? ['tests/smoke/**/*.test.ts']
    : ['tests/unit-test/**/*.test.ts'],
  ...(enableSmokeTest ? { testTimeout: 120_000 } : {}),
});
