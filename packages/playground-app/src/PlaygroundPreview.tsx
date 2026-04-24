import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import type { ScreenshotViewerMode } from '@midscene/visualizer';
import type { CSSProperties, ReactNode } from 'react';
import { PreviewRenderer } from './PreviewRenderer';
import type { ScrcpyErrorOverlayRenderer } from './ScrcpyPanel';
import type { ScrcpyPreviewStatus } from './scrcpy-preview';

export interface PlaygroundPreviewProps {
  connectingOverlay?: ReactNode;
  onScrcpyStatusChange?: (
    status: ScrcpyPreviewStatus,
    statusText: string,
  ) => void;
  renderErrorOverlay?: ScrcpyErrorOverlayRenderer;
  scrcpyViewportStyle?: CSSProperties;
  screenshotViewerMode?: ScreenshotViewerMode;
  playgroundSDK: PlaygroundSDK;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  serverUrl: string;
  serverOnline: boolean;
  isUserOperating: boolean;
}

export function PlaygroundPreview(props: PlaygroundPreviewProps) {
  return <PreviewRenderer {...props} />;
}
