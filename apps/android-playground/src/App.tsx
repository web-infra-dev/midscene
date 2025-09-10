import './App.less';
import { SCRCPY_SERVER_PORT } from '@midscene/shared/constants';
import { overrideAIConfig } from '@midscene/shared/env';
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
  // Device and connection state - now simplified since device is pre-selected
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [connectToDevice, setConnectToDevice] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [connectionReady, setConnectionReady] = useState(false);

  // Configuration state
  const { config } = useEnvConfig();
  const configAlreadySet = Object.keys(config || {}).length >= 1;
  const serverValid = useServerValid(true);

  // Override AI configuration when config changes
  useEffect(() => {
    overrideAIConfig(config);
  }, [config]);

  // Socket connection and device management
  const socketRef = useRef<Socket | null>(null);
  const scrcpyPlayerRef = useRef<ScrcpyRefMethods>(null);

  // connect to device server - simplified since device is pre-selected
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

    socket.on(
      'devices-list',
      (data: {
        devices: { id: string; name: string; status: string }[];
        currentDeviceId: string | null;
      }) => {
        if (data.currentDeviceId) {
          setSelectedDeviceId(data.currentDeviceId);
          // Auto-connect since device is already selected
          setConnectToDevice(true);
        }
      },
    );

    socket.on('connect_error', (error: Error) => {
      console.error('Socket.IO connection error:', error);
      messageApi.error(
        'Waiting for device server connection, please try again later',
      );
    });

    socket.on('error', (error: Error) => {
      console.error('Socket.IO error:', error);
      messageApi.error(
        `Error occurred while communicating with the server: ${error.message || 'Unknown error'}`,
      );
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [messageApi]);

  // listen to the connection status change
  const handleConnectionStatusChange = useCallback((status: boolean) => {
    setConnectionReady(status);
  }, []);

  // reset the connection flag
  useEffect(() => {
    if (connectToDevice) {
      // reset the connection flag after a delay
      const timer = setTimeout(() => {
        setConnectToDevice(false);
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [connectToDevice]);

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
                    selectedDeviceId={selectedDeviceId}
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
