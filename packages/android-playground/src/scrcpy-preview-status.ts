export type ScrcpyPreviewPhase =
  | 'connecting-device'
  | 'pushing-server'
  | 'starting-service'
  | 'waiting-for-video';

export interface ScrcpyPreviewStatusEvent {
  phase: ScrcpyPreviewPhase;
  message: string;
}

export type ScrcpyPreviewErrorReason =
  | 'adb-unavailable'
  | 'process-exited'
  | 'startup-timeout'
  | 'stream-ended'
  | 'stream-read-failed'
  | 'unknown';

export interface ScrcpyPreviewErrorEvent {
  message: string;
  reason: ScrcpyPreviewErrorReason;
  recoverable: boolean;
  sessionId: string;
}

export function buildScrcpyPreviewErrorEvent(
  reason: ScrcpyPreviewErrorReason,
  sessionId: string,
  message: string,
): ScrcpyPreviewErrorEvent {
  return {
    reason,
    sessionId,
    message,
    recoverable:
      reason === 'process-exited' ||
      reason === 'startup-timeout' ||
      reason === 'stream-ended' ||
      reason === 'stream-read-failed',
  };
}

export function getScrcpyPreviewStatusMessage(
  phase: ScrcpyPreviewPhase,
): string {
  switch (phase) {
    case 'connecting-device':
      return 'Preparing Android device connection…';
    case 'pushing-server':
      return 'Uploading scrcpy runtime to device…';
    case 'starting-service':
      return 'Starting scrcpy service…';
    case 'waiting-for-video':
      return 'Waiting for first video frame…';
  }
}

export function buildScrcpyPreviewStatusEvent(
  phase: ScrcpyPreviewPhase,
): ScrcpyPreviewStatusEvent {
  return {
    phase,
    message: getScrcpyPreviewStatusMessage(phase),
  };
}
