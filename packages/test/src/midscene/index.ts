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
import {
  type WorkflowReportSource,
  assertResourceAvailable,
  trackResourceOperation,
} from '@midscene/core/internal/test-runner';
import {
  enterYamlAction,
  enterYamlExecution,
  runInYamlExecutionContext,
} from '@midscene/core/internal/yaml-runtime';
import { getDebug } from '@midscene/shared/logger';
import { z } from 'zod/v4';
import type { Awaitable } from '../engine/types';
import { NodeDefinitionError } from '../errors';
import { defineNode } from '../node/define-node';
import type { NodeDefinition, NodeExecutionContext } from '../node/types';

export type MidsceneUIAgent = CommonAgentTestRunnerApi & {
  _prepareForTestRunner?(): void;
  _createReportSource?(
    scopeId: string,
  ): Promise<WorkflowReportSource | undefined>;
  flushReport?(): Promise<string | undefined>;
  addDumpUpdateListener?(
    listener: (dump: string, execution?: MidsceneExecutionRef) => void,
  ): () => void;
};

export {
  actionInputSchema,
  aiDragAndDropInputSchema,
  aiInputInputSchema,
  aiKeyboardPressInputSchema,
  aiLongPressInputSchema,
  aiPinchInputSchema,
  aiQueryInputSchema,
  aiScrollInputSchema,
  aiWaitForInputSchema,
  javascriptInputSchema,
  runGherkinScenarioInputSchema,
  setAIContextInputSchema,
} from '@midscene/core/agent/test';
export type {
  ActionNodeInput,
  AiDragAndDropNodeInput,
  AiInputNodeInput,
  AiKeyboardPressNodeInput,
  AiLongPressNodeInput,
  AiPinchNodeInput,
  AiQueryNodeInput,
  AiScrollNodeInput,
  AiWaitForNodeInput,
  JavascriptNodeInput,
  RunGherkinScenarioNodeInput,
  SetAIContextNodeInput,
} from '@midscene/core/agent/test';

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
    ctx: NodeExecutionContext<unknown, TContext>,
  ) => Awaitable<unknown>,
): readonly NodeDefinition<any, any, TContext>[] => {
  const runAgentCall = async <T>(
    node: string,
    ctx: NodeExecutionContext<unknown, TContext>,
    agent: MidsceneUIAgent,
    call: () => Promise<T>,
    captureExecutions = true,
  ): Promise<T> =>
    runInYamlExecutionContext(async () => {
      const scopeId =
        ctx.scope === 'case' ? ctx.case.runId : ctx.document.documentRunId;
      const isCleanupOwner = assertResourceAvailable(agent, true, ctx.signal);
      // Native Steps own the root report. Any Agent.runYaml invoked underneath
      // contributes to that Step instead of publishing another root snapshot.
      const yamlBoundary = enterYamlExecution(agent, {
        allowIndependentOverlap: isCleanupOwner,
      });
      const leaveYamlAction = enterYamlAction(agent, ctx.signal);
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
        return await trackResourceOperation(
          agent,
          Promise.resolve().then(call),
          ctx.signal,
        );
      } finally {
        leaveYamlAction();
        yamlBoundary.finish();
        ctx.signal.removeEventListener('abort', stopListeningOnAbort);
        stopListening();
        if (sawExecutionWithoutId) {
          warnReportTrace(
            `Skipped a report trace without a stable execution id for ${node} in scope ${scopeId}.`,
          );
        }
      }
    });

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
        ctx.signal.throwIfAborted();
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

  const agentsByScope = new Map<string, Set<MidsceneUIAgent>>();
  const getAgent = async (
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Promise<MidsceneUIAgent> => {
    const runId =
      ctx.scope === 'case' ? ctx.case.runId : ctx.document.documentRunId;
    let agents = agentsByScope.get(runId);
    if (!agents) {
      agents = new Set();
      agentsByScope.set(runId, agents);
      const ownedScope = agents;
      ctx.onTeardown(async () => {
        const errors: unknown[] = [];
        const reportPaths: string[] = [];
        const reportSources: WorkflowReportSource[] = [];
        try {
          for (const agent of ownedScope) {
            try {
              const path = await agent.flushReport?.();
              if (path) reportPaths.push(path);
              const source = await agent._createReportSource?.(runId);
              if (source) reportSources.push(source);
            } catch (error) {
              errors.push(error);
            }
          }
          // Publication failure never prevents the owner from disposing its Agent.
          try {
            const released = await options.agentProvider?.releaseAgent?.(runId);
            if (
              released?.reportPath &&
              !reportPaths.includes(released.reportPath)
            )
              reportPaths.push(released.reportPath);
          } catch (error) {
            errors.push(error);
          }
          if (errors.length === 1) throw errors[0];
          if (errors.length)
            throw new AggregateError(
              errors,
              'Agent report publication and release failed',
            );
          return {
            reportPaths,
            ...(reportSources.length ? { reportSources } : {}),
          };
        } finally {
          agentsByScope.delete(runId);
        }
      });
    }
    const scopeAgents = agents;
    // Acquisition can outlive cancellation. Teardown waits for actual settlement.
    return trackResourceOperation(
      {},
      Promise.resolve().then(async () => {
        const agent = options.agentProvider
          ? await options.agentProvider.getAgent(runId, ctx)
          : await options.getAgent!(ctx);
        agent._prepareForTestRunner?.();
        scopeAgents.add(agent);
        return agent;
      }),
      ctx.signal,
    );
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
