import { PlaygroundSDK } from '@midscene/playground';
import {
  Logo,
  NavActions,
  ScreenshotViewer,
  UniversalPlayground,
  globalThemeConfig,
  type PlaygroundBranding,
  type UniversalPlaygroundConfig,
} from '@midscene/visualizer';
import { ConfigProvider, Layout } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import ServerOfflineBackground from './icons/server-offline-background.svg';
import ServerOfflineForeground from './icons/server-offline-foreground.svg';
import './PlaygroundApp.less';

const { Content } = Layout;

type VisualizerDeviceType = 'web' | 'android' | 'ios';

export type DeviceType = VisualizerDeviceType | 'harmony';

export interface PlaygroundAppProps {
  serverUrl: string;
  appVersion: string;
  title?: string;
  defaultDeviceType?: DeviceType;
  branding?: Partial<PlaygroundBranding>;
  playgroundConfig?: Partial<UniversalPlaygroundConfig>;
  offlineTitle?: string;
  offlineStatusText?: string;
  pollIntervalMs?: number;
}

export function PlaygroundApp({
  serverUrl,
  appVersion,
  title = 'Playground',
  defaultDeviceType = 'web',
  branding,
  playgroundConfig,
  offlineTitle = 'Midscene Playground',
  offlineStatusText = 'Server offline...',
  pollIntervalMs = 5000,
}: PlaygroundAppProps) {
  const [serverOnline, setServerOnline] = useState(false);
  const [isUserOperating, setIsUserOperating] = useState(false);
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [deviceType, setDeviceType] = useState<DeviceType>(defaultDeviceType);

  const playgroundSDK = useMemo(() => {
    const sdk = new PlaygroundSDK({
      type: 'remote-execution',
      serverUrl,
    });

    sdk.onProgressUpdate((tip: string) => {
      setIsUserOperating(Boolean(tip));
    });

    return sdk;
  }, [serverUrl]);

  useEffect(() => {
    let active = true;

    const checkServer = async () => {
      try {
        const online = await playgroundSDK.checkStatus();
        if (!active) return;
        setServerOnline(online);

        if (!online) return;

        try {
          const interfaceInfo = await playgroundSDK.getInterfaceInfo();
          if (!active || !interfaceInfo?.type) return;

          const type = interfaceInfo.type.toLowerCase();
          if (
            type === 'android' ||
            type === 'ios' ||
            type === 'web' ||
            type === 'harmony'
          ) {
            setDeviceType(type);
          }
        } catch (error) {
          console.warn('Failed to get interface info:', error);
        }
      } catch (error) {
        if (!active) return;
        console.error('Failed to check server status:', error);
        setServerOnline(false);
      }
    };

    checkServer();
    const interval = window.setInterval(checkServer, pollIntervalMs);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [playgroundSDK, pollIntervalMs]);

  useEffect(() => {
    const handleResize = () => {
      setIsNarrowScreen(window.innerWidth <= 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const mergedConfig: UniversalPlaygroundConfig = {
    showContextPreview: false,
    layout: 'vertical',
    showVersionInfo: true,
    enableScrollToBottom: true,
    serverMode: true,
    showEnvConfigReminder: true,
    deviceType: deviceType === 'harmony' ? 'ios' : deviceType,
    ...playgroundConfig,
  };

  const mergedBranding: PlaygroundBranding = {
    ...branding,
    title: branding?.title ?? title,
    version: branding?.version ?? appVersion,
  };

  if (!serverOnline) {
    return (
      <ConfigProvider theme={globalThemeConfig()}>
        <div className="server-offline-container">
          <div className="server-offline-message">
            <Logo />
            <div className="server-offline-content">
              <div className="server-offline-icon">
                <ServerOfflineBackground className="icon-background" />
                <ServerOfflineForeground className="icon-foreground" />
              </div>
              <h1>{offlineTitle}</h1>
              <p className="connection-status">{offlineStatusText}</p>
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
            <Panel
              defaultSize={isNarrowScreen ? 67 : 32}
              maxSize={isNarrowScreen ? 85 : 60}
              minSize={isNarrowScreen ? 67 : 25}
              className="app-panel left-panel"
            >
              <div className="panel-content left-panel-content">
                <div className="playground-panel-header">
                  <div className="header-row">
                    <Logo />
                    <NavActions
                      showTooltipWhenEmpty={false}
                      showModelName={false}
                    />
                  </div>
                </div>

                <div className="playground-panel-playground">
                  <UniversalPlayground
                    playgroundSDK={playgroundSDK}
                    config={mergedConfig}
                    branding={mergedBranding}
                    className="playground-container"
                  />
                </div>
              </div>
            </Panel>

            <PanelResizeHandle
              className={`panel-resize-handle ${isNarrowScreen ? 'vertical' : 'horizontal'}`}
            />

            <Panel className="app-panel right-panel">
              <div className="panel-content right-panel-content">
                <ScreenshotViewer
                  getScreenshot={() => playgroundSDK.getScreenshot()}
                  getInterfaceInfo={() => playgroundSDK.getInterfaceInfo()}
                  serverOnline={serverOnline}
                  isUserOperating={isUserOperating}
                  mjpegUrl={
                    deviceType === 'ios' || deviceType === 'harmony'
                      ? `${serverUrl}/mjpeg`
                      : undefined
                  }
                />
              </div>
            </Panel>
          </PanelGroup>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
