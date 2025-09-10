import { PlaygroundSDK } from '@midscene/playground';
import { PLAYGROUND_SERVER_PORT } from '@midscene/shared/constants';
import {
  EnvConfig,
  LocalStorageProvider,
  Logo,
  UniversalPlayground,
  globalThemeConfig,
  useEnvConfig,
} from '@midscene/visualizer';
import { ConfigProvider } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import './App.less';

// Use current page port if available, fallback to default port
const currentPort = typeof window !== 'undefined' ? window.location.port : '';
const SERVER_PORT = currentPort || PLAYGROUND_SERVER_PORT;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

export default function App() {
  const { config } = useEnvConfig();
  const [serverOnline, setServerOnline] = useState(false);

  // Create PlaygroundSDK and storage provider
  const playgroundSDK = useMemo(() => {
    return new PlaygroundSDK({
      type: 'remote-execution',
      serverUrl: SERVER_URL,
    });
  }, []);

  const storage = useMemo(() => {
    return new LocalStorageProvider('web-playground');
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

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <div className="web-playground-app">
        {/* Header */}
        <div className="web-playground-header">
          <div className="header-content">
            <Logo />
            <div className="header-title">
              <h1>Midscene Web Playground</h1>
              <div
                className={`server-status ${serverOnline ? 'online' : 'offline'}`}
              >
                <span className="status-dot" />
                {serverOnline ? 'Server Online' : 'Server Offline'}
              </div>
            </div>
            <div className="header-config">
              <EnvConfig showTooltipWhenEmpty={false} />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="web-playground-main">
          {!serverOnline ? (
            <div className="server-offline-message">
              <h2>🚀 Ready to start?</h2>
              <p>Please start the playground server to begin:</p>
              <div className="start-command">
                <code>npx @midscene/playground</code>
              </div>
              <p className="server-info">
                The server will be available at{' '}
                <a href={SERVER_URL} target="_blank" rel="noopener noreferrer">
                  {SERVER_URL}
                </a>
              </p>
            </div>
          ) : (
            <UniversalPlayground
              playgroundSDK={playgroundSDK}
              storage={storage}
              config={{
                showContextPreview: false, // Web playground doesn't need context preview initially
                enablePersistence: true,
                layout: 'vertical',
                showVersionInfo: true,
                enableScrollToBottom: true,
              }}
              branding={{
                title: 'Web Playground',
                version: process.env.npm_package_version || '1.0.0',
              }}
              className="web-playground-container"
            />
          )}
        </div>
      </div>
    </ConfigProvider>
  );
}
