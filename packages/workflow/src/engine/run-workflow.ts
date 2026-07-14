import { randomUUID } from 'node:crypto';
import type { CollectedWorkflow } from '../parser/types';
import { runStepForWorkflow } from './run-step';
import type {
  NodeWorkflowContext,
  RunWorkflowOptions,
  WorkflowRunResult,
} from './types';

export async function runWorkflow(
  workflow: CollectedWorkflow,
  options: RunWorkflowOptions,
): Promise<WorkflowRunResult> {
  const nodes = workflow.definition.steps.map((step) =>
    options.resolveNode(step.node),
  );
  const runId = options.createRunId?.() ?? randomUUID();
  const startedAt = new Date();
  const completedSteps: WorkflowRunResult['steps'] = [];

  for (const [stepIndex, step] of workflow.definition.steps.entries()) {
    const context: NodeWorkflowContext = {
      testId: workflow.testId,
      runId,
      name: workflow.definition.name,
      sourcePath: workflow.sourcePath,
      workflowIndex: workflow.workflowIndex,
      stepIndex,
      completedSteps: Object.freeze([...completedSteps]),
    };
    const result = await runStepForWorkflow(step, nodes[stepIndex], context);
    completedSteps.push(result);

    if (result.status === 'failed' && !result.continuedAfterError) {
      break;
    }
  }

  const endedAt = new Date();
  const result: WorkflowRunResult = {
    testId: workflow.testId,
    runId,
    name: workflow.definition.name,
    sourcePath: workflow.sourcePath,
    workflowIndex: workflow.workflowIndex,
    status: completedSteps.some((step) => step.status === 'failed')
      ? 'failed'
      : 'success',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    steps: completedSteps,
  };

  await options.onResult?.(result);
  return result;
}
