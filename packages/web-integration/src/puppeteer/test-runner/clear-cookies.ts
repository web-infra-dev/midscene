import type { AgentTestRunnerNodeDefinition } from '@midscene/core/agent';
import { z } from 'zod/v4';
import { requirePuppeteerAgent, throwIfAborted } from './utils';

export const clearCookiesInputSchema = z.strictObject({
  name: z.string().regex(/\S/).optional().describe('Cookie name to clear.'),
  domain: z.string().regex(/\S/).optional().describe('Cookie domain to clear.'),
  path: z.string().regex(/\S/).optional().describe('Cookie path to clear.'),
});

export type ClearCookiesNodeInput = z.infer<typeof clearCookiesInputSchema>;

export const clearCookiesNode: AgentTestRunnerNodeDefinition<
  z.output<typeof clearCookiesInputSchema>,
  { filters: ClearCookiesNodeInput }
> = {
  name: 'clearCookies',
  title: 'Clear browser cookies',
  description:
    'Clear all cookies from the current Puppeteer BrowserContext, or only cookies matching name, domain, or path.',
  stringInputKey: false,
  inputSchema: clearCookiesInputSchema,
  async execute(agent, input, executionContext) {
    const ctx = {
      ...executionContext,
      input,
      context: requirePuppeteerAgent(agent),
    };
    throwIfAborted(ctx.signal, 'clearCookies');
    const browserContext =
      ctx.context.interface.underlyingPage.browserContext();
    const cookies = (await browserContext.cookies()).filter(
      (cookie) =>
        (input.name === undefined || cookie.name === input.name) &&
        (input.domain === undefined || cookie.domain === input.domain) &&
        (input.path === undefined || cookie.path === input.path),
    );
    throwIfAborted(ctx.signal, 'clearCookies');
    if (cookies.length > 0) await browserContext.deleteCookie(...cookies);
    const filterNames = Object.keys(input);
    return {
      summary:
        filterNames.length === 0
          ? `Cleared ${cookies.length} browser cookie(s)`
          : `Cleared ${cookies.length} browser cookie(s) matching ${filterNames.join(', ')}`,
      data: { filters: input },
    };
  },
};
