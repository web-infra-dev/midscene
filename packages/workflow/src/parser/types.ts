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

export type StepValue = string | Record<string, unknown>;

export type StepInput = Record<string, unknown>;

export interface CaseInput {
  name?: string;
  steps: readonly StepInput[];
}

export interface WorkflowDocumentDefinition {
  beforeAll?: readonly StepInput[];
  beforeEach?: readonly StepInput[];
  cases: readonly CaseDefinition[];
  afterEach?: readonly StepInput[];
  afterAll?: readonly StepInput[];
}

export interface CaseDefinition<TStep = StepInput> {
  name: string;
  steps: readonly TStep[];
}

export interface NormalizedStep {
  node: string;
  input: Record<string, unknown> & CommonNodeInput;
  meta: NormalizedStepMeta;
}

export type NormalizedCaseDefinition = CaseDefinition<NormalizedStep>;

export interface WorkflowDocumentSource {
  projectId: string;
  sourcePath: string;
  absolutePath: string;
}

export interface CollectedCase {
  caseId: string;
  projectId: string;
  sourcePath: string;
  caseIndex: number;
  definition: NormalizedCaseDefinition;
}

export interface CollectedWorkflowDocument {
  documentId: string;
  projectId: string;
  sourcePath: string;
  lifecycle: CollectedDocumentLifecycle;
  cases: readonly CollectedCase[];
}

export interface CollectedDocumentLifecycle {
  beforeAll: readonly NormalizedStep[];
  beforeEach: readonly NormalizedStep[];
  afterEach: readonly NormalizedStep[];
  afterAll: readonly NormalizedStep[];
}
