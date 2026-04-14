import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import { ScreenshotViewer } from '@midscene/visualizer';
import { WebCodecsVideoDecoder } from '@yume-chan/scrcpy-decoder-webcodecs';
import { Alert, Popover } from 'antd';
import type { ReactNode } from 'react';
import { type ScrcpyErrorOverlayRenderer, ScrcpyPanel } from './ScrcpyPanel';
import { resolvePreviewConnectionInfo } from './runtime-info';
import type { ScrcpyPreviewStatus } from './scrcpy-preview';

interface PreviewRendererProps {
  connectingOverlay?: ReactNode;
  onScrcpyStatusChange?: (status: ScrcpyPreviewStatus) => void;
  renderErrorOverlay?: ScrcpyErrorOverlayRenderer;
  playgroundSDK: PlaygroundSDK;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  serverUrl: string;
  serverOnline: boolean;
  isUserOperating: boolean;
}

function isNonLocalhostHttp(): boolean {
  try {
    const { protocol, hostname } = window.location;
    if (protocol !== 'http:') return false;
    return (
      hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1'
    );
  } catch {
    return false;
  }
}

export function PreviewRenderer({
  connectingOverlay,
  onScrcpyStatusChange,
  renderErrorOverlay,
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

  // Fall back to screenshot polling when WebCodecs is unavailable
  // (e.g. non-secure context over HTTP with a LAN IP)
  const scrcpyAvailable =
    previewConnection.type === 'scrcpy' && WebCodecsVideoDecoder.isSupported;
  const useScreenshot =
    previewConnection.type === 'screenshot' ||
    (previewConnection.type === 'scrcpy' && !scrcpyAvailable);

  // Show a hint when scrcpy is expected but WebCodecs is unavailable due to insecure context
  const showInsecureContextHint =
    previewConnection.type === 'scrcpy' &&
    !WebCodecsVideoDecoder.isSupported &&
    isNonLocalhostHttp();

  return (
    <div
      style={{ flex: 1, minHeight: 0, height: '100%', position: 'relative' }}
    >
      {showInsecureContextHint && (
        <Popover
          content={
            <div style={{ maxWidth: 360 }}>
              <p style={{ margin: '0 0 8px' }}>
                Live scrcpy streaming is unavailable because WebCodecs API is
                disabled in non-secure (HTTP) contexts with non-localhost
                addresses.
              </p>
              <p style={{ margin: '0 0 8px' }}>
                Currently using screenshot polling as fallback. To enable scrcpy
                streaming:
              </p>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>
                  Open{' '}
                  <code>
                    chrome://flags/#unsafely-treat-insecure-origin-as-secure
                  </code>
                </li>
                <li>
                  Add <code>{window.location.origin}</code>
                </li>
                <li>
                  Set to <b>Enabled</b> and relaunch Chrome
                </li>
              </ol>
            </div>
          }
          title="Screenshot polling mode"
          trigger="click"
          placement="bottomRight"
        >
          <button
            type="button"
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              background: '#faad14',
              border: 'none',
              borderRadius: '50%',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <span
              style={{
                color: '#fff',
                fontSize: 14,
                fontWeight: 'bold',
                lineHeight: 1,
              }}
            >
              !
            </span>
          </button>
        </Popover>
      )}
      {previewConnection.type === 'none' ? (
        <Alert
          type="warning"
          showIcon
          message="Preview unavailable"
          description="This session did not expose a preview capability in runtime metadata."
        />
      ) : scrcpyAvailable ? (
        <ScrcpyPanel
          connectingOverlay={connectingOverlay}
          onStatusChange={onScrcpyStatusChange}
          renderErrorOverlay={renderErrorOverlay}
          serverUrl={previewConnection.scrcpyUrl}
        />
      ) : (
        <ScreenshotViewer
          getScreenshot={() =>
            useScreenshot
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
