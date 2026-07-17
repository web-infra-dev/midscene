import { SCRCPY_PREVIEW_METADATA_TIMEOUT_MS } from '@midscene/shared/constants';

export const SCRCPY_METADATA_TIMEOUT_MS = SCRCPY_PREVIEW_METADATA_TIMEOUT_MS;

export type ScrcpyPreviewStatus =
  | 'connecting'
  | 'waiting-for-stream'
  | 'recovering'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface ScrcpyPreviewStatusEvent {
  message: string;
  phase?: string;
}

export interface ScrcpyPreviewErrorEvent {
  message: string;
  reason: string;
  recoverable: boolean;
  sessionId: string;
}

export const SCRCPY_RECOVERY_MAX_ATTEMPTS = 5;
export const SCRCPY_RECOVERY_MAX_ELAPSED_MS = 15_000;
export const SCRCPY_STABLE_CONNECTION_MS = 2_000;
const SCRCPY_RECOVERY_DELAYS_MS = [1_000, 2_000, 3_000, 3_000] as const;

export function isScrcpyPreviewStatusEvent(
  value: unknown,
): value is ScrcpyPreviewStatusEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

export function isScrcpyPreviewErrorEvent(
  value: unknown,
): value is ScrcpyPreviewErrorEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const event = value as Partial<ScrcpyPreviewErrorEvent>;
  return (
    typeof event.message === 'string' &&
    typeof event.reason === 'string' &&
    typeof event.recoverable === 'boolean' &&
    typeof event.sessionId === 'string'
  );
}

export function getScrcpyRecoveryDelayMs(attempt: number): number {
  const delayIndex = Math.max(
    0,
    Math.min(attempt - 1, SCRCPY_RECOVERY_DELAYS_MS.length - 1),
  );
  return SCRCPY_RECOVERY_DELAYS_MS[delayIndex];
}

export function canRecoverScrcpyPreview(
  recoverable: boolean,
  nextAttempt: number,
  elapsedMs: number,
): boolean {
  return (
    recoverable &&
    nextAttempt <= SCRCPY_RECOVERY_MAX_ATTEMPTS &&
    elapsedMs < SCRCPY_RECOVERY_MAX_ELAPSED_MS
  );
}

export function getDefaultScrcpyWaitingStatusText(): string {
  return 'Preparing Android device connection…';
}

export function getScrcpyDecoderStatusText(): string {
  return 'Starting video decoder…';
}

export function getScrcpyPreviewStatusText(
  status: ScrcpyPreviewStatus,
  waitingMessage: string = getDefaultScrcpyWaitingStatusText(),
): string {
  switch (status) {
    case 'connected':
      return 'Live scrcpy preview connected';
    case 'waiting-for-stream':
      return waitingMessage;
    case 'recovering':
      return waitingMessage;
    case 'error':
      return 'Unable to start scrcpy preview';
    case 'disconnected':
      return 'scrcpy preview disconnected, retrying…';
    default:
      return 'Connecting to scrcpy preview server…';
  }
}

export function getScrcpyMetadataTimeoutMessage(
  timeoutMs: number = SCRCPY_METADATA_TIMEOUT_MS,
): string {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `Timed out waiting ${seconds}s for scrcpy video stream data.`;
}
