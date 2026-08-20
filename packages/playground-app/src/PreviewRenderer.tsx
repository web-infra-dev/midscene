import type {
  PlaygroundInteractPayload,
  PlaygroundRecorderBeforeFrame,
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import { PREVIEW_TEXT_INPUT_BATCH_DELAY_MS } from '@midscene/shared/constants';
import {
  ScreenshotViewer,
  type ScreenshotViewerMode,
} from '@midscene/visualizer';
import { WebCodecsVideoDecoder } from '@yume-chan/scrcpy-decoder-webcodecs';
import { Alert, App as AntdApp, Popover } from 'antd';
import React, {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DeviceInteractionLayer,
  type DeviceSize,
} from './DeviceInteractionLayer';
import { type ScrcpyErrorOverlayRenderer, ScrcpyPanel } from './ScrcpyPanel';
import {
  type ManualControlCoordinator,
  createManualControlCoordinator,
  isManualControlFrozenError,
} from './manual-control-coordinator';
import {
  type ManualDragActionType,
  buildManualDragInteractPayload,
  buildManualScrollInteractPayload,
} from './manual-interaction';
import {
  type ScrcpyFrameCapture,
  type ScrcpyFrameCaptureResult,
  type ScrcpyFrameObservation,
  captureRecorderBeforeFrameFromScrcpy,
  waitForScrcpyFrameAfter,
} from './recorder-before-frame';
import { resolvePreviewConnectionInfo } from './runtime-info';
import type { ScrcpyPreviewStatus } from './scrcpy-preview';

interface PreviewRendererProps {
  connectingOverlay?: ReactNode;
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
  manualControlCoordinator?: ManualControlCoordinator;
  manualInteractionEnabled?: boolean;
  recorderBeforeFrameEnabled?: boolean;
}

interface RecorderPreviewInteractionBoundary {
  interactionCompletedAt: number;
  videoSequenceAtDispatch: number;
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
  onDeviceSizeChange,
  onScrcpyStatusChange,
  renderErrorOverlay,
  scrcpyViewportStyle,
  screenshotViewerMode,
  playgroundSDK,
  runtimeInfo,
  serverUrl,
  serverOnline,
  isUserOperating,
  manualControlCoordinator,
  manualInteractionEnabled = true,
  recorderBeforeFrameEnabled = false,
}: PreviewRendererProps) {
  const { message } = AntdApp.useApp();
  const previewConnection = resolvePreviewConnectionInfo(
    runtimeInfo,
    serverUrl,
  );

  const [deviceSize, setDeviceSize] = useState<DeviceSize | null>(null);
  // Pixel dimensions reported by the scrcpy video-metadata event. This is
  // the canvas's actual pixel buffer size — the authoritative source for
  // any aspect-ratio calculation, since `/interface-info` can drift from
  // the real stream resolution by a few pixels.
  const [streamSize, setStreamSize] = useState<DeviceSize | null>(null);
  const [actionTypes, setActionTypes] = useState<string[] | null>(null);
  const [scrcpyStatus, setScrcpyStatus] =
    useState<ScrcpyPreviewStatus>('connecting');
  const localManualControlCoordinator = useMemo(
    () => createManualControlCoordinator(),
    [],
  );
  const resolvedManualControlCoordinator =
    manualControlCoordinator ?? localManualControlCoordinator;
  const pendingTextInputRef = useRef('');
  const pendingTextInputPointRef = useRef<{ x: number; y: number } | null>(
    null,
  );
  const textInputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textInputFlushPromiseRef = useRef<Promise<void> | null>(null);
  // Shared with the active preview component (ScrcpyPanel / ScreenshotViewer)
  // and the interaction layer so pointer coords always project against the
  // real screen-mirror box, not the outer panel that may include chrome.
  const previewContentRef = useRef<HTMLDivElement>(null);
  const latestScrcpyFrameRef = useRef<ScrcpyFrameObservation>({
    sequence: 0,
    receivedAt: 0,
  });
  const scrcpyFrameCaptureRef = useRef<ScrcpyFrameCapture | null>(null);
  const scrcpyFrameCaptureInFlightRef = useRef<Promise<
    ScrcpyFrameCaptureResult | undefined
  > | null>(null);
  const previousRecorderInteractionRef =
    useRef<RecorderPreviewInteractionBoundary>();
  // Default to `screen-only` so the playground does not render chrome
  // (header / Refresh / timestamp) inside the same relative-positioned panel
  // that DeviceInteractionLayer overlays — embedding hosts (Studio) can opt
  // back into the full viewer by passing 'default'.
  const resolvedScreenshotViewerMode: ScreenshotViewerMode =
    screenshotViewerMode ?? 'screen-only';

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
  const manualScrollEnabled = actionTypes?.includes('Scroll') ?? false;

  const enqueueManualControl = useCallback(
    <TResult,>(task: () => Promise<TResult>): Promise<TResult> => {
      return resolvedManualControlCoordinator.enqueue(task);
    },
    [resolvedManualControlCoordinator],
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

  // Notify consumers when the connected device's intrinsic size changes —
  // they can use it to size the surrounding chrome to the actual screen
  // aspect (instead of a hardcoded 9:19.5 assumption that leaves
  // letterboxing on most modern phones).
  //
  // Prefer the scrcpy stream's own pixel buffer dimensions over
  // `/interface-info.size` when both are available. The canvas inside
  // ScrcpyPanel sizes itself to the stream buffer, so any aspect-ratio
  // derived from `/interface-info` can be off by a handful of pixels
  // (the visible "white edge" inside the rounded device border).
  useEffect(() => {
    onDeviceSizeChange?.(streamSize ?? deviceSize);
  }, [deviceSize, onDeviceSizeChange, streamSize]);

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
  const previewInteractionEnabled =
    previewConnection.type !== 'none' &&
    (!scrcpyAvailable || scrcpyStatus === 'connected');

  // A recording toggle does not change the scrcpy stream. Keep the latest
  // frame and causal boundary across that toggle so the first action can use
  // the frame already visible in Preview. Reset only when the stream identity
  // itself changes.
  useEffect(() => {
    latestScrcpyFrameRef.current = { sequence: 0, receivedAt: 0 };
    previousRecorderInteractionRef.current = undefined;
  }, [previewConnection.deviceId, previewConnection.type]);

  const handleScrcpyFrameAvailable = useCallback((receivedAt: number) => {
    latestScrcpyFrameRef.current = {
      sequence: latestScrcpyFrameRef.current.sequence + 1,
      receivedAt,
    };
  }, []);

  const handleScrcpyFrameCaptureChange = useCallback(
    (capture: ScrcpyFrameCapture | null) => {
      scrcpyFrameCaptureRef.current = capture;
    },
    [],
  );

  const interactWithRecorderBeforeFrame = useCallback(
    async (payload: PlaygroundInteractPayload) => {
      const shouldCapturePreviewFrame =
        recorderBeforeFrameEnabled && scrcpyAvailable;
      let recorderBeforeFrame: PlaygroundRecorderBeforeFrame | undefined;

      if (shouldCapturePreviewFrame) {
        const previousBoundary = previousRecorderInteractionRef.current;
        let latestFrame = latestScrcpyFrameRef.current;
        let frameIsEligible = latestFrame.sequence > 0;

        if (frameIsEligible && previousBoundary) {
          const observedAfterPreviousAction =
            latestFrame.sequence > previousBoundary.videoSequenceAtDispatch &&
            latestFrame.receivedAt >= previousBoundary.interactionCompletedAt;
          if (!observedAfterPreviousAction) {
            // A slow Android encoder can exceed any wall-clock grace period.
            // Require an observed frame instead of guessing that the cached
            // frame is current; a missing image is safer than a mismatched one.
            const observedFrame = await waitForScrcpyFrameAfter(
              () => latestScrcpyFrameRef.current,
              previousBoundary.videoSequenceAtDispatch,
              previousBoundary.interactionCompletedAt,
            );
            latestFrame = observedFrame ?? latestScrcpyFrameRef.current;
            frameIsEligible = Boolean(observedFrame);
          }
        }

        const captureFrame = scrcpyFrameCaptureRef.current;
        if (
          frameIsEligible &&
          captureFrame &&
          !scrcpyFrameCaptureInFlightRef.current
        ) {
          const capture = captureFrame();
          scrcpyFrameCaptureInFlightRef.current = capture;
          const clearCapture = () => {
            if (scrcpyFrameCaptureInFlightRef.current === capture) {
              scrcpyFrameCaptureInFlightRef.current = null;
            }
          };
          void capture.then(clearCapture, clearCapture);
          recorderBeforeFrame =
            await captureRecorderBeforeFrameFromScrcpy(capture);
        }
      }

      const videoSequenceAtDispatch = latestScrcpyFrameRef.current.sequence;
      const result = await playgroundSDK.interact({
        ...payload,
        ...(recorderBeforeFrame ? { recorderBeforeFrame } : {}),
      });
      if (shouldCapturePreviewFrame && result.ok) {
        previousRecorderInteractionRef.current = {
          interactionCompletedAt: Date.now(),
          videoSequenceAtDispatch,
        };
      } else if (shouldCapturePreviewFrame) {
        previousRecorderInteractionRef.current = undefined;
      }
      return result;
    },
    [playgroundSDK, recorderBeforeFrameEnabled, scrcpyAvailable],
  );

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

  const clearTextInputTimer = useCallback(() => {
    if (textInputTimerRef.current) {
      clearTimeout(textInputTimerRef.current);
      textInputTimerRef.current = null;
    }
  }, []);

  const takePendingTextInputTask = useCallback(() => {
    clearTextInputTimer();

    const text = pendingTextInputRef.current;
    const point = pendingTextInputPointRef.current;
    if (!text) {
      return null;
    }

    pendingTextInputRef.current = '';
    pendingTextInputPointRef.current = null;
    return async () => {
      const res = await interactWithRecorderBeforeFrame({
        actionType: 'Input',
        value: text,
        mode: 'typeOnly',
        ...(point ? { x: point.x, y: point.y } : {}),
      });
      if (!res.ok) {
        showManualControlError('Input failed', res.error);
      }
    };
  }, [
    clearTextInputTimer,
    interactWithRecorderBeforeFrame,
    showManualControlError,
  ]);

  const flushPendingTextInput = useCallback((): Promise<void> => {
    const task = takePendingTextInputTask();
    if (!task) {
      return textInputFlushPromiseRef.current ?? Promise.resolve();
    }

    const flushPromise = enqueueManualControl(task).catch((error) => {
      if (!isManualControlFrozenError(error)) {
        throw error;
      }
    });
    const trackedFlushPromise = flushPromise.finally(() => {
      if (textInputFlushPromiseRef.current === trackedFlushPromise) {
        textInputFlushPromiseRef.current = null;
      }
    });

    textInputFlushPromiseRef.current = trackedFlushPromise;
    return textInputFlushPromiseRef.current;
  }, [enqueueManualControl, takePendingTextInputTask]);

  useEffect(
    () =>
      resolvedManualControlCoordinator.registerPendingTaskSource(
        takePendingTextInputTask,
      ),
    [resolvedManualControlCoordinator, takePendingTextInputTask],
  );

  const runManualControl = useCallback(
    async <TResult extends { ok: boolean; error?: string }>(
      fallback: string,
      task: () => Promise<TResult>,
    ) => {
      try {
        const res = await enqueueManualControl(task);
        if (!res.ok) {
          showManualControlError(fallback, res.error);
        }
      } catch (error) {
        if (!isManualControlFrozenError(error)) {
          showManualControlError(
            fallback,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    },
    [enqueueManualControl, showManualControlError],
  );

  const handleTap = useCallback(
    (point: { x: number; y: number }) => {
      void flushPendingTextInput();
      return runManualControl('Tap failed', () =>
        interactWithRecorderBeforeFrame({
          actionType: 'Tap',
          x: point.x,
          y: point.y,
        }),
      );
    },
    [flushPendingTextInput, interactWithRecorderBeforeFrame, runManualControl],
  );

  const handleSwipe = useCallback(
    (
      start: { x: number; y: number },
      end: { x: number; y: number },
      duration: number,
    ) => {
      void flushPendingTextInput();
      return runManualControl(`${manualDragActionType} failed`, () =>
        interactWithRecorderBeforeFrame(
          buildManualDragInteractPayload(
            manualDragActionType,
            start,
            end,
            duration,
          ),
        ),
      );
    },
    [
      flushPendingTextInput,
      manualDragActionType,
      interactWithRecorderBeforeFrame,
      runManualControl,
    ],
  );

  const handleTextInput = useCallback(
    (text: string, point?: { x: number; y: number }) => {
      if (!text || resolvedManualControlCoordinator.isFrozen()) return;
      pendingTextInputRef.current += text;
      if (point) {
        pendingTextInputPointRef.current = point;
      }
      clearTextInputTimer();
      textInputTimerRef.current = setTimeout(() => {
        void flushPendingTextInput();
      }, PREVIEW_TEXT_INPUT_BATCH_DELAY_MS);
    },
    [
      clearTextInputTimer,
      flushPendingTextInput,
      resolvedManualControlCoordinator,
    ],
  );

  useEffect(() => {
    if (serverOnline && previewInteractionEnabled && manualKeyboardEnabled) {
      return;
    }
    clearTextInputTimer();
    pendingTextInputRef.current = '';
    pendingTextInputPointRef.current = null;
  }, [
    clearTextInputTimer,
    manualKeyboardEnabled,
    previewInteractionEnabled,
    serverOnline,
  ]);

  useEffect(() => {
    return () => {
      if (
        serverOnline &&
        previewInteractionEnabled &&
        manualKeyboardEnabled &&
        pendingTextInputRef.current
      ) {
        void flushPendingTextInput();
        return;
      }
      clearTextInputTimer();
      pendingTextInputPointRef.current = null;
    };
  }, [
    clearTextInputTimer,
    flushPendingTextInput,
    manualKeyboardEnabled,
    previewConnection.type,
    previewInteractionEnabled,
    runtimeInfo,
    serverOnline,
    serverUrl,
  ]);

  const handleKeyboardPress = useCallback(
    (keyName: string) => {
      if (!keyName) return;
      void flushPendingTextInput();
      return runManualControl('Keyboard press failed', () =>
        interactWithRecorderBeforeFrame({
          actionType: 'KeyboardPress',
          keyName,
        }),
      );
    },
    [flushPendingTextInput, interactWithRecorderBeforeFrame, runManualControl],
  );

  const handleWheelScroll = useCallback(
    (
      point: { x: number; y: number },
      delta: { deltaX: number; deltaY: number },
    ) => {
      void flushPendingTextInput();
      return runManualControl('Scroll failed', () =>
        interactWithRecorderBeforeFrame(
          buildManualScrollInteractPayload(point, delta),
        ),
      );
    },
    [flushPendingTextInput, interactWithRecorderBeforeFrame, runManualControl],
  );

  const handleScrcpyStatusChange = useCallback(
    (status: ScrcpyPreviewStatus, statusText: string) => {
      setScrcpyStatus(status);
      onScrcpyStatusChange?.(status, statusText);
    },
    [onScrcpyStatusChange],
  );

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
          onFrameAvailable={handleScrcpyFrameAvailable}
          onFrameCaptureChange={handleScrcpyFrameCaptureChange}
          onIntrinsicSize={setStreamSize}
          onStatusChange={handleScrcpyStatusChange}
          renderErrorOverlay={renderErrorOverlay}
          serverUrl={previewConnection.scrcpyUrl}
          viewportStyle={scrcpyViewportStyle}
          contentRef={previewContentRef}
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
          mode={resolvedScreenshotViewerMode}
          contentRef={previewContentRef}
        />
      )}
      <DeviceInteractionLayer
        enabled={
          manualInteractionEnabled &&
          manualControlEnabled &&
          serverOnline &&
          previewInteractionEnabled
        }
        deviceSize={deviceSize}
        contentRef={previewContentRef}
        onTap={handleTap}
        onSwipe={handleSwipe}
        scrollEnabled={manualScrollEnabled}
        onWheelScroll={handleWheelScroll}
        keyboardEnabled={manualKeyboardEnabled}
        onTextInput={handleTextInput}
        onKeyboardPress={handleKeyboardPress}
      />
    </div>
  );
}
