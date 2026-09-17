import type { AgentTestRunnerNodeDefinition } from '@midscene/core/agent';
import type { Page } from 'puppeteer';
import { z } from 'zod/v4';
import { requirePuppeteerAgent, resolveWebUrl, throwIfAborted } from './utils';

const DEFAULT_NAVIGATION_TIMEOUT_MS = 60_000;
const DEFAULT_WAIT_UNTIL = 'domcontentloaded' as const;

export const gotoUrlInputSchema = z.strictObject({
  url: z
    .string()
    .min(1)
    .describe(
      'An absolute HTTP(S) URL or a path relative to Puppeteer baseURL or the current page URL.',
    ),
  waitUntil: z
    .enum(['domcontentloaded', 'load', 'networkidle0', 'networkidle2'])
    .default(DEFAULT_WAIT_UNTIL)
    .describe('The Puppeteer navigation lifecycle event to wait for.'),
  timeoutMs: z
    .number()
    .positive()
    .default(DEFAULT_NAVIGATION_TIMEOUT_MS)
    .describe('The navigation timeout in milliseconds.'),
});

export type GotoUrlNodeInput = z.infer<typeof gotoUrlInputSchema>;

export interface GotoUrlNodeResult {
  url: string;
  status: number | null;
  title: string;
}

const resolveNavigationUrl = (
  target: string,
  page: Page,
  configuredBase: string | undefined,
): string => {
  const trimmed = target.trim();
  if (!trimmed) throw new TypeError('gotoUrl.url must not be blank.');
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    return resolveWebUrl(trimmed, undefined, 'gotoUrl.url');
  }
  if (configuredBase !== undefined) {
    return resolveWebUrl(trimmed, configuredBase, 'gotoUrl.url');
  }
  const currentUrl = page.url();
  if (!/^https?:\/\//i.test(currentUrl)) {
    throw new TypeError(
      `gotoUrl.url cannot resolve a relative URL from ${JSON.stringify(currentUrl)}. Use an absolute HTTP(S) URL for the first navigation or configure Puppeteer testRunner.baseURL.`,
    );
  }
  return resolveWebUrl(trimmed, currentUrl, 'gotoUrl.url');
};

export const gotoUrlNode: AgentTestRunnerNodeDefinition<
  z.output<typeof gotoUrlInputSchema>,
  GotoUrlNodeResult
> = {
  name: 'gotoUrl',
  title: 'Open a Web URL',
  description:
    'Navigate the current Puppeteer Page to an absolute HTTP(S) URL or a path relative to testRunner.baseURL or the current page URL.',
  stringInputKey: 'url',
  inputSchema: gotoUrlInputSchema,
  async execute(agent, input, executionContext) {
    const ctx = {
      ...executionContext,
      input,
      context: requirePuppeteerAgent(agent),
    };
    throwIfAborted(ctx.signal, 'gotoUrl');
    const page = ctx.context.interface.underlyingPage;
    const url = resolveNavigationUrl(
      ctx.input.url,
      page,
      ctx.context.testRunner?.baseURL,
    );
    const response = await page.goto(url, {
      waitUntil: ctx.input.waitUntil,
      timeout: ctx.input.timeoutMs,
    });
    throwIfAborted(ctx.signal, 'gotoUrl');
    const result = {
      url: page.url(),
      status: response?.status() ?? null,
      title: await page.title(),
    };
    return { summary: `Navigated to ${result.url}`, data: result };
  },
};
