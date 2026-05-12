import { SCRCPY_PREVIEW_METADATA_TIMEOUT_MS } from '@midscene/shared/constants';

export const SCRCPY_METADATA_TIMEOUT_MS = SCRCPY_PREVIEW_METADATA_TIMEOUT_MS;

export type ScrcpyPreviewStatus =
  | 'connecting'
  | 'waiting-for-stream'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface ScrcpyPreviewStatusEvent {
  message: string;
  phase?: string;
}

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
  return `Timed out waiting ${seconds}s for scrcpy video stream metadata.`;
}
