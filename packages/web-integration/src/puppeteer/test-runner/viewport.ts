import type { AgentTestRunnerNodeDefinition } from '@midscene/core/agent';
import { z } from 'zod/v4';
import { requirePuppeteerAgent, throwIfAborted } from './utils';

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

export const setViewportSizeNode: AgentTestRunnerNodeDefinition<
  z.output<typeof setViewportSizeInputSchema>,
  { width: number; height: number }
> = {
  name: 'setViewportSize',
  title: 'Set the browser viewport size',
  description:
    'Set the current Puppeteer Page viewport size in CSS pixels and return the effective size.',
  stringInputKey: false,
  inputSchema: setViewportSizeInputSchema,
  async execute(agent, input, executionContext) {
    const ctx = {
      ...executionContext,
      input,
      context: requirePuppeteerAgent(agent),
    };
    throwIfAborted(ctx.signal, 'setViewportSize');
    const page = ctx.context.interface.underlyingPage;
    await page.setViewport({ width: input.width, height: input.height });
    const viewport = page.viewport();
    if (!viewport) {
      throw new Error('Puppeteer did not report an effective viewport size.');
    }
    const result = { width: viewport.width, height: viewport.height };
    return {
      summary: `Set viewport to ${result.width}x${result.height}`,
      data: result,
    };
  },
};
