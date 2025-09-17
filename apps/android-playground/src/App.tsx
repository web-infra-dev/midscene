import './App.less';
import { SCRCPY_SERVER_PORT } from '@midscene/shared/constants';
import {
  globalThemeConfig,
  safeOverrideAIConfig,
  useEnvConfig,
} from '@midscene/visualizer';
import { ConfigProvider, Layout, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { type Socket, io } from 'socket.io-client';
import AdbDevice from './components/adb-device';
import PlaygroundPanel from './components/playground-panel';
import ScrcpyPlayer, {
  type ScrcpyRefMethods,
} from './components/scrcpy-player';

const { Content } = Layout;

export default function App() {
  // Device and connection state - now simplified since device is pre-selected
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [connectToDevice, setConnectToDevice] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [serverUrl, setServerUrl] = useState(
    `http://localhost:${SCRCPY_SERVER_PORT}`,
  );
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);

  // Configuration state
  const { config } = useEnvConfig();

  // Override AI configuration when config changes
  useEffect(() => {
    safeOverrideAIConfig(config);
  }, [config]);

  // Get scrcpy port from injected window variable
  useEffect(() => {
    const scrcpyPort = (window as any).SCRCPY_PORT;
    if (scrcpyPort) {
      setServerUrl(`http://localhost:${scrcpyPort}`);
    }
  }, []);

  // Socket connection and device management
  const socketRef = useRef<Socket | null>(null);
  const scrcpyPlayerRef = useRef<ScrcpyRefMethods>(null);

  // connect to device server - simplified since device is pre-selected
  useEffect(() => {
    if (!serverUrl) return;

    const socket = io(serverUrl, {
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
  }, [messageApi, serverUrl]);

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

  // Handle window resize to detect narrow screens
  useEffect(() => {
    const handleResize = () => {
      setIsNarrowScreen(window.innerWidth <= 1024);
    };

    // Set initial value
    handleResize();

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      {contextHolder}
      <Layout className="app-container playground-container vertical-mode">
        <Content className="app-content">
          <PanelGroup
            autoSaveId="android-playground-layout"
            direction={isNarrowScreen ? 'vertical' : 'horizontal'}
          >
            {/* left panel: PlaygroundPanel with Universal Playground */}
            <Panel
              defaultSize={isNarrowScreen ? 60 : 32}
              maxSize={isNarrowScreen ? 80 : 60}
              minSize={isNarrowScreen ? 40 : 25}
              className="app-panel left-panel"
            >
              <div className="panel-content left-panel-content">
                <PlaygroundPanel />
              </div>
            </Panel>

            <PanelResizeHandle
              className={`panel-resize-handle ${isNarrowScreen ? 'vertical' : 'horizontal'}`}
            />

            {/* right panel: ScrcpyPlayer */}
            <Panel className="app-panel right-panel">
              <div className="panel-content right-panel-content">
                <AdbDevice
                  selectedDeviceId={selectedDeviceId}
                  scrcpyPlayerRef={scrcpyPlayerRef}
                />
                <ScrcpyPlayer
                  ref={scrcpyPlayerRef}
                  serverUrl={serverUrl}
                  autoConnect={connectToDevice}
                />
              </div>
            </Panel>
          </PanelGroup>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
