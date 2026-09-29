import {
  type ResolveNodeForNormalization,
  normalizeStep as coreNormalizeStep,
  normalizeSteps as coreNormalizeSteps,
} from '@midscene/core/internal/test-runner';
import type { NormalizedStep } from './types';
export type { ResolveNodeForNormalization } from '@midscene/core/internal/test-runner';

export const normalizeStep: (
  value: unknown,
  index?: number,
  resolveNode?: ResolveNodeForNormalization,
) => NormalizedStep = coreNormalizeStep;
export const normalizeSteps: (
  values: unknown,
  resolveNode?: ResolveNodeForNormalization,
) => NormalizedStep[] = coreNormalizeSteps;
