import type { Agent } from '@midscene/core/agent';
import type {
  MidsceneRecorderEvent,
  MidsceneRecorderEventType,
  MidsceneRecorderSourceKind,
} from '@midscene/shared/recorder';
import type { LaunchPlaygroundOptions } from './launcher';
import type { AgentFactory } from './types';

export type PlaygroundPreviewKind =
  | 'none'
  | 'screenshot'
  | 'mjpeg'
  | 'scrcpy'
  | 'custom';

export interface PlaygroundPreviewCapability {
  kind: PlaygroundPreviewKind;
  label?: string;
  live?: boolean;
}

export interface PlaygroundPreviewDescriptor {
  kind: PlaygroundPreviewKind;
  title?: string;
  capabilities?: PlaygroundPreviewCapability[];
  screenshotPath?: string;
  mjpegPath?: string;
  custom?: Record<string, unknown>;
}

export interface PlaygroundSessionTarget {
  id: string;
  label: string;
  description?: string;
  status?: string;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PlaygroundSessionFieldOption {
  label: string;
  value: string | number | boolean;
  description?: string;
}

export interface PlaygroundPlatformRegistration {
  id: string;
  label: string;
  description?: string;
  unavailableReason?: string;
  supportsStandalone?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PlaygroundPlatformSelectorConfig {
  fieldKey: string;
  variant?: 'cards' | 'select';
}

export interface PlaygroundSessionField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: PlaygroundSessionFieldOption[];
  placeholder?: string;
  description?: string;
}

export interface PlaygroundSessionNotice {
  type: 'info' | 'warning' | 'error';
  message: string;
  description?: string;
}

export interface PlaygroundSessionSetup {
  title?: string;
  description?: string;
  primaryActionLabel?: string;
  autoSubmitWhenReady?: boolean;
  fields: PlaygroundSessionField[];
  targets?: PlaygroundSessionTarget[];
  platformRegistry?: PlaygroundPlatformRegistration[];
  platformSelector?: PlaygroundPlatformSelectorConfig;
  notice?: PlaygroundSessionNotice;
}

export interface PlaygroundExecutionHooks {
  beforeExecute?: () => void | Promise<void>;
  afterExecute?: () => void | Promise<void>;
}

export interface PlaygroundSidecar {
  id: string;
  start(): void | Promise<void>;
  stop?(): void | Promise<void>;
}

export type PlaygroundRecorderSourceKind = MidsceneRecorderSourceKind;

export type PlaygroundRecorderEventType = MidsceneRecorderEventType;

export type PlaygroundRecorderEvent = MidsceneRecorderEvent;

export interface PlaygroundRecorderCapabilitiesResult {
  supported: boolean;
  source: PlaygroundRecorderSourceKind;
  platformId?: string;
  error?: string;
}

export interface PlaygroundRecorderStartResult {
  ok: boolean;
  supported?: boolean;
  source?: PlaygroundRecorderSourceKind;
  platformId?: string;
  error?: string;
}

export interface PlaygroundRecorderEventsResult {
  events: PlaygroundRecorderEvent[];
  nextIndex: number;
}

export interface PlaygroundRecorderDescribeTrace {
  traceId: string;
  eventHashId?: string;
  eventType?: string;
  actionType?: string;
  eventSummary?: {
    hashId?: string;
    mergedHashIds?: string[];
    type?: string;
    source?: string;
    actionType?: string;
    timestamp?: number;
    url?: string;
    title?: string;
    valueLength?: number;
    rawPayloadSummary?: Record<string, unknown>;
    elementRect?: {
      left?: number;
      top?: number;
      width?: number;
      height?: number;
      x?: number;
      y?: number;
    };
    pageInfo?: { width: number; height: number };
  };
  status: 'ready' | 'failed' | 'skipped';
  error?: string;
  startedAt: string;
  durationMs: number;
  modelCallDurationMs?: number;
  point?: [number, number];
  pageInfo?: { width: number; height: number };
  screenshotBytes?: number;
  screenshotRef?: {
    path: string;
    sha256: string;
    bytes: number;
    mimeType?: string;
  };
  annotatedScreenshotRef?: {
    path: string;
    sha256: string;
    bytes: number;
    mimeType?: string;
  };
  screenshotAnnotation?: {
    inputPoint?: {
      logical: [number, number];
      screenshot: [number, number];
    };
    sourceTargetRect?: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
    locateRect?: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
    centerDelta?: {
      x: number;
      y: number;
      distance: number;
    };
    distanceOutsideRect?: {
      x: number;
      y: number;
      distance: number;
    };
  };
  screenshotPersistError?: string;
  annotatedScreenshotPersistError?: string;
  elementDescription?: string;
  verifyPassed?: boolean;
  centerDistance?: number;
  verifyResult?: {
    pass?: boolean;
    rect?: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
    center?: [number, number];
    centerDistance?: number;
    rectPadding?: number;
    includedInRect?: boolean;
    includedInPaddedRect?: boolean;
  };
}

export interface PlaygroundRecorderDescribeResult {
  ok: boolean;
  event?: PlaygroundRecorderEvent;
  trace?: PlaygroundRecorderDescribeTrace;
  error?: string;
}

export interface PlaygroundSessionState {
  connected: boolean;
  displayName?: string;
  metadata?: Record<string, unknown>;
  setupState?: 'required' | 'ready' | 'blocked';
  setupBlockingReason?: string;
}

export interface PlaygroundCreatedSession {
  agent?: Agent;
  agentFactory?: AgentFactory;
  preview?: PlaygroundPreviewDescriptor;
  metadata?: Record<string, unknown>;
  displayName?: string;
  platformId?: string;
  title?: string;
  platformDescription?: string;
  executionHooks?: PlaygroundExecutionHooks;
  sidecars?: PlaygroundSidecar[];
}

export interface PlaygroundSessionManager {
  getSetupSchema?(
    input?: Record<string, unknown>,
  ): Promise<PlaygroundSessionSetup>;
  listTargets?(): Promise<PlaygroundSessionTarget[]>;
  createSession(
    input?: Record<string, unknown>,
  ): Promise<PlaygroundCreatedSession>;
  destroySession?(session?: PlaygroundSessionState): Promise<void>;
}

export interface PreparedPlaygroundPlatform {
  platformId: string;
  title: string;
  description?: string;
  agent?: Agent;
  agentFactory?: AgentFactory;
  sessionManager?: PlaygroundSessionManager;
  executionHooks?: PlaygroundExecutionHooks;
  launchOptions?: LaunchPlaygroundOptions;
  preview?: PlaygroundPreviewDescriptor;
  metadata?: Record<string, unknown>;
  sidecars?: PlaygroundSidecar[];
}

export interface PlaygroundPlatformDescriptor<TOptions = void> {
  id: string;
  title: string;
  description?: string;
  prepare(options: TOptions): Promise<PreparedPlaygroundPlatform>;
}

export function definePlaygroundPlatform<TOptions>(
  descriptor: PlaygroundPlatformDescriptor<TOptions>,
): PlaygroundPlatformDescriptor<TOptions> {
  return descriptor;
}

export function createScreenshotPreviewDescriptor(
  overrides: Partial<PlaygroundPreviewDescriptor> = {},
): PlaygroundPreviewDescriptor {
  return {
    kind: 'screenshot',
    screenshotPath: '/screenshot',
    capabilities: [
      {
        kind: 'screenshot',
        label: 'Screenshot polling',
        live: false,
      },
    ],
    ...overrides,
  };
}

export function createMjpegPreviewDescriptor(
  overrides: Partial<PlaygroundPreviewDescriptor> = {},
): PlaygroundPreviewDescriptor {
  return {
    kind: 'mjpeg',
    screenshotPath: '/screenshot',
    mjpegPath: '/mjpeg',
    capabilities: [
      {
        kind: 'mjpeg',
        label: 'MJPEG streaming',
        live: true,
      },
      {
        kind: 'screenshot',
        label: 'Screenshot fallback',
        live: false,
      },
    ],
    ...overrides,
  };
}

export function createScrcpyPreviewDescriptor(
  custom: Record<string, unknown> = {},
  overrides: Partial<PlaygroundPreviewDescriptor> = {},
): PlaygroundPreviewDescriptor {
  return {
    kind: 'scrcpy',
    screenshotPath: '/screenshot',
    capabilities: [
      {
        kind: 'scrcpy',
        label: 'scrcpy streaming',
        live: true,
      },
      {
        kind: 'screenshot',
        label: 'Screenshot fallback',
        live: false,
      },
    ],
    custom,
    ...overrides,
  };
}

export function resolvePreparedLaunchOptions(
  prepared: PreparedPlaygroundPlatform,
  overrides: LaunchPlaygroundOptions = {},
): LaunchPlaygroundOptions {
  return {
    ...(prepared.launchOptions || {}),
    ...overrides,
  };
}
