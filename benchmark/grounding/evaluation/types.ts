import type { ModelFamily } from './location-format.js';
import type { TaskFileData } from './task-types.js';

export type ImageType = 'sd' | 'hd';

export type ReportRunConfig = {
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
    implementation: 'aiLocate' | 'aiAct';
  };
  debug: {
    enableLangSmith: boolean;
  };
};

export type CodeVersionSnapshot = {
  branch: string | null;
  commitHash: string | null;
  dirtyFiles: string[];
  isDirty: boolean;
};

export type ModelConnectivityResult = {
  modelId: string;
  modelAlias: string;
  ok: boolean;
  message: string;
};

export type StoredModelRecord = {
  id: string;
  baseUrl: string;
  apiKey: string;
  name: string;
  alias: string;
  shortName: string;
  logo: string;
  family: ModelFamily;
  apiType?: 'responses';
  providerId: string;
  note: string;
  createdAt: string;
};

export type StoredModelGroupRecord = {
  id: string;
  groupName: string;
  baseUrl?: string;
  apiKey?: string;
  family?: ModelFamily;
  apiType?: 'responses';
  note?: string;
  logo?: string;
  models: Array<{
    id: string;
    name: string;
    displayName: string;
    shortName?: string;
    logo?: string;
    baseUrl?: string;
    apiKey?: string;
    family?: ModelFamily;
    apiType?: 'responses';
    providerId: string;
    note?: string;
    createdAt?: string;
  }>;
};

export type CaseImageRecord = {
  fileName: string;
  imageType: ImageType;
  gtBox: [number, number, number, number] | null;
  expectedOutcome?: 'point' | 'refusal';
};

export type CaseRecord = {
  platform?: 'web' | 'mobile';
  taskClass?: 'basic' | 'functional' | 'reason' | 'refusal';
  sourceName?: string;
  sourceCategory?: string;
  caseName: string;
  prompt: string;
  fallbackPrompt: string;
  note: string;
  tags: string[];
  images: CaseImageRecord[];
};

export type RunTaskFileData = TaskFileData & {
  runConfig?: ReportRunConfig;
  codeVersion?: CodeVersionSnapshot;
  midsceneCodeVersion?: CodeVersionSnapshot;
  connectivity?: {
    checked: boolean;
    results: ModelConnectivityResult[];
  };
  generatedAt?: string;
};
