import type { AgentTestRunnerNodeDefinition } from '@midscene/core/agent';
import type { BrowserContext, Page } from 'playwright';
import { z } from 'zod/v4';
import { requirePlaywrightAgent, resolveWebUrl, throwIfAborted } from './utils';

const DEFAULT_NAVIGATION_TIMEOUT_MS = 60_000;
const DEFAULT_WAIT_UNTIL = 'domcontentloaded' as const;

/** Input schema for the Playwright gotoUrl Node. */
export const gotoUrlInputSchema = z.strictObject({
  url: z
    .string()
    .min(1)
    .describe(
      'An absolute HTTP(S) URL or a path relative to Playwright baseURL or the current page URL.',
    ),
  waitUntil: z
    .enum(['commit', 'domcontentloaded', 'load', 'networkidle'])
    .default(DEFAULT_WAIT_UNTIL)
    .describe('The Playwright navigation lifecycle event to wait for.'),
  timeoutMs: z
    .number()
    .positive()
    .default(DEFAULT_NAVIGATION_TIMEOUT_MS)
    .describe('The navigation timeout in milliseconds.'),
});

/** Validated input accepted by the Playwright gotoUrl Node. */
export type GotoUrlNodeInput = z.infer<typeof gotoUrlInputSchema>;

/** Structured navigation details returned by the Playwright gotoUrl Node. */
export interface GotoUrlNodeResult {
  /** Final Page URL after navigation and redirects. */
  url: string;
  /** Main-resource HTTP status, or null when Playwright returns no response. */
  status: number | null;
  /** Document title after navigation completes. */
  title: string;
}

const resolveNavigationUrl = (target: string, page: Page): string => {
  const trimmed = target.trim();
  if (!trimmed) throw new TypeError('gotoUrl.url must not be blank.');
  // Absolute URLs do not depend on either configured or current-page bases.
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    return resolveWebUrl(trimmed, undefined, 'gotoUrl.url');
  }

  // Playwright has no public baseURL getter. Its BrowserContext stores the
  // configured value in _options; keep this internal access localized here.
  const context = page.context() as BrowserContext & {
    _options?: { baseURL?: string };
  };
  const configuredBase = context._options?.baseURL;
  if (configuredBase !== undefined) {
    return resolveWebUrl(trimmed, configuredBase, 'gotoUrl.url');
  }

  const currentUrl = page.url();
  if (!/^https?:\/\//i.test(currentUrl)) {
    throw new TypeError(
      `gotoUrl.url cannot resolve a relative URL from ${JSON.stringify(currentUrl)}. Use an absolute HTTP(S) URL for the first navigation or configure Playwright baseURL.`,
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
    'Navigate the current Playwright Page to an absolute HTTP(S) URL or a path relative to Playwright baseURL or the current page URL.',
  stringInputKey: 'url',
  inputSchema: gotoUrlInputSchema,
  async execute(agent, input, executionContext) {
    const ctx = {
      ...executionContext,
      input,
      context: requirePlaywrightAgent(agent),
    };
    throwIfAborted(ctx.signal, 'gotoUrl');
    const page = ctx.context.interface.underlyingPage;
    const url = resolveNavigationUrl(ctx.input.url, page);
    const response = await page.goto(url, {
      waitUntil: ctx.input.waitUntil,
      timeout: ctx.input.timeoutMs,
    });
    const status = response?.status() ?? null;
    const result = {
      url: page.url(),
      status,
      title: await page.title(),
    };
    return { summary: `Navigated to ${result.url}`, data: result };
  },
};
