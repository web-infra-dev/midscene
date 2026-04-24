import type { PlaygroundRuntimeInfo } from '@midscene/playground';

export type StudioPreviewConnectionState =
  | 'connecting'
  | 'waiting-for-stream'
  | 'connected'
  | 'disconnected'
  | 'error'
  | null;

export function shouldPauseDiscoveryPollingDuringPreview({
  previewStatus,
  runtimeInfo,
  sessionConnected,
  sessionMutating,
}: {
  previewStatus: StudioPreviewConnectionState;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  sessionConnected: boolean;
  sessionMutating: boolean;
}): boolean {
  if (sessionMutating) {
    return true;
  }

  if (!sessionConnected) {
    return false;
  }

  if (runtimeInfo?.preview.kind !== 'scrcpy') {
    return false;
  }

  return (
    previewStatus !== 'connected' &&
    previewStatus !== 'disconnected' &&
    previewStatus !== 'error'
  );
}
