import ChromeExtensionProxyPage from '@/chrome-extension/page';
import { PlaywrightAgent } from '@/playwright/agent';
import { PuppeteerAgent } from '@/puppeteer';
import type { WebPageAgentOpt } from '@/web-element';
import { afterAll, beforeAll, describe, expect, rs, test } from '@rstest/core';
import { type Browser as PlaywrightBrowser, chromium } from 'playwright';
import puppeteer, { type Browser as PuppeteerBrowser } from 'puppeteer';

const scenarios = [
  {
    type: 'date',
    before: '2026-07-21',
    value: '2026-09-01',
    expected: '2026-09-01',
  },
  {
    type: 'datetime-local',
    before: '2026-07-21T17:00',
    value: '2026-09-01T00:00:00',
    expected: '2026-09-01T00:00',
  },
  { type: 'time', before: '17:00', value: '09:37:00', expected: '09:37:00' },
  { type: 'month', before: '2026-07', value: '2026-09', expected: '2026-09' },
  { type: 'week', before: '2026-W30', value: '2026-W36', expected: '2026-W36' },
];

function fixtureHtml(type: string, value: string, shadow = false) {
  return `<!doctype html><form id="form"><input id="other" value="unchanged"></form>
    <script>
      window.changes = []; window.changeCount = 0; window.enters = 0; window.submits = 0;
      const form = document.querySelector('#form');
      const root = ${shadow ? "form.appendChild(document.createElement('div')).attachShadow({mode:'open'})" : 'form'};
      const field = document.createElement('input');
      field.type = ${JSON.stringify(type)}; field.value = ${JSON.stringify(value)};
      root.appendChild(field); window.field = field;
      field.addEventListener('input', () => window.changes.push(field.value));
      field.addEventListener('change', () => window.changeCount++);
      document.addEventListener('keydown', e => { if (e.key === 'Enter') window.enters++; });
      form.addEventListener('submit', e => { e.preventDefault(); window.submits++; });
      field.focus();
    </script>`;
}

type FixtureWindow = Window & {
  field: HTMLInputElement;
  changes: string[];
  changeCount: number;
  enters: number;
  submits: number;
};

function readState() {
  const state = window as unknown as FixtureWindow;
  return {
    value: state.field.value,
    changes: state.changes,
    changeCount: state.changeCount,
    enters: state.enters,
    submits: state.submits,
    other: (document.querySelector('#other') as HTMLInputElement).value,
  };
}

function targetLocation() {
  const rect = (
    window as unknown as FixtureWindow
  ).field.getBoundingClientRect();
  return {
    locatedPixelResult: {
      center: [rect.x + 12, rect.y + rect.height / 2],
      rect: {
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      },
    },
  };
}

interface FixtureFrame {
  evaluate<Result>(fn: () => Result): Promise<Awaited<Result>>;
}

interface FixturePage extends FixtureFrame {
  setContent(html: string): Promise<void>;
  frames(): FixtureFrame[];
  close(): Promise<void>;
}

interface Fixture {
  page: FixturePage;
  input(param: {
    value: string;
    mode?: string;
    locate?: ReturnType<typeof targetLocation>;
  }): Promise<unknown>;
  modelCalls(): number;
  close(): Promise<void>;
}

type DebuggerTransport = {
  sendCommandToDebugger(command: string, params?: object): Promise<unknown>;
};

