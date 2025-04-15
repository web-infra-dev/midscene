import { InfoCircleOutlined } from '@ant-design/icons';
import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import { WebCodecsVideoDecoder } from '@yume-chan/scrcpy-decoder-webcodecs';
import {
  BitmapVideoFrameRenderer,
  WebGLVideoFrameRenderer,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import {
  Button,
  Card,
  Col,
  Divider,
  Row,
  Spin,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import LinkedIcon from '../icons/linked.svg?react';
import ScreenshotIcon from '../icons/screenshot.svg?react';
import UnlinkIcon from '../icons/unlink.svg?react';
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

export interface ScrcpyRefMethods {
  disconnectDevice: () => void;
}

export const ScrcpyPlayer = forwardRef<ScrcpyRefMethods, ScrcpyProps>(
  (
    {
      serverUrl,
      maxSize = 1024,
      autoConnect = true,
      autoReconnect = true,
      reconnectInterval = 5000,
      onConnectionStatusChange,
    },
    ref,
  ) => {
    const [connecting, setConnecting] = useState(false);
    const [connected, setConnected] = useState(false);
    const [screenInfo, setScreenInfo] = useState<{
      width: number;
      height: number;
    } | null>(null);
    const [deviceId, setDeviceId] = useState<string>('');

    const socketRef = useRef<Socket | null>(null);
    const videoContainerRef = useRef<HTMLDivElement>(null);
    const videoElementRef = useRef<HTMLCanvasElement | null>(null);
    const decoderRef = useRef<any>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const metadataTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // create a safe remove child nodes tool function
    const safeRemoveChildNodes = useCallback((parent: Element | null) => {
      if (!parent) return;

      try {
        // use a safer way to clear child nodes
        while (parent.firstChild) {
          try {
            parent.removeChild(parent.firstChild);
          } catch (e) {
            console.warn('Failed to remove child, skipping:', e);
            // if remove failed, set it to null to avoid trying to remove again
            if (parent.firstChild) {
              parent.innerHTML = '';
              break;
            }
          }
        }
      } catch (e) {
        console.error('Error clearing container:', e);
        // last resort - directly reset HTML
        try {
          parent.innerHTML = '';
        } catch (innerErr) {
          console.error('Failed to reset innerHTML:', innerErr);
        }
      }
    }, []);

    // update canvas size to fit container
    const updateCanvasSize = useCallback(() => {
      if (!videoElementRef.current || !videoContainerRef.current || !screenInfo)
        return;

      const container = videoContainerRef.current;
      const canvas = videoElementRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const { width: originalWidth, height: originalHeight } = screenInfo;

      // leave 20px padding on top and bottom
      const paddingVertical = 40; // 顶部和底部各20px
      const availableHeight = containerHeight - paddingVertical;

      // calculate the size fit to container, keep the aspect ratio
      const aspectRatio = originalWidth / originalHeight;
      let targetWidth = containerWidth;
      let targetHeight = containerWidth / aspectRatio;

      if (targetHeight > availableHeight) {
        targetHeight = availableHeight;
        targetWidth = availableHeight * aspectRatio;
      }

      // update canvas properties and styles
      canvas.width = originalWidth;
      canvas.height = originalHeight;
      canvas.style.width = `${targetWidth}px`;
      canvas.style.height = `${targetHeight}px`;
      canvas.style.marginTop = '20px';
      canvas.style.marginBottom = '20px';
    }, [screenInfo]);

    // listen window size change
    useEffect(() => {
      const handleResize = () => {
        updateCanvasSize();
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [updateCanvasSize]);

    // when screenInfo updates, adjust the size
    useEffect(() => {
      updateCanvasSize();
    }, [screenInfo, updateCanvasSize]);

    // create and initialize renderer
    const createVideoFrameRenderer = async () => {
      // use WebGL renderer first, if not supported, fallback to Bitmap renderer
      if (WebGLVideoFrameRenderer.isSupported) {
        const renderer = new WebGLVideoFrameRenderer();
        return {
          renderer,
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

      // add video element to page
      if (videoContainerRef.current) {
        const canvasWrapper =
          videoContainerRef.current.querySelector('.canvas-wrapper');
        if (canvasWrapper) {
          // safely clear container
          safeRemoveChildNodes(canvasWrapper);
          canvasWrapper.appendChild(videoElementRef.current);
        }
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
              console.error(
                'error occurred while enqueuing video data:',
                error,
              );
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

    // disconnect device
    const disconnectDevice = useCallback(() => {
      // dispose decoder resources
      if (decoderRef.current) {
        try {
          decoderRef.current.dispose();
          decoderRef.current = null;
        } catch (error) {
          console.error('Error disposing decoder:', error);
        }
      }

      // clear video container
      if (videoContainerRef.current) {
        const canvasWrapper =
          videoContainerRef.current.querySelector('.canvas-wrapper');
        safeRemoveChildNodes(canvasWrapper);
      }

      // disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      // clean up timers
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (metadataTimeoutRef.current) {
        clearTimeout(metadataTimeoutRef.current);
        metadataTimeoutRef.current = null;
      }

      // reset status
      setConnected(false);
      setConnecting(false);
      setScreenInfo(null);
    }, [safeRemoveChildNodes]);

    // Expose methods to parent component
    useImperativeHandle(
      ref,
      () => ({
        disconnectDevice,
      }),
      [disconnectDevice],
    );

    // connect device
    const connectDevice = useCallback(async () => {
      try {
        // always clean up previous resources, ensure clean state
        disconnectDevice();

        // ensure status reset
        setConnected(false);
        setConnecting(true);
        setScreenInfo(null);

        // short delay to ensure resources are cleaned
        await new Promise((resolve) => setTimeout(resolve, 150));

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
              onConnectionStatusChange?.(true);

              // get device id from socket
              if (socketRef.current?.id) {
                setDeviceId(socketRef.current.id);
              }

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

                  // if there is already a decoder, clean it first
                  if (decoderRef.current) {
                    try {
                      decoderRef.current.dispose();
                      decoderRef.current = null;
                    } catch (error) {
                      console.error('Error disposing old decoder:', error);
                    }
                  }

                  // clean video container
                  if (videoContainerRef.current) {
                    const canvasWrapper =
                      videoContainerRef.current.querySelector(
                        '.canvas-wrapper',
                      );
                    safeRemoveChildNodes(canvasWrapper);
                  }

                  // ensure the metadata object exists, and set the default codec
                  // convert string to ScrcpyVideoCodecId enum
                  const codecId = metadata?.codec
                    ? (metadata.codec as unknown as ScrcpyVideoCodecId)
                    : ScrcpyVideoCodecId.H264;

                  // create decoder
                  decoderRef.current = await createDecoder(codecId);

                  // ensure the decoder is created successfully
                  if (!decoderRef.current) {
                    throw new Error('Failed to create decoder');
                  }

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
                // safely clear container
                safeRemoveChildNodes(
                  videoContainerRef.current.querySelector('.canvas-wrapper'),
                );
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
      disconnectDevice,
    ]);

    // detect autoConnect change, connect device when autoConnect is true
    useEffect(() => {
      if (autoConnect && !connected && !connecting) {
        // only trigger connection when not connected and not connecting
        const timer = setTimeout(() => {
          connectDevice();
        }, 300);

        return () => clearTimeout(timer);
      }
    }, [autoConnect, connected, connecting, connectDevice]);

    // resource cleanup useEffect
    useEffect(() => {
      // return cleanup function, called when component unmounts
      return () => {
        onConnectionStatusChange?.(false);

        // dispose decoder
        if (decoderRef.current) {
          try {
            decoderRef.current.dispose();
            decoderRef.current = null;
          } catch (error) {
            console.error('Error disposing decoder during unmount:', error);
          }
        }

        // clean video container
        if (videoContainerRef.current) {
          try {
            const canvasWrapper =
              videoContainerRef.current.querySelector('.canvas-wrapper');
            if (canvasWrapper) {
              // safely clear content instead of removing node
              canvasWrapper.innerHTML = '';
            }
          } catch (error) {
            console.error(
              'Error clearing canvas wrapper during unmount:',
              error,
            );
          }
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
      };
    }, [onConnectionStatusChange]);

    return (
      <div className="scrcpy-container">
        <Card>
          {connected && (
            <div className="header-bar">
              <div className="header-left">
                <Text>Screen Projection</Text>
                <Tooltip
                  placement="bottom"
                  title={`Device ID: ${deviceId || 'Unknown'}`}
                >
                  <InfoCircleOutlined />
                </Tooltip>
              </div>
              <div className="screen-info">
                <Text type="secondary">
                  size : {screenInfo?.width}×{screenInfo?.height}
                </Text>
              </div>
              <div className="header-right">
                <Tooltip placement="bottom" title="Screenshot">
                  <Button icon={<ScreenshotIcon />} onClick={takeScreenshot} />
                </Tooltip>
                <Divider
                  type="vertical"
                  style={{
                    margin: '0 16px',
                  }}
                />
                <Tooltip placement="bottom" title="Connect Device">
                  <Button
                    disabled={connected}
                    icon={<LinkedIcon />}
                    onClick={connectDevice}
                  />
                </Tooltip>
                {connected && (
                  <>
                    <Divider
                      type="vertical"
                      style={{
                        margin: '0 16px',
                      }}
                    />
                    <Tooltip title="Disconnect Device">
                      <Button
                        icon={<UnlinkIcon />}
                        onClick={disconnectDevice}
                      />
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          )}
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <div className="video-section">
                <div ref={videoContainerRef} className="video-container">
                  <div className="canvas-wrapper" />
                  {!connected && (
                    <div className="empty-state">
                      <div className="empty-state-icon">📱</div>
                      <div className="empty-state-text">
                        {connecting
                          ? 'Connecting to device...'
                          : 'No device connected'}
                      </div>
                      {!connecting && (
                        <Button
                          type="primary"
                          onClick={() => {
                            connectDevice();
                          }}
                        >
                          Connect now
                        </Button>
                      )}
                      {connecting && (
                        <div className="loading-spinner">
                          <Spin size="large" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Col>
          </Row>
        </Card>
      </div>
    );
  },
);

export default ScrcpyPlayer;
