import { z } from 'zod/v4';
import type { TUserPrompt } from '../common';
import { inputStrategies } from '../device/input-strategy';
import { NodeExecutionError } from '../test-runner/errors';
import type { LocateOption, ScrollParam } from '../yaml';
import { buildDetailedLocateParam } from '../yaml/utils';
import type { Agent } from './agent';

export interface AgentTestRunnerNodeResult<TData = unknown> {
  summary?: string;
  data?: TData;
}

export interface AgentTestRunnerNodeExecutionContext {
  signal: AbortSignal;
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
  effort: z
    .enum(['fast', 'balance', 'deepThink'])
    .optional()
    .describe('Action planning effort: fast, balanced, or deeper reasoning.'),
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
    .describe(
      'Additional facts, rules, constraints, or output requirements for this AI call. Overrides inherited aiContexts; an empty string disables inherited user context.',
    ),
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
    .describe(
      'Additional facts, rules, constraints, or output requirements for this AI call. Overrides inherited aiContexts; an empty string disables inherited user context.',
    ),
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
    .describe(
      'Additional facts, rules, constraints, or output requirements for this AI call. Overrides inherited aiContexts; an empty string disables inherited user context.',
    ),
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

export const aiInputInputSchema = z.strictObject({
  prompt: userPromptInputSchema,
  value: z.union([z.string(), z.number()]),
  options: locateOptionsInputSchema
    .extend({
      mode: z.enum(['replace', 'clear', 'typeOnly', 'append']).optional(),
      autoDismissKeyboard: z.boolean().optional(),
      keyboardTypeDelay: z.number().nonnegative().optional(),
      inputStrategy: z.enum(inputStrategies).optional(),
    })
    .optional(),
});

export const aiKeyboardPressInputSchema = z.strictObject({
  prompt: userPromptInputSchema.optional(),
  keyName: nonBlankText('The key or key combination to press.'),
  options: locateOptionsInputSchema.optional(),
});

export const aiScrollInputSchema = z.strictObject({
  prompt: userPromptInputSchema.optional(),
  options: locateOptionsInputSchema
    .extend({
      direction: z.enum(['down', 'up', 'right', 'left']).optional(),
      scrollType: z
        .enum([
          'singleAction',
          'scrollToBottom',
          'scrollToTop',
          'scrollToRight',
          'scrollToLeft',
          'once',
          'untilBottom',
          'untilTop',
          'untilRight',
          'untilLeft',
        ])
        .optional(),
      distance: z.number().nullable().optional(),
    })
    .optional(),
});

export const aiPinchInputSchema = z.strictObject({
  prompt: userPromptInputSchema.optional(),
  direction: z.enum(['in', 'out']),
  options: locateOptionsInputSchema
    .extend({
      distance: z.number().optional(),
      duration: z.number().nonnegative().optional(),
    })
    .optional(),
});

export const aiLongPressInputSchema = z.strictObject({
  prompt: userPromptInputSchema,
  options: locateOptionsInputSchema
    .extend({ duration: z.number().nonnegative().optional() })
    .optional(),
});

export const aiDragAndDropInputSchema = z.strictObject({
  from: userPromptInputSchema,
  to: userPromptInputSchema,
  options: locateOptionsInputSchema.optional(),
});

export const aiQueryInputSchema = z.strictObject({
  prompt: z.union([
    nonBlankText('The extraction request.'),
    z.record(z.string(), z.string()),
  ]),
  options: insightOptionsInputSchema.optional(),
});

export const aiWaitForInputSchema = z.strictObject({
  prompt: userPromptInputSchema,
  options: insightOptionsInputSchema
    .extend({
      timeoutMs: z.number().positive().optional(),
      checkIntervalMs: z.number().positive().optional(),
    })
    .optional(),
});

export const javascriptInputSchema = z.strictObject({
  script: nonBlankText('JavaScript to evaluate through the current interface.'),
});

export const runGherkinScenarioInputSchema = z.strictObject({
  scenario: nonBlankText('The Gherkin scenario to execute.'),
  options: aiActOptionsInputSchema.optional(),
});

export const actionInputSchema = z.strictObject({
  name: nonBlankText('The ActionSpace action name, for example DragAndDrop.'),
  params: z.unknown().optional(),
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
export type AiInputNodeInput = z.infer<typeof aiInputInputSchema>;
export type AiKeyboardPressNodeInput = z.infer<
  typeof aiKeyboardPressInputSchema
>;
export type AiScrollNodeInput = z.infer<typeof aiScrollInputSchema>;
export type AiPinchNodeInput = z.infer<typeof aiPinchInputSchema>;
export type AiLongPressNodeInput = z.infer<typeof aiLongPressInputSchema>;
export type AiDragAndDropNodeInput = z.infer<typeof aiDragAndDropInputSchema>;
export type AiQueryNodeInput = z.infer<typeof aiQueryInputSchema>;
export type AiWaitForNodeInput = z.infer<typeof aiWaitForInputSchema>;
export type JavascriptNodeInput = z.infer<typeof javascriptInputSchema>;
export type RunGherkinScenarioNodeInput = z.infer<
  typeof runGherkinScenarioInputSchema
>;
export type ActionNodeInput = z.infer<typeof actionInputSchema>;
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

// Select the current overloads without expanding the minimum API required by
// existing getAgent() providers. Each Node checks its own method at execution.
type AgentActionNodeApi = Pick<
  Agent,
  | 'sleep'
  | 'aiHover'
  | 'aiDoubleClick'
  | 'aiRightClick'
  | 'aiLongPress'
  | 'aiClearInput'
  | 'aiPinch'
  | 'aiLocate'
  | 'aiQuery'
  | 'aiWaitFor'
  | 'evaluateJavaScript'
  | 'runGherkinScenario'
  | 'callActionInActionSpace'
> & {
  aiInput(
    prompt: TUserPrompt,
    options: NonNullable<Parameters<Agent['aiInput']>[2]> & {
      value: string | number;
    },
  ): Promise<void>;
  aiKeyboardPress(
    prompt: TUserPrompt | undefined,
    options: LocateOption & { keyName: string },
  ): Promise<void>;
  aiScroll(
    prompt: TUserPrompt | undefined,
    options: LocateOption & ScrollParam,
  ): Promise<void>;
};

const defineAgentActionNode =
  createAgentTestRunnerNodeDefinition<AgentActionNodeApi>('an Agent');

const promptText = (prompt: UserPromptNodeInput): string =>
  typeof prompt === 'string' ? prompt : prompt.prompt;

const valueResult = (
  value: unknown,
): AgentTestRunnerNodeResult | undefined => ({ data: value });

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
  toArgs(input) {
    return [input.prompt, input.options];
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
        keepRawResponse: true,
        ...input.options,
        abortSignal: context.signal,
      },
    ];
  },
  toResult(output, input) {
    const result = {
      summary: `Assertion ${output?.pass === false ? 'failed' : 'passed'}: ${promptText(input.prompt)}`,
      ...(output === undefined
        ? {}
        : {
            data: {
              pass: output.pass,
              ...(output.thought === undefined
                ? {}
                : { thought: output.thought }),
              ...(output.message === undefined
                ? {}
                : { message: output.message }),
            },
          }),
    };
    if (output?.pass === false)
      throw new NodeExecutionError(
        'aiAssert',
        new Error(
          input.message ||
            output.message ||
            output.thought ||
            `Assertion failed: ${promptText(input.prompt)}`,
        ),
        result,
      );
    return result;
  },
});

