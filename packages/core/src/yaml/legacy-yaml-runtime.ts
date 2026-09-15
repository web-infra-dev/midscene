import type { Agent } from '@/agent/agent';
import { deriveCaseStatus } from '@/dump/task-status';
import type {
  DeviceAction,
  MidsceneYamlScript,
  MidsceneYamlTask,
} from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import {
  type CaseRunOutcome,
  type CollectedWorkflowDocument,
  type NodeDefinition,
  type RunWorkflowDocumentOptions,
  type WorkflowDocumentExecutionResult,
  assertResourceAvailable,
  defineNode,
  runWorkflowDocument,
  trackResourceOperation,
  waitForResourceIdle,
} from '../test-runner';
import {
  enterYamlAction,
  runInYamlExecutionContext,
} from './execution-session';
import {
  collectLegacyYamlDocument,
  collectLegacyYamlTaskDocument,
} from './test-runner-compat';
import {
  getLegacyYamlResultData,
  legacyAgentTestRunnerNodeDefinitions,
} from './test-runner-nodes';
const debug = getDebug('yaml-player');

type SetLegacyYamlResult = (
  key: string | undefined,
  value: any,
) => void | Promise<void>;

export type LegacyYamlRuntimeRunOptions = Omit<
  RunWorkflowDocumentOptions<Agent>,
  'projectContext' | 'resolveCaseReportScopeId' | 'resolveNode' | 'retry'
> & { document?: CollectedWorkflowDocument };

export interface LegacyYamlRuntimeOptions {
  agent: Agent;
  actionSpace: readonly DeviceAction[];
  sourcePath?: string;
  setResult: SetLegacyYamlResult;
}

export interface LegacyYamlRuntime {
  /** Wait before releasing an Agent whose non-cooperative action was aborted. */
  waitForIdle(): Promise<void>;
  runScript(
    script: MidsceneYamlScript,
    options?: LegacyYamlRuntimeRunOptions,
  ): Promise<WorkflowDocumentExecutionResult>;
  runTask(
    task: MidsceneYamlTask,
    taskIndex: number,
    options?: LegacyYamlRuntimeRunOptions,
  ): Promise<WorkflowDocumentExecutionResult>;
}

const hasFailedReportExecutionSince = (
  agent: Agent,
  executionCountBefore: number,
): boolean =>
  deriveCaseStatus(
    (agent.dump?.executions ?? []).slice(executionCountBefore),
  ) === 'failed';

const recordYamlTaskError = async (
  agent: Agent,
  task: MidsceneYamlTask,
  flowItemIndex: number,
  error: Error,
): Promise<void> => {
  const recordErrorToReport = (agent as any).recordErrorToReport;
  if (typeof recordErrorToReport !== 'function') return;

  try {
    await recordErrorToReport.call(agent, `YAML task failed - ${task.name}`, {
      error,
      content: `Step ${flowItemIndex} failed while running YAML task "${task.name}".`,
    });
  } catch (reportError) {
    debug('failed to record yaml error to report', reportError);
  }
};

