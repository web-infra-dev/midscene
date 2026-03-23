import {
  type PlaygroundPreviewDescriptor,
  type PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import {
  Logo,
  NavActions,
  type PlaygroundBranding,
  ScreenshotViewer,
  UniversalPlayground,
  type UniversalPlaygroundConfig,
  globalThemeConfig,
} from '@midscene/visualizer';
import { ConfigProvider, Layout, Modal } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import ServerOfflineBackground from './icons/server-offline-background.svg';
import ServerOfflineForeground from './icons/server-offline-foreground.svg';
import { useServerStatus } from './useServerStatus';
import './PlaygroundApp.less';

const { Content } = Layout;

type VisualizerDeviceType = 'web' | 'android' | 'ios';

export type DeviceType = VisualizerDeviceType | 'harmony' | 'computer';

function resolveVisualizerDeviceType(
  deviceType: DeviceType,
): VisualizerDeviceType {
  if (deviceType === 'android' || deviceType === 'ios') {
    return deviceType;
  }

  return 'web';
}

function resolvePreviewDescriptor(
  runtimeInfo: PlaygroundRuntimeInfo | null,
): PlaygroundPreviewDescriptor | null {
  return runtimeInfo?.preview || null;
}

function hasExecutionUxHint(
  runtimeInfo: PlaygroundRuntimeInfo | null,
  hint: string,
): boolean {
  return runtimeInfo?.executionUxHints.includes(hint) || false;
}

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
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [countdown, setCountdown] = useState<number | string | null>(null);
  const executeActionRestoreRef = useRef<(() => void) | null>(null);

  const playgroundSDK = useMemo(() => {
    return new PlaygroundSDK({
      type: 'remote-execution',
      serverUrl,
    });
  }, [serverUrl]);

  const { serverOnline, isUserOperating, deviceType, runtimeInfo } =
    useServerStatus(playgroundSDK, defaultDeviceType, pollIntervalMs);

  const showCountdownBeforeRun = hasExecutionUxHint(
    runtimeInfo,
    'countdown-before-run',
  );
  const preview = resolvePreviewDescriptor(runtimeInfo);
  const previewKind = preview?.kind || 'none';
  const mjpegPath = preview?.mjpegPath || '/mjpeg';
  const supportsPollingScreenshot =
    previewKind === 'screenshot' ||
    previewKind === 'scrcpy' ||
    Boolean(preview?.screenshotPath);

  const showCountdownModal = useCallback(async () => {
    if (!showCountdownBeforeRun) {
      return;
    }

    await new Promise<void>((resolve) => {
      let count = 3;
      setCountdown(count);

      const timer = window.setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdown(count);
        } else if (count === 0) {
          setCountdown('GO!');
        } else {
          window.clearInterval(timer);
          setCountdown(null);
          resolve();
        }
      }, 1000);
    });
  }, [showCountdownBeforeRun]);

  useEffect(() => {
    const handleResize = () => {
      setIsNarrowScreen(window.innerWidth <= 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const originalExecuteAction =
      playgroundSDK.executeAction.bind(playgroundSDK);

    playgroundSDK.executeAction = async (actionType, value, options) => {
      await showCountdownModal();
      return originalExecuteAction(actionType, value, options);
    };

    executeActionRestoreRef.current = () => {
      playgroundSDK.executeAction = originalExecuteAction;
    };

    return () => {
      executeActionRestoreRef.current?.();
      executeActionRestoreRef.current = null;
    };
  }, [playgroundSDK, showCountdownModal]);

  const mergedConfig: UniversalPlaygroundConfig = {
    showContextPreview: false,
    layout: 'vertical',
    showVersionInfo: true,
    enableScrollToBottom: true,
    serverMode: true,
    showEnvConfigReminder: true,
    deviceType: resolveVisualizerDeviceType(deviceType),
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
      <Modal
        open={countdown !== null}
        footer={null}
        closable={false}
        maskClosable={false}
        centered
        width={400}
        style={{ top: '30%' }}
        styles={{
          mask: { backgroundColor: 'rgba(0, 0, 0, 0.75)' },
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
          }}
        >
          <div
            style={{
              fontSize: '72px',
              fontWeight: 'bold',
              color: countdown === 'GO!' ? '#52c41a' : '#1890ff',
              marginBottom: '24px',
              lineHeight: 1,
            }}
          >
            {countdown}
          </div>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 500,
              marginBottom: '12px',
            }}
          >
            Automation Starting Soon
          </div>
          <div
            style={{
              fontSize: '14px',
              color: 'rgba(0, 0, 0, 0.65)',
            }}
          >
            The window will minimize automatically.
            <br />
            Please do not interact with the screen.
          </div>
        </div>
      </Modal>
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
                  getScreenshot={() =>
                    supportsPollingScreenshot
                      ? playgroundSDK.getScreenshot()
                      : Promise.resolve(null)
                  }
                  getInterfaceInfo={async () =>
                    runtimeInfo
                      ? {
                          type: runtimeInfo.interface.type,
                          description: runtimeInfo.interface.description,
                        }
                      : playgroundSDK.getInterfaceInfo()
                  }
                  serverOnline={serverOnline}
                  isUserOperating={isUserOperating}
                  mjpegUrl={
                    previewKind === 'mjpeg'
                      ? `${serverUrl}${mjpegPath}`
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
