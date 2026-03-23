import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import { ScreenshotViewer } from '@midscene/visualizer';
import { Alert } from 'antd';
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
  const usesScreenshotPolling =
    previewConnection.type === 'screenshot' ||
    previewConnection.type === 'scrcpy';

  return (
    <div>
      {previewConnection.type === 'scrcpy' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Live scrcpy preview metadata detected"
          description="The unified playground shell is using screenshot fallback for scrcpy-backed sessions."
        />
      )}
      {previewConnection.type === 'none' ? (
        <Alert
          type="warning"
          showIcon
          message="Preview unavailable"
          description="This session did not expose a preview capability in runtime metadata."
        />
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
