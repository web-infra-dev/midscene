import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  defineMidsceneConfig,
  defineRuntime,
} from '@midscene/testing-framework';

// The demo ships a tiny static page so the example runs offline (only the model
// endpoint needs network). Point `DEMO_URL` at your own app to try real flows.
const demoUrl =
  process.env.DEMO_URL ??
  pathToFileURL(join(__dirname, 'site', 'index.html')).href;

export default defineMidsceneConfig({
  // —— run target: single `uiAgent` field (config-style object) ——
  uiAgent: {
    type: 'web',
    options: {
      url: demoUrl,
    },
  },

  // —— case discovery ——
  testDir: './e2e',
  include: ['**/*.yaml'],
  exclude: ['**/*.draft.yaml'],

  // —— execution policy (aligned with Rstest concepts) ——
  testRunner: {
    maxConcurrency: 1,
    bail: 0,
    testTimeout: 120_000,
  },

  // —— output ——
  output: {
    summary: './midscene_run/output/summary.json',
    reportDir: './midscene_run/report',
  },

  // —— shared UI Agent behavior ——
  uiAgentOptions: {
    aiActContext: 'The user is browsing a demo shop as an anonymous visitor.',
    generateReport: true,
  },

  // —— custom YAML nodes (defineRuntime, RFC §3) ——
  runtime: {
    // A fixture-prep node: writes engineering state (not visible to the agent)
    // and a natural-language conclusion (visible to later verify/agent).
    prepareCartFixture: defineRuntime(async (rawInput, ctx) => {
      const input = (rawInput ?? {}) as { scenario?: string };
      const scenario = input.scenario ?? 'default';
      ctx.state.cartFixture = { id: `cart-${Date.now()}`, scenario };

      return {
        conclusion: `Prepared a "${scenario}" cart fixture for this run.`,
        output: { scenario },
      };
    }),

    // A side-effect node that reads the accumulated case result.
    notify: defineRuntime(async (_input, ctx) => {
      const failed = ctx.result.steps.filter((s) => s.status === 'failed');
      return {
        conclusion:
          failed.length === 0
            ? 'All gating checks passed; no alert needed.'
            : `Would alert: ${failed.length} step(s) failed.`,
      };
    }),
  },
});
