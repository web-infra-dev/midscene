import type { NodeDefinition } from '../node/types';
import { normalizeSteps } from '../parser/normalize';
import type { CaseInput, CollectedCase } from '../parser/types';
import { NodeRegistry } from './registry';
import { runCollectedCase } from './run-collected-case';
import type { CaseRunResult, CaseRunnerOptions } from './types';

export class CaseRunner<TContext = undefined> {
  readonly registry: NodeRegistry;
  readonly context: TContext;

  constructor(options: CaseRunnerOptions<TContext> = {}) {
    this.registry = new NodeRegistry(options.nodes);
    this.context = options.context as TContext;
  }

  register<TInput, TData>(node: NodeDefinition<TInput, TData, TContext>): this {
    this.registry.register(node);
    return this;
  }

  async run(input: CaseInput): Promise<CaseRunResult> {
    const collectedCase: CollectedCase = {
      caseId: 'standalone-case',
      projectId: 'standalone-project',
      sourcePath: '',
      caseIndex: 0,
      definition: {
        name: input.name ?? 'case',
        steps: normalizeSteps(input.steps),
      },
    };
    const result = await runCollectedCase(collectedCase, {
      resolveNode: (name) =>
        this.registry.require(name) as NodeDefinition<any, any, TContext>,
      context: this.context,
      createRunId: () => 'standalone-case',
    });

    const fatalStepError = result.steps.find(
      (step) => step.status === 'failed' && !step.continuedAfterError,
    )?.error;
    if (fatalStepError) throw fatalStepError;
    return result;
  }
}

export function createCaseRunner<TContext = undefined>(
  options: CaseRunnerOptions<TContext> = {},
): CaseRunner<TContext> {
  return new CaseRunner(options);
}
