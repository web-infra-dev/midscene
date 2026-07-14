import type { NodeDefinition } from '../node/types';
import { normalizeWorkflow } from '../parser/normalize';
import type { WorkflowSource } from '../parser/types';
import { NodeRegistry } from './registry';
import { runStep } from './run-step';
import type {
  NodeWorkflowContext,
  StepRunResult,
  WorkflowEngineOptions,
  WorkflowRunResult,
} from './types';

export class WorkflowEngine {
  readonly registry: NodeRegistry;

  constructor(options: WorkflowEngineOptions = {}) {
    this.registry = new NodeRegistry(options.nodes);
  }

  register<TInput, TData>(node: NodeDefinition<TInput, TData>): this {
    this.registry.register(node);
    return this;
  }

  async run(source: WorkflowSource): Promise<WorkflowRunResult> {
    const normalized = normalizeWorkflow(source);
    const executableSteps = normalized.workflow.map((step) => ({
      step,
      node: this.registry.require(step.node),
    }));
    const startedAt = new Date();
    const steps: StepRunResult[] = [];

    for (const [stepIndex, { step, node }] of executableSteps.entries()) {
      const workflow: NodeWorkflowContext = {
        testId: 'legacy-workflow',
        runId: 'legacy-workflow',
        name: 'workflow',
        sourcePath: '',
        workflowIndex: 0,
        stepIndex,
        completedSteps: Object.freeze([...steps]),
      };
      steps.push(await runStep(step, node, workflow));
    }

    const endedAt = new Date();
    return {
      testId: 'legacy-workflow',
      runId: 'legacy-workflow',
      name: 'workflow',
      sourcePath: '',
      workflowIndex: 0,
      status: steps.some((step) => step.status === 'failed')
        ? 'failed'
        : 'success',
      steps,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    };
  }
}

export function createWorkflowEngine(
  options: WorkflowEngineOptions = {},
): WorkflowEngine {
  return new WorkflowEngine(options);
}
