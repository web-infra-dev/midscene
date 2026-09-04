import { z } from 'zod/v4';
import { defineNode } from '../node/define-node';
import type { NodeDefinition } from '../node/types';
import type { CreatePlaywrightNodesOptions } from './types';
import { throwIfAborted } from './utils';

/** Input schema for the Playwright setViewportSize Node. */
export const setViewportSizeInputSchema = z.strictObject({
  width: z.number().int().positive().describe('Viewport width in CSS pixels.'),
  height: z
    .number()
    .int()
    .positive()
    .describe('Viewport height in CSS pixels.'),
});

/** Validated input accepted by the Playwright setViewportSize Node. */
export type SetViewportSizeNodeInput = z.infer<
  typeof setViewportSizeInputSchema
>;

export const createSetViewportSizeNode = <TContext>(
  options: CreatePlaywrightNodesOptions<TContext>,
): NodeDefinition<any, any, TContext> =>
  defineNode<
    typeof setViewportSizeInputSchema,
    { width: number; height: number },
    TContext
  >({
    name: 'setViewportSize',
    title: 'Set the browser viewport size',
    description:
      'Set the current Playwright Page viewport size in CSS pixels and return the effective size.',
    stringInputKey: false,
    inputSchema: setViewportSizeInputSchema,
    async execute(ctx) {
      throwIfAborted(ctx.signal, 'setViewportSize');
      const page = await options.getPage(ctx);
      await page.setViewportSize({
        width: ctx.input.width,
        height: ctx.input.height,
      });
      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error(
          'Playwright did not report an effective viewport size.',
        );
      }
      return {
        summary: `Set viewport to ${viewport.width}x${viewport.height}`,
        data: viewport,
      };
    },
  });
