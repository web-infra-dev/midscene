import type { NodeDefinition } from '../node/types';
import { normalizeWorkflow } from '../parser/normalize';
import type { WorkflowSource } from '../parser/types';
import { NodeRegistry } from './registry';
import { runStep } from './run-step';
import type {
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

    for (const { step, node } of executableSteps) {
      steps.push(await runStep(step, node));
    }

    const endedAt = new Date();
    return {
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
