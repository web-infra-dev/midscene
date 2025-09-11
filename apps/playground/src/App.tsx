import { PlaygroundSDK } from '@midscene/playground';
import {
  LocalStorageProvider,
  Logo,
  UniversalPlayground,
  globalThemeConfig,
} from '@midscene/visualizer';
import { Col, ConfigProvider, Layout, Row } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import ScreenshotViewer from './components/screenshot-viewer';

import './App.less';

declare const __APP_VERSION__: string;

const { Content } = Layout;

export default function App() {
  const [serverOnline, setServerOnline] = useState(false);
  const [isUserOperating, setIsUserOperating] = useState(false);

  // Create PlaygroundSDK and storage provider
  const playgroundSDK = useMemo(() => {
    const sdk = new PlaygroundSDK({
      type: 'remote-execution',
    });

    // Set progress callback to monitor user operation status
    sdk.onProgressUpdate((tip: string) => {
      // When there's a progress tip, it means user is operating
      setIsUserOperating(!!tip);
    });

    return sdk;
  }, []);

  const storage = useMemo(() => {
    return new LocalStorageProvider('playground');
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

  if (!serverOnline) {
    return (
      <ConfigProvider theme={globalThemeConfig()}>
        <div className="server-offline-container">
          <div className="server-offline-message">
            <Logo />
            <h1>Midscene Playground</h1>
            <div className="server-status offline">
              <span className="status-dot" />
              Server Offline
            </div>
            {/* <h2>🚀 Ready to start?</h2>
            <p>Please start the playground server to begin:</p>
            <div className="start-command">
              <code>npx @midscene/playground</code>
            </div>
            <p className="server-info">
              The server will be available at{' '}
              <a href={SERVER_URL} target="_blank" rel="noopener noreferrer">
                {SERVER_URL}
              </a>
            </p> */}
          </div>
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <Layout className="app-container playground-container">
        <Content className="app-content">
          <div className="app-grid-layout">
            <Row className="app-grid-layout">
              {/* Left panel: UniversalPlayground */}
              <Col className="app-panel left-panel">
                <div className="panel-content left-panel-content">
                  {/* Header with Logo and Config */}
                  <div className="playground-panel-header">
                    <div className="header-row">
                      <Logo />
                      {/* <EnvConfig /> */}
                    </div>
                  </div>

                  {/* Main playground area */}
                  <div className="playground-panel-playground">
                    <UniversalPlayground
                      playgroundSDK={playgroundSDK}
                      storage={storage}
                      config={{
                        showContextPreview: false,
                        enablePersistence: false,
                        layout: 'vertical',
                        showVersionInfo: true,
                        enableScrollToBottom: true,
                        serverMode: true,
                      }}
                      branding={{
                        title: 'Playground',
                        version: __APP_VERSION__,
                      }}
                      className="playground-container"
                    />
                  </div>
                </div>
              </Col>

              {/* Right panel: Screenshot Viewer */}
              <Col className="app-panel right-panel">
                <div className="panel-content right-panel-content">
                  <ScreenshotViewer
                    playgroundSDK={playgroundSDK}
                    serverOnline={serverOnline}
                    isUserOperating={isUserOperating}
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
