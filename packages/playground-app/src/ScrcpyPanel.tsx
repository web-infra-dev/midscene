import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
  WebGLVideoFrameRenderer,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import { Alert, Card, Spin, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

const { Text } = Typography;

interface ScrcpyPanelProps {
  serverUrl?: string;
  reconnectInterval?: number;
}

interface VideoMetadata {
  codec?: string;
  width?: number;
  height?: number;
}

export function ScrcpyPanel({
  serverUrl,
  reconnectInterval = 3000,
}: ScrcpyPanelProps) {
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const decoderRef = useRef<WebCodecsVideoDecoder | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [screenInfo, setScreenInfo] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [webCodecsSupported, setWebCodecsSupported] = useState(true);

  const statusText = useMemo(() => {
    switch (status) {
      case 'connected':
        return 'Live scrcpy preview connected';
      case 'error':
        return 'Unable to start scrcpy preview';
      case 'disconnected':
        return 'scrcpy preview disconnected, retrying…';
      default:
        return 'Connecting to scrcpy preview…';
    }
  }, [status]);

  const clearCanvas = () => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) {
      return;
    }

    while (wrapper.firstChild) {
      wrapper.removeChild(wrapper.firstChild);
    }
  };

  const disposeDecoder = () => {
    if (!decoderRef.current) {
      return;
    }

    decoderRef.current.dispose();
    decoderRef.current = null;
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
      canvasWrapperRef.current?.appendChild(canvas);

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

    const setupVideoStream = () => {
      let configurationPacketSent = false;
      let pendingDataPackets: Array<{
        type: string;
        data: Uint8Array;
        timestamp: number;
      }> = [];

      const transformStream = new TransformStream({
        transform(chunk: any, controller: TransformStreamDefaultController) {
          const packet = {
            type: chunk.type,
            data: new Uint8Array(chunk.data),
            timestamp: chunk.timestamp,
          };

          if (packet.type === 'configuration') {
            configurationPacketSent = true;
            controller.enqueue(packet);
            pendingDataPackets.forEach((queuedPacket) =>
              controller.enqueue(queuedPacket),
            );
            pendingDataPackets = [];
            return;
          }

          if (packet.type === 'data' && !configurationPacketSent) {
            pendingDataPackets.push(packet);
            return;
          }

          controller.enqueue(packet);
        },
      });

      const readable = new ReadableStream({
        start(controller) {
          const handleVideoData = (data: any) => {
            try {
              controller.enqueue(data);
            } catch (error) {
              controller.error(error);
            }
          };

          const handleDisconnect = () => controller.close();
          const handleError = (error: Error) => controller.error(error);

          socketRef.current?.on('video-data', handleVideoData);
          socketRef.current?.on('disconnect', handleDisconnect);
          socketRef.current?.on('error', handleError);

          return () => {
            socketRef.current?.off('video-data', handleVideoData);
            socketRef.current?.off('disconnect', handleDisconnect);
            socketRef.current?.off('error', handleError);
          };
        },
      });

      return readable.pipeThrough(transformStream);
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      setStatus('connecting');
      setErrorMessage(null);
      setScreenInfo(null);

      const socket = io(serverUrl, {
        withCredentials: true,
        reconnection: false,
        timeout: 10000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('connect-device', {
          maxSize: 1024,
        });
      });

      socket.on('video-metadata', async (metadata: VideoMetadata) => {
        try {
          disposeDecoder();
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

          setupVideoStream()
            .pipeTo(decoder.writable)
            .catch((error: Error) => {
              if (disposed) {
                return;
              }
              setStatus('error');
              setErrorMessage(error.message);
              scheduleReconnect();
            });

          setStatus('connected');
        } catch (error) {
          if (disposed) {
            return;
          }
          setStatus('error');
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to start decoder.',
          );
          scheduleReconnect();
        }
      });

      socket.on('disconnect', () => {
        if (disposed) {
          return;
        }
        setStatus('disconnected');
        scheduleReconnect();
      });

      socket.on('connect_error', (error: Error) => {
        if (disposed) {
          return;
        }
        setStatus('error');
        setErrorMessage(error.message);
        scheduleReconnect();
      });

      socket.on('error', (error: Error) => {
        if (disposed) {
          return;
        }
        setStatus('error');
        setErrorMessage(error.message);
        scheduleReconnect();
      });
    };

    connect();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [reconnectInterval, serverUrl]);

  return (
    <Card
      size="small"
      title="Live scrcpy preview"
      extra={
        screenInfo ? (
          <Text type="secondary">
            {screenInfo.width} × {screenInfo.height}
          </Text>
        ) : null
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
      ) : (
        <Alert
          type={status === 'connected' ? 'success' : 'info'}
          showIcon
          style={{ marginBottom: 12 }}
          message={statusText}
          description="scrcpy sessions now render directly in the unified playground shell."
        />
      )}
      <div
        ref={canvasWrapperRef}
        style={{
          position: 'relative',
          minHeight: 360,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111827',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
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
            }}
          >
            <Spin spinning />
            <Text style={{ color: '#fff' }}>{statusText}</Text>
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
