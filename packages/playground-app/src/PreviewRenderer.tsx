import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import {
  ScreenshotViewer,
  type ScreenshotViewerMode,
} from '@midscene/visualizer';
import { WebCodecsVideoDecoder } from '@yume-chan/scrcpy-decoder-webcodecs';
import { Alert, Popover, message } from 'antd';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  DeviceInteractionLayer,
  type DeviceSize,
} from './DeviceInteractionLayer';
import { type ScrcpyErrorOverlayRenderer, ScrcpyPanel } from './ScrcpyPanel';
import { resolvePreviewConnectionInfo } from './runtime-info';
import type { ScrcpyPreviewStatus } from './scrcpy-preview';

interface PreviewRendererProps {
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
  /**
   * When true, the preview accepts mouse/touch input and forwards it to the
   * connected device (Android tap/swipe via ADB, iOS via WDA). Currently
   * supported for Android and iOS only.
   */
  manualControlEnabled?: boolean;
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
  scrcpyViewportStyle,
  screenshotViewerMode,
  playgroundSDK,
  runtimeInfo,
  serverUrl,
  serverOnline,
  isUserOperating,
  manualControlEnabled = false,
}: PreviewRendererProps) {
  const previewConnection = resolvePreviewConnectionInfo(
    runtimeInfo,
    serverUrl,
  );

  const [deviceSize, setDeviceSize] = useState<DeviceSize | null>(null);

  // Pull device size from /screenshot once a session is online so the
  // interaction layer can map display coords to device pixels. Refresh
  // periodically (orientation changes, hot-swapped devices).
  useEffect(() => {
    if (!manualControlEnabled || !serverOnline) {
      setDeviceSize(null);
      return;
    }
    let cancelled = false;
    const fetchSize = async () => {
      const result = await playgroundSDK.getScreenshot();
      if (cancelled) return;
      if (result?.size?.width && result.size.height) {
        setDeviceSize((current) => {
          if (
            current &&
            current.width === result.size!.width &&
            current.height === result.size!.height
          ) {
            return current;
          }
          return { width: result.size!.width, height: result.size!.height };
        });
      }
    };
    fetchSize();
    const timer = setInterval(fetchSize, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [manualControlEnabled, playgroundSDK, serverOnline]);

  const handleTap = useCallback(
    async (point: { x: number; y: number }) => {
      const res = await playgroundSDK.interact({
        actionType: 'Tap',
        x: point.x,
        y: point.y,
      });
      if (!res.ok) {
        message.error(res.error || 'Tap failed');
      }
    },
    [playgroundSDK],
  );

  const handleSwipe = useCallback(
    async (
      start: { x: number; y: number },
      end: { x: number; y: number },
      duration: number,
    ) => {
      const res = await playgroundSDK.interact({
        actionType: 'Swipe',
        x: start.x,
        y: start.y,
        endX: end.x,
        endY: end.y,
        duration,
      });
      if (!res.ok) {
        message.error(res.error || 'Swipe failed');
      }
    },
    [playgroundSDK],
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
          deviceId={previewConnection.deviceId}
          onStatusChange={onScrcpyStatusChange}
          renderErrorOverlay={renderErrorOverlay}
          serverUrl={previewConnection.scrcpyUrl}
          viewportStyle={scrcpyViewportStyle}
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
          mode={screenshotViewerMode}
        />
      )}
      <DeviceInteractionLayer
        enabled={
          manualControlEnabled &&
          serverOnline &&
          previewConnection.type !== 'none'
        }
        deviceSize={deviceSize}
        onTap={handleTap}
        onSwipe={handleSwipe}
      />
    </div>
  );
}
