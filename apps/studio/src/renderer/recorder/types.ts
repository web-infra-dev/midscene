import type {
  MidsceneRecorderEvent,
  MidsceneRecorderGeneratedCode,
  MidsceneRecorderTarget,
} from '@midscene/shared/recorder';
import type {
  StudioPlatformId,
  StudioRecorderCodeType,
} from '@shared/electron-contract';

export enum StudioModeTab {
  Record = 'record',
  Replay = 'replay',
  Playground = 'playground',
}

export type StudioMode = StudioModeTab;

export type StudioRecordingStatus =
  | 'idle'
  | 'recording'
  | 'finalizing'
  | 'completed';

export interface StudioRecorderFinalization {
  jobId: string;
  status:
    | 'finalizing'
    | 'completed'
    | 'completed_with_warnings'
    | 'cancelled'
    | 'failed';
  actionHighWaterMark: number;
  accepted: number;
  captured: number;
  degraded: number;
  pending: number;
  described?: number;
  startedAt: number;
  deadlineAt: number;
  completedAt?: number;
  finalLogSequence?: number;
  timings: {
    stopRequestedAt: number;
    queueDrainedAt?: number;
    assetsReleasedAt?: number;
    completedAt?: number;
    durationMs?: number;
    studioStopRequestedAt?: number;
    studioTerminalObservedAt?: number;
    studioCursorReachedAt?: number;
    studioDurationMs?: number;
  };
  reason?: 'deadline_exceeded' | 'cancelled' | 'capture_failed';
  error?: string;
}

export interface StudioRecorderEnrichment {
  status: 'pending' | 'completed' | 'completed_with_warnings';
  pendingDescriptions: number;
  startedAt: number;
  completedAt?: number;
  warningCount?: number;
}

export type StudioRecorderGenerationStepId = 'prepare' | 'metadata' | 'code';
export type StudioRecorderGenerationStepStatus =
  | 'pending'
  | 'loading'
  | 'completed'
  | 'error';

export interface StudioRecorderGenerationProgress {
  step: StudioRecorderGenerationStepId;
  status: StudioRecorderGenerationStepStatus;
  details?: string;
}

export interface StudioRecorderTarget extends MidsceneRecorderTarget {
  platformId: StudioPlatformId;
  deviceId?: string;
  label: string;
}

export interface StudioInterfaceInfo {
  type: string;
  description?: string;
  size?: { width: number; height: number };
  navigationState?: { isLoading: boolean };
  actionTypes?: string[];
}

export interface StudioScreenshotRef {
  screenshot: string;
  timestamp: number;
}

export interface StudioRecordedEvent extends MidsceneRecorderEvent {
  platformId: StudioPlatformId;
  actionType: string;
  rawPayload: Record<string, unknown>;
  target: StudioRecorderTarget;
}

export interface StudioRecordingSession {
  id: string;
  name: string;
  description?: string;
  url?: string;
  status: StudioRecordingStatus;
  target: StudioRecorderTarget;
  events: StudioRecordedEvent[];
  generatedCode?: MidsceneRecorderGeneratedCode;
  metadataGeneratedAt?: number;
  /** Optional AI narrative kept separate from deterministic event facts. */
  metadataDescription?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  stoppedAt?: number;
  finalization?: StudioRecorderFinalization;
  /** Background event descriptions and metadata that do not block Stop. */
  enrichment?: StudioRecorderEnrichment;
}

export interface StudioRecorderState {
  initialized: boolean;
  initializing: boolean;
  sessions: StudioRecordingSession[];
  currentSessionId: string | null;
  isRecording: boolean;
  error: string | null;
}

export interface StudioRecorderContextValue {
  state: StudioRecorderState;
  currentSession: StudioRecordingSession | null;
  currentTarget: StudioRecorderTarget | null;
  canStartRecording: boolean;
  startRecording: () => Promise<StudioRecordingSession | null>;
  stopRecording: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  selectSession: (sessionId: string) => void;
  generateSessionYaml: (
    sessionId: string,
    options?: {
      force?: boolean;
      language?: string;
      onChunk?: (content: string) => void;
      onProgress?: (progress: StudioRecorderGenerationProgress) => void;
    },
  ) => Promise<string>;
  generateSessionCode: (
    sessionId: string,
    options?: {
      type?: StudioRecorderCodeType;
      force?: boolean;
      language?: string;
      onChunk?: (content: string) => void;
      onProgress?: (progress: StudioRecorderGenerationProgress) => void;
    },
  ) => Promise<string>;
  deleteSessionCode: (
    sessionId: string,
    type: StudioRecorderCodeType,
  ) => Promise<void>;
  exportSessionJson: (sessionId: string) => Promise<void>;
  exportSessionYaml: (sessionId: string) => Promise<void>;
  exportSessionCode: (
    sessionId: string,
    type: StudioRecorderCodeType,
  ) => Promise<void>;
  getRecorderScreenshotAssetUrl: (assetId: string) => string | null;
  loadSessionScreenshots: (sessionId: string) => Promise<StudioRecordedEvent[]>;
  exportAllZip: () => Promise<void>;
}
