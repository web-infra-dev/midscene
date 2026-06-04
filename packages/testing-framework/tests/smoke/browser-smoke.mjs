import { dirname, join } from 'node:path';
// Real-browser smoke: launches the web UI Agent against the bundled demo page,
// captures a screenshot, and drives the engine end-to-end. The MODEL is stubbed
// (this sandbox cannot reach the model endpoint), so this exercises everything
// EXCEPT live inference: config -> ui agent (chrome launch + navigate) ->
// screenshot capture -> context assembly -> verify path -> summary.
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import {
  createUIAgent,
  defineRuntime,
  discoverCases,
  parseCaseYaml,
  runCase,
} from '../../dist/es/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const demoUrl = pathToFileURL(
  join(repoRoot, 'example', 'site', 'index.html'),
).href;

// 1) discovery + parse against the real example cases
const found = discoverCases(
  join(repoRoot, 'example', 'e2e'),
  ['**/*.yaml'],
  ['**/*.draft.yaml'],
);
console.log(
  'DISCOVERED',
  found.map((f) => f.split('/').pop()),
);
for (const file of found) {
  const fs = await import('node:fs');
  parseCaseYaml(fs.readFileSync(file, 'utf-8'), file);
}
console.log('PARSE_OK');

// 2) launch the real web UI agent (headless chrome) and navigate to the demo
const { agent, cleanup } = await createUIAgent(
  { type: 'web', options: { url: demoUrl } },
  { generateReport: false },
  process.env,
);

try {
  const shot = await agent.interface.screenshotBase64();
  if (!/^data:image\/(png|jpeg);base64,/.test(shot)) {
    throw new Error('screenshot is not a data URL');
  }
  console.log(
    'SCREENSHOT_OK',
    `${shot.slice(0, 28)}... (${shot.length} bytes)`,
  );

  // 3) drive the engine with a runtime node + verify, using a stubbed agent
  //    runtime so no model call is needed. The stub asserts it received the
  //    assembled context + the real screenshot.
  const parsed = parseCaseYaml(`
name: smoke
flow:
  - prepareCartFixture:
      scenario: smoke
  - verify: Confirm the demo shop page rendered
`);

  let sawScreenshot = false;
  let sawConclusion = false;
  const stubGeneralAgent = {
    run: async (input) => {
      sawScreenshot = Boolean(input.screenshotBase64);
      sawConclusion = input.context.includes('smoke');
      return {
        text: 'looks fine',
        verdict: { pass: true, reason: 'rendered' },
      };
    },
  };

  const result = await runCase({
    parsed,
    file: 'smoke.yaml',
    uiAgent: agent,
    generalAgent: stubGeneralAgent,
    runtimeNodes: {
      prepareCartFixture: defineRuntime(async (input, ctx) => {
        ctx.state.fixture = { scenario: input?.scenario };
        return { conclusion: `prepared ${input?.scenario} fixture` };
      }),
    },
    projectRoot: repoRoot,
    env: process.env,
  });

  if (result.status !== 'passed') {
    throw new Error(`expected passed, got ${result.status}`);
  }
  if (!sawScreenshot) throw new Error('verify did not receive a screenshot');
  if (!sawConclusion)
    throw new Error('runtime conclusion did not reach verify context');

  console.log('ENGINE_OK', {
    status: result.status,
    steps: result.steps.map((s) => `${s.node}:${s.status}`),
  });
  console.log('BROWSER_SMOKE_OK');
} finally {
  await cleanup?.();
}
