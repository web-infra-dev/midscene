import { randomUUID } from 'node:crypto';
import { NodeScopeTeardownError, WorkflowLifecycleError } from '../errors';
import type { CollectedCase, NormalizedStep } from '../parser/types';
import { executeStep } from './execute-step';
import { createHistory } from './history';
import { reportPathsFromTeardown } from './scope-teardown';
import type {
  CaseNodePhase,
  CaseRunResult,
  NodeCaseContext,
  NodeScopeTeardown,
  RunCollectedCaseOptions,
  StepRunResult,
} from './types';

export async function runCollectedCase<TContext = undefined>(
  collectedCase: CollectedCase,
  options: RunCollectedCaseOptions<TContext>,
): Promise<CaseRunResult> {
  const phases: Record<CaseNodePhase, readonly NormalizedStep[]> = {
    beforeEach: options.beforeEach ?? [],
    steps: collectedCase.definition.steps,
    afterEach: options.afterEach ?? [],
  };
  const nodes = {
    beforeEach: phases.beforeEach.map((step) => options.resolveNode(step.node)),
    steps: phases.steps.map((step) => options.resolveNode(step.node)),
    afterEach: phases.afterEach.map((step) => options.resolveNode(step.node)),
  };
  const runId = options.createRunId?.() ?? randomUUID();
  const startedAt = new Date();
  const beforeEach: StepRunResult[] = [];
  const steps: StepRunResult[] = [];
  const afterEach: StepRunResult[] = [];
  const completedNodes: StepRunResult[] = [];
  const teardownStack: Array<{
    registrationIndex: number;
    node: string;
    teardown: NodeScopeTeardown;
  }> = [];
  let acceptingTeardowns = true;

  const onTeardown = (node: string, teardown: NodeScopeTeardown): void => {
    if (!acceptingTeardowns) {
      throw new WorkflowLifecycleError(
        'Node teardown can only be registered while a case attempt is running.',
        { runId, node },
      );
    }
    if (typeof teardown !== 'function') {
      throw new WorkflowLifecycleError(
        'Node onTeardown() requires a teardown function.',
        { runId, node },
      );
    }
    teardownStack.push({
      registrationIndex: teardownStack.length,
      node,
      teardown,
    });
  };

  const runPhase = async (
    phase: CaseNodePhase,
    results: StepRunResult[],
    signal = options.signal,
  ): Promise<void> => {
    for (const [stepIndex, step] of phases[phase].entries()) {
      const caseContext: NodeCaseContext = {
        caseId: collectedCase.caseId,
        runId,
        projectName: options.projectName ?? collectedCase.projectId,
        attemptIndex: options.attemptIndex ?? 0,
        name: collectedCase.definition.name,
        sourcePath: collectedCase.sourcePath,
        caseIndex: collectedCase.caseIndex,
        phase,
        stepIndex,
        completedSteps: Object.freeze([...steps]),
        completedNodes: Object.freeze([...completedNodes]),
      };
      const stepInfo = {
        scope: 'case' as const,
        node: step.node,
        stepCount: phases[phase].length,
        case: caseContext,
      };
      await options.onStepStart?.(stepInfo);
      const result = await executeStep(
        step,
        nodes[phase][stepIndex],
        { scope: 'case', case: caseContext },
        options.context as TContext,
        {
          history: createHistory(
            options.documentHistory ?? [],
            completedNodes,
            'case',
          ),
          signal,
          defaultTimeoutMs: options.defaultTimeoutMs,
          onTeardown,
        },
      );
      await options.onStepResult?.(stepInfo, result);
      results.push(result);
      completedNodes.push(result);
      if (result.status === 'failed' && !result.continuedAfterError) break;
    }
  };

  let executionError: unknown;
  try {
    await runPhase('beforeEach', beforeEach);
    if (!beforeEach.some((step) => step.status === 'failed')) {
      await runPhase('steps', steps);
    }
  } catch (error) {
    executionError = error;
  }
  try {
    const cleanupSignal = options.signal?.aborted
      ? new AbortController().signal
      : options.signal;
    await runPhase('afterEach', afterEach, cleanupSignal);
  } catch (error) {
    executionError ??= error;
  }

  acceptingTeardowns = false;
  const teardownErrors: NodeScopeTeardownError[] = [];
  const reportPaths = new Set<string>();
  for (const { registrationIndex, node, teardown } of teardownStack.reverse()) {
    try {
      for (const path of reportPathsFromTeardown(await teardown())) {
        reportPaths.add(path);
      }
    } catch (error) {
      teardownErrors.push(
        new NodeScopeTeardownError(error, {
          scope: 'case',
          scopeId: runId,
          node,
          registrationIndex,
        }),
      );
    }
  }
  if (executionError) throw executionError;

  const endedAt = new Date();
  const result: CaseRunResult = {
    caseId: collectedCase.caseId,
    runId,
    projectName: options.projectName ?? collectedCase.projectId,
    attemptIndex: options.attemptIndex ?? 0,
    name: collectedCase.definition.name,
    sourcePath: collectedCase.sourcePath,
    caseIndex: collectedCase.caseIndex,
    status:
      completedNodes.some((step) => step.status === 'failed') ||
      teardownErrors.length > 0
        ? 'failed'
        : 'success',
    beforeEach,
    steps,
    afterEach,
    ...(teardownErrors.length > 0 ? { teardownErrors } : {}),
    ...(reportPaths.size > 0 ? { reportPaths: [...reportPaths] } : {}),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
  };

  await options.onResult?.(result);
  return result;
}
