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

type Translator = (key: string) => string;

export function getDefaultScrcpyWaitingStatusText(t?: Translator): string {
  return t
    ? t('scrcpy.preparingAndroid')
    : 'Preparing Android device connection…';
}

export function getScrcpyDecoderStatusText(t?: Translator): string {
  return t ? t('scrcpy.startingDecoder') : 'Starting video decoder…';
}

export function getScrcpyPreviewStatusText(
  status: ScrcpyPreviewStatus,
  waitingMessage?: string,
  t?: Translator,
): string {
  const fallbackWaiting =
    waitingMessage ?? getDefaultScrcpyWaitingStatusText(t);
  switch (status) {
    case 'connected':
      return t ? t('scrcpy.streamConnected') : 'Live scrcpy preview connected';
    case 'waiting-for-stream':
      return fallbackWaiting;
    case 'error':
      return t ? t('scrcpy.unableToStart') : 'Unable to start scrcpy preview';
    case 'disconnected':
      return t
        ? t('scrcpy.disconnectedRetrying')
        : 'scrcpy preview disconnected, retrying…';
    default:
      return t
        ? t('scrcpy.connecting')
        : 'Connecting to scrcpy preview server…';
  }
}

export function getScrcpyMetadataTimeoutMessage(
  timeoutMs: number = SCRCPY_METADATA_TIMEOUT_MS,
  t?: Translator,
): string {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  if (t) {
    return t('scrcpy.metadataTimeout').replace('{seconds}', String(seconds));
  }
  return `Timed out waiting ${seconds}s for scrcpy video stream metadata.`;
}
