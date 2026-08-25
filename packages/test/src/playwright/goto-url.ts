import { z } from 'zod/v4';
import { defineNode } from '../node/define-node';
import type { NodeDefinition } from '../node/types';
import type { CreatePlaywrightNodesOptions } from './types';
import { resolveWebUrl, throwIfAborted } from './utils';

const DEFAULT_NAVIGATION_TIMEOUT_MS = 60_000;
const DEFAULT_WAIT_UNTIL = 'domcontentloaded' as const;

/** Input schema for the Playwright gotoUrl Node. */
export const gotoUrlInputSchema = z
  .strictObject({
    prompt: z
      .string()
      .min(1)
      .optional()
      .describe('String shorthand for the URL to open.'),
    url: z
      .string()
      .min(1)
      .optional()
      .describe('An absolute HTTP(S) URL or a path relative to baseUrl.'),
    waitUntil: z
      .enum(['commit', 'domcontentloaded', 'load', 'networkidle'])
      .default(DEFAULT_WAIT_UNTIL)
      .describe('The Playwright navigation lifecycle event to wait for.'),
    timeoutMs: z
      .number()
      .positive()
      .default(DEFAULT_NAVIGATION_TIMEOUT_MS)
      .describe('The navigation timeout in milliseconds.'),
  })
  .superRefine((input, ctx) => {
    if ((input.prompt === undefined) === (input.url === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'exactly one of prompt and url is required',
      });
    }
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

export const createGotoUrlNode = <TContext>(
  options: CreatePlaywrightNodesOptions<TContext>,
): NodeDefinition<any, any, TContext> =>
  defineNode<typeof gotoUrlInputSchema, GotoUrlNodeResult, TContext>({
    name: 'gotoUrl',
    title: 'Open a Web URL',
    description:
      'Navigate the current Playwright Page to an absolute HTTP(S) URL or a path relative to the configured baseUrl.',
    inputSchema: gotoUrlInputSchema,
    async execute(ctx) {
      throwIfAborted(ctx.signal, 'gotoUrl');
      const page = await options.getPage(ctx);
      const baseUrl = await options.getBaseUrl?.(ctx);
      const target = ctx.input.url ?? ctx.input.prompt;
      if (target === undefined) {
        throw new TypeError('gotoUrl requires a URL.');
      }
      const url = resolveWebUrl(target, baseUrl, 'gotoUrl.url');
      const response = await page.goto(url, {
        waitUntil: ctx.input.waitUntil,
        timeout: ctx.input.timeoutMs,
      });
      const status = response?.status() ?? null;
      if (status !== null && status >= 400) {
        throw new Error(`Navigation failed with HTTP ${status}: ${page.url()}`);
      }
      const result = {
        url: page.url(),
        status,
        title: await page.title(),
      };
      return { summary: `Navigated to ${result.url}`, data: result };
    },
  });
