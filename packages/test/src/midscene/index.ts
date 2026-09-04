import {
  type AgentTestRunnerNodeDefinition,
  type AgentTestRunnerNodeProvider,
  type CommonAgentTestRunnerApi,
  aiActInputSchema,
  aiActOptionsInputSchema,
  aiAssertInputSchema,
  aiAssertOptionsInputSchema,
  aiTapInputSchema,
  insightInputSchema,
  insightOptionsInputSchema,
  locateOptionsInputSchema,
  promptImageInputSchema,
  recordToReportInputSchema,
  recordToReportOptionsInputSchema,
  reportScreenshotInputSchema,
  structuredUserPromptInputSchema,
  userPromptInputSchema,
} from '@midscene/core/agent/test-runner';
import { z } from 'zod/v4';
import type { Awaitable, NodeHistoryEntry } from '../engine/types';
import { NodeDefinitionError, NodeExecutionError } from '../errors';
import { defineNode } from '../node/define-node';
import type {
  NodeDefinition,
  NodeExecutionContext,
  NodeResult,
} from '../node/types';

export type MidsceneUIAgent = CommonAgentTestRunnerApi;

export {
  aiActInputSchema,
  aiActOptionsInputSchema,
  aiAssertInputSchema,
  aiAssertOptionsInputSchema,
  aiTapInputSchema,
  insightInputSchema,
  insightOptionsInputSchema,
  locateOptionsInputSchema,
  promptImageInputSchema,
  recordToReportInputSchema,
  recordToReportOptionsInputSchema,
  reportScreenshotInputSchema,
  structuredUserPromptInputSchema,
  userPromptInputSchema,
};

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
export type AiTapNodeInput = z.infer<typeof aiTapInputSchema>;
export type InsightNodeInput = z.infer<typeof insightInputSchema>;
export type RecordToReportNodeInput = z.infer<typeof recordToReportInputSchema>;
export type WaitNodeInput = z.infer<typeof waitInputSchema>;
export type AgentNodeInput = z.infer<typeof agentInputSchema>;

export interface CreateMidsceneNodesOptions<TContext> {
  getAgent?(
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<MidsceneUIAgent>;
  agentProvider?: AgentProvider<TContext>;
  /** Agent class that declares the Agent-backed Nodes to register. */
  agentClass: AgentTestRunnerNodeProvider;
  agentExecutor?: AgentExecutor<TContext>;
}

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

/** Adapt Agent-owned descriptions to executable Test Runner Nodes. */
export const createAgentTestRunnerNodes = <TContext>(
  definitions: readonly AgentTestRunnerNodeDefinition[],
  getAgent: (
    ctx: NodeExecutionContext<unknown, TContext>,
  ) => Awaitable<unknown>,
): readonly NodeDefinition<any, any, TContext>[] =>
  definitions.map((definition) =>
    defineNode({
      name: definition.name,
      ...(definition.title === undefined ? {} : { title: definition.title }),
      ...(definition.description === undefined
        ? {}
        : { description: definition.description }),
      ...(definition.stringInputKey === undefined
        ? {}
        : { stringInputKey: definition.stringInputKey }),
      inputSchema: definition.inputSchema,
      async execute(ctx) {
        const agent = await getAgent(ctx);
        return definition.execute(agent, ctx.input, {
          signal: ctx.signal,
          historyContext: renderNodeHistory(ctx.history),
        });
      },
    }),
  );

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
  if (
    !options.agentClass ||
    typeof options.agentClass.getTestRunnerNodeDefinitions !== 'function'
  ) {
    throw new NodeDefinitionError(
      'createMidsceneNodes() requires agentClass.getTestRunnerNodeDefinitions().',
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

  const agentDefinitions = options.agentClass.getTestRunnerNodeDefinitions();

  return [
    ...createAgentTestRunnerNodes(agentDefinitions, getAgent),
    defineNode<typeof waitInputSchema, unknown, TContext>({
      name: 'wait',
      description: 'Wait for a fixed duration while honoring cancellation.',
      stringInputKey: false,
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
      stringInputKey: 'prompt',
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
