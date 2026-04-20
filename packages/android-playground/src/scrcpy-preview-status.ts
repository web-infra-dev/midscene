export type ScrcpyPreviewPhase =
  | 'connecting-device'
  | 'pushing-server'
  | 'starting-service'
  | 'waiting-for-video';

export interface ScrcpyPreviewStatusEvent {
  phase: ScrcpyPreviewPhase;
  message: string;
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
