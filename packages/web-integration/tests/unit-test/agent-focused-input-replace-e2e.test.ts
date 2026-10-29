import { PlaywrightAgent } from '@/playwright/agent';
import { PuppeteerAgent } from '@/puppeteer';
import type { WebPageAgentOpt } from '@/web-element';
import { afterAll, beforeAll, describe, expect, test } from '@rstest/core';
import { type Browser as PlaywrightBrowser, chromium } from 'playwright';
import puppeteer, { type Browser as PuppeteerBrowser } from 'puppeteer';

const TIMEOUT = 120_000;
const HTML = `<!doctype html><textarea id="target">old value</textarea>
  <input id="other" value="unchanged">
  <script>
    window.changes = [];
    window.enterCount = 0;
    const target = document.querySelector('#target');
    target.addEventListener('input', () => window.changes.push(target.value));
    target.addEventListener('keydown', event => {
      if (event.key === 'Enter') window.enterCount++;
    });
    target.focus();
    target.setSelectionRange(target.value.length, target.value.length);
  </script>`;

function readState() {
  return {
    value: (document.querySelector('#target') as HTMLTextAreaElement).value,
    other: (document.querySelector('#other') as HTMLInputElement).value,
    changes: (window as unknown as { changes: string[] }).changes,
    enterCount: (window as unknown as { enterCount: number }).enterCount,
  };
}

interface Fixture {
  agent: PlaywrightAgent | PuppeteerAgent;
  read(): Promise<ReturnType<typeof readState>>;
  close(): Promise<void>;
}

const cases = [
  {
    name: 'default replace',
    param: { value: 'new value' },
    expected: 'new value',
  },
  {
    name: 'multiline Unicode replace',
    param: { value: 'first\nsecond 😀', mode: 'replace' },
    expected: 'first\nsecond 😀',
  },
  {
    name: 'numeric zero replace',
    param: { value: 0, mode: 'replace' },
    expected: '0',
  },
  {
    name: 'explicit typeOnly',
    param: { value: 'new value', mode: 'typeOnly' },
    expected: 'old valuenew value',
  },
];

for (const adapter of ['Playwright', 'Puppeteer'] as const) {
  describe(`${adapter} Agent targetless Input end to end`, () => {
    let browser: PlaywrightBrowser | PuppeteerBrowser;
    let createFixture: (options: WebPageAgentOpt) => Promise<Fixture>;

    beforeAll(async () => {
      const options = {
        headless: true,
        executablePath: puppeteer.executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };
      if (adapter === 'Playwright') {
        const playwrightBrowser = await chromium.launch(options);
        browser = playwrightBrowser;
        createFixture = async (agentOptions) => {
          const page = await playwrightBrowser.newPage();
          await page.setContent(HTML);
          return {
            agent: new PlaywrightAgent(page, agentOptions),
            read: () => page.evaluate(readState),
            close: () => page.close(),
          };
        };
      } else {
        const puppeteerBrowser = await puppeteer.launch(options);
        browser = puppeteerBrowser;
        createFixture = async (agentOptions) => {
          const page = await puppeteerBrowser.newPage();
          await page.setContent(HTML);
          return {
            agent: new PuppeteerAgent(page, agentOptions),
            read: () => page.evaluate(readState),
            close: () => page.close(),
          };
        };
      }
    }, TIMEOUT);

    afterAll(async () => {
      await browser?.close();
    }, TIMEOUT);

    test.each(cases)(
      '$name traverses the public Agent action pipeline',
      async (scenario) => {
        let modelCalls = 0;
        let hookCalls = 0;
        const fixture = await createFixture({
          inputStrategy: 'bulk',
          generateReport: false,
          persistExecutionDump: false,
          forceChromeSelectRendering: false,
          modelConfig: {
            MIDSCENE_MODEL_NAME: 'focused-input-local-test',
            MIDSCENE_MODEL_API_KEY: 'local-test',
            MIDSCENE_MODEL_BASE_URL: 'https://model.invalid/v1',
            MIDSCENE_MODEL_FAMILY: 'qwen2.5-vl',
          },
          beforeInvokeAction: async () => {
            hookCalls++;
          },
          createOpenAIClient: async () => ({
            chat: {
              completions: {
                create: async () => {
                  modelCalls++;
                  throw new Error('Focused Input must not call a model');
                },
              },
            },
          }),
        });
        try {
          await fixture.agent.callActionInActionSpace('Input', scenario.param);
          const state = await fixture.read();
          expect(state.value).toBe(scenario.expected);
          expect(state.other).toBe('unchanged');
          expect(state.enterCount).toBe(0);
          expect(state.changes.length).toBeGreaterThan(0);
          expect(
            state.changes.every((value) => value === scenario.expected),
          ).toBe(true);
          if (!scenario.expected.includes('\n'))
            expect(state.changes).toEqual([scenario.expected]);
          expect(hookCalls).toBe(1);
          expect(modelCalls).toBe(0);
        } finally {
          await fixture.agent.destroy();
          await fixture.close();
        }
      },
      TIMEOUT,
    );
  });
}
