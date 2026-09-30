export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped';

export type BBox = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

export type Point = {
  x: number;
  y: number;
};

export type BBoxCoordinateSpace = 'model' | 'pixel';

export type ErrorDetail = {
  name?: string;
  message: string;
  stack?: string;
  raw?: string;
};

export type TaskProgress = {
  total: number;
  completed: number;
  currentDescription: string;
};

export type LocationRequestRecord = {
  iterationIndex: number;
  locate: {
    success: boolean;
    rawResponse: string | null;
    parsedBbox: BBox | null;
    parsedBboxCoordinateSpace?: BBoxCoordinateSpace;
    center: { x: number; y: number } | null;
    hitGt: boolean;
    answerCorrect?: boolean;
    expectedOutcome?: 'point' | 'refusal';
    abstained?: boolean;
    error?: string;
    errorDetail?: ErrorDetail;
  };
  durationMs: number;
  error?: string;
  errorDetail?: ErrorDetail;
};

export type ImageLocationRecord = {
  imageName: string;
  imageType: 'sd' | 'hd';
  requests: LocationRequestRecord[];
};

export type CaseLocationRecord = {
  caseName: string;
  promptType: 'primary' | 'fallback';
  images: ImageLocationRecord[];
};

export type ModelLocationRecord = {
  modelId: string;
  modelAlias: string;
  cases: CaseLocationRecord[];
};

export type TaskParams = {
  useDeepLocate: boolean;
  locateImplementation: 'aiLocate' | 'aiAct';
  iterations: number;
  selectedModels: { id: string; alias: string }[];
  useHdImage: boolean;
  useSdImage: boolean;
};

export type TaskFileData = {
  id: string;
  createdAt: string;
  status: TaskStatus;
  params: TaskParams;
  progress?: TaskProgress;
  results?: ModelLocationRecord[];
  error?: string;
  errorDetail?: ErrorDetail;
  completedAt?: string;
};
