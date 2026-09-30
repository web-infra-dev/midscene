import type {
  BBox,
  ErrorDetail,
  LocationRequestRecord,
} from '../../../evaluation/task-types.js';
import type {
  CaseRecord,
  RunTaskFileData,
  StoredModelRecord,
} from '../../../evaluation/types.js';

type RequestDetail = {
  iterationIndex: number;
  durationMs: number;
  locate: LocationRequestRecord['locate'];
  locateDisplayBbox: BBox | null;
  error?: string;
  errorDetail?: ErrorDetail;
};

export type ImageDetail = {
  modelId: string;
  modelAlias: string;
  modelFamily: StoredModelRecord['family'] | null;
  caseName: string;
  caseTags: string[];
  promptType: 'primary' | 'fallback';
  imageName: string;
  imageType: 'sd' | 'hd';
  imageRelativePath: string;
  imageWidth: number | null;
  imageHeight: number | null;
  gtBox: [number, number, number, number] | null;
  expectedOutcome?: 'point' | 'refusal';
  requestCount: number;
  plannedRequestCount: number;
  pendingRequestCount: number;
  successCount: number;
  correctCount: number;
  averageDurationMs: number;
  accuracy: number | null;
  overallSuccess: boolean | null;
  requests: RequestDetail[];
};

export type ReportData = {
  title: string;
  scoringMode?: 'legacy' | 'answer';
  task: RunTaskFileData;
  caseCatalog: Array<{
    caseName: string;
    tags: string[];
    prompt: string;
    fallbackPrompt: string;
    note: string;
    platform?: CaseRecord['platform'];
    taskClass?: CaseRecord['taskClass'];
    sourceName?: string;
    sourceCategory?: string;
  }>;
  modelCatalog: Array<{
    modelId: string;
    modelAlias: string;
    shortName: string;
    logo: string;
    logoDataUri?: string;
    family: StoredModelRecord['family'] | null;
  }>;
  modelSummaries: Array<{
    modelId: string;
    modelAlias: string;
    shortName: string;
    logo: string;
    logoDataUri?: string;
    family: StoredModelRecord['family'] | null;
    imageCount: number;
    totalRequests: number;
    pendingRequests: number;
    successCount: number;
    hitCount: number;
    scoreDenominator?: number;
    passedImages: number;
    participatedImages: number;
    averageDurationMs: number;
    p50DurationMs: number;
    p90DurationMs: number;
    p95DurationMs: number;
    maxDurationMs: number;
    requestSuccessCount: number;
    hitRate: number | null;
    requestSuccessRate: number | null;
  }>;
  totals: {
    caseCount: number;
    imageCount: number;
    requestCount: number;
    plannedRequestCount: number;
    pendingRequestCount: number;
    successCount: number;
    requestSuccessCount: number;
    averageDurationMs: number;
  };
  imageDetails: ImageDetail[];
  generatedAt: string;
};

export type ReportImageMetaLoader = (
  imageRelativePath: string,
) => Promise<{ width: number | null; height: number | null }>;

export type ReportCaseCatalogItem = Pick<CaseRecord, 'caseName' | 'tags'>;
