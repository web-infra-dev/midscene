import { randomUUID } from 'node:crypto';
import {
  WorkflowDocumentSetupError,
  WorkflowDocumentTeardownError,
  WorkflowLifecycleError,
} from '../errors';
import type { CollectedWorkflowDocument } from '../parser/types';
import { executeStep } from './execute-step';
import type {
  CreateDocumentRuntimeOptions,
  DocumentNodePhase,
  NodeDocumentContext,
  StepRunResult,
  WorkflowDocumentInfo,
  WorkflowDocumentRunResult,
  WorkflowDocumentRuntime,
  WorkflowDocumentTeardown,
} from './types';

export function createDocumentRuntime<TContext = undefined>(
  document: CollectedWorkflowDocument,
  options: CreateDocumentRuntimeOptions<TContext>,
): WorkflowDocumentRuntime<TContext> {
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
  const info: WorkflowDocumentInfo = {
    documentId: document.documentId,
    documentRunId,
    projectId: document.projectId,
    sourcePath: document.sourcePath,
    cases: document.cases.map((caseDefinition) => caseDefinition.definition),
    lifecycle: document.lifecycle,
    env: Object.freeze({ ...process.env }),
  };
  const teardownStack: Array<{
    registrationIndex: number;
    teardown: WorkflowDocumentTeardown;
  }> = [];
  let acceptingTeardowns = options.setupDocument !== undefined;
  let context = undefined as TContext;
  let setupError: WorkflowDocumentSetupError | undefined;
  let started = false;
  let finishedResult: WorkflowDocumentRunResult | undefined;

  const createResult = (
    teardownErrors: WorkflowDocumentTeardownError[] = [],
  ): WorkflowDocumentRunResult => {
    const endedAt = new Date();
    return {
      documentId: document.documentId,
      documentRunId,
      projectId: document.projectId,
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
    };
  };

  const runPhase = async (
    phase: DocumentNodePhase,
    results: StepRunResult[],
  ): Promise<void> => {
    for (const [stepIndex, step] of document.lifecycle[phase].entries()) {
      const documentContext: NodeDocumentContext = {
        documentId: document.documentId,
        documentRunId,
        projectId: document.projectId,
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
      );
      await options.onStepResult?.(stepInfo, result);
      results.push(result);
      completedNodes.push(result);
      if (result.status === 'failed' && !result.continuedAfterError) break;
    }
  };

  const onTeardown = (teardown: WorkflowDocumentTeardown): void => {
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
    get canRunCases() {
      return (
        started &&
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
      if (options.setupDocument) {
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
      if (!setupError) await runPhase('beforeAll', beforeAll);
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
      if (!setupError) await runPhase('afterAll', afterAll);

      const statusBeforeTeardown = createResult().status;
      const teardownErrors: WorkflowDocumentTeardownError[] = [];
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
      await options.onResult?.(finishedResult);
      return finishedResult;
    },
  };
}
