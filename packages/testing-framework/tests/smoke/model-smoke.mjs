import { dirname, join } from 'node:path';
// Full model-backed smoke. Run this in an environment that can reach your
// MIDSCENE_MODEL_BASE_URL endpoint (this CI sandbox cannot, so it is not part
// of the automated suite). It runs the real example cases against the bundled
// demo page using the real UI Agent (ui nodes) and the real Pi runtime
// (verify/soft/agent nodes) on the SAME model endpoint.
//
//   export MIDSCENE_MODEL_BASE_URL=...
//   export MIDSCENE_MODEL_API_KEY=...
//   export MIDSCENE_MODEL_NAME=...
//   export MIDSCENE_MODEL_FAMILY=...   # a VL model is required for UI grounding
//   node packages/testing-framework/tests/smoke/model-smoke.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAll } from '../../dist/es/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const exampleDir = join(repoRoot, 'example');
const demoUrl =
  process.env.DEMO_URL ??
  pathToFileURL(join(exampleDir, 'site', 'index.html')).href;

for (const v of [
  'MIDSCENE_MODEL_BASE_URL',
  'MIDSCENE_MODEL_API_KEY',
  'MIDSCENE_MODEL_NAME',
]) {
  if (!process.env[v]) {
    console.error(`Missing required env var: ${v}`);
    process.exit(2);
  }
}

const summary = await runAll(
  {
    uiAgent: { type: 'web', options: { url: demoUrl } },
    testDir: join(exampleDir, 'e2e'),
    include: ['**/*.yaml'],
    exclude: ['**/*.draft.yaml'],
    output: {
      summary: join(exampleDir, 'midscene_run/output/summary.json'),
      reportDir: join(exampleDir, 'midscene_run/report'),
    },
    uiAgentOptions: {
      aiActContext: 'The user is browsing a demo shop as an anonymous visitor.',
      generateReport: true,
    },
    runtime: {
      prepareCartFixture: async (input, ctx) => {
        ctx.state.cartFixture = { scenario: input?.scenario };
        return {
          conclusion: `Prepared a "${input?.scenario}" cart fixture.`,
        };
      },
      notify: async (_input, ctx) => {
        const failed = ctx.result.steps.filter((s) => s.status === 'failed');
        return {
          conclusion:
            failed.length === 0
              ? 'All gating checks passed; no alert needed.'
              : `Would alert: ${failed.length} step(s) failed.`,
        };
      },
    },
  },
  { projectRoot: exampleDir },
);

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.failed > 0 ? 1 : 0);
