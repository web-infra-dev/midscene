import type { AgentTestRunnerNodeDefinition } from '@midscene/core/agent';
import { z } from 'zod/v4';
import {
  type SetCookiesNodeResult,
  resolveCookieInput,
  setCookiesInputSchema,
} from './cookies';
import type {
  WebCookieFilters,
  WebTestDriverAdapter,
  WebTestRunnerOptions,
  WebViewportSize,
} from './driver';
import { resolveWebUrl, throwIfAborted } from './utils';

const DEFAULT_NAVIGATION_TIMEOUT_MS = 60_000;
const DEFAULT_WAIT_UNTIL = 'domcontentloaded' as const;

export const gotoUrlInputSchema = z.strictObject({
  url: z
    .string()
    .min(1)
    .describe(
      'An absolute HTTP(S) URL or a path relative to testRunner.baseURL or the current page URL.',
    ),
  waitUntil: z
    .enum([
      'commit',
      'domcontentloaded',
      'load',
      'networkidle',
      'networkidle0',
      'networkidle2',
    ])
    .default(DEFAULT_WAIT_UNTIL)
    .describe(
      'The navigation lifecycle event. domcontentloaded, load, and networkidle are portable across browser drivers.',
    ),
  timeoutMs: z
    .number()
    .positive()
    .max(10 * 60_000)
    .default(DEFAULT_NAVIGATION_TIMEOUT_MS)
    .describe('The navigation timeout in milliseconds.'),
});

export type GotoUrlNodeInput = z.infer<typeof gotoUrlInputSchema>;

export interface GotoUrlNodeResult {
  url: string;
  status: number | null;
  title: string;
}

export const clearCookiesInputSchema = z.strictObject({
  name: z.string().regex(/\S/).optional().describe('Cookie name to clear.'),
  domain: z.string().regex(/\S/).optional().describe('Cookie domain to clear.'),
  path: z.string().regex(/\S/).optional().describe('Cookie path to clear.'),
});

export type ClearCookiesNodeInput = z.infer<typeof clearCookiesInputSchema>;

export const setViewportSizeInputSchema = z.strictObject({
  width: z.number().int().positive().describe('Viewport width in CSS pixels.'),
  height: z
    .number()
    .int()
    .positive()
    .describe('Viewport height in CSS pixels.'),
});

export type SetViewportSizeNodeInput = z.infer<
  typeof setViewportSizeInputSchema
>;

const resolveNavigationUrl = (
  target: string,
  currentUrl: string,
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
  if (!/^https?:\/\//i.test(currentUrl)) {
    throw new TypeError(
      `gotoUrl.url cannot resolve a relative URL from ${JSON.stringify(currentUrl)}. Use an absolute HTTP(S) URL for the first navigation or configure testRunner.baseURL.`,
    );
  }
  return resolveWebUrl(trimmed, currentUrl, 'gotoUrl.url');
};

/** Create the browser-neutral built-in Web Nodes for one browser adapter. */
export const createWebTestRunnerNodeDefinitions = <
  TAgent,
  TOptions extends WebTestRunnerOptions<TAgent>,
