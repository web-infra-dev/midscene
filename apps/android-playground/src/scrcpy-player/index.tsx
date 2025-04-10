import { PictureOutlined } from '@ant-design/icons';
import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import { WebCodecsVideoDecoder } from '@yume-chan/scrcpy-decoder-webcodecs';
import {
  BitmapVideoFrameRenderer,
  WebGLVideoFrameRenderer,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import { Button, Card, Col, Row, Typography, message } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import './index.less';

const { Text } = Typography;

interface ScrcpyProps {
  serverUrl?: string;
  maxSize?: number;
  autoConnect?: boolean;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  onConnectionStatusChange?: (status: boolean) => void;
}

interface VideoMetadata {
  codec?: string;
  width?: number;
  height?: number;
  [key: string]: any;
}

export const ScrcpyPlayer: React.FC<ScrcpyProps> = ({
  serverUrl,
  maxSize = 1024,
  autoConnect = true,
  autoReconnect = true,
  reconnectInterval = 5000,
  onConnectionStatusChange,
}) => {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [screenInfo, setScreenInfo] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [prevAutoConnect, setPrevAutoConnect] = useState(autoConnect);

  const socketRef = useRef<Socket | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const videoElementRef = useRef<HTMLCanvasElement | null>(null);
  const decoderRef = useRef<any>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const metadataTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // create and initialize renderer
  const createVideoFrameRenderer = async () => {
    // use WebGL renderer first, if not supported, fallback to Bitmap renderer
    if (WebGLVideoFrameRenderer.isSupported) {
      const renderer = new WebGLVideoFrameRenderer();
      return {
        renderer,
        // type assertion, handle the type mismatch problem between HTMLCanvasElement and OffscreenCanvas
        element: renderer.canvas as HTMLCanvasElement,
      };
    }

    const renderer = new BitmapVideoFrameRenderer();
    return {
      renderer,
      element: renderer.canvas as HTMLCanvasElement,
    };
  };

  // create and initialize decoder
  const createDecoder = async (codecId: ScrcpyVideoCodecId) => {
    // check if WebCodecs API is supported
    if (!WebCodecsVideoDecoder.isSupported) {
      throw new Error(
        'Current browser does not support WebCodecs API, please use the latest version of Chrome/Edge browser',
      );
    }

    // create renderer
    const { renderer, element } = await createVideoFrameRenderer();
    videoElementRef.current = element;

    // apply video element styles
    if (videoElementRef.current) {
      videoElementRef.current.style.maxWidth = '100%';
      videoElementRef.current.style.border = '1px solid #ddd';
      videoElementRef.current.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';
      videoElementRef.current.style.height = '500px';
    }

    // add video element to page
    if (videoContainerRef.current && videoElementRef.current) {
      videoContainerRef.current.innerHTML = '';
      videoContainerRef.current.appendChild(videoElementRef.current);
    }

    // create decoder
    return new WebCodecsVideoDecoder({
      codec: codecId,
      renderer: renderer,
    });
  };

  // setup video stream processing
  const setupVideoStream = (metadata: VideoMetadata) => {
    // for tracking if the configuration frame has been received
    let configurationPacketSent = false;
    let pendingDataPackets: any[] = [];

    // create transform stream to convert data to Uint8Array
    const transformStream = new TransformStream({
      transform(chunk: any, controller: any) {
        // convert array to Uint8Array
        const packet = {
          type: chunk.type,
          data: new Uint8Array(chunk.data),
          timestamp: chunk.timestamp,
        };

        // for configuration frame, we should handle it first
        if (packet.type === 'configuration') {
          controller.enqueue(packet);
          configurationPacketSent = true;

          // after sending the configuration frame, send all pending data frames
          if (pendingDataPackets.length > 0) {
            pendingDataPackets.forEach((p) => controller.enqueue(p));
            pendingDataPackets = [];
          }
        } else if (packet.type === 'data') {
          // if the configuration frame has not been received, cache the data frame
          if (!configurationPacketSent) {
            pendingDataPackets.push(packet);
          } else {
            controller.enqueue(packet);
          }
        } else {
          // other types of frames are passed directly
          controller.enqueue(packet);
        }
      },
    });

    // create a readable stream to receive video data from the server
    const videoStream = new ReadableStream({
      start(controller) {
        // for tracking if the stream has been closed
        let streamClosed = false;

        // receive video data
        const videoDataHandler = (data: any) => {
          // check if the stream has been closed
          if (streamClosed) return;

          try {
            controller.enqueue(data);
          } catch (error) {
            console.error('error occurred while enqueuing video data:', error);
            // if an error occurs, mark the stream as closed and clean up
            streamClosed = true;
            cleanupHandlers();
          }
        };

        // handle error
        const errorHandler = (error: any) => {
          console.error('stream error:', error);
          if (!streamClosed) {
            controller.error(new Error(error.message));
            streamClosed = true;
            cleanupHandlers();
          }
        };

        // handle disconnection
        const disconnectHandler = () => {
          console.log('disconnected from server, closing stream');
          if (!streamClosed) {
            controller.close();
            streamClosed = true;
            cleanupHandlers();
          }
        };

        // clean up all event handlers
        const cleanupHandlers = () => {
          if (socketRef.current) {
            socketRef.current.off('video-data', videoDataHandler);
            socketRef.current.off('error', errorHandler);
            socketRef.current.off('disconnect', disconnectHandler);
          }
        };

        // register event handlers
        if (socketRef.current) {
          socketRef.current.on('video-data', videoDataHandler);
          socketRef.current.on('error', errorHandler);
          socketRef.current.on('disconnect', disconnectHandler);
        }

        // clean up when the stream is cancelled
        return () => {
          streamClosed = true;
          cleanupHandlers();
        };
      },
    });

    // handle video stream
    return videoStream.pipeThrough(transformStream);
  };

  // screenshot feature
  const takeScreenshot = async () => {
    if (!decoderRef.current) return;

    try {
      const blob = await decoderRef.current.snapshot();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `screenshot_${new Date().toISOString().replace(/:/g, '-')}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('screenshot failed:', error);
      alert('screenshot failed');
    }
  };

  // connect device
  const connectDevice = useCallback(async () => {
    try {
      setConnecting(true);
      // ensure the component is still mounted and has a valid server URL
      if (!serverUrl) {
        console.error('Cannot connect: missing server URL');
        setConnecting(false);
        onConnectionStatusChange?.(false);
        return;
      }

      // setup metadata timeout check
      const setupMetadataTimeout = () => {
        // clear previous timeout
        if (metadataTimeoutRef.current) {
          clearTimeout(metadataTimeoutRef.current);
          metadataTimeoutRef.current = null;
        }

        // setup new timeout check
        metadataTimeoutRef.current = setTimeout(() => {
          console.log(
            'Warning: no video metadata event received, possible connection issue',
            {
              socketConnected: socketRef.current?.connected,
            },
          );

          if (socketRef.current?.connected) {
            try {
              socketRef.current.emit('connect-device', {
                maxSize,
              });

              // setup metadata timeout check again
              setupMetadataTimeout();
            } catch (err) {
              console.error('Failed to request connection:', err);
              onConnectionStatusChange?.(false); // notify connection request failed
              message.error(
                'connection request failed, please refresh the page',
              );
            }
          } else {
            onConnectionStatusChange?.(false); // notify connection status change

            try {
              if (socketRef.current) {
                socketRef.current.disconnect();
                setTimeout(() => {
                  // reconnect after a short delay
                  if (socketRef.current) {
                    socketRef.current.connect();
                  }
                }, 500);
              }
            } catch (err) {
              console.error('Failed to reconnect:', err);
              message.error('reconnection failed, please refresh the page');
            }
          }
        }, 5000);
      };

      // connect to server
      if (!socketRef.current) {
        try {
          socketRef.current = io(serverUrl, {
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000,
          });

          // notify parent component after connection is successful
          socketRef.current.on('connect', () => {
            console.log('Socket connected, notify parent component');
            onConnectionStatusChange?.(true);

            if (reconnectTimerRef.current) {
              clearTimeout(reconnectTimerRef.current);
              reconnectTimerRef.current = null;
            }

            socketRef.current?.emit('connect-device', {
              maxSize,
            });

            // setup metadata timeout check
            setupMetadataTimeout();
          });

          // handle video metadata
          socketRef.current.on(
            'video-metadata',
            async (metadata: VideoMetadata) => {
              try {
                // clear metadata timeout
                if (metadataTimeoutRef.current) {
                  clearTimeout(metadataTimeoutRef.current);
                  metadataTimeoutRef.current = null;
                }

                // ensure the metadata object exists, and set the default codec
                // convert string to ScrcpyVideoCodecId enum
                const codecId = metadata?.codec
                  ? (metadata.codec as unknown as ScrcpyVideoCodecId)
                  : ScrcpyVideoCodecId.H264;

                // create decoder
                decoderRef.current = await createDecoder(codecId);

                // listen to size change event
                decoderRef.current.sizeChanged(
                  ({ width, height }: { width: number; height: number }) => {
                    setScreenInfo({ width, height });
                  },
                );

                // setup video stream processing
                const videoStream = setupVideoStream(metadata);

                // pass the video stream to the decoder
                videoStream
                  .pipeTo(decoderRef.current.writable)
                  .catch((error: Error) => {
                    console.error('video stream processing error:', error);
                    message.error('video stream processing error');
                    onConnectionStatusChange?.(false);
                  });

                // update UI status
                setConnected(true);
                setConnecting(false);
                // video metadata received successfully, device connected
                console.log(
                  'video metadata received successfully, device connected',
                );
                onConnectionStatusChange?.(true);
              } catch (error: any) {
                console.error('Failed to initialize decoder:', error);
                setConnecting(false);
                onConnectionStatusChange?.(false);
              }
            },
          );

          // handle error
          socketRef.current.on('error', (error: Error) => {
            console.error('server error:', error);
            message.error('server error');
            setConnecting(false);
            onConnectionStatusChange?.(false);

            // clear metadata timeout
            if (metadataTimeoutRef.current) {
              clearTimeout(metadataTimeoutRef.current);
              metadataTimeoutRef.current = null;
            }
          });

          // handle disconnection event
          socketRef.current.on('disconnect', () => {
            setConnected(false);
            console.log('Socket disconnected, notify parent component');
            onConnectionStatusChange?.(false);

            // clear metadata timeout
            if (metadataTimeoutRef.current) {
              clearTimeout(metadataTimeoutRef.current);
              metadataTimeoutRef.current = null;
            }

            // clean up video container
            if (decoderRef.current) {
              decoderRef.current.dispose();
              decoderRef.current = null;
            }

            if (videoContainerRef.current) {
              videoContainerRef.current.innerHTML = '';
            }

            if (autoReconnect && !reconnectTimerRef.current) {
              reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                connectDevice();
              }, reconnectInterval);
            }
          });
        } catch (error: any) {
          console.error('Failed to create socket connection:', error);
          setConnecting(false);
          onConnectionStatusChange?.(false);

          if (autoReconnect && !reconnectTimerRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null;
              connectDevice();
            }, reconnectInterval);
          }
        }
      } else {
        if (!socketRef.current.connected) {
          socketRef.current.connect();
        } else {
          socketRef.current.emit('connect-device', {
            maxSize,
          });

          // setup metadata timeout check
          setupMetadataTimeout();
        }
      }
    } catch (error: any) {
      setConnecting(false);
      onConnectionStatusChange?.(false);
      console.error(`Failed to connect: ${error.message}`);
      message.error('connection failed');

      if (autoReconnect && !reconnectTimerRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connectDevice();
        }, reconnectInterval);
      }
    }
  }, [
    serverUrl,
    maxSize,
    autoReconnect,
    reconnectInterval,
    onConnectionStatusChange,
  ]);

  // disconnect device
  const disconnectDevice = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (metadataTimeoutRef.current) {
      clearTimeout(metadataTimeoutRef.current);
      metadataTimeoutRef.current = null;
    }

    setConnected(false);
    setConnecting(false);
  };

  // detect autoConnect change, connect device when autoConnect is true
  useEffect(() => {
    // detect autoConnect change from false to true
    if (autoConnect && !prevAutoConnect && !connected && !connecting) {
      console.log(
        'detected autoConnect change from false to true, trigger connection',
      );

      // add a short delay to ensure the component is fully ready
      const timer = setTimeout(() => {
        console.log('start auto connection (triggered by state change)');
        connectDevice();
      }, 300);

      return () => clearTimeout(timer);
    }

    // update the previous autoConnect value
    setPrevAutoConnect(autoConnect);
  }, [autoConnect, prevAutoConnect, connected, connecting, connectDevice]);

  // resource cleanup useEffect
  useEffect(() => {
    // return cleanup function, called when component unmounts
    return () => {
      console.log('component unmount, clean up resources...');

      onConnectionStatusChange?.(false);

      // dispose decoder
      if (decoderRef.current) {
        decoderRef.current.dispose();
        decoderRef.current = null;
      }

      // disconnect socket connection
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      // clean up all timers
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (metadataTimeoutRef.current) {
        clearTimeout(metadataTimeoutRef.current);
        metadataTimeoutRef.current = null;
      }

      console.log('resource cleanup completed');
    };
  }, [onConnectionStatusChange]);

  return (
    <div className="scrcpy-container">
      <Card title="Android device screen">
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <div className="video-section">
              <div ref={videoContainerRef} className="video-container" />
              {screenInfo && (
                <div className="screen-info">
                  <Text type="secondary">
                    screen size: {screenInfo.width} x {screenInfo.height}
                  </Text>
                </div>
              )}
            </div>
          </Col>

          <Col span={24}>
            <div className="controls-section">
              <Button
                type="primary"
                loading={connecting}
                disabled={connected}
                onClick={() => {
                  connectDevice();
                }}
              >
                {connected
                  ? 'Connected'
                  : connecting
                    ? 'Connecting...'
                    : 'Connect device'}
              </Button>

              <Button
                danger
                disabled={!connected}
                onClick={disconnectDevice}
                style={{ marginLeft: 8 }}
              >
                Disconnect
              </Button>

              <Button
                icon={<PictureOutlined />}
                disabled={!connected}
                onClick={takeScreenshot}
                style={{ marginLeft: 8 }}
              >
                Screenshot
              </Button>
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default ScrcpyPlayer;
