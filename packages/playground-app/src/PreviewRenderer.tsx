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
import React, {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  DeviceInteractionLayer,
  type DeviceSize,
} from './DeviceInteractionLayer';
import { type ScrcpyErrorOverlayRenderer, ScrcpyPanel } from './ScrcpyPanel';
import {
  type ManualDragActionType,
  buildManualDragInteractPayload,
} from './manual-interaction';
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
}: PreviewRendererProps) {
  const previewConnection = resolvePreviewConnectionInfo(
    runtimeInfo,
    serverUrl,
  );

  const [deviceSize, setDeviceSize] = useState<DeviceSize | null>(null);
  const [actionTypes, setActionTypes] = useState<string[] | null>(null);
  const manualControlQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  // Self-derive interaction capabilities from the connected device's
  // actionSpace. Tap is the gate for any pointer interaction; the drag
  // flavor follows whichever name the device exposes (mobile devices ship
  // both, Computer/Web only ship DragAndDrop). Keyboard injection rides on
  // KeyboardPress / Input. If any device omits Tap, the interaction layer
  // stays disabled — defense in depth, since /interact would 404 anyway.
  const manualControlEnabled = actionTypes?.includes('Tap') ?? false;
  const manualDragActionType: ManualDragActionType = actionTypes?.includes(
    'Swipe',
  )
    ? 'Swipe'
    : 'DragAndDrop';
  const manualKeyboardEnabled =
    actionTypes?.includes('KeyboardPress') ||
    actionTypes?.includes('Input') ||
    false;

  const enqueueManualControl = useCallback(
    <TResult,>(task: () => Promise<TResult>): Promise<TResult> => {
      const nextTask = manualControlQueueRef.current.then(task, task);
      manualControlQueueRef.current = nextTask.catch(() => undefined);
      return nextTask;
    },
    [],
  );

  // Pull device size and actionSpace from /interface-info so the interaction
  // layer can map display coords to device pixels and decide which
  // pointer/keyboard actions to forward. Refresh periodically (orientation
  // changes, hot-swapped devices, dynamically reconfigured action sets).
  useEffect(() => {
    if (!serverOnline) {
      setDeviceSize(null);
      setActionTypes(null);
      return;
    }
    let cancelled = false;
    const fetchInterfaceInfo = async () => {
      let result: Awaited<ReturnType<typeof playgroundSDK.getInterfaceInfo>>;
      try {
        result = await playgroundSDK.getInterfaceInfo();
      } catch {
        return;
      }
      if (cancelled) return;
      if (result?.size?.width && result.size.height) {
        const { size } = result;
        setDeviceSize((current) => {
          if (
            current &&
            current.width === size.width &&
            current.height === size.height
          ) {
            return current;
          }
          return { width: size.width, height: size.height };
        });
      }
      const nextActionTypes = Array.isArray(result?.actionTypes)
        ? result.actionTypes
        : null;
      setActionTypes((current) => {
        if (current === null && nextActionTypes === null) return current;
        if (
          current &&
          nextActionTypes &&
          current.length === nextActionTypes.length &&
          current.every((name, idx) => name === nextActionTypes[idx])
        ) {
          return current;
        }
        return nextActionTypes;
      });
    };
    fetchInterfaceInfo();
    const timer = setInterval(fetchInterfaceInfo, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [playgroundSDK, serverOnline]);

  const showManualControlError = useCallback(
    (fallback: string, error?: string) => {
      message.open({
        type: 'error',
        content: error || fallback,
        key: 'manual-control-error',
      });
    },
    [],
  );

  const handleTap = useCallback(
    async (point: { x: number; y: number }) => {
      const res = await enqueueManualControl(() =>
        playgroundSDK.interact({
          actionType: 'Tap',
          x: point.x,
          y: point.y,
        }),
      );
      if (!res.ok) {
        showManualControlError('Tap failed', res.error);
      }
    },
    [enqueueManualControl, playgroundSDK, showManualControlError],
  );

  const handleSwipe = useCallback(
    async (
      start: { x: number; y: number },
      end: { x: number; y: number },
      duration: number,
    ) => {
      const res = await enqueueManualControl(() =>
        playgroundSDK.interact(
          buildManualDragInteractPayload(
            manualDragActionType,
            start,
            end,
            duration,
          ),
        ),
      );
      if (!res.ok) {
        showManualControlError(`${manualDragActionType} failed`, res.error);
      }
    },
    [
      enqueueManualControl,
      manualDragActionType,
      playgroundSDK,
      showManualControlError,
    ],
  );

  const handleTextInput = useCallback(
    async (text: string) => {
      if (!text) return;
      const res = await enqueueManualControl(() =>
        playgroundSDK.interact({
          actionType: 'Input',
          value: text,
          mode: 'typeOnly',
        }),
      );
      if (!res.ok) {
        showManualControlError('Input failed', res.error);
      }
    },
    [enqueueManualControl, playgroundSDK, showManualControlError],
  );

  const handleKeyboardPress = useCallback(
    async (keyName: string) => {
      if (!keyName) return;
      const res = await enqueueManualControl(() =>
        playgroundSDK.interact({
          actionType: 'KeyboardPress',
          keyName,
        }),
      );
      if (!res.ok) {
        showManualControlError('Keyboard press failed', res.error);
      }
    },
    [enqueueManualControl, playgroundSDK, showManualControlError],
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
        keyboardEnabled={manualKeyboardEnabled}
        onTextInput={handleTextInput}
        onKeyboardPress={handleKeyboardPress}
      />
    </div>
  );
}
