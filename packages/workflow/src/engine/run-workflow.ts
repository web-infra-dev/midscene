import { randomUUID } from 'node:crypto';
import type { CollectedWorkflow, NormalizedStep } from '../parser/types';
import { runStepForWorkflow } from './run-step';
import type {
  NodeWorkflowContext,
  RunWorkflowOptions,
  StepRunResult,
  WorkflowNodePhase,
  WorkflowRunResult,
} from './types';

export async function runWorkflow<TContext = undefined>(
  workflow: CollectedWorkflow,
  options: RunWorkflowOptions<TContext>,
): Promise<WorkflowRunResult> {
  const phases: Record<WorkflowNodePhase, readonly NormalizedStep[]> = {
    beforeEach: options.beforeEach ?? [],
    steps: workflow.definition.steps,
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

  const runPhase = async (
    phase: WorkflowNodePhase,
    results: StepRunResult[],
  ): Promise<void> => {
    for (const [stepIndex, step] of phases[phase].entries()) {
      const workflowContext: NodeWorkflowContext = {
        testId: workflow.testId,
        runId,
        name: workflow.definition.name,
        sourcePath: workflow.sourcePath,
        workflowIndex: workflow.workflowIndex,
        phase,
        stepIndex,
        completedSteps: Object.freeze([...steps]),
        completedNodes: Object.freeze([...completedNodes]),
      };
      const result = await runStepForWorkflow(
        step,
        nodes[phase][stepIndex],
        workflowContext,
        options.context as TContext,
      );
      results.push(result);
      completedNodes.push(result);
      if (result.status === 'failed' && !result.continuedAfterError) break;
    }
  };

  await runPhase('beforeEach', beforeEach);
  if (!beforeEach.some((step) => step.status === 'failed')) {
    await runPhase('steps', steps);
  }
  await runPhase('afterEach', afterEach);

  const endedAt = new Date();
  const result: WorkflowRunResult = {
    testId: workflow.testId,
    runId,
    name: workflow.definition.name,
    sourcePath: workflow.sourcePath,
    workflowIndex: workflow.workflowIndex,
    status: completedNodes.some((step) => step.status === 'failed')
      ? 'failed'
      : 'success',
    beforeEach,
    steps,
    afterEach,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
  };

  await options.onResult?.(result);
  return result;
}
