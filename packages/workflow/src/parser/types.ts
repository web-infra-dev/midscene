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

export type WorkflowStepInput = Record<string, unknown>;

/** RFC 0001 single-workflow input retained by WorkflowEngine. */
export interface LegacyWorkflowDefinition {
  workflow: WorkflowStepInput[];
}

export type WorkflowSource = string | LegacyWorkflowDefinition;

export interface WorkflowDocumentDefinition {
  workflows: readonly WorkflowDefinition[];
}

export interface WorkflowDefinition<TStep = WorkflowStepInput> {
  name: string;
  steps: readonly TStep[];
}

export interface NormalizedStep {
  node: string;
  input: Record<string, unknown> & CommonNodeInput;
  meta: NormalizedStepMeta;
}

export interface NormalizedWorkflow {
  workflow: NormalizedStep[];
}

export type NormalizedWorkflowDefinition = WorkflowDefinition<NormalizedStep>;

export interface WorkflowDocumentSource {
  projectId: string;
  sourcePath: string;
  absolutePath: string;
}

export interface CollectedWorkflow {
  testId: string;
  projectId: string;
  sourcePath: string;
  workflowIndex: number;
  definition: NormalizedWorkflowDefinition;
}

export interface CollectedWorkflowDocument {
  projectId: string;
  sourcePath: string;
  workflows: readonly CollectedWorkflow[];
}
