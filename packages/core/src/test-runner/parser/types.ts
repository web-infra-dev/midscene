export type DurationInput = number;

export interface StepMetaInput {
  timeout?: DurationInput;
  'continue-on-error'?: boolean;
  resultName?: string;
  /** JSON Pointer into NodeResult.data; omitted means the complete data. */
  resultPath?: string;
}

export interface NormalizedStepMeta {
  /** Input adapter requests the legacy raw-result view, including unnamed values. */
  captureResult?: boolean;
  timeoutMs?: number;
  continueOnError: boolean;
  resultName?: string;
  resultPath?: string;
}

export type StepValue = string | Record<string, unknown>;

export type StepInput = Record<string, unknown>;

export interface CaseInput {
  name?: string;
  tags?: readonly string[];
  onFailure?: 'continue' | 'stop-document';
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
  /** Applies after retries finish; it never prevents document cleanup. */
  onFailure?: 'continue' | 'stop-document';
  steps: readonly TStep[];
}

export interface NormalizedStep {
  node: string;
  input: Record<string, unknown>;
  meta: NormalizedStepMeta;
}

export type NormalizedCaseDefinition = CaseDefinition<NormalizedStep>;

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
