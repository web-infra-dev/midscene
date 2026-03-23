import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import { ScreenshotViewer } from '@midscene/visualizer';
import { Alert } from 'antd';
import { ScrcpyPanel } from './ScrcpyPanel';
import { resolvePreviewConnectionInfo } from './runtime-info';

interface PreviewRendererProps {
  playgroundSDK: PlaygroundSDK;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  serverUrl: string;
  serverOnline: boolean;
  isUserOperating: boolean;
}

export function PreviewRenderer({
  playgroundSDK,
  runtimeInfo,
  serverUrl,
  serverOnline,
  isUserOperating,
}: PreviewRendererProps) {
  const previewConnection = resolvePreviewConnectionInfo(
    runtimeInfo,
    serverUrl,
  );
  const usesScreenshotPolling = previewConnection.type === 'screenshot';

  return (
    <div>
      {previewConnection.type === 'none' ? (
        <Alert
          type="warning"
          showIcon
          message="Preview unavailable"
          description="This session did not expose a preview capability in runtime metadata."
        />
      ) : previewConnection.type === 'scrcpy' ? (
        <ScrcpyPanel serverUrl={previewConnection.scrcpyUrl} />
      ) : (
        <ScreenshotViewer
          getScreenshot={() =>
            usesScreenshotPolling
              ? playgroundSDK.getScreenshot()
              : Promise.resolve(null)
          }
          getInterfaceInfo={() => playgroundSDK.getInterfaceInfo()}
          serverOnline={serverOnline}
          isUserOperating={isUserOperating}
          mjpegUrl={previewConnection.mjpegUrl}
        />
      )}
    </div>
  );
}