const locateActionNode = (
  method: 'aiHover' | 'aiDoubleClick' | 'aiRightClick' | 'aiClearInput',
) =>
  defineAgentActionNode({
    method,
    description: {
      aiHover: 'Locate and hover over an element with a Midscene UI Agent.',
      aiDoubleClick:
        'Locate and double-click an element with a Midscene UI Agent.',
      aiRightClick:
        'Locate and right-click an element with a Midscene UI Agent.',
      aiClearInput:
        'Locate an input element and clear its value with a Midscene UI Agent.',
    }[method],
    stringInputKey: 'prompt',
    inputSchema: aiTapInputSchema,
    toArgs: (input) => [input.prompt, input.options],
    toResult: (_output, input) => ({
      summary: `${method}: ${promptText(input.prompt)}`,
    }),
  });

const additionalAgentNodes: readonly AgentTestRunnerNodeDefinition[] = [
  locateActionNode('aiHover'),
  locateActionNode('aiDoubleClick'),
  locateActionNode('aiRightClick'),
  locateActionNode('aiClearInput'),
  defineAgentActionNode({
    method: 'aiInput',
    description:
      'Locate an input element and enter a value with a Midscene UI Agent.',
    inputSchema: aiInputInputSchema,
    toArgs: (input) => [input.prompt, { ...input.options, value: input.value }],
  }),
  defineAgentActionNode({
    method: 'aiKeyboardPress',
    description:
      'Press a key or key combination, optionally targeting a located element.',
    stringInputKey: 'keyName',
    inputSchema: aiKeyboardPressInputSchema,
    toArgs: (input) => [
      input.prompt,
      { ...input.options, keyName: input.keyName },
    ],
  }),
  defineAgentActionNode({
    method: 'aiScroll',
    description:
      'Scroll the page or a located region with a Midscene UI Agent.',
    stringInputKey: 'prompt',
    inputSchema: aiScrollInputSchema,
    toArgs: (input) => [input.prompt, { ...input.options }],
  }),
  defineAgentActionNode({
    method: 'aiPinch',
    description:
      'Perform a pinch-in or pinch-out gesture with a Midscene UI Agent.',
    inputSchema: aiPinchInputSchema,
    toArgs: (input) => [
      input.prompt,
      { ...input.options, direction: input.direction },
    ],
  }),
  defineAgentActionNode({
    method: 'aiLongPress',
    description: 'Locate and long-press an element with a Midscene UI Agent.',
    stringInputKey: 'prompt',
    inputSchema: aiLongPressInputSchema,
    toArgs: (input) => [input.prompt, input.options],
  }),
  defineAgentActionNode({
    method: 'callActionInActionSpace',
    name: 'aiDragAndDrop',
    description:
      'Locate source and destination elements, then drag the source to the destination.',
    inputSchema: aiDragAndDropInputSchema,
    toArgs: (input) => [
      'DragAndDrop',
      {
        from: buildDetailedLocateParam(input.from, input.options),
        to: buildDetailedLocateParam(input.to, input.options),
      },
    ],
  }),
  defineAgentActionNode({
    method: 'aiLocate',
    description:
      'Locate an element from a natural-language description and store the result.',
    stringInputKey: 'prompt',
    inputSchema: aiTapInputSchema,
    toArgs: (input, context) => [
      input.prompt,
      { ...input.options, abortSignal: context.signal },
    ],
    toResult: valueResult,
  }),
  defineAgentActionNode({
    method: 'aiQuery',
    description:
      'Extract structured data from the current interface and store the result.',
    stringInputKey: 'prompt',
    inputSchema: aiQueryInputSchema,
    toArgs: (input, context) => [
      input.prompt,
      { ...input.options, abortSignal: context.signal },
    ],
    toResult: valueResult,
  }),
  defineAgentActionNode({
    method: 'aiWaitFor',
    description: 'Wait until a natural-language condition is satisfied.',
    stringInputKey: 'prompt',
    inputSchema: aiWaitForInputSchema,
    toArgs: (input, context) => [
      input.prompt,
      { ...input.options, abortSignal: context.signal },
    ],
  }),
  defineAgentActionNode({
    method: 'evaluateJavaScript',
    name: 'javascript',
    description:
      'Evaluate JavaScript in the current interface and store the result.',
    stringInputKey: 'script',
    inputSchema: javascriptInputSchema,
    toArgs: (input) => [input.script],
    toResult: valueResult,
  }),
  defineAgentActionNode({
    method: 'runGherkinScenario',
    description:
      'Execute a Gherkin scenario with the current Midscene UI Agent.',
    stringInputKey: 'scenario',
    inputSchema: runGherkinScenarioInputSchema,
    toArgs: (input, context) => [
      input.scenario,
      { ...input.options, abortSignal: context.signal },
    ],
  }),
  defineAgentActionNode({
    method: 'callActionInActionSpace',
    name: 'action',
    description:
      'Call a platform or custom action. Its ActionSpace schema validates params when the action executes.',
    inputSchema: actionInputSchema,
    toArgs: (input) => [input.name, input.params],
    toResult: (value) => (value === undefined ? undefined : valueResult(value)),
  }),
];

