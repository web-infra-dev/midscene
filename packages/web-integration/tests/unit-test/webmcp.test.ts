import { PlaywrightWebPage } from '@/playwright';
import { PuppeteerWebPage } from '@/puppeteer';
import { TaskExecutor } from '@midscene/core/agent';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { chromium } from 'playwright';
import puppeteer from 'puppeteer';

const browserOptions = {
  headless: true as const,
  executablePath: puppeteer.executablePath(),
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
};

type TestPage = {
  evaluate: <T, Arg = undefined>(
    fn: (arg: Arg) => T,
    arg?: Arg,
  ) => Promise<Awaited<T>>;
};

async function registerMockWebMCP(
  page: TestPage,
  inputType?: 'string' | 'object',
) {
  await page.evaluate((expectedInputType) => {
    const tools: Array<Record<string, unknown>> = [
      {
        name: 'write_note',
        origin: location.origin,
        description: 'Write a note',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
      },
    ];
    (window as any).__webMCPTools = tools;
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        getTools: async () => tools,
        executeTool: async (
          tool: { name: string },
          rawInput: { text?: string } | string,
        ) => {
          const actualInputType = typeof rawInput;
          if (expectedInputType && actualInputType !== expectedInputType) {
            throw new TypeError(`Expected ${expectedInputType} tool input`);
          }
          const input =
            typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
          document.body.dataset.calledTool = tool.name;
          document.body.dataset.inputText = input.text;
          if (input.text === 'large') return 'x'.repeat(20_000);
          return { changed: true, text: input.text };
        },
      },
    });
  }, inputType);
}

afterEach(() => {
  rs.restoreAllMocks();
});

describe.each(['puppeteer', 'playwright'] as const)(
  '%s WebMCP integration',
  (driver) => {
    const launchBrowser = (options = browserOptions) =>
      driver === 'puppeteer'
        ? puppeteer.launch(options)
        : chromium.launch(options);
    const createWebPage = (page: TestPage, enableWebMCP?: boolean) =>
      driver === 'puppeteer'
        ? new PuppeteerWebPage(page as never, { enableWebMCP })
        : new PlaywrightWebPage(page as never, { enableWebMCP });

    it('refreshes tools after page changes and rechecks before execution', async () => {
      const browser = await launchBrowser();
      try {
        const firstPage = (await browser.newPage()) as TestPage;
        const defaultPage = createWebPage(firstPage);
        expect(
          defaultPage
            .actionSpace()
            .some((action) => action.name === 'CallWebMCPTool'),
        ).toBe(false);
        const webPage = createWebPage(firstPage, true);
        const actionSpace = webPage.actionSpace();
        const uiOnly = await webPage.prepareActionSpaceForPlanning(actionSpace);
        expect(uiOnly.some((action) => action.name === 'CallWebMCPTool')).toBe(
          false,
        );

        await registerMockWebMCP(firstPage);
        await firstPage.evaluate(() => {
          (window as any).__webMCPTools.push({
            name: 'other_origin_tool',
            origin: 'https://other.example',
            description: 'Not accessible from this page',
          });
        });
        const withTool =
          await webPage.prepareActionSpaceForPlanning(actionSpace);
        const catalogDescription = withTool.find(
          (action) => action.name === 'CallWebMCPTool',
        )?.description;
        expect(catalogDescription).toContain('write_note');
        expect(catalogDescription).not.toContain('other_origin_tool');

        const action = actionSpace.find(
          (item) => item.name === 'CallWebMCPTool',
        );
        expect(action).toBeDefined();
        const task = { planningFeedback: undefined as string | undefined };
        const callTool = (text: string) =>
          action!.call(
            { name: 'write_note', origin: 'null', input: { text } },
            { task } as any,
          );
        const collectFeedback = () =>
          (TaskExecutor.prototype as any).collectPlanningFeedback([
            {
              ...task,
              planningFeedbackMaxLength: action!.planningFeedbackMaxLength,
            },
          ]);
        const result = await callTool('hello');
        expect(result).toEqual({ changed: true, text: 'hello' });
        expect(task.planningFeedback).toContain('write_note');
        expect(task.planningFeedback).toContain('hello');
        expect(
          await firstPage.evaluate(() => document.body.dataset.inputText),
        ).toBe('hello');

        const longResult = await callTool(
          `${'x'.repeat(1000)}required_id=note-42`,
        );
        expect(collectFeedback()).toContain(JSON.stringify(longResult));

        const largeResult = await callTool('large');
        expect(typeof largeResult).toBe('string');
        expect((largeResult as string).length).toBeLessThan(17_000);
        expect(largeResult).toContain('[WebMCP result truncated]');
        expect(task.planningFeedback).toContain('[WebMCP result truncated]');
        expect(collectFeedback()).toContain('[WebMCP result truncated]');
        expect(collectFeedback().length).toBeLessThan(17_000);

        await firstPage.evaluate(() => {
          (window as any).__webMCPTools.length = 0;
        });
        await expect(callTool('again')).rejects.toThrow(
          'no longer uniquely available',
        );
        expect(
          (await webPage.prepareActionSpaceForPlanning(actionSpace)).some(
            (item) => item.name === 'CallWebMCPTool',
          ),
        ).toBe(false);

        const secondPage = (await browser.newPage()) as TestPage;
        await registerMockWebMCP(secondPage);
        await secondPage.evaluate(() => {
          (window as any).__webMCPTools[0].name = 'second_page_tool';
        });
        webPage.underlyingPage = secondPage as never;
        const afterPageSwitch =
          await webPage.prepareActionSpaceForPlanning(actionSpace);
        const description = afterPageSwitch.find(
          (item) => item.name === 'CallWebMCPTool',
        )?.description;
        expect(description).toContain('second_page_tool');
        expect(description).not.toContain('write_note');
      } finally {
        await browser.close();
      }
    }, 30_000);

    it.each([
      {
        product: 'Chrome/154.0.0.0',
        userAgent: 'CustomUA/1.0',
        inputType: 'string' as const,
      },
      {
        product: 'Chrome/155.0.0.0',
        userAgent: 'Mozilla/5.0 Chrome/114.0.0.0 Safari/537.36',
        inputType: 'object' as const,
      },
    ])(
      'uses $inputType input for $product despite a custom user agent',
      async ({ product, userAgent, inputType }) => {
        const options = {
          ...browserOptions,
          args: [...browserOptions.args, `--user-agent=${userAgent}`],
        };
        const browser = await launchBrowser(options);
        try {
          const page = (await browser.newPage()) as TestPage;
          expect(await page.evaluate(() => navigator.userAgent)).toBe(
            userAgent,
          );
          await registerMockWebMCP(page, inputType);
          const webPage = createWebPage(page, true);
          rs.spyOn(webPage as any, 'createPageCdpSession').mockResolvedValue({
            send: rs.fn().mockResolvedValue({ product }),
            detach: rs.fn().mockResolvedValue(undefined),
          });
          const action = webPage
            .actionSpace()
            .find((item) => item.name === 'CallWebMCPTool');
          await expect(
            action!.call({
              name: 'write_note',
              origin: 'null',
              input: { text: 'draft' },
            }),
          ).resolves.toEqual({ changed: true, text: 'draft' });
        } finally {
          await browser.close();
        }
      },
      30_000,
    );
  },
);
