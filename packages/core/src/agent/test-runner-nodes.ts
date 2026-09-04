import { z } from 'zod/v4';
import type { Agent } from './agent';

export interface AgentTestRunnerNodeResult<TData = unknown> {
  summary?: string;
  data?: TData;
}

export interface AgentTestRunnerNodeExecutionContext {
  signal: AbortSignal;
  /** A bounded, human-readable rendering of earlier Test Runner results. */
  historyContext?: string;
}

/** Agent-owned Node description consumed by Test Runner adapters. */
export interface AgentTestRunnerNodeDefinition<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TData = unknown,
> {
  name: string;
  title?: string;
  description?: string;
  /** Node input field populated by YAML string shorthand; omit to disable. */
  stringInputKey?: string | false;
  inputSchema: z.ZodObject;
  execute(
    agent: unknown,
    input: TInput,
    context: AgentTestRunnerNodeExecutionContext,
  ):
    | Promise<AgentTestRunnerNodeResult<TData> | undefined>
    | AgentTestRunnerNodeResult<TData>
    | undefined;
}

/** Static capability implemented by Agent classes that expose Runner Nodes. */
export interface AgentTestRunnerNodeProvider {
  getTestRunnerNodeDefinitions(): readonly AgentTestRunnerNodeDefinition[];
}

type AnyAgentMethod = (...args: any[]) => unknown;
type AgentMethodName<TAgent extends object> = {
  [TKey in keyof TAgent]-?: TAgent[TKey] extends AnyAgentMethod ? TKey : never;
}[keyof TAgent] &
  string;
type AgentMethod<
  TAgent extends object,
  TMethod extends AgentMethodName<TAgent>,
> = Extract<TAgent[TMethod], AnyAgentMethod>;

export interface DefineAgentTestRunnerNodeOptions<
  TAgent extends object,
  TMethod extends AgentMethodName<TAgent>,
  TSchema extends z.ZodObject,
  TData = unknown,
> {
  method: TMethod;
  name?: string;
  title?: string;
  description?: string;
  stringInputKey?: (keyof z.output<TSchema> & string) | false;
  inputSchema: TSchema;
  toArgs(
    input: z.output<TSchema>,
    context: AgentTestRunnerNodeExecutionContext,
  ): Parameters<AgentMethod<TAgent, TMethod>>;
  toResult?(
    result: Awaited<ReturnType<AgentMethod<TAgent, TMethod>>>,
    input: z.output<TSchema>,
  ): AgentTestRunnerNodeResult<TData> | undefined;
}

/** Create a Node factory whose adapters are checked against an Agent API. */
export const createAgentTestRunnerNodeDefinition =
  <TAgent extends object>(agentLabel = 'an Agent') =>
  <
    TMethod extends AgentMethodName<TAgent>,
    TSchema extends z.ZodObject,
    TData = unknown,
  >(
    definition: DefineAgentTestRunnerNodeOptions<
      TAgent,
      TMethod,
      TSchema,
      TData
    >,
  ): AgentTestRunnerNodeDefinition => ({
    name: definition.name ?? definition.method,
    ...(definition.title === undefined ? {} : { title: definition.title }),
    ...(definition.description === undefined
      ? {}
      : { description: definition.description }),
    ...(definition.stringInputKey === undefined
      ? {}
      : { stringInputKey: definition.stringInputKey }),
    inputSchema: definition.inputSchema,
    async execute(agent, input, context) {
      if (
        typeof agent !== 'object' ||
        agent === null ||
        typeof (agent as Record<string, unknown>)[definition.method] !==
          'function'
      ) {
        throw new TypeError(
          `getAgent() must return ${agentLabel} with ${definition.method}().`,
        );
      }

      const typedAgent = agent as TAgent;
      const method = typedAgent[definition.method] as AgentMethod<
        TAgent,
        TMethod
      >;
      const typedInput = input as z.output<TSchema>;
      const result = (await method.apply(
        typedAgent,
        definition.toArgs(typedInput, context),
      )) as Awaited<ReturnType<AgentMethod<TAgent, TMethod>>>;
      return definition.toResult?.(result, typedInput);
    },
  });

const nonBlankText = (description: string) =>
  z
    .string()
    .regex(/\S/, 'value must contain a non-whitespace character')
    .describe(description);

export const promptImageInputSchema = z.strictObject({
  name: nonBlankText('The name used to identify this reference image.'),
  url: nonBlankText('The URL, data URL, or file path of this reference image.'),
});

export const structuredUserPromptInputSchema = z.strictObject({
  prompt: nonBlankText('The natural-language prompt.'),
  images: z.array(promptImageInputSchema).min(1).optional(),
  convertHttpImage2Base64: z
    .boolean()
    .optional()
    .describe('Whether HTTP reference images are converted to base64 first.'),
});

export const userPromptInputSchema = z.union([
  nonBlankText('The natural-language prompt.'),
  structuredUserPromptInputSchema,
]);

