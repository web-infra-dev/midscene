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
} from '@midscene/core/agent/test';
import { getDebug } from '@midscene/shared/logger';
import { z } from 'zod/v4';
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError, NodeExecutionError } from '../errors';
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
    execution: NodeExecutionContext<unknown, TContext>,
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
    execution: NodeExecutionContext<unknown, TContext>,
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
    execution: NodeExecutionContext<unknown, TContext>,
  ) => Awaitable<unknown>,
): readonly NodeDefinition<any, any, TContext>[] => {
  const activeAgentCalls = new WeakMap<
    MidsceneUIAgent,
    { scopeId: string; node: string }
  >();
  const runAgentCall = async <T>(
    node: string,
    execution: NodeExecutionContext<unknown, TContext>,
    agent: MidsceneUIAgent,
    call: () => Promise<T>,
    captureExecutions = true,
  ): Promise<T> => {
    const scopeId =
      execution.scope === 'case'
        ? execution.case.runId
        : execution.document.documentRunId;
    const activeCall = activeAgentCalls.get(agent);
    if (activeCall) {
      throw new NodeExecutionError(
        node,
        new Error(
          `The same Agent instance cannot execute overlapping Midscene Test Steps. Active scope: ${activeCall.scopeId} (${activeCall.node}); requested scope: ${scopeId} (${node}).`,
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
        removeListener = agent.addDumpUpdateListener((_dump, executionRef) => {
          if (!executionRef) return;
          if (!executionRef.id) {
            sawExecutionWithoutId = true;
            return;
          }
          execution.report.addTrace({
            type: 'midscene-execution',
            executionId: executionRef.id,
          });
        });
        if (execution.signal.aborted) stopListening();
        else {
          execution.signal.addEventListener('abort', stopListeningOnAbort, {
            once: true,
          });
        }
      }
      return await call();
    } finally {
      execution.signal.removeEventListener('abort', stopListeningOnAbort);
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
      async execute(execution) {
        const agent = await getAgent(execution);
        const call = async () =>
          definition.execute(agent, execution.input, {
            signal: execution.signal,
          });
        if (typeof agent !== 'object' || agent === null) return call();
        return runAgentCall(
          definition.name,
          execution,
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
  const getExecutionId = (
    execution: NodeExecutionContext<unknown, TContext>,
  ) =>
    execution.scope === 'case'
      ? execution.case.runId
      : execution.document.documentRunId;
  const getAgent = async (
    execution: NodeExecutionContext<unknown, TContext>,
  ): Promise<MidsceneUIAgent> => {
    if (!options.agentProvider) return options.getAgent!(execution);
    const runId = getExecutionId(execution);
    if (
      options.agentProvider.releaseAgent &&
      !registeredAgentScopes.has(runId)
    ) {
      registeredAgentScopes.add(runId);
      execution.onTeardown(async () => {
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
    return options.agentProvider.getAgent(runId, execution);
  };

  const agentDefinitions = options.agentClass.getTestRunnerNodeDefinitions();

  return [
    ...createAgentTestRunnerNodes(agentDefinitions, getAgent),
    defineNode<typeof waitInputSchema, unknown, TContext>({
      name: 'wait',
      description: 'Wait for a fixed duration while honoring cancellation.',
      stringInputKey: false,
      inputSchema: waitInputSchema,
      async execute(execution) {
        const multiplier =
          execution.input.unit === 'min'
            ? 60_000
            : execution.input.unit === 's'
              ? 1_000
              : 1;
        const durationMs = execution.input.duration * multiplier;
        await waitFor(durationMs, execution.signal);
        return { summary: `Waited ${durationMs}ms` };
      },
    }),
  ];
}
