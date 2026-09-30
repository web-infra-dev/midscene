import type {
  CaseRecord,
  CodeVersionSnapshot,
  ImageType,
  StoredModelRecord,
} from '../types.js';

export type MidsceneLocateImplementation = 'aiLocate' | 'aiAct';

export type MidsceneRunConfig = {
  meta: {
    title: string;
    objective: string;
    note: string;
  };
  selection: {
    modelIds: string[];
    caseNames: string[];
    excludeCaseNames: string[];
    imageTypes: ImageType[];
    promptSource: 'primary' | 'fallback';
  };
  execution: {
    iterations: number;
    providerConcurrency: number;
    runId: string;
  };
  locate: {
    useDeepLocate: boolean;
    implementation: MidsceneLocateImplementation;
    aiActDeepThink: boolean;
  };
  modelConfig: {
    reasoningEnabled?: boolean;
  };
  debug: {
    enableLangSmith: boolean;
  };
};

export type MidsceneEvaluationPlanItem = {
  id: string;
  model: StoredModelRecord;
  caseRecord: CaseRecord;
  caseName: string;
  prompt: string;
  promptType: 'primary' | 'fallback';
  imageType: ImageType;
  imageFileName: string;
  screenshotPath: string;
  gtBox: [number, number, number, number] | null;
  expectedOutcome: 'point' | 'refusal';
  iteration: number;
  deepLocate: boolean;
  locateImplementation: MidsceneLocateImplementation;
};

export type MidsceneEvaluationPlan = {
  config: MidsceneRunConfig;
  items: MidsceneEvaluationPlanItem[];
  selectedModels: StoredModelRecord[];
  selectedCases: CaseRecord[];
};

export type MidsceneLocateResult = {
  raw: unknown;
  bbox?: [number, number, number, number] | null;
  center?: [number, number] | null;
  outcome?: 'located' | 'not-found';
};

export type MidsceneErrorRaw = {
  error: string;
  name?: string;
  rawResponse?: string | null;
  rawChoiceMessage?: unknown;
  formatResponse?: string | null;
  searchAreaRawResponse?: string | null;
  searchAreaRawChoiceMessage?: unknown;
  searchArea?: unknown;
};

export type MidsceneEvaluationResultItem = {
  planItemId: string;
  modelId: string;
  modelAlias: string;
  caseName: string;
  promptType: 'primary' | 'fallback';
  imageType: ImageType;
  imageFileName: string;
  iteration: number;
  deepLocate: boolean;
  locateImplementation: MidsceneLocateImplementation;
  finished: boolean;
  hitGt: boolean;
  answerCorrect?: boolean;
  expectedOutcome?: 'point' | 'refusal';
  durationMs: number;
  locateResult?: MidsceneLocateResult;
  error?: string;
};

export type MidsceneRunState = {
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  meta: MidsceneRunConfig['meta'];
  selection: {
    modelIds: string[];
    caseNames: string[];
    imageTypes: ImageType[];
    promptSource: 'primary' | 'fallback';
  };
  execution: MidsceneRunConfig['execution'];
  locate: MidsceneRunConfig['locate'];
  modelConfig: MidsceneRunConfig['modelConfig'];
  debug: MidsceneRunConfig['debug'];
  progress: {
    total: number;
    completed: number;
    currentDescription: string;
  };
  outcomes?: {
    success: number;
    failed: number;
    pending: number;
  };
  artifacts: {
    runConfigJson: string;
    stateJson: string;
    resultsJson: string;
    reportHtml?: string;
    midsceneDiff?: string;
  };
  error?: string;
};

export type MidsceneResultsModelRecord = Pick<
  StoredModelRecord,
  'id' | 'alias' | 'shortName' | 'logo' | 'family' | 'providerId'
> & {
  logoDataUri?: string;
  modelConfig: {
    MIDSCENE_MODEL_NAME: string;
    MIDSCENE_MODEL_BASE_URL: string;
    MIDSCENE_MODEL_FAMILY: string;
    MIDSCENE_MODEL_API_TYPE?: string;
    MIDSCENE_MODEL_REASONING_ENABLED?: string;
  };
};

export type MidsceneResultsCaseRecord = Pick<
  CaseRecord,
  | 'caseName'
  | 'note'
  | 'tags'
  | 'prompt'
  | 'fallbackPrompt'
  | 'platform'
  | 'taskClass'
  | 'sourceName'
  | 'sourceCategory'
> & {
  images: Array<{
    fileName: string;
    imageType: ImageType;
    gtBox: [number, number, number, number] | null;
    expectedOutcome?: 'point' | 'refusal';
    imageRelativePath: string;
  }>;
};

export type MidsceneResultsFileData = {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  completedAt: string | null;
  status: MidsceneRunState['status'];
  error: string | null;
  meta: MidsceneRunConfig['meta'];
  config: MidsceneRunConfig;
  progress: MidsceneRunState['progress'];
  outcomes: NonNullable<MidsceneRunState['outcomes']>;
  generatedAt: string;
  versions: {
    grounding: CodeVersionSnapshot;
    midscene: CodeVersionSnapshot;
  };
  midsceneRepo: {
    repoPath: string;
    action:
      | 'cloned'
      | 'updated'
      | 'existing'
      | 'ready'
      | 'skipped-update'
      | 'npm';
    commitHash: string | null;
    dirtyFiles: string[];
    diffAgainstMain?: string | null;
  };
  midsceneSource?: {
    type: 'repo' | 'npm';
    moduleEntryFile: string;
    repoPath?: string;
    packageName?: string;
    version?: string;
    packageSpec?: string;
    registry?: string | null;
    installDir?: string;
  };
  models: MidsceneResultsModelRecord[];
  cases: MidsceneResultsCaseRecord[];
  items: MidsceneEvaluationResultItem[];
};
