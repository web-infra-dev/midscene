import { exec } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { promisify } from 'node:util';
import { SCRCPY_SERVER_PORT } from '@midscene/shared/constants';
import { Adb, AdbServerClient } from '@yume-chan/adb';
import { AdbScrcpyClient, AdbScrcpyOptions2_1 } from '@yume-chan/adb-scrcpy';
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp';
import { BIN } from '@yume-chan/fetch-scrcpy-server';
import {
  DefaultServerPath,
  ScrcpyOptions3_1,
  ScrcpyVideoCodecId,
} from '@yume-chan/scrcpy';
import { ReadableStream } from '@yume-chan/stream-extra';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { debugPage } from '../page';

const promiseExec = promisify(exec);

export default class ScrcpyServer {
  app: express.Application;
  httpServer: HttpServer;
  io: Server;
  port?: number | null;
  defaultPort = SCRCPY_SERVER_PORT;
  adbClient: AdbServerClient | null = null;
  currentDeviceId: string | null = null;
  devicePollInterval: NodeJS.Timeout | null = null;
  lastDeviceList = ''; // 用于保存上次设备列表的JSON字符串，用于比较变化

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new Server(this.httpServer, {
      cors: {
        origin: [
          /^http:\/\/localhost(:\d+)?$/,
          /^http:\/\/127\.0\.0\.1(:\d+)?$/,
        ],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.app.use(
      cors({
        origin: '*',
        credentials: true,
      }),
    );

    // setup Socket.IO connection handlers
    this.setupSocketHandlers();

    // setup REST API routes
    this.setupApiRoutes();
  }

  // setup API routes
  private setupApiRoutes() {
    // get devices list API
    this.app.get('/api/devices', async (req, res) => {
      try {
        const devices = await this.getDevicesList();
        res.json({ devices, currentDeviceId: this.currentDeviceId });
      } catch (error: any) {
        res
          .status(500)
          .json({ error: error.message || 'Failed to get devices list' });
      }
    });
  }

  // get devices list
  private async getDevicesList() {
    try {
      debugPage('start to get devices list');
      const client = await this.getAdbClient();
      if (!client) {
        console.warn('failed to get adb client');

        return [];
      }

      debugPage('success to get adb client, start to request devices list');
      let devices;

      try {
        devices = await client.getDevices();
        debugPage('original devices list:', devices);
      } catch (error) {
        console.error('failed to get devices list:', error);
        return [];
      }

      if (!devices || devices.length === 0) {
        return [];
      }

      const formattedDevices = devices.map((device) => {
        const result = {
          id: device.serial,
          name: device.product || device.model || device.serial,
          status: (device as any).state || 'device',
        };
        return result;
      });

      return formattedDevices;
    } catch (error) {
      console.error('failed to get devices list:', error);
      return [];
    }
  }

  // get adb client
  private async getAdbClient() {
    try {
      if (!this.adbClient) {
        await promiseExec('adb start-server'); // make sure adb server is running
        debugPage('adb server started');
        debugPage('initialize adb client');
        this.adbClient = new AdbServerClient(
          new AdbServerNodeTcpConnector({
            host: 'localhost',
            port: 5037,
          }),
        );
        await debugPage('success to initialize adb client');
      } else {
        debugPage('use existing adb client');
      }
      return this.adbClient;
    } catch (error) {
      console.error('failed to get adb client:', error);
      return null;
    }
  }

  // get adb object
  private async getAdb(deviceId?: string) {
    try {
      const client = await this.getAdbClient();
      if (!client) {
        return null;
      }

      // if specific device id is provided, use it
      if (deviceId) {
        this.currentDeviceId = deviceId;
        // use device id as DeviceSelector
        return new Adb(await client.createTransport({ serial: deviceId }));
      }

      // otherwise, get devices list and use the first online device
      const devices = await client.getDevices();
      if (devices.length === 0) {
        return null;
      }

      this.currentDeviceId = devices[0].serial;
      return new Adb(await client.createTransport(devices[0]));
    } catch (error) {
      console.error('failed to get adb client:', error);
      return null;
    }
  }

  // start scrcpy
  private async startScrcpy(adb: Adb, options = {}) {
    try {
      // Push server
      await AdbScrcpyClient.pushServer(
        adb,
        ReadableStream.from(createReadStream(BIN)),
      );

      // Start scrcpy service
      const scrcpyOptions = new ScrcpyOptions3_1({
        // default options
        audio: false,
        control: true,
        maxSize: 1024,
        // use videoBitRate as property name
        videoBitRate: 2_000_000,
        // override default values with user provided options
        ...options,
      });

      return await AdbScrcpyClient.start(
        adb,
        DefaultServerPath,
        new AdbScrcpyOptions2_1(scrcpyOptions),
      );
    } catch (error) {
      console.error('failed to start scrcpy:', error);
      throw error;
    }
  }

  // setup Socket.IO connection handlers
  private setupSocketHandlers() {
    this.io.on('connection', async (socket) => {
      debugPage(
        'client connected, id: %s, client address: %s',
        socket.id,
        socket.handshake.address,
      );

      let scrcpyClient: any = null;
      let adb = null;

      // send devices list to client
      const sendDevicesList = async () => {
        try {
          debugPage('Socket request to get devices list');
          const devices = await this.getDevicesList();
          debugPage('send devices list to client:', devices);
          socket.emit('devices-list', {
            devices,
            currentDeviceId: this.currentDeviceId,
          });
        } catch (error) {
          console.error('failed to send devices list:', error);
          socket.emit('error', { message: 'failed to get devices list' });
        }
      };

      // send devices list to client
      await sendDevicesList();

      // listen to get devices list request
      socket.on('get-devices', async () => {
        debugPage('received client request to get devices list');
        await sendDevicesList();
      });

      // listen to switch device request
      socket.on('switch-device', async (deviceId) => {
        debugPage('received client request to switch device:', deviceId);
        try {
          // if there is a connection, close it first
          if (scrcpyClient) {
            await scrcpyClient.close();
            scrcpyClient = null;
          }

          this.currentDeviceId = deviceId;
          debugPage('device switched to:', deviceId);
          socket.emit('device-switched', { deviceId });

          // notify all clients that device switched
          this.io.emit('global-device-switched', {
            deviceId,
            timestamp: Date.now(),
          });
        } catch (error: any) {
          console.error('failed to switch device:', error);
          socket.emit('error', {
            message: `Failed to switch device: ${error?.message || 'Unknown error'}`,
          });
        }
      });

      // handle device connection request
      socket.on('connect-device', async (options) => {
        try {
          debugPage(
            'received device connection request, options: %s, client id: %s',
            options,
            socket.id,
          );

          // use current selected device id or default the first online device
          adb = await this.getAdb(this.currentDeviceId || undefined);
          if (!adb) {
            console.error('no available device found');
            socket.emit('error', { message: 'No device found' });
            return;
          }

          debugPage(
            'starting scrcpy service, device id: %s',
            this.currentDeviceId,
          );
          scrcpyClient = await this.startScrcpy(adb, options);
          debugPage('scrcpy service started successfully');

          // check scrcpyClient object structure
          debugPage(
            'check scrcpyClient object structure: %s',
            Object.getOwnPropertyNames(scrcpyClient).map((name) => {
              const type = typeof scrcpyClient[name];
              const isPromise =
                type === 'object' &&
                scrcpyClient[name] &&
                typeof scrcpyClient[name].then === 'function';
              return `${name}: ${type}${isPromise ? ' (Promise)' : ''}`;
            }),
          );

          try {
            // check if videoStream is a Promise
            if (scrcpyClient.videoStream) {
              debugPage(
                'videoStream exists, type: %s',
                typeof scrcpyClient.videoStream,
              );

              // get video stream
              let videoStream;
              if (
                typeof scrcpyClient.videoStream === 'object' &&
                typeof scrcpyClient.videoStream.then === 'function'
              ) {
                debugPage(
                  'videoStream is a Promise, waiting for resolution...',
                );
                videoStream = await scrcpyClient.videoStream;
              } else {
                debugPage('videoStream is not a Promise, directly use');
                videoStream = scrcpyClient.videoStream;
              }

              debugPage(
                'video stream fetched successfully, metadata: %s',
                videoStream.metadata,
              );

              // ensure metadata exists
              const metadata = videoStream.metadata || {};
              debugPage('original metadata: %s', metadata);

              // ensure metadata contains necessary fields
              if (!metadata.codec) {
                debugPage(
                  'metadata does not have codec field, use H264 by default',
                );
                metadata.codec = ScrcpyVideoCodecId.H264;
              }

              // make sure metadata contains size information
              if (!metadata.width || !metadata.height) {
                debugPage(
                  'metadata does not have width or height field, use default values',
                );
                metadata.width = metadata.width || 1080;
                metadata.height = metadata.height || 1920;
              }

              debugPage(
                'prepare to send video-metadata event to client, data: %s',
                JSON.stringify(metadata),
              );
              socket.emit('video-metadata', metadata);
              debugPage(
                'video-metadata event sent to client, id: %s',
                socket.id,
              );

              const { stream } = videoStream;

              // convert video stream
              const reader = stream.getReader();
              const processStream = async () => {
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    // ensure type field is correctly set to 'configuration' or 'data'
                    const frameType = value.type || 'data'; // default to 'data'

                    // send video frame data to client
                    socket.emit('video-data', {
                      data: Array.from(value.data),
                      type: frameType,
                      timestamp: Date.now(),
                      // fix keyframe access
                      keyFrame: value.keyFrame,
                    });
                  }
                } catch (error) {
                  console.error('error processing video stream:', error);
                  socket.emit('error', {
                    message: 'video stream processing error',
                  });
                }
              };

              processStream();
            } else {
              console.error(
                'scrcpyClient object does not have videoStream property',
              );
              socket.emit('error', {
                message: 'Video stream not available in scrcpy client',
              });
            }
          } catch (error: any) {
            console.error('error processing video stream:', error);
            socket.emit('error', {
              message: `Video stream processing error: ${error.message}`,
            });
          }

          // set control ready
          // fix control property access
          if (scrcpyClient?.controller) {
            socket.emit('control-ready');
          }
        } catch (error: any) {
          console.error('failed to connect device:', error);
          socket.emit('error', {
            message: `Failed to connect device: ${error?.message || 'Unknown error'}`,
          });
        }
      });

      // handle disconnection
      socket.on('disconnect', async (reason) => {
        debugPage('client disconnected, id: %s, reason: %s', socket.id, reason);

        if (scrcpyClient) {
          try {
            // close scrcpy
            debugPage('closing scrcpy client');
            await scrcpyClient.close();
          } catch (error) {
            console.error('failed to close scrcpy client:', error);
          }
          scrcpyClient = null;
        }
      });
    });
  }

