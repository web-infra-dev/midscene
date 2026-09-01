import { z } from 'zod/v4';
import { createLaunchNode } from '../device/lifecycle';
export type { LaunchNodeInput } from '../device/lifecycle';
export { launchInputSchema } from '../device/lifecycle';
import type { Awaitable, NodeHistoryEntry } from '../engine/types';
import { NodeDefinitionError, NodeExecutionError } from '../errors';
import { defineNode } from '../node/define-node';
import type {
  NodeDefinition,
  NodeExecutionContext,
  NodeResult,
} from '../node/types';

export interface MidsceneAiActOptions {
  cacheable?: boolean;
  fileChooserAccept?: string | string[];
  deepThink?: 'unset' | boolean;
  deepLocate?: boolean;
  /**
   * Additional facts, rules, constraints, or output requirements for this AI
   * call. It overrides Agent API and default contexts; `''` disables inherited
   * user context for this call.
   */
  context?: string;
  abortSignal?: AbortSignal;
}

type MidsceneAiActInternalOptions = MidsceneAiActOptions & {
  /** Workflow history rendered by Core as a separate read-only prompt block. */
  _internalAdditionalContext?: string;
};

export interface MidsceneAiAssertOptions {
  domIncluded?: boolean | 'visible-only';
  screenshotIncluded?: boolean;
  /**
   * Additional facts, decision rules, constraints, or output requirements for
   * this assertion. It overrides Agent API and default contexts; `''` disables
   * inherited user context for this call.
   */
  context?: string;
  abortSignal?: AbortSignal;
  keepRawResponse?: boolean;
}

type MidsceneAiAssertInternalOptions = MidsceneAiAssertOptions & {
  /** Workflow history rendered by Core as a separate read-only prompt block. */
  _internalAdditionalContext?: string;
};

export interface MidscenePromptImage {
  name: string;
  url: string;
}

export type MidsceneUserPrompt =
  | string
  | {
      prompt: string;
      images?: MidscenePromptImage[];
      convertHttpImage2Base64?: boolean;
    };

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
    prompt: MidsceneUserPrompt,
    options?: MidsceneAiActOptions,
  ): Promise<string | undefined>;
  aiAssert(
    prompt: MidsceneUserPrompt,
    message?: string,
    options?: MidsceneAiAssertOptions,
  ): Promise<unknown>;
  recordToReport(
    title?: string,
    options?: MidsceneRecordToReportOptions,
  ): Promise<unknown>;
  /** Available on device Agents that support launching an app, URL, or URI. */
  launch?(uri: string): Promise<void>;
}

export interface AgentProvider<TContext> {
  getAgent(
    runId: string,
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<MidsceneUIAgent>;
  // biome-ignore lint/suspicious/noConfusingVoidType: providers without a report intentionally return void.
  releaseAgent?(runId: string): Awaitable<AgentReleaseResult | void>;
  dispose?(): Awaitable<void>;
}

export interface AgentReleaseResult {
  /** Absolute path to the finalized report for this Agent scope. */
  reportPath?: string;
}

export interface AgentExecutorInput<TContext> {
  prompt: string;
  history: readonly NodeHistoryEntry[];
  context: TContext;
  signal: AbortSignal;
  execution:
    | { scope: 'case'; runId: string }
    | { scope: 'document'; runId: string };
}

export interface AgentExecutor<TContext> {
  // biome-ignore lint/suspicious/noConfusingVoidType: executors may perform side effects without returning a summary.
  execute(input: AgentExecutorInput<TContext>): Awaitable<NodeResult | void>;
}

const nonBlankPrompt = (description: string) =>
  z
    .string()
    .regex(/\S/, 'prompt must contain a non-whitespace character')
    .describe(description);

const promptImagesInputSchema = z
  .array(
    z.strictObject({
      name: nonBlankPrompt('The name used to identify this reference image.'),
      url: nonBlankPrompt(
        'The URL, data URL, or file path of this reference image.',
      ),
    }),
  )
  .min(1)
  .optional();

const promptImageConversionInputSchema = z
  .boolean()
  .optional()
  .describe('Whether HTTP reference images are converted to base64 first.');

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
    .describe(
      'Additional facts, rules, constraints, or output requirements for this AI call. It overrides Agent API and default contexts; an empty string disables inherited user context.',
    ),
});

