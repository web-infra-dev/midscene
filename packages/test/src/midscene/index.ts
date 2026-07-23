import { z } from 'zod/v4';
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

export interface ApplicationLaunchInput {
  appName: string;
  uri?: string;
  packageName?: string;
  bundleId?: string;
  downloadUrl?: string;
  reinstall: boolean;
  forceStop: boolean;
}

export interface ApplicationLauncher<TContext> {
  launch(
    input: ApplicationLaunchInput,
    ctx: NodeExecutionContext<ApplicationLaunchInput, TContext>,
    // biome-ignore lint/suspicious/noConfusingVoidType: launchers may perform side effects without returning a summary.
  ): Awaitable<NodeResult | void>;
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

export const launchInputSchema = z.strictObject({
  appName: z.string().min(1).describe('Application display name or identity.'),
  uri: z.string().min(1).optional().describe('URI or deep link to launch.'),
  packageName: z.string().min(1).optional().describe('Android package name.'),
  bundleId: z.string().min(1).optional().describe('iOS bundle identifier.'),
  downloadUrl: z
    .string()
    .url()
    .optional()
    .describe('Application package download URL.'),
  reinstall: z
    .boolean()
    .default(false)
    .describe('Whether to reinstall the application before launch.'),
  forceStop: z
    .boolean()
    .default(true)
    .describe('Whether to stop an existing process before launch.'),
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
export type LaunchNodeInput = z.infer<typeof launchInputSchema>;
export type WaitNodeInput = z.infer<typeof waitInputSchema>;
export type AgentNodeInput = z.infer<typeof agentInputSchema>;

export interface CreateMidsceneNodesOptions<TContext> {
  getAgent?(
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<MidsceneUIAgent>;
  agentProvider?: AgentProvider<TContext>;
  launcher?: ApplicationLauncher<TContext>;
  agentExecutor?: AgentExecutor<TContext>;
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

export const renderNodeHistory = (
  history: readonly NodeHistoryEntry[],
): string | undefined => {
  if (history.length === 0) return undefined;
  return [
    'Previous workflow results (read-only):',
    ...history.map((entry, index) =>
      JSON.stringify({ index: index + 1, ...entry }),
    ),
  ].join('\n');
};

const mergeContext = (
  explicit: string | undefined,
  history: readonly NodeHistoryEntry[],
): string | undefined =>
  [explicit, renderNodeHistory(history)].filter(Boolean).join('\n\n') ||
  undefined;

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
        const output = await aiAct.call(agent, ctx.input.prompt, {
          ...ctx.input.options,
          context: mergeContext(ctx.input.options?.context, ctx.history),
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
        const agent = await getAgent(ctx);
        const aiAssert = requireAgentMethod(agent, 'aiAssert', 'aiAssert');
        await aiAssert.call(agent, ctx.input.prompt, ctx.input.message, {
          ...ctx.input.options,
          context: mergeContext(ctx.input.options?.context, ctx.history),
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
    defineNode<typeof launchInputSchema, unknown, TContext>({
      name: 'launch',
      description:
        'Ensure an application is installed as requested, stop an existing process, and launch it.',
      inputSchema: launchInputSchema,
      async execute(ctx) {
        if (!options.launcher) {
          throw new NodeExecutionError(
            'launch',
            new TypeError('createMidsceneNodes() requires a launcher.'),
          );
        }
        const result = await options.launcher.launch(ctx.input, ctx);
        return result ?? { summary: `Launched ${ctx.input.appName}` };
      },
    }),
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
