import { PlaygroundSDK } from '@midscene/playground';
import {
  Logo,
  NavActions,
  UniversalPlayground,
  globalThemeConfig,
} from '@midscene/visualizer';
import { ConfigProvider, Layout } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import ScreenshotViewer from './components/screenshot-viewer';
import serverOfflineBackground from './icons/server-offline-background.svg';
import serverOfflineForeground from './icons/server-offline-foreground.svg';

import './App.less';

declare const __APP_VERSION__: string;
declare const __SERVER_URL__: string;

const { Content } = Layout;

export default function App() {
  const [serverOnline, setServerOnline] = useState(false);
  const [isUserOperating, setIsUserOperating] = useState(false);
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);

  // Create PlaygroundSDK and storage provider
  const playgroundSDK = useMemo(() => {
    // Support environment variable for serverUrl, fallback to default
    const serverUrl = __SERVER_URL__;
    const sdk = new PlaygroundSDK({
      type: 'remote-execution',
      serverUrl,
    });

    console.log('🌐 Connecting to playground server:', serverUrl);

    // Set progress callback to monitor user operation status
    sdk.onProgressUpdate((tip: string) => {
      // When there's a progress tip, it means user is operating
      setIsUserOperating(!!tip);
    });

    return sdk;
  }, []);

  // Check server status on mount
  useEffect(() => {
    const checkServer = async () => {
      try {
        const online = await playgroundSDK.checkStatus();
        setServerOnline(online);
      } catch (error) {
        console.error('Failed to check server status:', error);
        setServerOnline(false);
      }
    };

    checkServer();

    // Check server status periodically
    const interval = setInterval(checkServer, 5000);
    return () => clearInterval(interval);
  }, [playgroundSDK]);

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

  if (!serverOnline) {
    return (
      <ConfigProvider theme={globalThemeConfig()}>
        <div className="server-offline-container">
          <div className="server-offline-message">
            <Logo />
            <div className="server-offline-content">
              <div className="server-offline-icon">
                <img
                  src={serverOfflineBackground}
                  className="icon-background"
                  alt=""
                />
                <img
                  src={serverOfflineForeground}
                  className="icon-foreground"
                  alt=""
                />
              </div>
              <h1>Midscene Playground</h1>
              <p className="connection-status">Server offline...</p>
            </div>
          </div>
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <Layout className="app-container playground-container">
        <Content className="app-content">
          <PanelGroup
            autoSaveId="playground-layout"
            direction={isNarrowScreen ? 'vertical' : 'horizontal'}
          >
            {/* Left panel: UniversalPlayground */}
            <Panel
              defaultSize={isNarrowScreen ? 67 : 32}
              maxSize={isNarrowScreen ? 85 : 60}
              minSize={isNarrowScreen ? 67 : 25}
              className="app-panel left-panel"
            >
              <div className="panel-content left-panel-content">
                {/* Header with Logo and Config */}
                <div className="playground-panel-header">
                  <div className="header-row">
                    <Logo />
                    <NavActions showEnvConfig={false} />
                  </div>
                </div>

                {/* Main playground area */}
                <div className="playground-panel-playground">
                  <UniversalPlayground
                    playgroundSDK={playgroundSDK}
                    config={{
                      showContextPreview: false,
                      layout: 'vertical',
                      showVersionInfo: true,
                      enableScrollToBottom: true,
                      serverMode: true,
                      showEnvConfigReminder: true,
                    }}
                    branding={{
                      title: 'Playground',
                      version: __APP_VERSION__,
                    }}
                    className="playground-container"
                  />
                </div>
              </div>
            </Panel>

            <PanelResizeHandle
              className={`panel-resize-handle ${isNarrowScreen ? 'vertical' : 'horizontal'}`}
            />

            {/* Right panel: Screenshot Viewer */}
            <Panel className="app-panel right-panel">
              <div className="panel-content right-panel-content">
                <ScreenshotViewer
                  playgroundSDK={playgroundSDK}
                  serverOnline={serverOnline}
                  isUserOperating={isUserOperating}
                />
              </div>
            </Panel>
          </PanelGroup>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
