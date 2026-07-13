export type DurationInput = number;

export interface StepMetaInput {
  timeout?: DurationInput;
  'continue-on-error'?: boolean;
}

export interface NormalizedStepMeta {
  timeoutMs?: number;
  continueOnError: boolean;
}

export interface CommonNodeInput {
  prompt?: string;
}

export type WorkflowStepValue = string | Record<string, unknown>;

export type WorkflowStepInput = Record<string, WorkflowStepValue>;

export interface WorkflowDefinition {
  workflow: WorkflowStepInput[];
}

export type WorkflowSource = string | WorkflowDefinition;

export interface NormalizedStep {
  node: string;
  input: Record<string, unknown> & CommonNodeInput;
  meta: NormalizedStepMeta;
}

export interface NormalizedWorkflow {
  workflow: NormalizedStep[];
}