export const aiActInputSchema = z.strictObject({
  prompt: nonBlankPrompt('The natural-language UI task to perform.'),
  images: promptImagesInputSchema,
  convertHttpImage2Base64: promptImageConversionInputSchema,
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
    .describe(
      'Additional facts, decision rules, constraints, or output requirements for this assertion. It overrides Agent API and default contexts; an empty string disables inherited user context.',
    ),
});

export const aiAssertInputSchema = z.strictObject({
  prompt: nonBlankPrompt('The natural-language condition that must be true.'),
  images: promptImagesInputSchema,
  convertHttpImage2Base64: promptImageConversionInputSchema,
  message: z.string().optional().describe('The assertion failure message.'),
  options: aiAssertOptionsInputSchema.optional(),
});

const reportScreenshotInputSchema = z.strictObject({
  base64: z.string().min(1).describe('A base64-encoded screenshot.'),
  description: z.string().optional().describe('What the screenshot shows.'),
});

export const recordToReportInputSchema = z
  .strictObject({
    prompt: z.string().optional().describe('String shorthand for the title.'),
    title: z.string().optional().describe('The report section title.'),
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

export const waitInputSchema = z.strictObject({
  duration: z.number().positive().describe('How long to wait.'),
  unit: z
    .enum(['ms', 's', 'min'])
    .default('ms')
    .describe('Duration unit: milliseconds, seconds, or minutes.'),
});

export const agentInputSchema = z.strictObject({
  prompt: nonBlankPrompt(
    'A self-contained task, including allowed tools and success conditions.',
  ),
});

export type AiActNodeInput = z.infer<typeof aiActInputSchema>;
export type AiAssertNodeInput = z.infer<typeof aiAssertInputSchema>;
export type RecordToReportNodeInput = z.infer<typeof recordToReportInputSchema>;
export type WaitNodeInput = z.infer<typeof waitInputSchema>;
export type AgentNodeInput = z.infer<typeof agentInputSchema>;

export interface CreateMidsceneNodesOptions<TContext> {
  getAgent?(
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<MidsceneUIAgent>;
  agentProvider?: AgentProvider<TContext>;
  /** Disable when a project registers its own platform-specific launch Node. */
  includeLaunch?: boolean;
  agentExecutor?: AgentExecutor<TContext>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireAgentMethod = <TMethod extends keyof MidsceneUIAgent>(
  agent: MidsceneUIAgent,
  method: TMethod,
  node: string,
): NonNullable<MidsceneUIAgent[TMethod]> => {
  if (!isRecord(agent) || typeof agent[method] !== 'function') {
    throw new NodeExecutionError(
      node,
      new TypeError(`getAgent() must return an Agent with ${method}().`),
    );
  }
  return agent[method] as NonNullable<MidsceneUIAgent[TMethod]>;
};

const maxHistoryContextCharacters = 64_000;
const maxHistoryValuePreviewCharacters = 8_000;
const maxHistoryEntryCharacters = 24_000;
const historyOmissionNoticeReserve = 256;

const compactHistoryContextValue = (value: unknown): unknown => {
  const serialized = JSON.stringify(value);
  if (
    serialized === undefined ||
    serialized.length <= maxHistoryValuePreviewCharacters
  ) {
    return value;
  }
  return {
    omittedFromContext: true,
    originalCharacters: serialized.length,
    preview:
      typeof value === 'string'
        ? value.slice(0, maxHistoryValuePreviewCharacters)
        : serialized.slice(0, maxHistoryValuePreviewCharacters),
  };
};

const serializeHistoryEntryForContext = (
  entry: NodeHistoryEntry,
  index: number,
): string => {
  const compacted = Object.fromEntries(
    Object.entries({ index, ...entry }).map(([key, value]) => [
      key,
      compactHistoryContextValue(value),
    ]),
  );
  const serialized = JSON.stringify(compacted);
  if (serialized.length <= maxHistoryEntryCharacters) return serialized;

  return JSON.stringify({
    index,
    scope: entry.scope,
    phase: entry.phase,
    stepIndex: entry.stepIndex,
    node: entry.node,
    status: entry.status,
    ...(entry.summary === undefined
      ? {}
      : { summary: compactHistoryContextValue(entry.summary) }),
    omittedFromContext: true,
    compactedCharacters: serialized.length,
  });
};

export const renderNodeHistory = (
  history: readonly NodeHistoryEntry[],
): string | undefined => {
  if (history.length === 0) return undefined;

  const heading = 'Previous workflow results (read-only):';
  const availableCharacters =
    maxHistoryContextCharacters - heading.length - historyOmissionNoticeReserve;
  const renderedEntries: string[] = [];
  let renderedCharacters = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const rendered = serializeHistoryEntryForContext(history[index], index + 1);
    const separatorCharacters = renderedEntries.length === 0 ? 0 : 1;
    if (
      renderedCharacters + separatorCharacters + rendered.length >
      availableCharacters
    ) {
      break;
    }
    renderedEntries.unshift(rendered);
    renderedCharacters += separatorCharacters + rendered.length;
  }

  const omittedEntries = history.length - renderedEntries.length;
  return [
    heading,
    ...(omittedEntries === 0
      ? []
      : [
          `${omittedEntries} earlier history entr${omittedEntries === 1 ? 'y was' : 'ies were'} omitted from Agent context to stay within the size limit. Complete results remain available in the Test Runner output.`,
        ]),
    ...renderedEntries,
  ].join('\n');
};

const toAgentPrompt = (input: {
  prompt: string;
  images?: MidscenePromptImage[];
  convertHttpImage2Base64?: boolean;
}): MidsceneUserPrompt => {
  if (
    input.images === undefined &&
    input.convertHttpImage2Base64 === undefined
  ) {
    return input.prompt;
  }
  return {
    prompt: input.prompt,
    ...(input.images === undefined ? {} : { images: input.images }),
    ...(input.convertHttpImage2Base64 === undefined
      ? {}
      : { convertHttpImage2Base64: input.convertHttpImage2Base64 }),
  };
};

const waitFor = async (durationMs: number, signal: AbortSignal) => {
  if (signal.aborted) {
    throw signal.reason ?? new Error('Wait aborted.');
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, durationMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(signal.reason ?? new Error('Wait aborted.'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
};

export function createMidsceneNodes<TContext>(
  options: CreateMidsceneNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError(
      'createMidsceneNodes() options must be an object.',
    );
  }
  if (
    typeof options.agentProvider?.getAgent !== 'function' &&
    typeof options.getAgent !== 'function'
  ) {
    throw new NodeDefinitionError(
      'createMidsceneNodes() requires getAgent or agentProvider.getAgent.',
    );
  }

  const registeredAgentScopes = new Set<string>();
  const getExecutionId = (ctx: NodeExecutionContext<unknown, TContext>) =>
    ctx.scope === 'case' ? ctx.case.runId : ctx.document.documentRunId;
  const getAgent = async (
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Promise<MidsceneUIAgent> => {
    if (!options.agentProvider) return options.getAgent!(ctx);
    const runId = getExecutionId(ctx);
    if (
      options.agentProvider.releaseAgent &&
      !registeredAgentScopes.has(runId)
    ) {
      registeredAgentScopes.add(runId);
      ctx.onTeardown(async () => {
        try {
          const released = await options.agentProvider!.releaseAgent!(runId);
          return released?.reportPath
            ? { reportPaths: [released.reportPath] }
            : undefined;
        } finally {
          registeredAgentScopes.delete(runId);
        }
      });
    }
    return options.agentProvider.getAgent(runId, ctx);
  };

  return [
    defineNode<typeof aiActInputSchema, unknown, TContext>({
      name: 'aiAct',
      description: 'Perform a natural-language task with a Midscene UI Agent.',
      inputSchema: aiActInputSchema,
      async execute(ctx) {
        const agent = await getAgent(ctx);
        const aiAct = requireAgentMethod(agent, 'aiAct', 'aiAct');
        const additionalContext = renderNodeHistory(ctx.history);
        const aiActOptions: MidsceneAiActInternalOptions = {
          ...ctx.input.options,
          abortSignal: ctx.signal,
          ...(additionalContext === undefined
            ? {}
            : { _internalAdditionalContext: additionalContext }),
        };
        const output = await aiAct.call(
          agent,
          toAgentPrompt(ctx.input),
          aiActOptions,
        );
        return output === undefined ? undefined : { summary: output };
      },
    }),
    defineNode<typeof aiAssertInputSchema, unknown, TContext>({
      name: 'aiAssert',
      description:
        'Assert a natural-language condition with a Midscene UI Agent.',
      inputSchema: aiAssertInputSchema,
      async execute(ctx) {
        const agent = await getAgent(ctx);
        const aiAssert = requireAgentMethod(agent, 'aiAssert', 'aiAssert');
        const additionalContext = renderNodeHistory(ctx.history);
        const aiAssertOptions: MidsceneAiAssertInternalOptions = {
          ...ctx.input.options,
          abortSignal: ctx.signal,
          ...(additionalContext === undefined
            ? {}
            : { _internalAdditionalContext: additionalContext }),
        };
        await aiAssert.call(
          agent,
          toAgentPrompt(ctx.input),
          ctx.input.message,
          aiAssertOptions,
        );
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
        const agent = await getAgent(ctx);
        const recordToReport = requireAgentMethod(
          agent,
          'recordToReport',
          'recordToReport',
        );
        await recordToReport.call(agent, title, reportOptions);
        return { summary: `Recorded to report: ${title ?? 'untitled'}` };
      },
    }),
    ...(options.includeLaunch === false ? [] : [createLaunchNode(getAgent)]),
    defineNode<typeof waitInputSchema, unknown, TContext>({
      name: 'wait',
      description: 'Wait for a fixed duration while honoring cancellation.',
      inputSchema: waitInputSchema,
      async execute(ctx) {
        const multiplier =
          ctx.input.unit === 'min'
            ? 60_000
            : ctx.input.unit === 's'
              ? 1_000
              : 1;
        const durationMs = ctx.input.duration * multiplier;
        await waitFor(durationMs, ctx.signal);
        return { summary: `Waited ${durationMs}ms` };
      },
    }),
    defineNode<typeof agentInputSchema, unknown, TContext>({
      name: 'agent',
      description:
        'Execute one self-contained natural-language task with an injected Agent executor.',
      inputSchema: agentInputSchema,
      async execute(ctx) {
        if (!options.agentExecutor) {
          throw new NodeExecutionError(
            'agent',
            new TypeError('createMidsceneNodes() requires an agentExecutor.'),
          );
        }
        const execution =
          ctx.scope === 'case'
            ? { scope: 'case' as const, runId: ctx.case.runId }
            : {
                scope: 'document' as const,
                runId: ctx.document.documentRunId,
              };
        const result = await options.agentExecutor.execute({
          prompt: ctx.input.prompt,
          history: ctx.history,
          context: ctx.context,
          signal: ctx.signal,
          execution,
        });
        return result ?? { summary: 'Agent task completed.' };
      },
    }),
  ];
}
