import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
  WebGLVideoFrameRenderer,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import { Alert, Spin, Typography } from 'antd';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import {
  SCRCPY_METADATA_TIMEOUT_MS,
  type ScrcpyPreviewStatus,
  getDefaultScrcpyWaitingStatusText,
  getScrcpyDecoderStatusText,
  getScrcpyMetadataTimeoutMessage,
  getScrcpyPreviewStatusText,
  isScrcpyPreviewStatusEvent,
} from './scrcpy-preview';
import { createScrcpyVideoStream } from './scrcpy-stream';

const { Text } = Typography;

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
  onStatusChange?: (status: ScrcpyPreviewStatus) => void;
  renderErrorOverlay?: ScrcpyErrorOverlayRenderer;
  serverUrl?: string;
  metadataTimeoutMs?: number;
  reconnectInterval?: number;
}

interface VideoMetadata {
  codec?: string;
  width?: number;
  height?: number;
}

export function ScrcpyPanel({
  connectingOverlay,
  onStatusChange,
  renderErrorOverlay,
  serverUrl,
  metadataTimeoutMs = SCRCPY_METADATA_TIMEOUT_MS,
  reconnectInterval = 3000,
}: ScrcpyPanelProps) {
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const decoderRef = useRef<WebCodecsVideoDecoder | null>(null);
  const metadataTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreDisconnectRef = useRef(false);
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
    onStatusChange?.(status);
  }, [onStatusChange, status]);

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

    const cleanup = () => {
      clearMetadataTimeout();
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
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimerRef.current) {
        return;
      }

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        cleanup();
        connect();
      }, reconnectInterval);
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

      ignoreDisconnectRef.current = false;
      setStatus('connecting');
      setErrorMessage(null);
      setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());

      const socket = io(serverUrl, {
        withCredentials: true,
        reconnection: false,
        timeout: 10000,
      });
      socketRef.current = socket;
      const videoStream = createScrcpyVideoStream(socket);

      socket.on('connect', () => {
        setStatus('waiting-for-stream');
        setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
        clearMetadataTimeout();
        metadataTimeoutRef.current = setTimeout(() => {
          if (disposed) {
            return;
          }

          ignoreDisconnectRef.current = true;
          setStatus('error');
          setErrorMessage(getScrcpyMetadataTimeoutMessage(metadataTimeoutMs));
          setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
          socket.disconnect();
          socketRef.current = null;
          scheduleReconnect();
        }, metadataTimeoutMs);

        socket.emit('connect-device', {
          maxSize: 1024,
        });
      });

      socket.on('preview-status', (event: unknown) => {
        if (disposed || !isScrcpyPreviewStatusEvent(event)) {
          return;
        }

        setStatus('waiting-for-stream');
        setWaitingStatusMessage(event.message);
      });

      socket.on('video-metadata', async (metadata: VideoMetadata) => {
        try {
          clearMetadataTimeout();
          disposeDecoder();
          setWaitingStatusMessage(getScrcpyDecoderStatusText());
          const codecId = metadata.codec
            ? (metadata.codec as unknown as ScrcpyVideoCodecId)
            : ScrcpyVideoCodecId.H264;
          const decoder = await createDecoder(codecId);
          decoderRef.current = decoder;

          videoStream.pipeTo(decoder.writable).catch((error: Error) => {
            if (disposed) {
              return;
            }
            setStatus('error');
            setErrorMessage(error.message);
            scheduleReconnect();
          });

          setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
          setStatus('connected');
        } catch (error) {
          if (disposed) {
            return;
          }
          setStatus('error');
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to start decoder.',
          );
          setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
          scheduleReconnect();
        }
      });

      socket.on('disconnect', () => {
        clearMetadataTimeout();
        if (disposed) {
          return;
        }
        if (ignoreDisconnectRef.current) {
          ignoreDisconnectRef.current = false;
          return;
        }
        setStatus('disconnected');
        setErrorMessage(null);
        setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
        scheduleReconnect();
      });

      socket.on('connect_error', (error: Error) => {
        clearMetadataTimeout();
        if (disposed) {
          return;
        }
        setStatus('error');
        setErrorMessage(error.message);
        setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
        scheduleReconnect();
      });

      socket.on('error', (error: Error) => {
        clearMetadataTimeout();
        if (disposed) {
          return;
        }
        setStatus('error');
        setErrorMessage(error.message);
        setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
        scheduleReconnect();
      });
    };

    connect();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [metadataTimeoutMs, reconnectInterval, retryNonce, serverUrl]);

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
                  Scrcpy preview will retry automatically.
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