>(
  adapter: WebTestDriverAdapter<TAgent, TOptions>,
): readonly AgentTestRunnerNodeDefinition[] => {
  const gotoUrlNode: AgentTestRunnerNodeDefinition<
    z.output<typeof gotoUrlInputSchema>,
    GotoUrlNodeResult
  > = {
    name: 'gotoUrl',
    title: 'Open a Web URL',
    description:
      'Navigate the current browser Page to an absolute HTTP(S) URL or a path relative to testRunner.baseURL or the current page URL.',
    stringInputKey: 'url',
    inputSchema: gotoUrlInputSchema,
    async execute(agent, input, executionContext) {
      const runtimeAgent = adapter.requireAgent(agent);
      const driver = adapter.createDriver(runtimeAgent);
      throwIfAborted(executionContext.signal, 'gotoUrl');
      const url = resolveNavigationUrl(
        input.url,
        driver.currentUrl(),
        adapter.getOptions(runtimeAgent)?.baseURL ?? driver.baseUrl(),
      );
      const response = await driver.goto(url, {
        waitUntil: input.waitUntil,
        timeoutMs: input.timeoutMs,
      });
      throwIfAborted(executionContext.signal, 'gotoUrl');
      const result = {
        url: driver.currentUrl(),
        status: response.status,
        title: await driver.title(),
      };
      return { summary: `Navigated to ${result.url}`, data: result };
    },
  };

  const setCookiesNode: AgentTestRunnerNodeDefinition<
    z.output<typeof setCookiesInputSchema>,
    SetCookiesNodeResult
  > = {
    name: 'setCookies',
    title: 'Set browser cookies',
    description:
      'Load cookies from an environment variable, configured profile, or browser storage-state file without persisting cookie values in workflow input or output.',
    stringInputKey: false,
    inputSchema: setCookiesInputSchema,
    async execute(agent, input, executionContext) {
      const runtimeAgent = adapter.requireAgent(agent);
      const driver = adapter.createDriver(runtimeAgent);
      throwIfAborted(executionContext.signal, 'setCookies');
      const { cookies, result } = await resolveCookieInput(
        input,
        { ...executionContext, input, context: runtimeAgent },
        adapter.getOptions(runtimeAgent) ?? {},
      );
      throwIfAborted(executionContext.signal, 'setCookies');
      try {
        await driver.setCookies(cookies);
      } catch {
        throw new Error(
          `Failed to set ${cookies.length} browser cookie(s); the browser error was redacted because it may contain cookie values.`,
        );
      }
      return {
        summary: `Set ${result.count} browser cookie(s) from ${result.source} ${result.sourceName}`,
        data: result,
      };
    },
  };

  const clearCookiesNode: AgentTestRunnerNodeDefinition<
    z.output<typeof clearCookiesInputSchema>,
    { filters: WebCookieFilters }
  > = {
    name: 'clearCookies',
    title: 'Clear browser cookies',
    description:
      'Clear all cookies from the current browser context, or only cookies matching name, domain, or path.',
    stringInputKey: false,
    inputSchema: clearCookiesInputSchema,
    async execute(agent, input, executionContext) {
      const runtimeAgent = adapter.requireAgent(agent);
      const driver = adapter.createDriver(runtimeAgent);
      throwIfAborted(executionContext.signal, 'clearCookies');
      const filters: WebCookieFilters = { ...input };
      await driver.clearCookies(filters);
      const filterNames = Object.keys(filters);
      return {
        summary:
          filterNames.length === 0
            ? 'Cleared all browser cookies'
            : `Cleared browser cookies matching ${filterNames.join(', ')}`,
        data: { filters },
      };
    },
  };

  const setViewportSizeNode: AgentTestRunnerNodeDefinition<
    z.output<typeof setViewportSizeInputSchema>,
    WebViewportSize
  > = {
    name: 'setViewportSize',
    title: 'Set the browser viewport size',
    description:
      'Set the current browser Page viewport size in CSS pixels and return the effective size.',
    stringInputKey: false,
    inputSchema: setViewportSizeInputSchema,
    async execute(agent, input, executionContext) {
      const runtimeAgent = adapter.requireAgent(agent);
      const driver = adapter.createDriver(runtimeAgent);
      throwIfAborted(executionContext.signal, 'setViewportSize');
      const viewport = await driver.setViewportSize(input);
      return {
        summary: `Set viewport to ${viewport.width}x${viewport.height}`,
        data: viewport,
      };
    },
  };

  return [gotoUrlNode, setCookiesNode, clearCookiesNode, setViewportSizeNode];
};

export { setCookiesInputSchema };
export type { SetCookiesNodeInput, SetCookiesNodeResult } from './cookies';