const createLegacyYamlNodeResolver = (
  options: LegacyYamlRuntimeOptions,
  resolveTask: (taskIndex: number) => MidsceneYamlTask | undefined,
  recordTaskErrors: boolean,
  captureReportTraces: boolean,
): ((
  name: string,
) => NodeDefinition<Record<string, unknown>, unknown, Agent>) => {
  const definitions = new Map(
    legacyAgentTestRunnerNodeDefinitions.map((definition) => [
      definition.name,
      definition,
    ]),
  );
  const nodes = new Map<
    string,
    NodeDefinition<Record<string, unknown>, unknown, Agent>
  >();

  return (name) => {
    const existing = nodes.get(name);
    if (existing) return existing;

    const definition = definitions.get(name);
    assert(definition, `Unknown Agent Node: ${name}`);
    const node = defineNode<Record<string, unknown>, unknown, Agent>({
      name,
      inputSchema: definition.inputSchema,
      execute: (ctx) =>
        runInYamlExecutionContext(async () => {
          ctx.signal.throwIfAborted();
          assertResourceAvailable(options.agent, false, ctx.signal);
          assert(ctx.scope === 'case', 'YAML task requires a Case scope');
          const taskIndex = ctx.case.caseIndex;
          const flowItemIndex = ctx.case.stepIndex;
          const task = resolveTask(taskIndex);
          assert(task, `missing YAML task at index ${taskIndex}`);
          assert(task.flow, 'missing flow in task');

          const executionCountBeforeStep =
            options.agent.dump?.executions?.length ?? 0;
          const addDumpUpdateListener = captureReportTraces
            ? (options.agent as any).addDumpUpdateListener
            : undefined;
          const removeDumpListener =
            typeof addDumpUpdateListener === 'function'
              ? addDumpUpdateListener.call(
                  options.agent,
                  (_dump: string, execution?: { id?: string }) => {
                    if (!ctx.signal.aborted && execution?.id) {
                      ctx.report.addTrace({
                        type: 'midscene-execution',
                        executionId: execution.id,
                      });
                    }
                  },
                )
              : undefined;

          let listening = true;
          const removeListener = () => {
            if (!listening) return;
            listening = false;
            removeDumpListener?.();
          };
          const operation = trackResourceOperation(
            options.agent,
            Promise.resolve().then(() => {
              ctx.signal.throwIfAborted();
              return definition.execute(options.agent, ctx.input, {
                signal: ctx.signal,
              });
            }),
            ctx.signal,
          );
          const leaveAction = enterYamlAction(options.agent, ctx.signal);
          const onAbort = () => {
            removeListener();
          };
          ctx.signal.addEventListener('abort', onAbort, { once: true });

          try {
            return await operation;
          } catch (error) {
            const reportAlreadyContainsFailure = hasFailedReportExecutionSince(
              options.agent,
              executionCountBeforeStep,
            );
            if (
              !ctx.signal.aborted &&
              recordTaskErrors &&
              !reportAlreadyContainsFailure
            ) {
              await recordYamlTaskError(
                options.agent,
                task,
                flowItemIndex,
                error as Error,
              );
            }
            throw error;
          } finally {
            ctx.signal.removeEventListener('abort', onAbort);
            removeListener();
            leaveAction();
          }
        }),
    });
    nodes.set(name, node);
    return node;
  };
};

const runLegacyYamlDocument = (
  document: CollectedWorkflowDocument,
  options: LegacyYamlRuntimeOptions,
  resolveTask: (taskIndex: number) => MidsceneYamlTask | undefined,
  recordTaskErrors: boolean,
  captureReportTraces: boolean,
  runOptions?: LegacyYamlRuntimeRunOptions,
): Promise<WorkflowDocumentExecutionResult> => {
  return runWorkflowDocument(document, {
    ...(runOptions ?? {}),
    onStepResult: async (info, result) => {
      if (
        result.meta.captureResult &&
        result.output &&
        Object.hasOwn(result.output, 'data')
      ) {
        // Publication follows the recorded action. The Node result is never mutated.
        await options.setResult(
          result.meta.resultName,
          getLegacyYamlResultData(result.node, result.output),
        );
      }
      await runOptions?.onStepResult?.(info, result);
    },
    resolveNode: createLegacyYamlNodeResolver(
      options,
      resolveTask,
      recordTaskErrors,
      captureReportTraces,
    ),
    projectContext: options.agent,
    // Legacy CLI retry recreates the whole player and Agent outside this
    // runtime, so the shared kernel must not retry a Case here.
    retry: 0,
    // One legacy YAML file owns one Agent report shared by all of its tasks.
    resolveCaseReportScopeId: (_collectedCase, _attemptIndex, documentRunId) =>
      documentRunId,
  });
};

export const createLegacyYamlRuntime = (
  options: LegacyYamlRuntimeOptions,
): LegacyYamlRuntime => {
  const sourcePath = options.sourcePath ?? '<inline-yaml>';
  return {
    waitForIdle: () => waitForResourceIdle(options.agent),
    runScript: (script, runOptions) =>
      runLegacyYamlDocument(
        runOptions?.document ??
          collectLegacyYamlDocument(script, sourcePath, options.actionSpace),
        options,
        (taskIndex) => script.tasks?.[taskIndex],
        true,
        true,
        runOptions,
      ),
    runTask: (task, taskIndex, runOptions) =>
      runLegacyYamlDocument(
        collectLegacyYamlTaskDocument(
          task,
          taskIndex,
          sourcePath,
          options.actionSpace,
        ),
        options,
        () => task,
        false,
        false,
        runOptions,
      ),
  };
};

export const legacyYamlOutcomeError = (outcome: CaseRunOutcome): Error => {
  const failedStep = [
    ...(outcome.run?.beforeEach ?? []),
    ...(outcome.run?.steps ?? []),
    ...(outcome.run?.afterEach ?? []),
  ].find((step) => step.status === 'failed');
  const error = failedStep?.error;
  return error?.code === 'NODE_EXECUTION_ERROR' && error.cause instanceof Error
    ? error.cause
    : (error ?? new Error(`Task "${outcome.name}" failed`));
};
