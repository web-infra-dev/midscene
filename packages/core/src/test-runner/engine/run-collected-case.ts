import { getDebug } from '@midscene/shared/logger';
import { uuid as randomUUID } from '@midscene/shared/utils';
import { NodeScopeTeardownError, WorkflowLifecycleError } from '../errors';
import type { CollectedCase, NormalizedStep } from '../parser/types';
import { executeStep } from './execute-step';
import {
  WorkflowExecutionFailure,
  asExecutionError,
} from './execution-failure';
import {
  ResourceCleanupDeferredError,
  cleanupScopeResources,
  createResourceScope,
  getPendingScopeOperations,
  getResourceCleanupSnapshot,
  recoverCancelledScopeResources,
  setResourceOperationIdentity,
} from './resource-operations';
import { phaseResult } from './result-metadata';
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
  const resourceScope = createResourceScope(options.signal);
  const scopeSignal = resourceScope.signal;
  const runId = options.createRunId?.() ?? randomUUID();
  const startedAt = new Date();
  setResourceOperationIdentity(scopeSignal, { scopeId: runId });
  const beforeEach: StepRunResult[] = [];
  const steps: StepRunResult[] = [];
  const afterEach: StepRunResult[] = [];
  const capturedSources = new Map<
    string,
    import('./types').WorkflowReportSource
  >();
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
    signal = scopeSignal,
  ): Promise<void> => {
    for (const [stepIndex, step] of phases[phase].entries()) {
      // A Step timeout ends the Runner's wait, not the underlying operation.
      // Recovery belongs between Steps, outside the next Step's timeout budget.
      if (stepIndex > 0) await recoverCancelledScopeResources(signal);
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
          signal,
          defaultTimeoutMs: options.defaultTimeoutMs,
          onTeardown,
        },
      );
      results.push(result);
      for (const source of result.report?.sources ?? [])
        capturedSources.set(
          `${source.sourcePath}\u0000${source.dumpPath ?? ''}`,
          source,
        );
      await options.onStepResult?.(stepInfo, result);
      if (result.status !== 'success' && !result.continuedAfterError) break;
    }
  };

  const executionErrors: unknown[] = [];
  try {
    await runPhase('beforeEach', beforeEach);
    if (!beforeEach.some((step) => step.status !== 'success')) {
      await runPhase('steps', steps);
    }
  } catch (error) {
    executionErrors.push(error);
  }
  const teardownErrors: NodeScopeTeardownError[] = [];
  const reportPaths = new Set<string>();
  const reportSources: import('./types').WorkflowReportSource[] = [];
  const cleanupExecutionErrors: unknown[] = [];
  let deferredCleanup = false;
  const cleanup = async () => {
    const priorTeardownErrors = teardownErrors.length;
    acceptingTeardowns = false;
    for (const {
      registrationIndex,
      node,
      teardown,
    } of teardownStack.reverse()) {
      try {
        const released = await teardown();
        reportSources.push(...(released?.reportSources ?? []));
        for (const path of reportPathsFromTeardown(released)) {
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
    {
      const errors = [
        ...cleanupExecutionErrors,
        ...teardownErrors.slice(priorTeardownErrors),
      ];
      if (errors.length)
        throw new AggregateError(errors, 'Case cleanup failed');
    }
  };
  try {
    if (phases.afterEach.length || teardownStack.length)
      await cleanupScopeResources(scopeSignal, cleanup, {
        beforeCleanup: async (cleanupSignal) => {
          try {
            await runPhase('afterEach', afterEach, cleanupSignal);
          } catch (error) {
            executionErrors.push(error);
            cleanupExecutionErrors.push(error);
          }
        },
        onDeferredError: (error) =>
          getDebug('runner:cleanup', { console: true })(
            `Deferred Case cleanup failed: ${String(error)}`,
          ),
      });
    else acceptingTeardowns = false;
  } catch (error) {
    deferredCleanup = error instanceof ResourceCleanupDeferredError;
    if (!deferredCleanup) acceptingTeardowns = false;
    if (
      !deferredCleanup &&
      !teardownErrors.length &&
      !cleanupExecutionErrors.length
    )
      teardownErrors.push(
        new NodeScopeTeardownError(error, {
          scope: 'case',
          scopeId: runId,
          node: 'resource-drain',
          registrationIndex: -1,
        }),
      );
  }
  const endedAt = new Date();
  const cleanupSnapshot = getResourceCleanupSnapshot(scopeSignal);
  const pendingOperations = getPendingScopeOperations(scopeSignal);
  const phaseResults = {
    beforeEach: phaseResult(phases.beforeEach.length, beforeEach),
    steps: phaseResult(phases.steps.length, steps),
    afterEach: phaseResult(phases.afterEach.length, afterEach),
  };
  const result: CaseRunResult = {
    caseId: collectedCase.caseId,
    runId,
    projectName: options.projectName ?? collectedCase.projectId,
    attemptIndex: options.attemptIndex ?? 0,
    name: collectedCase.definition.name,
    sourcePath: collectedCase.sourcePath,
    caseIndex: collectedCase.caseIndex,
    status:
      executionErrors.length > 0 ||
      beforeEach.some((step) => step.status !== 'success') ||
      steps.some((step) => step.status !== 'success') ||
      afterEach.some((step) => step.status !== 'success') ||
      cleanupSnapshot.status === 'pending' ||
      cleanupSnapshot.status === 'failed' ||
      pendingOperations.length > 0 ||
      teardownErrors.length > 0
        ? 'failed'
        : 'success',
    beforeEach: [...beforeEach],
    steps: [...steps],
    afterEach: [...afterEach],
    executionStatus: Object.values(phaseResults).some(
      (phase) => phase.status === 'failed',
    )
      ? 'failed'
      : Object.values(phaseResults).some((phase) => phase.status === 'not-run')
        ? 'not-run'
        : 'success',
    phases: phaseResults,
    cleanup: cleanupSnapshot,
    ...(pendingOperations.length ? { pendingOperations } : {}),
    ...(executionErrors.length
      ? { executionErrors: executionErrors.map(asExecutionError) }
      : {}),
    ...(teardownErrors.length > 0
      ? { teardownErrors: [...teardownErrors] }
      : {}),
    ...(reportPaths.size > 0 ? { reportPaths: [...reportPaths] } : {}),
    ...(capturedSources.size || reportSources.length
      ? { reportSources: [...capturedSources.values(), ...reportSources] }
      : {}),
    ...(options.reportScopeId ? { reportScopeId: options.reportScopeId } : {}),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
  };

  try {
    await options.onResult?.(result);
  } catch (error) {
    executionErrors.push(error);
    result.status = 'failed';
    result.executionErrors = executionErrors.map(asExecutionError);
  }
  resourceScope.dispose();
  if (executionErrors.length)
    throw new WorkflowExecutionFailure(result, executionErrors);
  return result;
}
