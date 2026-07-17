import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
  WebGLVideoFrameRenderer,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import { Alert, Spin, Typography } from 'antd';
import React, {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// Esbuild leaves `.tsx` on the classic JSX transform here (tsconfig sets
// `jsx: preserve`), so JSX in this file compiles to `React.createElement`.
// Keep a runtime reference to React or biome will strip the import as
// type-only, breaking SSR/test renders.
void React;
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import {
  SCRCPY_METADATA_TIMEOUT_MS,
  SCRCPY_STABLE_CONNECTION_MS,
  type ScrcpyPreviewStatus,
  canRecoverScrcpyPreview,
  getDefaultScrcpyWaitingStatusText,
  getScrcpyDecoderStatusText,
  getScrcpyMetadataTimeoutMessage,
  getScrcpyPreviewStatusText,
  getScrcpyRecoveryDelayMs,
  isScrcpyPreviewErrorEvent,
  isScrcpyPreviewStatusEvent,
} from './scrcpy-preview';
import { createScrcpyVideoStream } from './scrcpy-stream';

const { Text } = Typography;
// Studio's live preview is displayed large enough that scrcpy's old 1024px
// The Studio preview is normally rendered around 360x804. A 1600px long edge
// retains roughly 2x display density for portrait devices while avoiding the
// CPU, memory, and transport cost of a full-resolution 32 Mbps stream.
export const SCRCPY_PREVIEW_MAX_SIZE = 1600;
export const SCRCPY_PREVIEW_VIDEO_BIT_RATE = 8_000_000;

export interface ScrcpyErrorOverlayContext {
  errorMessage: string | null;
  retry: () => void;
  status: ScrcpyPreviewStatus;
  statusText: string;
}

export type ScrcpyErrorOverlayRenderer = (
  context: ScrcpyErrorOverlayContext,
) => ReactNode;

interface ScrcpyPanelProps {
  connectingOverlay?: ReactNode;
  deviceId?: string;
  /**
   * Fires when the underlying video stream's intrinsic resolution is
   * known (scrcpy `video-metadata` event), and again with `null` when
   * the stream tears down. Use this as the source of truth for any
   * surrounding aspect-ratio calculations — it always matches the
   * canvas's pixel buffer, unlike `/interface-info.size` which can
   * drift from the actual stream dimensions by a few pixels.
   */
  onIntrinsicSize?: (size: { width: number; height: number } | null) => void;
  onStatusChange?: (status: ScrcpyPreviewStatus, statusText: string) => void;
  renderErrorOverlay?: ScrcpyErrorOverlayRenderer;
  serverUrl?: string;
  metadataTimeoutMs?: number;
  /** @deprecated Recovery now uses a bounded progressive backoff. */
  reconnectInterval?: number;
  viewportStyle?: CSSProperties;
  // Receives the canvas-area wrapper so the device-interaction layer can
  // project pointer coords against the actual stream box, ignoring any
  // surrounding Alert / status chrome.
  contentRef?: React.Ref<HTMLDivElement>;
}

interface VideoMetadata {
  codec?: string;
  width?: number;
  height?: number;
}

export function ScrcpyPanel({
  connectingOverlay,
  deviceId,
  onIntrinsicSize,
  onStatusChange,
  renderErrorOverlay,
  serverUrl,
  metadataTimeoutMs = SCRCPY_METADATA_TIMEOUT_MS,
  viewportStyle,
  contentRef,
}: ScrcpyPanelProps) {
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const decoderRef = useRef<WebCodecsVideoDecoder | null>(null);
  const metadataTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableConnectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const ignoreDisconnectRef = useRef(false);
  const connectionAttemptRef = useRef(0);
  const [status, setStatus] = useState<ScrcpyPreviewStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waitingStatusMessage, setWaitingStatusMessage] = useState<string>(() =>
    getDefaultScrcpyWaitingStatusText(),
  );
  const [webCodecsSupported, setWebCodecsSupported] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);

  const statusText = useMemo(
    () => getScrcpyPreviewStatusText(status, waitingStatusMessage),
    [status, waitingStatusMessage],
  );
  const showCustomErrorOverlay =
    (status === 'error' || status === 'disconnected') &&
    Boolean(renderErrorOverlay);
  const renderResolvedErrorOverlay = renderErrorOverlay;

  const requestRetry = useCallback(() => {
    setStatus('connecting');
    setErrorMessage(null);
    setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
    setRetryNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    onStatusChange?.(status, statusText);
  }, [onStatusChange, status, statusText]);

  const clearCanvas = () => {
    const stage = canvasStageRef.current;
    if (!stage) {
      return;
    }

    stage.replaceChildren();
  };

  const disposeDecoder = () => {
    if (!decoderRef.current) {
      return;
    }

    decoderRef.current.dispose();
    decoderRef.current = null;
  };

  const clearMetadataTimeout = () => {
    if (metadataTimeoutRef.current) {
      clearTimeout(metadataTimeoutRef.current);
      metadataTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (!serverUrl) {
      setStatus('error');
      setErrorMessage('scrcpy preview metadata is missing a server URL.');
      return;
    }

    if (!WebCodecsVideoDecoder.isSupported) {
      setWebCodecsSupported(false);
      setStatus('error');
      setErrorMessage(
        'Current browser does not support WebCodecs, so live scrcpy preview is unavailable.',
      );
      return;
    }

    let disposed = false;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryEpisodeStartedAt = Date.now();
    let attempt = 1;

    const cleanup = () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      clearMetadataTimeout();
      if (stableConnectionTimerRef.current) {
        clearTimeout(stableConnectionTimerRef.current);
        stableConnectionTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      disposeDecoder();
      clearCanvas();
      onIntrinsicSize?.(null);
    };

    const scheduleReconnect = (message: string, recoverable = true) => {
      const nextAttempt = attempt + 1;
      const elapsedMs = Date.now() - recoveryEpisodeStartedAt;
      if (disposed || reconnectTimerRef.current) {
        return;
      }
      if (!canRecoverScrcpyPreview(recoverable, nextAttempt, elapsedMs)) {
        setStatus('error');
        setErrorMessage(message);
        setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
        clearMetadataTimeout();
        if (stableConnectionTimerRef.current) {
          clearTimeout(stableConnectionTimerRef.current);
          stableConnectionTimerRef.current = null;
        }
        ignoreDisconnectRef.current = true;
        socketRef.current?.disconnect();
        socketRef.current = null;
        disposeDecoder();
        clearCanvas();
        onIntrinsicSize?.(null);
        return;
      }

      const delayMs = getScrcpyRecoveryDelayMs(attempt);
      setStatus('recovering');
      setErrorMessage(null);
      setWaitingStatusMessage(
        `Preview interrupted. Recovering (${nextAttempt}/5)…`,
      );
      clearMetadataTimeout();
      if (stableConnectionTimerRef.current) {
        clearTimeout(stableConnectionTimerRef.current);
        stableConnectionTimerRef.current = null;
      }
      ignoreDisconnectRef.current = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      disposeDecoder();
      clearCanvas();
      onIntrinsicSize?.(null);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        cleanup();
        attempt = nextAttempt;
        connect();
      }, delayMs);
    };

    const createDecoder = async (codecId: ScrcpyVideoCodecId) => {
      const renderer = WebGLVideoFrameRenderer.isSupported
        ? new WebGLVideoFrameRenderer()
        : new BitmapVideoFrameRenderer();
      const canvas = renderer.canvas as HTMLCanvasElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.objectFit = 'contain';

      clearCanvas();
      canvasStageRef.current?.appendChild(canvas);

      const decoder = new WebCodecsVideoDecoder({
        codec: codecId,
        renderer,
      });
      return decoder;
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      const attemptId = connectionAttemptRef.current + 1;
      connectionAttemptRef.current = attemptId;
      const isCurrentAttempt = () =>
        !disposed && connectionAttemptRef.current === attemptId;

      ignoreDisconnectRef.current = false;
      setStatus('connecting');
      setErrorMessage(null);
      setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());

      const socket = io(serverUrl, {
        withCredentials: true,
        reconnection: false,
        timeout: 10000,
        transports: ['websocket'],
      });
      socketRef.current = socket;
      const videoStream = createScrcpyVideoStream(socket, {
        onFirstDataPacket: () => {
          if (!isCurrentAttempt() || stableConnectionTimerRef.current) {
            return;
          }
          clearMetadataTimeout();
          setWaitingStatusMessage('Verifying video stream stability…');
          stableConnectionTimerRef.current = setTimeout(() => {
            stableConnectionTimerRef.current = null;
            if (!isCurrentAttempt()) {
              return;
            }
            recoveryEpisodeStartedAt = Date.now();
            attempt = 1;
            setErrorMessage(null);
            setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
            setStatus('connected');
          }, SCRCPY_STABLE_CONNECTION_MS);
        },
      });

      socket.on('connect', () => {
        if (!isCurrentAttempt()) {
          return;
        }
        setStatus('waiting-for-stream');
        setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
        clearMetadataTimeout();
        metadataTimeoutRef.current = setTimeout(() => {
          if (!isCurrentAttempt()) {
            return;
          }

          ignoreDisconnectRef.current = true;
          scheduleReconnect(getScrcpyMetadataTimeoutMessage(metadataTimeoutMs));
        }, metadataTimeoutMs);

        socket.emit('connect-device', {
          ...(typeof deviceId === 'string' && deviceId.trim()
            ? { deviceId: deviceId.trim() }
            : {}),
          maxSize: SCRCPY_PREVIEW_MAX_SIZE,
          videoBitRate: SCRCPY_PREVIEW_VIDEO_BIT_RATE,
        });
      });

      socket.on('preview-status', (event: unknown) => {
        if (!isCurrentAttempt() || !isScrcpyPreviewStatusEvent(event)) {
          return;
        }

        setStatus('waiting-for-stream');
        setWaitingStatusMessage(event.message);
      });

      socket.on('video-metadata', async (metadata: VideoMetadata) => {
        try {
          if (!isCurrentAttempt()) {
            return;
          }
          disposeDecoder();
          setWaitingStatusMessage(getScrcpyDecoderStatusText());
          if (
            typeof metadata.width === 'number' &&
            metadata.width > 0 &&
            typeof metadata.height === 'number' &&
            metadata.height > 0
          ) {
            onIntrinsicSize?.({
              width: metadata.width,
              height: metadata.height,
            });
          }
          const codecId = metadata.codec
            ? (metadata.codec as unknown as ScrcpyVideoCodecId)
            : ScrcpyVideoCodecId.H264;
          const decoder = await createDecoder(codecId);
          decoderRef.current = decoder;

          videoStream.pipeTo(decoder.writable).catch((error: Error) => {
            if (!isCurrentAttempt()) {
              return;
            }
            scheduleReconnect(error.message);
          });

          setStatus('waiting-for-stream');
        } catch (error) {
          if (!isCurrentAttempt()) {
            return;
          }
          scheduleReconnect(
            error instanceof Error ? error.message : 'Failed to start decoder.',
          );
        }
      });

      socket.on('disconnect', () => {
        if (!isCurrentAttempt()) {
          return;
        }
        clearMetadataTimeout();
        if (ignoreDisconnectRef.current) {
          ignoreDisconnectRef.current = false;
          return;
        }
        scheduleReconnect('scrcpy preview disconnected.');
      });

      socket.on('connect_error', (error: Error) => {
        if (!isCurrentAttempt()) {
          return;
        }
        clearMetadataTimeout();
        scheduleReconnect(error.message);
      });

      socket.on('preview-error', (event: unknown) => {
        if (!isCurrentAttempt() || !isScrcpyPreviewErrorEvent(event)) {
          return;
        }
        scheduleReconnect(event.message, event.recoverable);
      });

      socket.on('error', (error: Error) => {
        if (!isCurrentAttempt()) {
          return;
        }
        clearMetadataTimeout();
        scheduleReconnect(error.message);
      });
    };

    // React StrictMode mounts, cleans up, and remounts effects in dev.
    // Defer the real socket connection by a tick so the probe mount is
    // cancelled before it can start a scrcpy session.
    connectTimer = setTimeout(() => {
      connectTimer = null;
      connect();
    }, 0);

    return () => {
      disposed = true;
      cleanup();
    };
  }, [deviceId, metadataTimeoutMs, retryNonce, serverUrl]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {errorMessage && !showCustomErrorOverlay ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={statusText}
          description={errorMessage}
        />
      ) : null}
      <div
        className={[
          'scrcpy-panel-viewport',
          status === 'connected' && 'scrcpy-panel-viewport-connected',
        ]
          .filter(Boolean)
          .join(' ')}
        ref={contentRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111827',
          borderRadius: 8,
          overflow: 'hidden',
          ...viewportStyle,
        }}
      >
        <div
          ref={canvasStageRef}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
        {status !== 'connected' ? (
          showCustomErrorOverlay && renderResolvedErrorOverlay ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1,
              }}
            >
              {renderResolvedErrorOverlay({
                errorMessage,
                retry: requestRetry,
                status,
                statusText,
              })}
            </div>
          ) : status !== 'error' &&
            status !== 'disconnected' &&
            connectingOverlay ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1,
              }}
            >
              {connectingOverlay}
            </div>
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                color: '#fff',
                background: 'rgba(17, 24, 39, 0.78)',
                textAlign: 'center',
                padding: 24,
                zIndex: 1,
              }}
            >
              {status === 'error' ? null : <Spin spinning />}
              <Text style={{ color: '#fff' }}>{statusText}</Text>
              {status === 'error' ? (
                <Text style={{ color: '#d1d5db' }}>
                  Reconnect the preview to try again.
                </Text>
              ) : null}
              {!webCodecsSupported && (
                <Text style={{ color: '#d1d5db' }}>
                  Please use a modern Chromium browser to view the stream.
                </Text>
              )}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
