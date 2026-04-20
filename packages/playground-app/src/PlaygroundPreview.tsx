import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import type { ReactNode } from 'react';
import { PreviewRenderer } from './PreviewRenderer';
import type { ScrcpyErrorOverlayRenderer } from './ScrcpyPanel';
import type { ScrcpyPreviewStatus } from './scrcpy-preview';

export interface PlaygroundPreviewProps {
  connectingOverlay?: ReactNode;
  onScrcpyStatusChange?: (status: ScrcpyPreviewStatus) => void;
  renderErrorOverlay?: ScrcpyErrorOverlayRenderer;
  playgroundSDK: PlaygroundSDK;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  serverUrl: string;
  serverOnline: boolean;
  isUserOperating: boolean;
}

export function PlaygroundPreview(props: PlaygroundPreviewProps) {
  return <PreviewRenderer {...props} />;
}
