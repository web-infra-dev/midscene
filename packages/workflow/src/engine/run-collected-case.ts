import { randomUUID } from 'node:crypto';
import type { CollectedCase, NormalizedStep } from '../parser/types';
import { executeStep } from './execute-step';
import type {
  CaseNodePhase,
  CaseRunResult,
  NodeCaseContext,
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

  const runPhase = async (
    phase: CaseNodePhase,
    results: StepRunResult[],
  ): Promise<void> => {
    for (const [stepIndex, step] of phases[phase].entries()) {
      const caseContext: NodeCaseContext = {
        caseId: collectedCase.caseId,
        runId,
        name: collectedCase.definition.name,
        sourcePath: collectedCase.sourcePath,
        caseIndex: collectedCase.caseIndex,
        phase,
        stepIndex,
        completedSteps: Object.freeze([...steps]),
        completedNodes: Object.freeze([...completedNodes]),
      };
      const result = await executeStep(
        step,
        nodes[phase][stepIndex],
        { scope: 'case', case: caseContext },
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
  const result: CaseRunResult = {
    caseId: collectedCase.caseId,
    runId,
    name: collectedCase.definition.name,
    sourcePath: collectedCase.sourcePath,
    caseIndex: collectedCase.caseIndex,
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
