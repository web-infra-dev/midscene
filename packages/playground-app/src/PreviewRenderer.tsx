import { useT } from '@midscene/i18n';
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
  /**
   * When true, the preview accepts mouse/touch input and forwards it to the
   * connected device (Android via ADB, iOS via WDA, Harmony via HDC).
   */
  manualControlEnabled?: boolean;
  manualDragActionType?: ManualDragActionType;
  manualKeyboardEnabled?: boolean;
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
  manualDragActionType = 'Swipe',
  manualKeyboardEnabled = false,
}: PreviewRendererProps) {
  const t = useT();
  const previewConnection = resolvePreviewConnectionInfo(
    runtimeInfo,
    serverUrl,
  );

  const [deviceSize, setDeviceSize] = useState<DeviceSize | null>(null);
  const manualControlQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueueManualControl = useCallback(
    <TResult,>(task: () => Promise<TResult>): Promise<TResult> => {
      const nextTask = manualControlQueueRef.current.then(task, task);
      manualControlQueueRef.current = nextTask.catch(() => undefined);
      return nextTask;
    },
    [],
  );

  // Pull device size from lightweight interface metadata so the interaction
  // layer can map display coords to device pixels. Refresh periodically
  // (orientation changes, hot-swapped devices).
  useEffect(() => {
    if (!manualControlEnabled || !serverOnline) {
      setDeviceSize(null);
      return;
    }
    let cancelled = false;
    const fetchSize = async () => {
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
    };
    fetchSize();
    const timer = setInterval(fetchSize, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [manualControlEnabled, playgroundSDK, serverOnline]);

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
        showManualControlError(t('preview.tapFailed'), res.error);
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
        showManualControlError(t('preview.inputFailed'), res.error);
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
        showManualControlError(t('preview.keyboardPressFailed'), res.error);
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
                {t('preview.webCodecsHttpDisabled')}
              </p>
              <p style={{ margin: '0 0 8px' }}>
                {t('preview.pollingFallback')}
              </p>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>
                  {t('preview.instructionOpen')}{' '}
                  <code>
                    chrome://flags/#unsafely-treat-insecure-origin-as-secure
                  </code>
                </li>
                <li>
                  {t('preview.instructionAdd')}{' '}
                  <code>{window.location.origin}</code>
                </li>
                <li>
                  {t('preview.instructionSetTo')}{' '}
                  <b>{t('preview.instructionEnabled')}</b>{' '}
                  {t('preview.instructionRelaunch')}
                </li>
              </ol>
            </div>
          }
          title={t('preview.pollingTitle')}
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
          message={t('preview.unavailableTitle')}
          description={t('preview.unavailableDescription')}
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
