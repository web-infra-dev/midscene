import {
  CaseRunner as CoreCaseRunner,
  createCaseRunner as coreCreateCaseRunner,
} from '@midscene/core/internal/test-runner';
import type { NodeDefinition } from '../node/types';
import type { CaseInput } from '../parser/types';
import type { NodeRegistry } from './registry';
import type { CaseRunResult, CaseRunnerOptions } from './types';

export type CaseRunner<TContext = undefined> = Omit<
  CoreCaseRunner<TContext>,
  'run' | 'register' | 'registry'
> & {
  readonly registry: NodeRegistry;
  register<TInput, TData>(
    node: NodeDefinition<TInput, TData, TContext>,
  ): CaseRunner<TContext>;
  run(input: CaseInput): Promise<CaseRunResult>;
};
export const CaseRunner: {
  new <TContext = undefined>(
    options?: CaseRunnerOptions<TContext>,
  ): CaseRunner<TContext>;
} = CoreCaseRunner;
export const createCaseRunner: <TContext = undefined>(
  options?: CaseRunnerOptions<TContext>,
) => CaseRunner<TContext> = coreCreateCaseRunner;