export const aiActOptionsInputSchema = z.strictObject({
  cacheable: z
    .boolean()
    .optional()
    .describe('Whether this action may use the Midscene cache.'),
  fileChooserAccept: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Accepted file types for a file chooser.'),
  fileChooserAllowedDir: z
    .string()
    .optional()
    .describe('Directory allowed for prompt-driven file uploads.'),
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
  prompt: userPromptInputSchema,
  options: aiActOptionsInputSchema.optional(),
});

export const insightOptionsInputSchema = z.strictObject({
  domIncluded: z
    .union([z.boolean(), z.literal('visible-only')])
    .optional()
    .describe('How DOM information is included.'),
  screenshotIncluded: z
    .boolean()
    .optional()
    .describe('Whether the request includes a screenshot.'),
  context: z
    .string()
    .optional()
    .describe('Additional context supplied to the UI Agent.'),
});

export const aiAssertOptionsInputSchema = insightOptionsInputSchema.extend({
  keepRawResponse: z
    .boolean()
    .optional()
    .describe('Whether the Agent returns the structured assertion result.'),
});

export const aiAssertInputSchema = z.strictObject({
  prompt: userPromptInputSchema,
  message: z.string().optional().describe('The assertion failure message.'),
  options: aiAssertOptionsInputSchema.optional(),
});

export const locateOptionsInputSchema = z.strictObject({
  context: z
    .string()
    .optional()
    .describe('Additional context supplied to the UI Agent.'),
  deepLocate: z
    .boolean()
    .optional()
    .describe('Whether to use deep element location.'),
  deepThink: z
    .boolean()
    .optional()
    .describe('Deprecated alias for deepLocate.'),
  cacheable: z
    .boolean()
    .optional()
    .describe('Whether this location may use the Midscene cache.'),
  xpath: z.string().optional().describe('A web XPath location hint.'),
  fileChooserAccept: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('Files accepted when tapping opens a file chooser.'),
});

export const aiTapInputSchema = z.strictObject({
  prompt: userPromptInputSchema,
  options: locateOptionsInputSchema.optional(),
});

export const insightInputSchema = z.strictObject({
  prompt: userPromptInputSchema,
  options: insightOptionsInputSchema.optional(),
});

export const reportScreenshotInputSchema = z.strictObject({
  base64: z.string().min(1).describe('A base64-encoded screenshot.'),
  description: z.string().optional().describe('What the screenshot shows.'),
});

export const recordToReportOptionsInputSchema = z
  .strictObject({
    content: z.string().optional().describe('The report text content.'),
    screenshotBase64: z
      .string()
      .optional()
      .describe('One base64-encoded screenshot.'),
    screenshots: z
      .array(reportScreenshotInputSchema)
      .min(1)
      .optional()
      .describe('Screenshots attached to the report section.'),
  })
  .superRefine((input, context) => {
    if (
      input.screenshotBase64 !== undefined &&
      input.screenshots !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'screenshotBase64 and screenshots are mutually exclusive',
      });
    }
  });

export const recordToReportInputSchema = z.strictObject({
  title: z.string().optional().describe('The report section title.'),
  options: recordToReportOptionsInputSchema.optional(),
});

export type UserPromptNodeInput = z.infer<typeof userPromptInputSchema>;
export type AiActNodeOptions = z.infer<typeof aiActOptionsInputSchema>;
export type AiActNodeInput = z.infer<typeof aiActInputSchema>;
export type AiAssertNodeOptions = z.infer<typeof aiAssertOptionsInputSchema>;
export type AiAssertNodeInput = z.infer<typeof aiAssertInputSchema>;
export type AiTapNodeOptions = z.infer<typeof locateOptionsInputSchema>;
export type AiTapNodeInput = z.infer<typeof aiTapInputSchema>;
export type InsightNodeOptions = z.infer<typeof insightOptionsInputSchema>;
export type InsightNodeInput = z.infer<typeof insightInputSchema>;
export type RecordToReportNodeOptions = z.infer<
  typeof recordToReportOptionsInputSchema
>;
export type RecordToReportNodeInput = z.infer<typeof recordToReportInputSchema>;

export type CommonAgentTestRunnerApi = Pick<
  Agent,
  | 'aiAct'
  | 'aiTap'
  | 'aiAssert'
  | 'aiBoolean'
  | 'aiNumber'
  | 'aiString'
  | 'aiAsk'
  | 'recordToReport'
>;

const defineCommonAgentNode =
  createAgentTestRunnerNodeDefinition<CommonAgentTestRunnerApi>('an Agent');

const promptText = (prompt: UserPromptNodeInput): string =>
  typeof prompt === 'string' ? prompt : prompt.prompt;

const mergeContext = (
  explicit: string | undefined,
  historyContext: string | undefined,
) => [explicit, historyContext].filter(Boolean).join('\n\n') || undefined;

