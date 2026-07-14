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

/** Standalone workflow input accepted by WorkflowEngine. */
export interface WorkflowCasesDefinition {
  cases: WorkflowStepInput[];
}

export type WorkflowSource = string | WorkflowCasesDefinition;

export interface WorkflowDocumentDefinition {
  beforeAll?: readonly WorkflowStepInput[];
  beforeEach?: readonly WorkflowStepInput[];
  workflows: readonly WorkflowDefinition[];
  afterEach?: readonly WorkflowStepInput[];
  afterAll?: readonly WorkflowStepInput[];
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
  cases: NormalizedStep[];
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
  documentId: string;
  projectId: string;
  sourcePath: string;
  lifecycle: CollectedWorkflowLifecycle;
  workflows: readonly CollectedWorkflow[];
}

export interface CollectedWorkflowLifecycle {
  beforeAll: readonly NormalizedStep[];
  beforeEach: readonly NormalizedStep[];
  afterEach: readonly NormalizedStep[];
  afterAll: readonly NormalizedStep[];
}
