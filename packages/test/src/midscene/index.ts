import { z } from 'zod/v4';
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError, NodeExecutionError } from '../errors';
import { defineNode } from '../node/define-node';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

export interface MidsceneAiActOptions {
  cacheable?: boolean;
  fileChooserAccept?: string | string[];
  deepThink?: 'unset' | boolean;
  deepLocate?: boolean;
  context?: string;
  abortSignal?: AbortSignal;
}

export interface MidsceneAiAssertOptions {
  domIncluded?: boolean | 'visible-only';
  screenshotIncluded?: boolean;
  context?: string;
  abortSignal?: AbortSignal;
  keepRawResponse?: boolean;
}

export interface MidsceneReportScreenshot {
  base64: string;
  description?: string;
}

export interface MidsceneRecordToReportOptions {
  content?: string;
  screenshotBase64?: string;
  screenshots?: MidsceneReportScreenshot[];
}

export interface MidsceneUIAgent {
  aiAct(
    prompt: string,
    options?: MidsceneAiActOptions,
  ): Promise<string | undefined>;
  aiAssert(
    prompt: string,
    message?: string,
    options?: MidsceneAiAssertOptions,
  ): Promise<unknown>;
  recordToReport(
    title?: string,
    options?: MidsceneRecordToReportOptions,
  ): Promise<unknown>;
}

const nonBlankPrompt = (description: string) =>
  z
    .string()
    .regex(/\S/, 'prompt must contain a non-whitespace character')
    .describe(description);

const aiActOptionsInputSchema = z.strictObject({
  cacheable: z
    .boolean()
    .optional()
    .describe('Whether this action may use the Midscene cache.'),
  fileChooserAccept: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Accepted file types for a file chooser.'),
  deepThink: z
    .union([z.literal('unset'), z.boolean()])
    .optional()
    .describe('Whether to enable deep thinking for this action.'),
  deepLocate: z
    .boolean()
    .optional()
    .describe('Whether to use deep element location.'),
  context: z
    .string()
    .optional()
    .describe('Additional context supplied to the UI Agent.'),
});

export const aiActInputSchema = z.strictObject({
  prompt: nonBlankPrompt('The natural-language UI task to perform.'),
  options: aiActOptionsInputSchema.optional(),
});

const aiAssertOptionsInputSchema = z.strictObject({
  domIncluded: z
    .union([z.boolean(), z.literal('visible-only')])
    .optional()
    .describe('How DOM information is included in the assertion.'),
  screenshotIncluded: z
    .boolean()
    .optional()
    .describe('Whether the assertion includes a screenshot.'),
  context: z
    .string()
    .optional()
    .describe('Additional context supplied to the UI Agent.'),
});

export const aiAssertInputSchema = z.strictObject({
  prompt: nonBlankPrompt('The natural-language condition that must be true.'),
  message: z.string().optional().describe('The assertion failure message.'),
  options: aiAssertOptionsInputSchema.optional(),
});

const reportScreenshotInputSchema = z.strictObject({
  base64: z.string().min(1).describe('A base64-encoded screenshot.'),
  description: z.string().optional().describe('What the screenshot shows.'),
});

export const recordToReportInputSchema = z
  .strictObject({
    prompt: z
      .string()
      .optional()
      .describe('String shorthand for the report title.'),
    title: z.string().optional().describe('The report section title.'),
    content: z.string().optional().describe('The report text content.'),
    screenshotBase64: z
      .string()
      .optional()
      .describe('One legacy base64-encoded screenshot.'),
    screenshots: z
      .array(reportScreenshotInputSchema)
      .min(1)
      .optional()
      .describe('Screenshots attached to the report section.'),
  })
  .describe(
    'prompt and title are mutually exclusive; screenshotBase64 and screenshots are mutually exclusive.',
  )
  .superRefine((input, ctx) => {
    if (input.prompt !== undefined && input.title !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'prompt and title are mutually exclusive',
      });
    }
    if (
      input.screenshotBase64 !== undefined &&
      input.screenshots !== undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'screenshotBase64 and screenshots are mutually exclusive',
      });
    }
  });

export type AiActNodeInput = z.infer<typeof aiActInputSchema>;
export type AiAssertNodeInput = z.infer<typeof aiAssertInputSchema>;
export type RecordToReportNodeInput = z.infer<typeof recordToReportInputSchema>;

export interface CreateMidsceneNodesOptions<TContext> {
  getAgent(
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<MidsceneUIAgent>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireAgentMethod = <TMethod extends keyof MidsceneUIAgent>(
  agent: MidsceneUIAgent,
  method: TMethod,
  node: string,
): MidsceneUIAgent[TMethod] => {
  if (!isRecord(agent) || typeof agent[method] !== 'function') {
    throw new NodeExecutionError(
      node,
      new TypeError(`getAgent() must return an Agent with ${method}().`),
    );
  }
  return agent[method];
};

export function createMidsceneNodes<TContext>(
  options: CreateMidsceneNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError(
      'createMidsceneNodes() options must be an object.',
    );
  }
  if (typeof options.getAgent !== 'function') {
    throw new NodeDefinitionError(
      'createMidsceneNodes() requires a getAgent function.',
    );
  }

  return [
    defineNode<typeof aiActInputSchema, unknown, TContext>({
      name: 'aiAct',
      description: 'Perform a natural-language task with a Midscene UI Agent.',
      inputSchema: aiActInputSchema,
      async execute(ctx) {
        const agent = await options.getAgent(ctx);
        const aiAct = requireAgentMethod(agent, 'aiAct', 'aiAct');
        const output = await aiAct.call(agent, ctx.input.prompt, {
          ...ctx.input.options,
          abortSignal: ctx.signal,
        });
        return output === undefined ? undefined : { summary: output };
      },
    }),
    defineNode<typeof aiAssertInputSchema, unknown, TContext>({
      name: 'aiAssert',
      description:
        'Assert a natural-language condition with a Midscene UI Agent.',
      inputSchema: aiAssertInputSchema,
      async execute(ctx) {
        const agent = await options.getAgent(ctx);
        const aiAssert = requireAgentMethod(agent, 'aiAssert', 'aiAssert');
        await aiAssert.call(agent, ctx.input.prompt, ctx.input.message, {
          ...ctx.input.options,
          abortSignal: ctx.signal,
        });
        return { summary: `Assertion passed: ${ctx.input.prompt}` };
      },
    }),
    defineNode<typeof recordToReportInputSchema, unknown, TContext>({
      name: 'recordToReport',
      description: 'Add text or screenshots to the current Midscene report.',
      inputSchema: recordToReportInputSchema,
      async execute(ctx) {
        const title = ctx.input.title ?? ctx.input.prompt;
        const reportOptions: MidsceneRecordToReportOptions = {
          ...(ctx.input.content === undefined
            ? {}
            : { content: ctx.input.content }),
          ...(ctx.input.screenshotBase64 === undefined
            ? {}
            : { screenshotBase64: ctx.input.screenshotBase64 }),
          ...(ctx.input.screenshots === undefined
            ? {}
            : { screenshots: ctx.input.screenshots }),
        };
        const agent = await options.getAgent(ctx);
        const recordToReport = requireAgentMethod(
          agent,
          'recordToReport',
          'recordToReport',
        );
        await recordToReport.call(agent, title, reportOptions);
        return { summary: `Recorded to report: ${title ?? 'untitled'}` };
      },
    }),
  ];
}