const insightNode = (method: 'aiBoolean' | 'aiNumber' | 'aiString' | 'aiAsk') =>
  defineCommonAgentNode({
    method,
    description: `Run ${method} with a Midscene UI Agent and store its value.`,
    stringInputKey: 'prompt',
    inputSchema: insightInputSchema,
    toArgs: (input, context) => [
      input.prompt,
      { ...input.options, abortSignal: context.signal },
    ],
    toResult: (value) => ({
      summary: `${method} returned ${
        method === 'aiString' || method === 'aiAsk'
          ? JSON.stringify(value)
          : value
      }`,
      data: { value },
    }),
  });

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
    defineAgentActionNode({
      method: 'sleep',
      description:
        'Wait for a fixed number of milliseconds, recording standard UI snapshots and honoring cancellation.',
      inputSchema: z.strictObject({ ms: z.number().positive() }),
      toArgs(input, { signal }) {
        signal.throwIfAborted();
        return [input.ms, { abortSignal: signal }];
      },
    }),
    aiActNode,
    aiTapNode,
    aiAssertNode,
    insightNode('aiBoolean'),
    insightNode('aiNumber'),
    insightNode('aiString'),
    insightNode('aiAsk'),
    recordToReportNode,
    ...additionalAgentNodes,
  ];
