import { PlaywrightWebPage } from '@/playwright';
import { PuppeteerWebPage } from '@/puppeteer';
import { buildWebMCPActions } from '@/puppeteer/webmcp';
import { validateJsonSchemaParam } from '@midscene/core/ai-model';
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
          required: ['text'],
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
          const actualType = typeof rawInput;
          if (expectedInputType && actualType !== expectedInputType) {
            throw new TypeError(`Expected ${expectedInputType} tool input`);
          }
          const input =
            typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
          document.body.dataset.inputText = input.text;
          return input.text === 'large'
            ? 'x'.repeat(20_000)
            : { changed: true, text: input.text };
        },
      },
    });
  }, inputType);
}

afterEach(() => {
  rs.restoreAllMocks();
});

it('preserves dictionary and composite JSON schemas and validates input with Ajv', () => {
  const actions = buildWebMCPActions(
    [
      {
        name: 'set_headers',
        origin: 'https://example.com',
        description: 'Set headers',
        inputSchema: {
          type: 'object',
          additionalProperties: { type: 'string' },
          minProperties: 1,
        },
      },
      {
        name: 'merge_fields',
        origin: 'https://example.com',
        description: 'Merge fields',
        inputSchema: {
          allOf: [
            {
              type: 'object',
              properties: { a: { type: 'string' } },
              required: ['a'],
            },
            {
              type: 'object',
              properties: { b: { type: 'number' } },
              required: ['b'],
            },
          ],
        },
      },
    ],
    new Set(),
    rs.fn(),
    rs.fn(),
  );

  const dictAction = actions.find((a) => a.name === 'WebMCP_set_headers');
  expect(dictAction?.paramJsonSchema).toBeDefined();
  expect(() =>
    validateJsonSchemaParam({}, dictAction!.paramJsonSchema!),
  ).toThrow();
  expect(() =>
    validateJsonSchemaParam({ a: 123 }, dictAction!.paramJsonSchema!),
  ).toThrow();
  expect(
    validateJsonSchemaParam({ a: 'ok' }, dictAction!.paramJsonSchema!),
  ).toEqual({ a: 'ok' });

  const allOfAction = actions.find((a) => a.name === 'WebMCP_merge_fields');
  expect(allOfAction?.paramJsonSchema).toBeDefined();
  expect(() =>
    validateJsonSchemaParam({ a: 'x' }, allOfAction!.paramJsonSchema!),
  ).toThrow();
  expect(() =>
    validateJsonSchemaParam(
      { a: 'x', b: 'bad' },
      allOfAction!.paramJsonSchema!,
    ),
  ).toThrow();
  expect(
    validateJsonSchemaParam({ a: 'x', b: 1 }, allOfAction!.paramJsonSchema!),
  ).toEqual({ a: 'x', b: 1 });

  const tuple = [{ type: 'string' }, { type: 'number' }];
  expect(() =>
    validateJsonSchemaParam(
      { pair: ['a', 'bad'] },
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        properties: { pair: { prefixItems: tuple } },
      },
    ),
  ).toThrow();
  expect(() =>
    validateJsonSchemaParam(
      { pair: ['a', 'bad'] },
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        properties: { pair: { items: tuple } },
      },
    ),
  ).toThrow();
  expect(() =>
    validateJsonSchemaParam(
      {},
      { $schema: 'https://json-schema.org/draft/2099-01/schema' },
    ),
  ).toThrow();
});

describe.each(['puppeteer', 'playwright'] as const)(
  '%s WebMCP integration',
  (driver) => {
    const launchBrowser = () =>
      driver === 'puppeteer'
        ? puppeteer.launch(browserOptions)
        : chromium.launch(browserOptions);
    const createWebPage = (page: TestPage, enableWebMCP?: boolean) =>
      driver === 'puppeteer'
        ? new PuppeteerWebPage(page as never, { enableWebMCP })
        : new PlaywrightWebPage(page as never, { enableWebMCP });

    it('exposes per-tool WebMCP actions, validates input, and rechecks before execution', async () => {
      const browser = await launchBrowser();
      try {
        const page = (await browser.newPage()) as TestPage;
        expect(await createWebPage(page).getWebMCPActions()).toEqual([]);

        const webPage = createWebPage(page, true);
        expect(await webPage.getWebMCPActions()).toEqual([]);

        await registerMockWebMCP(page);
        await page.evaluate(() => {
          (window as any).__webMCPTools.push({
            name: 'other_origin',
            origin: 'https://other.example',
            description: 'Cross-origin',
          });
        });

        const actions = await webPage.getWebMCPActions();
        const action = actions.find((a) => a.name === 'WebMCP_write_note');
        expect(action).toBeDefined();
        expect(actions.some((a) => a.name === 'WebMCP_other_origin')).toBe(
          false,
        );
        expect(action!.paramJsonSchema).toBeDefined();
        expect(() =>
          validateJsonSchemaParam({}, action!.paramJsonSchema!),
        ).toThrow();

        const task = { planningFeedback: undefined as string | undefined };
        expect(await action!.call({ text: 'hello' }, { task } as any)).toEqual({
          changed: true,
          text: 'hello',
        });
        expect(task.planningFeedback).toContain('hello');

        const large = await action!.call({ text: 'large' }, { task } as any);
        expect(large).toContain('[WebMCP result truncated]');

        await page.evaluate(() => {
          (window as any).__webMCPTools.length = 0;
        });
        await expect(action!.call({ text: 'again' })).rejects.toThrow(
          'no longer uniquely available',
        );
        expect(await webPage.getWebMCPActions()).toEqual([]);
      } finally {
        await browser.close();
      }
    }, 30_000);

    it.each([
      { product: 'Chrome/154.0.0.0', inputType: 'string' as const },
      { product: 'Chrome/155.0.0.0', inputType: 'object' as const },
    ])(
      'uses $inputType input for $product',
      async ({ product, inputType }) => {
        const browser = await launchBrowser();
        try {
          const page = (await browser.newPage()) as TestPage;
          await registerMockWebMCP(page, inputType);
          const webPage = createWebPage(page, true);
          rs.spyOn(webPage as any, 'createPageCdpSession').mockResolvedValue({
            send: rs.fn().mockResolvedValue({ product }),
            detach: rs.fn().mockResolvedValue(undefined),
          });
          const [action] = await webPage.getWebMCPActions();
          await expect(action.call({ text: 'draft' })).resolves.toEqual({
            changed: true,
            text: 'draft',
          });
        } finally {
          await browser.close();
        }
      },
      30_000,
    );
  },
);
