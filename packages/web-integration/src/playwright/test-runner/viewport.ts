import type { AgentTestRunnerNodeDefinition } from '@midscene/core/agent';
import { z } from 'zod/v4';
import { requirePlaywrightAgent, throwIfAborted } from './utils';

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

export const setViewportSizeNode: AgentTestRunnerNodeDefinition<
  z.output<typeof setViewportSizeInputSchema>,
  { width: number; height: number }
> = {
  name: 'setViewportSize',
  title: 'Set the browser viewport size',
  description:
    'Set the current Playwright Page viewport size in CSS pixels and return the effective size.',
  stringInputKey: false,
  inputSchema: setViewportSizeInputSchema,
  async execute(agent, input, executionContext) {
    const ctx = {
      ...executionContext,
      input,
      context: requirePlaywrightAgent(agent),
    };
    throwIfAborted(ctx.signal, 'setViewportSize');
    const page = ctx.context.interface.underlyingPage;
    await page.setViewportSize({
      width: ctx.input.width,
      height: ctx.input.height,
    });
    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error('Playwright did not report an effective viewport size.');
    }
    return {
      summary: `Set viewport to ${viewport.width}x${viewport.height}`,
      data: viewport,
    };
  },
};
