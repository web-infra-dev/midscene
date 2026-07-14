import { randomUUID } from 'node:crypto';
import {
  WorkflowLifecycleError,
  WorkflowSetupError,
  WorkflowTeardownError,
} from '../errors';
import type { CollectedWorkflow } from '../parser/types';
import { runStepForWorkflow } from './run-step';
import type {
  NodeWorkflowContext,
  RunWorkflowOptions,
  WorkflowAttemptInfo,
  WorkflowRunResult,
  WorkflowTeardown,
  WorkflowTeardownContext,
} from './types';

export async function runWorkflow<TContext = undefined>(
  workflow: CollectedWorkflow,
  options: RunWorkflowOptions<TContext>,
): Promise<WorkflowRunResult> {
  const nodes = workflow.definition.steps.map((step) =>
    options.resolveNode(step.node),
  );
  const runId = options.createRunId?.() ?? randomUUID();
  const startedAt = new Date();
  const completedSteps: WorkflowRunResult['steps'] = [];
  const teardownStack: Array<{
    registrationIndex: number;
    teardown: WorkflowTeardown;
  }> = [];
  const attempt: WorkflowAttemptInfo = {
    testId: workflow.testId,
    runId,
    name: workflow.definition.name,
    sourcePath: workflow.sourcePath,
    workflowIndex: workflow.workflowIndex,
    steps: workflow.definition.steps,
    env: Object.freeze({ ...process.env }),
  };
  let acceptingTeardowns = options.setupWorkflow !== undefined;
  let context = undefined as TContext;
  let setupError: WorkflowSetupError | undefined;

  const onTeardown = (teardown: WorkflowTeardown): void => {
    if (!acceptingTeardowns) {
      throw new WorkflowLifecycleError(
        'onTeardown() can only be called while setupWorkflow is running.',
        { testId: workflow.testId, runId },
      );
    }
    if (typeof teardown !== 'function') {
      throw new WorkflowLifecycleError(
        'onTeardown() requires a teardown function.',
        { testId: workflow.testId, runId },
      );
    }
    teardownStack.push({
      registrationIndex: teardownStack.length,
      teardown,
    });
  };

  if (options.setupWorkflow) {
    try {
      context = await options.setupWorkflow({ ...attempt, onTeardown });
    } catch (error) {
      setupError = new WorkflowSetupError(error, {
        testId: workflow.testId,
        runId,
      });
    } finally {
      acceptingTeardowns = false;
    }
  }

  if (!setupError) {
    for (const [stepIndex, step] of workflow.definition.steps.entries()) {
      const workflowContext: NodeWorkflowContext = {
        testId: workflow.testId,
        runId,
        name: workflow.definition.name,
        sourcePath: workflow.sourcePath,
        workflowIndex: workflow.workflowIndex,
        stepIndex,
        completedSteps: Object.freeze([...completedSteps]),
      };
      const result = await runStepForWorkflow(
        step,
        nodes[stepIndex],
        workflowContext,
        context,
      );
      completedSteps.push(result);

      if (result.status === 'failed' && !result.continuedAfterError) {
        break;
      }
    }
  }

  const statusBeforeTeardown =
    setupError || completedSteps.some((step) => step.status === 'failed')
      ? 'failed'
      : 'success';
  const teardownContext: WorkflowTeardownContext = {
    ...attempt,
    completedSteps: Object.freeze([...completedSteps]),
    status: statusBeforeTeardown,
    ...(setupError ? { setupError } : {}),
  };
  const teardownErrors: WorkflowTeardownError[] = [];
  for (const { registrationIndex, teardown } of teardownStack.reverse()) {
    try {
      await teardown(teardownContext);
    } catch (error) {
      teardownErrors.push(
        new WorkflowTeardownError(error, {
          testId: workflow.testId,
          runId,
          registrationIndex,
        }),
      );
    }
  }

  const endedAt = new Date();
  const result: WorkflowRunResult = {
    testId: workflow.testId,
    runId,
    name: workflow.definition.name,
    sourcePath: workflow.sourcePath,
    workflowIndex: workflow.workflowIndex,
    status:
      statusBeforeTeardown === 'failed' || teardownErrors.length > 0
        ? 'failed'
        : 'success',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    steps: completedSteps,
    ...(setupError ? { setupError } : {}),
    ...(teardownErrors.length > 0 ? { teardownErrors } : {}),
  };

  await options.onResult?.(result);
  return result;
}