const withHistoryContext = <TOptions extends { context?: string }>(
  options: TOptions | undefined,
  historyContext: string | undefined,
): TOptions | undefined => {
  const context = mergeContext(options?.context, historyContext);
  if (options === undefined && context === undefined) return undefined;
  return {
    ...options,
    ...(context === undefined ? {} : { context }),
  } as TOptions;
};

const contextOption = (
  explicit: string | undefined,
  historyContext: string | undefined,
) => {
  const context = mergeContext(explicit, historyContext);
  return context === undefined ? {} : { context };
};

const aiActNode = defineCommonAgentNode({
  method: 'aiAct',
  description: 'Perform a natural-language task with a Midscene UI Agent.',
  stringInputKey: 'prompt',
  inputSchema: aiActInputSchema,
  toArgs(input, context) {
    return [
      input.prompt,
      {
        ...input.options,
        ...contextOption(input.options?.context, context.historyContext),
        abortSignal: context.signal,
      },
    ];
  },
  toResult(output) {
    return output === undefined ? undefined : { summary: output };
  },
});

const aiTapNode = defineCommonAgentNode({
  method: 'aiTap',
  description: 'Locate and tap an element with a Midscene UI Agent.',
  stringInputKey: 'prompt',
  inputSchema: aiTapInputSchema,
  toArgs(input, context) {
    return [
      input.prompt,
      withHistoryContext(input.options, context.historyContext),
    ];
  },
  toResult(_output, input) {
    return { summary: `Tapped: ${promptText(input.prompt)}` };
  },
});

const aiAssertNode = defineCommonAgentNode({
  method: 'aiAssert',
  description: 'Assert a natural-language condition with a Midscene UI Agent.',
  stringInputKey: 'prompt',
  inputSchema: aiAssertInputSchema,
  toArgs(input, context) {
    return [
      input.prompt,
      input.message,
      {
        ...input.options,
        ...contextOption(input.options?.context, context.historyContext),
        abortSignal: context.signal,
      },
    ];
  },
  toResult(output, input) {
    return {
      summary: `Assertion passed: ${promptText(input.prompt)}`,
      ...(output === undefined ? {} : { data: output }),
    };
  },
});

const insightNode = (
  method: 'aiBoolean' | 'aiNumber' | 'aiString' | 'aiAsk',
) => {
  if (method === 'aiBoolean') {
    return defineCommonAgentNode({
      method,
      description: `Run ${method} with a Midscene UI Agent and store its value.`,
      stringInputKey: 'prompt',
      inputSchema: insightInputSchema,
      toArgs: (input, context) => [
        input.prompt,
        withHistoryContext(input.options, context.historyContext),
      ],
      toResult: (value) => ({
        summary: `${method} returned ${value}`,
        data: { value },
      }),
    });
  }
  if (method === 'aiNumber') {
    return defineCommonAgentNode({
      method,
      description: `Run ${method} with a Midscene UI Agent and store its value.`,
      stringInputKey: 'prompt',
      inputSchema: insightInputSchema,
      toArgs: (input, context) => [
        input.prompt,
        withHistoryContext(input.options, context.historyContext),
      ],
      toResult: (value) => ({
        summary: `${method} returned ${value}`,
        data: { value },
      }),
    });
  }
  if (method === 'aiString') {
    return defineCommonAgentNode({
      method,
      description: `Run ${method} with a Midscene UI Agent and store its value.`,
      stringInputKey: 'prompt',
      inputSchema: insightInputSchema,
      toArgs: (input, context) => [
        input.prompt,
        withHistoryContext(input.options, context.historyContext),
      ],
      toResult: (value) => ({
        summary: `${method} returned ${JSON.stringify(value)}`,
        data: { value },
      }),
    });
  }
  return defineCommonAgentNode({
    method,
    description: `Run ${method} with a Midscene UI Agent and store its value.`,
    stringInputKey: 'prompt',
    inputSchema: insightInputSchema,
    toArgs: (input, context) => [
      input.prompt,
      withHistoryContext(input.options, context.historyContext),
    ],
    toResult: (value) => ({
      summary: `${method} returned ${JSON.stringify(value)}`,
      data: { value },
    }),
  });
};

const recordToReportNode = defineCommonAgentNode({
  method: 'recordToReport',
  description: 'Add text or screenshots to the current Midscene report.',
  stringInputKey: 'title',
  inputSchema: recordToReportInputSchema,
  toArgs(input) {
    return [input.title, input.options];
  },
  toResult(_output, input) {
    return { summary: `Recorded to report: ${input.title ?? 'untitled'}` };
  },
});

export const commonAgentTestRunnerNodeDefinitions: readonly AgentTestRunnerNodeDefinition[] =
  [
    aiActNode,
    aiTapNode,
    aiAssertNode,
    insightNode('aiBoolean'),
    insightNode('aiNumber'),
    insightNode('aiString'),
    insightNode('aiAsk'),
    recordToReportNode,
  ];