  // launch server
  async launch(port?: number) {
    this.port = port || this.defaultPort;
    return new Promise<this>((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(`Scrcpy server running at: http://localhost:${this.port}`);
        // start device monitoring
        this.startDeviceMonitoring();
        resolve(this);
      });
    });
  }

  // start device monitoring
  private startDeviceMonitoring() {
    // check devices list every 3 seconds
    this.devicePollInterval = setInterval(async () => {
      try {
        const devices = await this.getDevicesList();
        const currentDevicesJson = JSON.stringify(devices);

        // if devices list changed, push to all connected clients
        if (this.lastDeviceList !== currentDevicesJson) {
          debugPage('devices list changed, push to all connected clients');
          this.lastDeviceList = currentDevicesJson;

          // if there is no selected device and there are available devices, auto select the first device
          if (!this.currentDeviceId && devices.length > 0) {
            const onlineDevices = devices.filter(
              (device) => device.status.toLowerCase() === 'device',
            );
            if (onlineDevices.length > 0) {
              this.currentDeviceId = onlineDevices[0].id;
              debugPage(
                'auto select the first online device:',
                this.currentDeviceId,
              );
            }
          }

          // push updated devices list to all connected clients
          this.io.emit('devices-list', {
            devices,
            currentDeviceId: this.currentDeviceId,
          });
        }
      } catch (error) {
        console.error('device monitoring error:', error);
      }
    }, 3000);
  }

  // close server
  close() {
    // 停止设备监控
    if (this.devicePollInterval) {
      clearInterval(this.devicePollInterval);
      this.devicePollInterval = null;
    }

    if (this.httpServer) {
      return this.httpServer.close();
    }
  }
}
