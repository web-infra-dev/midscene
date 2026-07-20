import type {
  MidsceneRecorderEvent,
  MidsceneRecorderGeneratedCode,
  MidsceneRecorderTarget,
} from '@midscene/shared/recorder';
import type {
  StudioPlatformId,
  StudioRecorderCodeType,
} from '@shared/electron-contract';
import type {
  ModelEgressDescriptor,
  SessionEvidenceBundle,
  UIKnowledgeArtifact,
  UIKnowledgeEgressDecision,
} from '@shared/ui-knowledge-contract';

export enum StudioModeTab {
  Record = 'record',
  Replay = 'replay',
  Playground = 'playground',
}

export type StudioMode = StudioModeTab;

export type StudioRecordingStatus = 'idle' | 'recording' | 'completed';
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
  /** Missing on sessions created before UI knowledge generation shipped. */
  actionTypeOrigin?: 'recorded' | 'fallback';
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
  /** Missing legacy values are normalized to 0 when read from storage. */
  evidenceRevision?: number;
  generatedCode?: MidsceneRecorderGeneratedCode;
  generatedKnowledge?: UIKnowledgeArtifact;
  metadataGeneratedAt?: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  stoppedAt?: number;
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
  generateSessionKnowledge: (
    sessionId: string,
    options?: {
      force?: boolean;
      confirmEgress?: (
        descriptor: ModelEgressDescriptor,
        evidenceBundle: SessionEvidenceBundle,
      ) => Promise<UIKnowledgeEgressDecision>;
    },
  ) => Promise<UIKnowledgeArtifact | null>;
  exportSessionJson: (sessionId: string) => Promise<void>;
  exportSessionYaml: (sessionId: string) => Promise<void>;
  exportSessionCode: (
    sessionId: string,
    type: StudioRecorderCodeType,
  ) => Promise<void>;
  getRecorderScreenshotAssetUrl: (assetId: string) => string | null;
  loadSessionScreenshots: (sessionId: string) => Promise<StudioRecordedEvent[]>;
  exportSessionKnowledge: (
    sessionId: string,
    format: 'markdown' | 'json',
  ) => Promise<void>;
  exportAllZip: () => Promise<void>;
}
