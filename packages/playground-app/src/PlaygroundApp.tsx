import { PlaygroundSDK } from '@midscene/playground';
import {
  type DeviceType,
  Logo,
  NavActions,
  type PlaygroundBranding,
  UniversalPlayground,
  type UniversalPlaygroundConfig,
  globalThemeConfig,
} from '@midscene/visualizer';
import { Button, ConfigProvider, Layout, Modal } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { PreviewRenderer } from './PreviewRenderer';
import ServerOfflineBackground from './icons/server-offline-background.svg';
import ServerOfflineForeground from './icons/server-offline-foreground.svg';
import { useServerStatus } from './useServerStatus';
import './PlaygroundApp.less';

const { Content } = Layout;

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
  const countdownSeconds = playgroundConfig?.executionUx?.countdownSeconds ?? 3;

  const playgroundSDK = useMemo(() => {
    return new PlaygroundSDK({
      type: 'remote-execution',
      serverUrl,
    });
  }, [serverUrl]);

  const {
    serverOnline,
    isUserOperating,
    deviceType,
    runtimeInfo,
    executionUxHints,
  } = useServerStatus(playgroundSDK, defaultDeviceType, pollIntervalMs);

  const countdownTimerRef = useRef<number | null>(null);
  const countdownResolveRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  const finishCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    const resolve = countdownResolveRef.current;
    countdownResolveRef.current = null;

    if (mountedRef.current) {
      setCountdown(null);
    }

    resolve?.();
  }, []);

  const showCountdownModal = useCallback(async () => {
    if (countdownSeconds <= 0) {
      return;
    }

    finishCountdown();

    return new Promise<void>((resolve) => {
      countdownResolveRef.current = resolve;
      let count = countdownSeconds;

      if (mountedRef.current) {
        setCountdown(count);
      }

      countdownTimerRef.current = window.setInterval(() => {
        count -= 1;
        if (count > 0) {
          if (mountedRef.current) {
            setCountdown(count);
          }
          return;
        }

        if (count === 0) {
          if (mountedRef.current) {
            setCountdown('GO!');
          }
          return;
        }

        finishCountdown();
      }, 1000);
    });
  }, [countdownSeconds, finishCountdown]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      finishCountdown();
    };
  }, [finishCountdown]);

  useEffect(() => {
    if (!executionUxHints.includes('countdown-before-run')) {
      playgroundSDK.setBeforeActionHook(undefined);
      return;
    }

    playgroundSDK.setBeforeActionHook(async () => {
      await showCountdownModal();
    });

    return () => {
      playgroundSDK.setBeforeActionHook(undefined);
    };
  }, [executionUxHints, playgroundSDK, showCountdownModal]);

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
    deviceType,
    executionUx: {
      hints: executionUxHints,
      countdownSeconds,
    },
    ...playgroundConfig,
  };

  const mergedBranding: PlaygroundBranding = {
    ...branding,
    title: runtimeInfo?.title ?? title,
    version: appVersion,
    targetName:
      runtimeInfo?.platformId ?? branding?.targetName ?? deviceType ?? 'screen',
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
        footer={
          <Button onClick={finishCountdown} type="default">
            Skip countdown
          </Button>
        }
        closable
        maskClosable
        onCancel={finishCountdown}
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
            The selected session requested a countdown before execution.
            <br />
            Please wait until the run starts.
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
                      playgroundSDK={playgroundSDK}
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
                <PreviewRenderer
                  playgroundSDK={playgroundSDK}
                  runtimeInfo={runtimeInfo}
                  serverUrl={serverUrl}
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
