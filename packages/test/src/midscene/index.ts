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
import { getDebug } from '@midscene/shared/logger';
import { z } from 'zod/v4';
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError } from '../errors';
import { defineNode } from '../node/define-node';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

export type MidsceneUIAgent = CommonAgentTestRunnerApi & {
  addDumpUpdateListener?(
    listener: (dump: string, execution?: MidsceneExecutionRef) => void,
  ): () => void;
};

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

export interface MidsceneExecutionRef {
  id?: string;
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
): readonly NodeDefinition<any, any, TContext>[] => {
  const activeAgentCalls = new WeakMap<
    MidsceneUIAgent,
    { scopeId: string; node: string }
  >();
  const runAgentCall = async <T>(
    node: string,
    ctx: NodeExecutionContext<unknown, TContext>,
    agent: MidsceneUIAgent,
    call: () => Promise<T>,
    captureExecutions = true,
  ): Promise<T> => {
    const scopeId =
      ctx.scope === 'case' ? ctx.case.runId : ctx.document.documentRunId;
    const activeCall = activeAgentCalls.get(agent);
    if (activeCall) {
      throw new NodeExecutionError(
        node,
        new Error(
          `The same Agent instance cannot execute overlapping Test Runner Steps. Active scope: ${activeCall.scopeId} (${activeCall.node}); requested scope: ${scopeId} (${node}).`,
        ),
      );
    }

    activeAgentCalls.set(agent, { scopeId, node });
    let removeListener: (() => void) | undefined;
    let sawExecutionWithoutId = false;
    const stopListening = () => {
      const remove = removeListener;
      removeListener = undefined;
      remove?.();
    };
    const stopListeningOnAbort = () => stopListening();
    try {
      if (captureExecutions && agent.addDumpUpdateListener) {
        removeListener = agent.addDumpUpdateListener((_dump, execution) => {
          if (!execution) return;
          if (!execution.id) {
            sawExecutionWithoutId = true;
            return;
          }
          ctx.report.addTrace({
            type: 'midscene-execution',
            executionId: execution.id,
          });
        });
        if (ctx.signal.aborted) stopListening();
        else {
          ctx.signal.addEventListener('abort', stopListeningOnAbort, {
            once: true,
          });
        }
      }
      return await call();
    } finally {
      ctx.signal.removeEventListener('abort', stopListeningOnAbort);
      try {
        stopListening();
      } finally {
        activeAgentCalls.delete(agent);
      }
      if (sawExecutionWithoutId) {
        warnReportTrace(
          `Skipped a report trace without a stable execution id for ${node} in scope ${scopeId}.`,
        );
      }
    }
  };

  return definitions.map((definition) =>
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
        const call = async () =>
          definition.execute(agent, ctx.input, { signal: ctx.signal });
        if (typeof agent !== 'object' || agent === null) return call();
        return runAgentCall(
          definition.name,
          ctx,
          agent as MidsceneUIAgent,
          call,
        );
      },
    }),
  );
};

const warnReportTrace = getDebug('test-runner:report-trace', {
  console: true,
});

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
