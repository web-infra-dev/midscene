import { getDebug } from '@midscene/shared/logger';
import { uuid as randomUUID } from '@midscene/shared/utils';
import {
  NodeScopeTeardownError,
  type WorkflowError,
  WorkflowLifecycleError,
} from '../errors';
import type { CollectedWorkflowDocument } from '../parser/types';
import { buildTestRunReportPlan } from '../reporting/test-plan';
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
  CreateDocumentRuntimeOptions,
  DocumentNodePhase,
  NodeDocumentContext,
  NodeScopeTeardown,
  StepRunResult,
  WorkflowDocumentRunResult,
  WorkflowDocumentRuntime,
  WorkflowHostError,
} from './types';

export function createDocumentRuntime<TContext = undefined>(
  document: CollectedWorkflowDocument,
  options: CreateDocumentRuntimeOptions<TContext>,
): WorkflowDocumentRuntime<TContext> {
  const documentRunId = options.createDocumentRunId?.() ?? randomUUID();
  const plan =
    options.plan ??
    buildTestRunReportPlan(document, {
      defaultTimeoutMs: options.defaultTimeoutMs,
      retry: { scope: 'case', count: options.project?.retry ?? 0 },
    });
  const startedAt = new Date();
  const beforeAll: StepRunResult[] = [];
  const afterAll: StepRunResult[] = [];
  const nodes = {
    beforeAll: document.lifecycle.beforeAll.map((step) =>
      options.resolveNode(step.node),
    ),
    afterAll: document.lifecycle.afterAll.map((step) =>
      options.resolveNode(step.node),
    ),
  };
  const project =
    options.project ??
    Object.freeze({
      projectId: document.projectId,
      name: document.projectId,
      retry: 0,
    });
  let context = options.projectContext as TContext;
  const resourceScope = createResourceScope(options.signal);
  const signal = resourceScope.signal;
  setResourceOperationIdentity(signal, { scopeId: documentRunId });
  const nodeTeardownStack: Array<{
    registrationIndex: number;
    node: string;
    teardown: NodeScopeTeardown;
    host?: boolean;
  }> = [];
  let acceptingNodeTeardowns = true;
  let started = false;
  let finishedResult: WorkflowDocumentRunResult | undefined;
  let finishPromise: Promise<WorkflowDocumentRunResult> | undefined;
  const reportPaths = new Set<string>();
  const reportSources: import('./types').WorkflowReportSource[] = [];
  const capturedSources = new Map<
    string,
    import('./types').WorkflowReportSource
  >();
  const executionErrors: unknown[] = [];
  const hostErrors: WorkflowHostError[] = [];
  let acceptingSetupTeardowns = false;

  const createResult = (
    teardownErrors: WorkflowError[] = [],
  ): WorkflowDocumentRunResult => {
    const endedAt = new Date();
    const cleanup = getResourceCleanupSnapshot(signal);
    const pendingOperations = getPendingScopeOperations(signal);
    const phaseResults = {
      beforeAll: phaseResult(document.lifecycle.beforeAll.length, beforeAll),
      afterAll: phaseResult(document.lifecycle.afterAll.length, afterAll),
    };
    return {
      plan,
      documentId: document.documentId,
      documentRunId,
      ...(options.documentAttemptIndex === undefined
        ? {}
        : { attemptIndex: options.documentAttemptIndex }),
      projectId: document.projectId,
      projectName: project.name,
      sourcePath: document.sourcePath,
      status:
        executionErrors.length > 0 ||
        hostErrors.length > 0 ||
        beforeAll.some((step) => step.status !== 'success') ||
        afterAll.some((step) => step.status !== 'success') ||
        cleanup.status === 'pending' ||
        cleanup.status === 'failed' ||
        pendingOperations.length > 0 ||
        teardownErrors.length > 0
          ? 'failed'
          : 'success',
      executionStatus: Object.values(phaseResults).some(
        (phase) => phase.status === 'failed',
      )
        ? 'failed'
        : Object.values(phaseResults).some(
              (phase) => phase.status === 'not-run',
            ) ||
            hostErrors.some(({ phase }) => phase === 'setup') ||
            (signal.aborted && !beforeAll.length && !afterAll.length)
          ? 'not-run'
          : 'success',
      phases: phaseResults,
      cleanup,
      ...(pendingOperations.length ? { pendingOperations } : {}),
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
      beforeAll: [...beforeAll],
      afterAll: [...afterAll],
      ...(executionErrors.length
        ? {
            executionErrors: executionErrors
              .filter(
                (error) => !hostErrors.some((host) => host.error === error),
              )
              .map(asExecutionError),
          }
        : {}),
      ...(hostErrors.length ? { hostErrors: [...hostErrors] } : {}),
      ...(teardownErrors.length > 0
        ? { teardownErrors: [...teardownErrors] }
        : {}),
      ...(reportPaths.size > 0 ? { reportPaths: [...reportPaths] } : {}),
      ...(capturedSources.size || reportSources.length
        ? { reportSources: [...capturedSources.values(), ...reportSources] }
        : {}),
    };
  };

  const runPhase = async (
    phase: DocumentNodePhase,
    results: StepRunResult[],
    executionSignal = signal,
  ): Promise<void> => {
    for (const [stepIndex, step] of document.lifecycle[phase].entries()) {
      const waitForPreviousOperationMs =
        stepIndex > 0
          ? await recoverCancelledScopeResources(executionSignal)
          : 0;
      const documentContext: NodeDocumentContext = {
        documentId: document.documentId,
        documentRunId,
        projectId: document.projectId,
        projectName: project.name,
        sourcePath: document.sourcePath,
        phase,
        stepIndex,
      };
      const stepInfo = {
        scope: 'document' as const,
        node: step.node,
        stepCount: document.lifecycle[phase].length,
        document: documentContext,
      };
      await options.onStepStart?.(stepInfo);
      const result = await executeStep(
        step,
        nodes[phase][stepIndex],
        { scope: 'document', document: documentContext },
        context,
        {
          signal: executionSignal,
          defaultTimeoutMs: options.defaultTimeoutMs,
          onTeardown(node, teardown) {
            if (!acceptingNodeTeardowns) {
              throw new WorkflowLifecycleError(
                'Node teardown can only be registered while a workflow document is running.',
                { documentId: document.documentId, documentRunId, node },
              );
            }
            if (typeof teardown !== 'function') {
              throw new WorkflowLifecycleError(
                'Node onTeardown() requires a teardown function.',
                { documentId: document.documentId, documentRunId, node },
              );
            }
            nodeTeardownStack.push({
              registrationIndex: nodeTeardownStack.length,
              node,
              teardown,
            });
          },
        },
      );
      if (waitForPreviousOperationMs > 0)
        result.waitForPreviousOperationMs = waitForPreviousOperationMs;
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

  return {
    signal,
    get context() {
      return context;
    },
    get canRunCases() {
      return (
        started &&
        executionErrors.length === 0 &&
        hostErrors.length === 0 &&
        !signal.aborted &&
        !beforeAll.some((step) => step.status !== 'success')
      );
    },
    async start() {
      if (started) {
        throw new WorkflowLifecycleError(
          'Workflow document runtime has already started.',
          { documentId: document.documentId, documentRunId },
        );
      }
      started = true;
      if (!signal.aborted && options.documentSetup) {
        acceptingSetupTeardowns = true;
        try {
          context = await options.documentSetup.setup({
            project,
            projectContext: options.projectContext,
            document: {
              documentId: document.documentId,
              documentRunId,
              sourcePath: document.sourcePath,
              attemptIndex: options.documentAttemptIndex ?? 0,
            },
            signal,
            onTeardown(teardown) {
              if (!acceptingSetupTeardowns || typeof teardown !== 'function')
                throw new WorkflowLifecycleError(
                  'Document setup onTeardown() requires a function registered during setup.',
                  { documentId: document.documentId, documentRunId },
                );
              nodeTeardownStack.push({
                registrationIndex: nodeTeardownStack.length,
                node: options.documentSetup!.name,
                teardown,
                host: true,
              });
            },
          });
        } catch (error) {
          hostErrors.push({ phase: 'setup', error: asExecutionError(error) });
        } finally {
          acceptingSetupTeardowns = false;
        }
      }
      try {
        if (!signal.aborted && !hostErrors.length)
          await runPhase('beforeAll', beforeAll);
      } catch (error) {
        executionErrors.push(error);
        throw new WorkflowExecutionFailure(createResult(), [
          ...executionErrors,
        ]);
      }
      return createResult();
    },
    async finish() {
      if (finishPromise) return finishPromise;
      if (!started) {
        throw new WorkflowLifecycleError(
          'Workflow document runtime must start before it can finish.',
          { documentId: document.documentId, documentRunId },
        );
      }
      finishPromise = (async () => {
        const teardownErrors: WorkflowError[] = [];
        const cleanupExecutionErrors: unknown[] = [];
        let deferredCleanup = false;
        const cleanup = async () => {
          const priorTeardownErrors = teardownErrors.length;
          acceptingNodeTeardowns = false;
          for (const {
            registrationIndex,
            node,
            teardown,
            host,
          } of nodeTeardownStack.reverse()) {
            try {
              const released = await teardown();
              reportSources.push(...(released?.reportSources ?? []));
              for (const path of reportPathsFromTeardown(released)) {
                reportPaths.add(path);
              }
            } catch (error) {
              if (host) {
                const failure = asExecutionError(error);
                hostErrors.push({
                  phase: 'cleanup',
                  error: failure,
                });
                executionErrors.push(failure);
                cleanupExecutionErrors.push(error);
                continue;
              }
              teardownErrors.push(
                new NodeScopeTeardownError(error, {
                  scope: 'document',
                  scopeId: documentRunId,
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
              throw new AggregateError(errors, 'Document cleanup failed');
          }
        };
        try {
          if (document.lifecycle.afterAll.length || nodeTeardownStack.length)
            await cleanupScopeResources(signal, cleanup, {
              beforeCleanup: async (cleanupSignal) => {
                try {
                  if (!hostErrors.some((error) => error.phase === 'setup'))
                    await runPhase('afterAll', afterAll, cleanupSignal);
                } catch (error) {
                  executionErrors.push(error);
                  cleanupExecutionErrors.push(error);
                }
              },
              onDeferredError: (error) =>
                getDebug('runner:cleanup', { console: true })(
                  `Deferred document cleanup failed: ${String(error)}`,
                ),
            });
          else acceptingNodeTeardowns = false;
        } catch (error) {
          deferredCleanup = error instanceof ResourceCleanupDeferredError;
          if (!deferredCleanup) acceptingNodeTeardowns = false;
          if (
            !deferredCleanup &&
            !teardownErrors.length &&
            !cleanupExecutionErrors.length
          )
            teardownErrors.push(
              new NodeScopeTeardownError(error, {
                scope: 'document',
                scopeId: documentRunId,
                node: 'resource-drain',
                registrationIndex: -1,
              }),
            );
        }
        finishedResult = createResult(teardownErrors);
        try {
          await options.onResult?.(finishedResult);
        } catch (error) {
          executionErrors.push(error);
          finishedResult = createResult(teardownErrors);
        }
        resourceScope.dispose();
        if (executionErrors.length)
          throw new WorkflowExecutionFailure(finishedResult, [
            ...executionErrors,
          ]);
        return finishedResult;
      })();
      return finishPromise;
    },
  };
}
