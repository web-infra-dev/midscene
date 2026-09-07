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
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError } from '../errors';
import { defineNode } from '../node/define-node';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

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

export const waitInputSchema = z.strictObject({
  duration: z.number().positive().describe('How long to wait.'),
  unit: z
    .enum(['ms', 's', 'min'])
    .default('ms')
    .describe('Duration unit: milliseconds, seconds, or minutes.'),
});

export type AiActNodeInput = z.infer<typeof aiActInputSchema>;
export type AiAssertNodeInput = z.infer<typeof aiAssertInputSchema>;
export type AiTapNodeInput = z.infer<typeof aiTapInputSchema>;
export type InsightNodeInput = z.infer<typeof insightInputSchema>;
export type RecordToReportNodeInput = z.infer<typeof recordToReportInputSchema>;
export type WaitNodeInput = z.infer<typeof waitInputSchema>;

export interface CreateMidsceneNodesOptions<TContext> {
  getAgent?(
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<MidsceneUIAgent>;
  agentProvider?: AgentProvider<TContext>;
  /** Agent class that declares the Agent-backed Nodes to register. */
  agentClass: AgentTestRunnerNodeProvider;
}

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

/** Adapt Agent-owned descriptions to executable Midscene Test Nodes. */
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
  ];
}
