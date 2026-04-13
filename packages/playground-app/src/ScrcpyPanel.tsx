import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
  WebGLVideoFrameRenderer,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import { Alert, Button, Card, Space, Spin, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface ScrcpyPanelProps {
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
  serverUrl,
  metadataTimeoutMs = SCRCPY_METADATA_TIMEOUT_MS,
  reconnectInterval = 3000,
}: ScrcpyPanelProps) {
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const decoderRef = useRef<WebCodecsVideoDecoder | null>(null);
  const metadataTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(() => void) | null>(null);
  const disconnectRef = useRef<(() => void) | null>(null);
  const manuallyDisconnectedRef = useRef(false);
  const ignoreDisconnectRef = useRef(false);
  const [status, setStatus] = useState<ScrcpyPreviewStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waitingStatusMessage, setWaitingStatusMessage] = useState<string>(() =>
    getDefaultScrcpyWaitingStatusText(),
  );
  const [screenInfo, setScreenInfo] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [webCodecsSupported, setWebCodecsSupported] = useState(true);

  const statusText = useMemo(
    () => getScrcpyPreviewStatusText(status, waitingStatusMessage),
    [status, waitingStatusMessage],
  );

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

  const handleConnect = useCallback(() => {
    manuallyDisconnectedRef.current = false;
    connectRef.current?.();
  }, []);

  const handleDisconnect = useCallback(() => {
    manuallyDisconnectedRef.current = true;
    disconnectRef.current?.();
  }, []);

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
      if (
        disposed ||
        reconnectTimerRef.current ||
        manuallyDisconnectedRef.current
      ) {
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
      decoder.sizeChanged(
        ({ width, height }: { width: number; height: number }) => {
          setScreenInfo({ width, height });
        },
      );
      return decoder;
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      manuallyDisconnectedRef.current = false;
      ignoreDisconnectRef.current = false;
      setStatus('connecting');
      setErrorMessage(null);
      setScreenInfo(null);
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
          if (disposed || manuallyDisconnectedRef.current) {
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
          if (metadata.width && metadata.height) {
            setScreenInfo({
              width: metadata.width,
              height: metadata.height,
            });
          }

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

    const disconnect = () => {
      cleanup();
      setStatus('disconnected');
      setErrorMessage(null);
      setScreenInfo(null);
      setWaitingStatusMessage(getDefaultScrcpyWaitingStatusText());
    };

    connectRef.current = connect;
    disconnectRef.current = disconnect;

    connect();

    return () => {
      disposed = true;
      connectRef.current = null;
      disconnectRef.current = null;
      cleanup();
    };
  }, [metadataTimeoutMs, reconnectInterval, serverUrl]);

  return (
    <Card
      size="small"
      title="Live scrcpy preview"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{
        body: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        },
      }}
      extra={
        <Space size="small">
          {screenInfo ? (
            <Text type="secondary">
              {screenInfo.width} × {screenInfo.height}
            </Text>
          ) : null}
          {status === 'connected' ? (
            <Button size="small" onClick={handleDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              loading={
                status === 'connecting' || status === 'waiting-for-stream'
              }
              onClick={handleConnect}
            >
              Connect
            </Button>
          )}
        </Space>
      }
    >
      {errorMessage ? (
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
        {status !== 'connected' && (
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
        )}
      </div>
    </Card>
  );
}
