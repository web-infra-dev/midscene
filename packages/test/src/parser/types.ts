export type {
  DurationInput,
  StepMetaInput,
  StepValue,
  StepInput,
  CaseInput,
  WorkflowDocumentDefinition,
  CaseDefinition,
} from '@midscene/core/internal/test-runner';

import type * as Core from '@midscene/core/internal/test-runner';

// Native contracts intentionally exclude metadata compiled by the YAML adapter.
export type NormalizedStepMeta = Omit<
  Core.NormalizedStepMeta,
  'captureResult' | 'resultName'
>;
export type NormalizedStep = Omit<Core.NormalizedStep, 'meta'> & {
  meta: NormalizedStepMeta;
};
export type NormalizedCaseDefinition = Core.CaseDefinition<NormalizedStep>;
export type WorkflowDocumentSource = Omit<
  Core.WorkflowDocumentSource,
  'invocationIndex'
>;
export type CollectedCase = Omit<Core.CollectedCase, 'definition'> & {
  definition: NormalizedCaseDefinition;
};
export type CollectedDocumentLifecycle = {
  [K in keyof Core.CollectedDocumentLifecycle]: readonly NormalizedStep[];
};
export type CollectedWorkflowDocument = Omit<
  Core.CollectedWorkflowDocument,
  'cases' | 'lifecycle'
> & {
  cases: readonly CollectedCase[];
  lifecycle: CollectedDocumentLifecycle;
};