for (const adapter of [
  'Playwright',
  'Puppeteer',
  'Chrome extension',
] as const) {
  describe(`${adapter} bulk native date/time replacement`, () => {
    let browser: PlaywrightBrowser | PuppeteerBrowser;
    let createFixture: (html: string) => Promise<Fixture>;

    beforeAll(async () => {
      const launchOptions = {
        headless: true,
        executablePath: puppeteer.executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };
      const options = (onModel: () => never): WebPageAgentOpt => ({
        inputStrategy: 'bulk',
        cache: false,
        generateReport: false,
        persistExecutionDump: false,
        waitForNavigationTimeout: 0,
        waitForNetworkIdleTimeout: 0,
        forceChromeSelectRendering: false,
        modelConfig: {
          MIDSCENE_MODEL_NAME: 'native-date-local-test',
          MIDSCENE_MODEL_FAMILY: 'doubao-seed',
          MIDSCENE_MODEL_API_KEY: 'unused',
          MIDSCENE_MODEL_BASE_URL: 'http://127.0.0.1:1/v1',
          MIDSCENE_MODEL_RETRY_COUNT: '0',
        },
        createOpenAIClient: async () => onModel(),
      });
      if (adapter === 'Playwright') {
        const launched = await chromium.launch(launchOptions);
        browser = launched;
        createFixture = async (html) => {
          const page = await launched.newPage({
            locale: 'en-US',
            timezoneId: 'America/Los_Angeles',
          });
          await page.setContent(html);
          let modelCalls = 0;
          const agent = new PlaywrightAgent(
            page,
            options(() => {
              modelCalls++;
              throw new Error('No model call expected');
            }),
          );
          return {
            page,
            input: (param) => agent.callActionInActionSpace('Input', param),
            modelCalls: () => modelCalls,
            close: async () => {
              await agent.destroy();
              await page.close();
            },
          };
        };
      } else {
        const launched = await puppeteer.launch(launchOptions);
        browser = launched;
        createFixture = async (html) => {
          const page = await launched.newPage();
          await page.emulateTimezone('America/Los_Angeles');
          await page.setContent(html);
          if (adapter === 'Chrome extension') {
            const proxy = new ChromeExtensionProxyPage(true);
            const session = await page.createCDPSession();
            rs.spyOn(
              proxy as unknown as DebuggerTransport,
              'sendCommandToDebugger',
            ).mockImplementation((command, params) =>
              session.send(
                command as Parameters<typeof session.send>[0],
                params as never,
              ),
            );
            const input = proxy
              .actionSpace()
              .find((action) => action.name === 'Input')!;
            return {
              page,
              input: (param) =>
                // The adapter and browser scripts stay intact; only replace
                // chrome.debugger transport with a real Chrome CDP session.
                input.call(
                  {
                    ...param,
                    locate: param.locate
                      ? { center: param.locate.locatedPixelResult.center }
                      : undefined,
                    inputStrategy: 'bulk',
                  } as never,
                  {
                    task: {
                      type: 'Action Space',
                      taskId: 'native-date-input',
                      status: 'running',
                      executor: async () => {},
                    },
                  },
                ),
              modelCalls: () => 0,
              close: async () => {
                await session.detach();
                await page.close();
              },
            };
          }
          let modelCalls = 0;
          const agent = new PuppeteerAgent(
            page,
            options(() => {
              modelCalls++;
              throw new Error('No model call expected');
            }),
          );
          return {
            page,
            input: (param) => agent.callActionInActionSpace('Input', param),
            modelCalls: () => modelCalls,
            close: async () => {
              await agent.destroy();
              await page.close();
            },
          };
        };
      }
    }, 120_000);

    afterAll(async () => {
      await browser?.close();
    });

    for (const scenario of scenarios) {
      for (const located of [false, true]) {
        test(`${scenario.type} ${located ? 'located' : 'focused'} replacement preserves other fields and emits one complete input`, async () => {
          const fixture = await createFixture(
            fixtureHtml(scenario.type, scenario.before),
          );
          try {
            await fixture.input({
              value: scenario.value,
              ...(located
                ? { locate: await fixture.page.evaluate(targetLocation) }
                : {}),
            });
            expect(await fixture.page.evaluate(readState)).toEqual({
              value: scenario.expected,
              changes: [scenario.expected],
              changeCount: 1,
              enters: 0,
              submits: 0,
              other: 'unchanged',
            });
            expect(fixture.modelCalls()).toBe(0);
          } finally {
            await fixture.close();
          }
        });
      }
    }

    test('fills a focused date inside open Shadow DOM', async () => {
      const fixture = await createFixture(
        fixtureHtml('date', '2026-07-21', true),
      );
      try {
        await fixture.input({ value: '2026-09-01', mode: 'replace' });
        expect((await fixture.page.evaluate(readState)).changes).toEqual([
          '2026-09-01',
        ]);
      } finally {
        await fixture.close();
      }
    });

    test('rejects an invalid complete date without clearing or changing the field', async () => {
      const fixture = await createFixture(fixtureHtml('date', '2026-07-21'));
      try {
        await expect(
          fixture.input({ value: '2026-02-30', mode: 'replace' }),
        ).rejects.toThrow(/Invalid value for native date/);
        expect((await fixture.page.evaluate(readState)).value).toBe(
          '2026-07-21',
        );
        expect((await fixture.page.evaluate(readState)).changes).toEqual([]);
      } finally {
        await fixture.close();
      }
    });

    test('does not change a readonly native date', async () => {
      const fixture = await createFixture(fixtureHtml('date', '2026-07-21'));
      try {
        await fixture.page.evaluate(() => {
          (window as unknown as FixtureWindow).field.readOnly = true;
        });
        await expect(fixture.input({ value: '2026-09-01' })).rejects.toThrow(
          /not editable/,
        );
        expect((await fixture.page.evaluate(readState)).value).toBe(
          '2026-07-21',
        );
      } finally {
        await fixture.close();
      }
    });

    test('keeps ordinary bulk text replacement and typeOnly behavior', async () => {
      const fixture = await createFixture(fixtureHtml('text', 'old value'));
      try {
        await fixture.input({ value: 'new value' });
        expect((await fixture.page.evaluate(readState)).value).toBe(
          'new value',
        );
        await fixture.input({ value: ' appended', mode: 'typeOnly' });
        expect((await fixture.page.evaluate(readState)).value).toBe(
          'new value appended',
        );
      } finally {
        await fixture.close();
      }
    });

    test('does not fill another focused date when a disabled target cannot receive focus', async () => {
      const fixture = await createFixture(fixtureHtml('date', '2026-07-21'));
      try {
        const locate = await fixture.page.evaluate(() => {
          const other = document.querySelector('#other') as HTMLInputElement;
          other.type = 'date';
          other.value = '2026-08-10';
          other.disabled = true;
          // Applications may retain the current field's focus even when a
          // different target is clicked. The input must not follow that focus.
          document.addEventListener(
            'pointerdown',
            (event) => event.preventDefault(),
            true,
          );
          const rect = other.getBoundingClientRect();
          return {
            locatedPixelResult: {
              center: [rect.x + 12, rect.y + rect.height / 2],
              rect: {
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
              },
            },
          };
        });
        await expect(
          fixture.input({ value: '2026-09-01', locate }),
        ).rejects.toThrow(/did not receive focus/);
        expect((await fixture.page.evaluate(readState)).value).toBe(
          '2026-07-21',
        );
        expect((await fixture.page.evaluate(readState)).other).toBe(
          '2026-08-10',
        );
        expect((await fixture.page.evaluate(readState)).changes).toEqual([]);
      } finally {
        await fixture.close();
      }
    });

    test('allows a valid date outside form constraints for negative form tests', async () => {
      const fixture = await createFixture(fixtureHtml('date', '2026-07-21'));
      try {
        await fixture.page.evaluate(() => {
          const field = (window as unknown as FixtureWindow).field;
          field.min = '2026-08-01';
          field.max = '2026-12-31';
          field.step = '2';
        });
        await fixture.input({ value: '2026-07-22' });
        expect((await fixture.page.evaluate(readState)).value).toBe(
          '2026-07-22',
        );
        expect(
          await fixture.page.evaluate(
            () => (window as unknown as FixtureWindow).field.validity.valid,
          ),
        ).toBe(false);
      } finally {
        await fixture.close();
      }
    });

    test('does not turn typeOnly date input into a complete replacement', async () => {
      const fixture = await createFixture(fixtureHtml('date', '2026-07-21'));
      try {
        await fixture.input({ value: '2026-09-01', mode: 'typeOnly' });
        expect((await fixture.page.evaluate(readState)).value).toBe(
          '2026-07-21',
        );
        expect((await fixture.page.evaluate(readState)).changes).toEqual([]);
      } finally {
        await fixture.close();
      }
    });

    if (adapter !== 'Chrome extension') {
      test('fills the focused date through nested cross-origin frame contexts', async () => {
        const fixture = await createFixture(fixtureHtml('text', 'outer field'));
        try {
          const inner = `data:text/html,${encodeURIComponent(fixtureHtml('date', '2026-07-21'))}`;
          const middle = `data:text/html,${encodeURIComponent(`<iframe src="${inner}"></iframe>`)}`;
          await fixture.page.setContent(`<iframe src="${middle}"></iframe>`);
          const frame = fixture.page.frames().at(-1)!;
          await frame.evaluate(() => {
            (window as unknown as FixtureWindow).field.focus();
          });

          await fixture.input({ value: '2026-09-01' });

          expect(await frame.evaluate(readState)).toEqual({
            value: '2026-09-01',
            changes: ['2026-09-01'],
            changeCount: 1,
            enters: 0,
            submits: 0,
            other: 'unchanged',
          });
        } finally {
          await fixture.close();
        }
      });
    }

    test('retains empty replacement and explicit clear semantics', async () => {
      const fixture = await createFixture(fixtureHtml('date', '2026-07-21'));
      try {
        await fixture.input({ value: '', mode: 'replace' });
        expect((await fixture.page.evaluate(readState)).value).toBe(
          '2026-07-21',
        );
        await fixture.input({
          value: '',
          mode: 'clear',
          ...(adapter === 'Chrome extension'
            ? { locate: await fixture.page.evaluate(targetLocation) }
            : {}),
        });
        expect((await fixture.page.evaluate(readState)).value).toBe('');
      } finally {
        await fixture.close();
      }
    });
  });
}
