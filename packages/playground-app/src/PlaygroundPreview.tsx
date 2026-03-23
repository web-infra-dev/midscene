import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import { PreviewRenderer } from './PreviewRenderer';

export interface PlaygroundPreviewProps {
  playgroundSDK: PlaygroundSDK;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  serverUrl: string;
  serverOnline: boolean;
  isUserOperating: boolean;
}

export function PlaygroundPreview(props: PlaygroundPreviewProps) {
  return <PreviewRenderer {...props} />;
}
