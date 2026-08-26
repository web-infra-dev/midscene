import type { BrowserContext } from 'playwright';
import { z } from 'zod/v4';
import { defineNode } from '../node/define-node';
import type { NodeDefinition } from '../node/types';
import type { CreatePlaywrightNodesOptions } from './types';
import { throwIfAborted } from './utils';

type CookieClearOptions = NonNullable<
  Parameters<BrowserContext['clearCookies']>[0]
>;

/** Input schema for the Playwright clearCookies Node. */
export const clearCookiesInputSchema = z.strictObject({
  name: z.string().regex(/\S/).optional().describe('Cookie name to clear.'),
  domain: z.string().regex(/\S/).optional().describe('Cookie domain to clear.'),
  path: z.string().regex(/\S/).optional().describe('Cookie path to clear.'),
});

/** Validated input accepted by the Playwright clearCookies Node. */
export type ClearCookiesNodeInput = z.infer<typeof clearCookiesInputSchema>;

export const createClearCookiesNode = <TContext>(
  options: CreatePlaywrightNodesOptions<TContext>,
): NodeDefinition<any, any, TContext> =>
  defineNode<
    typeof clearCookiesInputSchema,
    { filters: CookieClearOptions },
    TContext
  >({
    name: 'clearCookies',
    title: 'Clear browser cookies',
    description:
      'Clear all cookies from the current Playwright BrowserContext, or only cookies matching name, domain, or path.',
    inputSchema: clearCookiesInputSchema,
    async execute(ctx) {
      throwIfAborted(ctx.signal, 'clearCookies');
      const page = await options.getPage(ctx);
      const filters: CookieClearOptions = {
        ...(ctx.input.name === undefined ? {} : { name: ctx.input.name }),
        ...(ctx.input.domain === undefined ? {} : { domain: ctx.input.domain }),
        ...(ctx.input.path === undefined ? {} : { path: ctx.input.path }),
      };
      await page.context().clearCookies(filters);
      const filterNames = Object.keys(filters);
      return {
        summary:
          filterNames.length === 0
            ? 'Cleared all browser cookies'
            : `Cleared browser cookies matching ${filterNames.join(', ')}`,
        data: { filters },
      };
    },
  });
