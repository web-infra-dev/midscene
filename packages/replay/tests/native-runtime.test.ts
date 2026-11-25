import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runTestProject } from '@midscene/test/config';
import { expect, it } from '@rstest/core';

it('executes YAML scripts through Native Test and publishes their native report', async () => {
  const project = mkdtempSync(join(tmpdir(), 'replay-native-runtime-'));
  try {
    mkdirSync(join(project, 'node_modules/@midscene'), { recursive: true });
    for (const [name, directory] of [
      ['replay', 'replay'],
      ['test', 'test'],
      ['web', 'web-integration'],
    ])
      symlinkSync(
        resolve(__dirname, '../../', directory),
        join(project, 'node_modules/@midscene', name),
      );
    symlinkSync(
      resolve(__dirname, '../node_modules/playwright'),
      join(project, 'node_modules/playwright'),
    );
    writeFileSync(
      join(project, 'midscene.config.mjs'),
      `
      import { chromium } from 'playwright';
      import { PlaywrightBrowserAgent } from '@midscene/web/playwright';
      import { createMidsceneNodes } from '@midscene/test/midscene';
      export default {
        test: { replay: 'strict' },
        fileSetup: {
          name: 'web',
          async setup({ onTeardown }) {
            const browser = await chromium.launch();
            let agent;
            onTeardown(async () => { try { await agent?.destroy(); } finally { await browser.close(); } });
            const context = await browser.newContext();
            const page = await context.newPage();
            await page.setContent('<button>Save</button><output></output><script>document.querySelector("button").onclick = () => document.querySelector("output").textContent = "Saved";</script>');
            agent = new PlaywrightBrowserAgent(context, page, { generateReport: false, modelConfig: {} });
            agent.aiAct = agent.aiAssert = async () => { throw new Error('Unexpected native AI fallback'); };
            return { agent };
          },
        },
        nodes: createMidsceneNodes({ agentClass: PlaywrightBrowserAgent, getAgent: ({ context }) => context.agent }),
      };
    `,
    );
    writeFileSync(
      join(project, 'case.yaml'),
      `cases:
  - name: save
    steps:
      - aiAct:
          prompt: Save
          replay: ./save.mjs
      - aiAssert:
          prompt: Saved receipt is visible
          replay: ./check.mjs
`,
    );
    writeFileSync(
      join(project, 'save.mjs'),
      `
      import { defineStep } from '@midscene/replay';
      export default defineStep({
        run: rp => rp.tap('Save', { candidates: [{ xpath: '//button' }] }),
        done: rp => rp.expect({ xpath: '//output' }, { text: 'Saved' }),
      });
    `,
    );
    writeFileSync(
      join(project, 'check.mjs'),
      `export default { async run(rp) {
      await rp.expect({ xpath: '//output' }, { text: 'Saved' });
      return { pass: true, thought: 'Saved receipt checked' };
    } };`,
    );
    const events: Record<string, unknown>[] = [];
    const result = await runTestProject({
      cwd: project,
      testPath: 'case.yaml',
      resultDir: join(project, 'results'),
      onReplayEvent: (event) => events.push(event),
    });
    expect(result.status, JSON.stringify(result)).toBe('success');
    expect(result.summary).toMatchObject({ passed: 1, failed: 0 });
    expect(events.filter((event) => event.type === 'implementation')).toEqual([
      expect.objectContaining({
        node: 'aiAct',
        path: 'replay',
        status: 'passed',
      }),
      expect.objectContaining({
        node: 'aiAssert',
        path: 'replay',
        status: 'passed',
      }),
    ]);
    expect(readFileSync(result.reportPath!, 'utf8')).toContain('<html');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}, 30_000);
