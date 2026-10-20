import { runCollectedCase as coreRunCollectedCase } from '@midscene/core/internal/test-runner';
import type { CollectedCase } from '../parser/types';
import type { CaseRunResult, RunCollectedCaseOptions } from './types';

export const runCollectedCase: <TContext = undefined>(
  collectedCase: CollectedCase,
  options: RunCollectedCaseOptions<TContext>,
) => Promise<CaseRunResult> = coreRunCollectedCase;
