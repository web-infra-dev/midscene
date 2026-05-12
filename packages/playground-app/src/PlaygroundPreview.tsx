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
  /**
   * Fires whenever the connected device's intrinsic screen size becomes
   * available (initial mount) or changes (orientation flip / device
   * swap). Consumers can use it to drive their own viewport sizing so
   * the preview chrome tightly hugs the canvas without letterboxing.
   */
  onDeviceSizeChange?: (size: { width: number; height: number } | null) => void;
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
