import {
  type SetCookiesNodeInput,
  type SetCookiesNodeResult,
  resolveCookieInput,
  setCookiesInputSchema,
} from '@/common/test-runner/cookies';
import type { AgentTestRunnerNodeDefinition } from '@midscene/core/agent';
import type { CookieParam } from 'puppeteer';
import { requirePuppeteerAgent, throwIfAborted } from './utils';

export { setCookiesInputSchema };
export type { SetCookiesNodeInput, SetCookiesNodeResult };

export const setCookiesNode: AgentTestRunnerNodeDefinition<
  SetCookiesNodeInput,
  SetCookiesNodeResult
> = {
  name: 'setCookies',
  title: 'Set browser cookies',
  description:
    'Load cookies from an environment variable, configured profile, or browser storage-state file without persisting cookie values in workflow input or output.',
  stringInputKey: false,
  inputSchema: setCookiesInputSchema,
  async execute(agent, input, executionContext) {
    const ctx = {
      ...executionContext,
      input,
      context: requirePuppeteerAgent(agent),
    };
    throwIfAborted(ctx.signal, 'setCookies');
    const { cookies, result } = await resolveCookieInput(
      input,
      ctx,
      ctx.context.testRunner ?? {},
    );

    throwIfAborted(ctx.signal, 'setCookies');
    try {
      await ctx.context.interface.underlyingPage.setCookie(
        ...(cookies as CookieParam[]),
      );
    } catch {
      throw new Error(
        `Failed to set ${cookies.length} browser cookie(s); the browser error was redacted because it may contain cookie values.`,
      );
    }
    return {
      summary: `Set ${result.count} browser cookie(s) from ${result.source} source ${result.sourceName}`,
      data: result,
    };
  },
};
