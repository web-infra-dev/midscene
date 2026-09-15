export type DurationInput = number;

export interface StepMetaInput {
  timeout?: DurationInput;
  'continue-on-error'?: boolean;
}

export interface NormalizedStepMeta {
  /** Input adapter requests the legacy raw-result view, including unnamed values. */
  captureResult?: boolean;
  timeoutMs?: number;
  continueOnError: boolean;
  resultName?: string;
}

export type StepValue = string | Record<string, unknown>;

export type StepInput = Record<string, unknown>;

export interface CaseInput {
  name?: string;
  tags?: readonly string[];
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
  tags?: readonly string[];
  steps: readonly TStep[];
}

export interface NormalizedStep {
  node: string;
  input: Record<string, unknown>;
  meta: NormalizedStepMeta;
}

/** Adapter-only policy; native Case inputs do not expose this switch. */
export type NormalizedCaseDefinition = CaseDefinition<NormalizedStep> & {
  onFailure?: 'continue' | 'stop-document';
};

export interface WorkflowDocumentSource {
  projectId: string;
  projectName?: string;
  sourcePath: string;
  absolutePath: string;
  /** Repeated occurrences of this path are distinct logical invocations. */
  invocationIndex?: number;
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
