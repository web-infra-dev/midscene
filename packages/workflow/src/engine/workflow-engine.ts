import type { NodeDefinition } from '../node/types';
import { normalizeWorkflow } from '../parser/normalize';
import type { CollectedWorkflow, WorkflowSource } from '../parser/types';
import { NodeRegistry } from './registry';
import { runWorkflow } from './run-workflow';
import type { WorkflowEngineOptions, WorkflowRunResult } from './types';

export class WorkflowEngine<TContext = undefined> {
  readonly registry: NodeRegistry;
  readonly context: TContext;

  constructor(options: WorkflowEngineOptions<TContext> = {}) {
    this.registry = new NodeRegistry(options.nodes);
    this.context = options.context as TContext;
  }

  register<TInput, TData>(node: NodeDefinition<TInput, TData, TContext>): this {
    this.registry.register(node);
    return this;
  }

  async run(source: WorkflowSource): Promise<WorkflowRunResult> {
    const normalized = normalizeWorkflow(source);
    const workflow: CollectedWorkflow = {
      testId: 'legacy-workflow',
      projectId: 'legacy-project',
      sourcePath: '',
      workflowIndex: 0,
      definition: { name: 'workflow', steps: normalized.cases },
    };
    const result = await runWorkflow(workflow, {
      resolveNode: (name) =>
        this.registry.require(name) as NodeDefinition<any, any, TContext>,
      context: this.context,
      createRunId: () => 'legacy-workflow',
    });

    const fatalStepError = result.steps.find(
      (step) => step.status === 'failed' && !step.continuedAfterError,
    )?.error;
    if (fatalStepError) throw fatalStepError;
    return result;
  }
}

export function createWorkflowEngine<TContext = undefined>(
  options: WorkflowEngineOptions<TContext> = {},
): WorkflowEngine<TContext> {
  return new WorkflowEngine(options);
}
