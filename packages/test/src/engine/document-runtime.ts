import { randomUUID } from 'node:crypto';
import {
  NodeScopeTeardownError,
  WorkflowDocumentSetupError,
  WorkflowDocumentTeardownError,
  type WorkflowError,
  WorkflowLifecycleError,
} from '../errors';
import type { CollectedWorkflowDocument } from '../parser/types';
import { executeStep } from './execute-step';
import { createHistory } from './history';
import { reportPathsFromTeardown } from './scope-teardown';
import type {
  CreateDocumentRuntimeOptions,
  DocumentNodePhase,
  NodeDocumentContext,
  NodeScopeTeardown,
  StepRunResult,
  WorkflowDocumentInfo,
  WorkflowDocumentRunResult,
  WorkflowDocumentRuntime,
  WorkflowDocumentTeardown,
} from './types';

export function createDocumentRuntime<
  TProjectContext = undefined,
  TDocumentContext = TProjectContext,
>(
  document: CollectedWorkflowDocument,
  options: CreateDocumentRuntimeOptions<TProjectContext, TDocumentContext>,
): WorkflowDocumentRuntime<TDocumentContext> {
  const documentRunId = options.createDocumentRunId?.() ?? randomUUID();
  const startedAt = new Date();
  const beforeAll: StepRunResult[] = [];
  const afterAll: StepRunResult[] = [];
  const completedNodes: StepRunResult[] = [];
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
      name: document.projectId,
      platform: 'web' as const,
      tags: Object.freeze({ include: [], exclude: [] }),
      repeat: 1,
      retry: 0,
      variables: Object.freeze({}),
    });
  const projectContext = options.projectContext as TProjectContext;
  const signal = options.signal ?? new AbortController().signal;
  const info: WorkflowDocumentInfo<TProjectContext> = {
    documentId: document.documentId,
    documentRunId,
    projectId: document.projectId,
    projectName: project.name,
    project,
    projectContext,
    repeatIndex: options.repeatIndex ?? 0,
    sourcePath: document.sourcePath,
    cases: document.cases.map((caseDefinition) => caseDefinition.definition),
    lifecycle: document.lifecycle,
    env: Object.freeze({ ...process.env }),
    signal,
  };
  const teardownStack: Array<{
    registrationIndex: number;
    teardown: WorkflowDocumentTeardown<TProjectContext>;
  }> = [];
  const nodeTeardownStack: Array<{
    registrationIndex: number;
    node: string;
    teardown: NodeScopeTeardown;
  }> = [];
  let acceptingTeardowns = options.setupDocument !== undefined;
  let acceptingNodeTeardowns = true;
  let context = projectContext as unknown as TDocumentContext;
  let setupError: WorkflowDocumentSetupError | undefined;
  let started = false;
  let finishedResult: WorkflowDocumentRunResult | undefined;
  const reportPaths = new Set<string>();

  const createResult = (
    teardownErrors: WorkflowError[] = [],
  ): WorkflowDocumentRunResult => {
    const endedAt = new Date();
    return {
      documentId: document.documentId,
      documentRunId,
      projectId: document.projectId,
      projectName: project.name,
      repeatIndex: options.repeatIndex ?? 0,
      sourcePath: document.sourcePath,
      status:
        setupError ||
        completedNodes.some((step) => step.status === 'failed') ||
        teardownErrors.length > 0
          ? 'failed'
          : 'success',
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
      beforeAll: [...beforeAll],
      afterAll: [...afterAll],
      ...(setupError ? { setupError } : {}),
      ...(teardownErrors.length > 0 ? { teardownErrors } : {}),
      ...(reportPaths.size > 0 ? { reportPaths: [...reportPaths] } : {}),
    };
  };

  const runPhase = async (
    phase: DocumentNodePhase,
    results: StepRunResult[],
    executionSignal = signal,
  ): Promise<void> => {
    for (const [stepIndex, step] of document.lifecycle[phase].entries()) {
      const documentContext: NodeDocumentContext = {
        documentId: document.documentId,
        documentRunId,
        projectId: document.projectId,
        projectName: project.name,
        repeatIndex: options.repeatIndex ?? 0,
        sourcePath: document.sourcePath,
        phase,
        stepIndex,
        completedNodes: Object.freeze([...completedNodes]),
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
          history: createHistory([], completedNodes, 'document'),
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
      await options.onStepResult?.(stepInfo, result);
      results.push(result);
      completedNodes.push(result);
      if (result.status === 'failed' && !result.continuedAfterError) break;
    }
  };

  const onTeardown = (
    teardown: WorkflowDocumentTeardown<TProjectContext>,
  ): void => {
    if (!acceptingTeardowns) {
      throw new WorkflowLifecycleError(
        'onTeardown() can only be called while setupDocument is running.',
        { documentId: document.documentId, documentRunId },
      );
    }
    if (typeof teardown !== 'function') {
      throw new WorkflowLifecycleError(
        'onTeardown() requires a teardown function.',
        { documentId: document.documentId, documentRunId },
      );
    }
    teardownStack.push({
      registrationIndex: teardownStack.length,
      teardown,
    });
  };

  return {
    get context() {
      return context;
    },
    get history() {
      return createHistory([], completedNodes, 'document');
    },
    get canRunCases() {
      return (
        started &&
        !signal.aborted &&
        !setupError &&
        !beforeAll.some((step) => step.status === 'failed')
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
      if (options.setupDocument && !signal.aborted) {
        try {
          context = await options.setupDocument({ ...info, onTeardown });
        } catch (error) {
          setupError = new WorkflowDocumentSetupError(error, {
            documentId: document.documentId,
            documentRunId,
          });
        } finally {
          acceptingTeardowns = false;
        }
      }
      if (!setupError && !signal.aborted)
        await runPhase('beforeAll', beforeAll);
      return createResult();
    },
    async finish() {
      if (finishedResult) return finishedResult;
      if (!started) {
        throw new WorkflowLifecycleError(
          'Workflow document runtime must start before it can finish.',
          { documentId: document.documentId, documentRunId },
        );
      }
      let finishError: unknown;
      if (!setupError) {
        try {
          await runPhase(
            'afterAll',
            afterAll,
            signal.aborted ? new AbortController().signal : signal,
          );
        } catch (error) {
          finishError = error;
        }
      }

      acceptingNodeTeardowns = false;
      const teardownErrors: WorkflowError[] = [];
      for (const {
        registrationIndex,
        node,
        teardown,
      } of nodeTeardownStack.reverse()) {
        try {
          for (const path of reportPathsFromTeardown(await teardown())) {
            reportPaths.add(path);
          }
        } catch (error) {
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
      const statusBeforeTeardown = createResult(teardownErrors).status;
      for (const { registrationIndex, teardown } of teardownStack.reverse()) {
        try {
          await teardown({
            ...info,
            beforeAll: Object.freeze([...beforeAll]),
            afterAll: Object.freeze([...afterAll]),
            status: statusBeforeTeardown,
            ...(setupError ? { setupError } : {}),
          });
        } catch (error) {
          teardownErrors.push(
            new WorkflowDocumentTeardownError(error, {
              documentId: document.documentId,
              documentRunId,
              registrationIndex,
            }),
          );
        }
      }
      finishedResult = createResult(teardownErrors);
      if (finishError) throw finishError;
      await options.onResult?.(finishedResult);
      return finishedResult;
    },
  };
}
