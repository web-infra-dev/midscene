import './App.less';
import { SCRCPY_SERVER_PORT } from '@midscene/shared/constants';
import {
  globalThemeConfig,
  useEnvConfig,
  useServerValid,
} from '@midscene/visualizer';
import { Col, ConfigProvider, Layout, Row, message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Socket, io } from 'socket.io-client';
import AdbDevice from './adb-device';
import PlaygroundPanel from './components/PlaygroundPanel';
import ScrcpyPlayer, { type ScrcpyRefMethods } from './scrcpy-player';

import './adb-device/index.less';
import './components/PlaygroundPanel.less';

const { Content } = Layout;
const SERVER_URL = `http://localhost:${SCRCPY_SERVER_PORT}`;

export default function App() {
  // Device and connection state
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [connectToDevice, setConnectToDevice] = useState(false);
  const [devices, setDevices] = useState<
    { id: string; name: string; status: string }[]
  >([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const lastSelectedDeviceRef = useRef<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [connectionReady, setConnectionReady] = useState(false);

  // Configuration state
  const { config } = useEnvConfig();
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const serverValid = useServerValid(true);

  // Socket connection and device management
  const socketRef = useRef<Socket | null>(null);
  const scrcpyPlayerRef = useRef<ScrcpyRefMethods>(null);

  // connect to device server
  useEffect(() => {
    const socket = io(SERVER_URL, {
      withCredentials: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    socket.on('connect', () => {
      socket.emit('get-devices');
    });

    socket.on('disconnect', (_reason: string) => {
      setLoadingDevices(true);
    });

    socket.on(
      'devices-list',
      (data: {
        devices: { id: string; name: string; status: string }[];
        currentDeviceId: string | null;
      }) => {
        setDevices(data.devices);
        if (data.currentDeviceId) {
          setSelectedDeviceId(data.currentDeviceId);

          if (data.devices.length === 1) {
            handleDeviceSelect(data.devices[0].id, true);
          }
        }
        setLoadingDevices(false);
      },
    );

    socket.on('global-device-switched', (data: { deviceId: string }) => {
      setSelectedDeviceId(data.deviceId);
    });

    socket.on('connect_error', (error: Error) => {
      console.error('Socket.IO connection error:', error);
      messageApi.error(
        'Waiting for device server connection, please try again later',
      );
      setLoadingDevices(false);
    });

    socket.on('error', (error: Error) => {
      console.error('Socket.IO error:', error);
      messageApi.error(
        `Error occurred while communicating with the server: ${error.message || 'Unknown error'}`,
      );
    });

    socketRef.current = socket;

    // request device list periodically
    const timer = setTimeout(() => {
      if (socket.connected) {
        socket.emit('get-devices');
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [messageApi]);

  // switch device
  const handleDeviceSelect = useCallback(
    (deviceId: string, silent = false) => {
      if (deviceId === lastSelectedDeviceRef.current) {
        return;
      }

      if (!socketRef.current || !socketRef.current.connected) {
        messageApi.warning(
          'Waiting for device server connection, please try again later',
        );
        return;
      }

      // disconnect current connection and reset related status
      setConnectToDevice(false);
      setConnectionReady(false);

      // use a short delay to ensure resources are cleaned
      setTimeout(() => {
        // then set the new device id
        setSelectedDeviceId(deviceId);
        lastSelectedDeviceRef.current = deviceId;

        setLoadingDevices(true);
        if (socketRef.current) {
          socketRef.current.emit('switch-device', deviceId);

          const timeoutId = setTimeout(() => {
            setLoadingDevices(false);
            messageApi.error('Device switch timeout, please try again');
          }, 10000);

          socketRef.current.once('device-switched', () => {
            clearTimeout(timeoutId);
            setLoadingDevices(false);

            // after device switched, trigger new device connection
            setTimeout(() => {
              setConnectToDevice(true);
              if (!silent) {
                messageApi.success(`Device selected: ${deviceId}`);
              }
            }, 500); // add delay to ensure enough time for switch
          });

          socketRef.current.once('error', (error: Error) => {
            clearTimeout(timeoutId);
            setLoadingDevices(false);
            messageApi.error(`Device switch failed: ${error.message}`);
          });
        } else {
          setLoadingDevices(false);
          messageApi.error('Socket connection lost, please refresh the page');
        }
      }, 500); // add delay to ensure enough time for switch
    },
    [messageApi],
  );

  // listen to the connection status change
  const handleConnectionStatusChange = useCallback(
    (status: boolean) => {
      setConnectionReady(status);

      // if the connection is ready and there is a selected device but not connected, try to connect
      if (status && selectedDeviceId && !connectToDevice) {
        setTimeout(() => {
          setConnectToDevice(true);
        }, 100);
      }
    },
    [selectedDeviceId],
  );

  // reset the connection flag
  useEffect(() => {
    if (connectToDevice) {
      // reset the connection flag, so that it can be triggered again
      const timer = setTimeout(() => {
        // only reset connectToDevice when the device is not switched
        // this ensures that the connection status is not reset during device switch
        if (selectedDeviceId === lastSelectedDeviceRef.current) {
          setConnectToDevice(false);
        }
      }, 800); // add delay to ensure enough time for connection

      return () => clearTimeout(timer);
    }
  }, [connectToDevice, selectedDeviceId]);

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      {contextHolder}
      <Layout className="app-container playground-container vertical-mode">
        <Content className="app-content">
          <div className="app-grid-layout">
            <Row className="app-grid-layout">
              {/* left panel: PlaygroundPanel with Universal Playground */}
              <Col className="app-panel left-panel">
                <div className="panel-content left-panel-content">
                  <PlaygroundPanel
                    selectedDeviceId={selectedDeviceId}
                    serverValid={serverValid}
                    configAlreadySet={configAlreadySet}
                    connectionReady={connectionReady}
                  />
                </div>
              </Col>

              {/* right panel: ScrcpyPlayer */}
              <Col className="app-panel right-panel">
                <div className="panel-content right-panel-content">
                  <AdbDevice
                    devices={devices}
                    loadingDevices={loadingDevices}
                    selectedDeviceId={selectedDeviceId}
                    onDeviceSelect={handleDeviceSelect}
                    socketRef={socketRef}
                    scrcpyPlayerRef={scrcpyPlayerRef}
                  />
                  <ScrcpyPlayer
                    ref={scrcpyPlayerRef}
                    serverUrl={SERVER_URL}
                    autoConnect={connectToDevice}
                    onConnectionStatusChange={handleConnectionStatusChange}
                  />
                </div>
              </Col>
            </Row>
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
