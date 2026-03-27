import type { PlaygroundSessionSetup } from '@midscene/playground';
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
import {
  Alert,
  Button,
  ConfigProvider,
  Form,
  Layout,
  Modal,
  Space,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { PreviewRenderer } from './PreviewRenderer';
import { SessionSetupPanel } from './SessionSetupPanel';
import ServerOfflineBackground from './icons/server-offline-background.svg';
import ServerOfflineForeground from './icons/server-offline-foreground.svg';
import {
  buildSessionInitialValues,
  resolveSessionViewState,
} from './session-state';
import { useServerStatus } from './useServerStatus';
import './PlaygroundApp.less';

const { Content } = Layout;
const { Text } = Typography;

function getPlatformSelectorFieldKey(
  setup: PlaygroundSessionSetup | null,
): string | undefined {
  return setup?.platformSelector?.fieldKey;
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
  const [setupForm] = Form.useForm();
  const [sessionSetup, setSessionSetup] =
    useState<PlaygroundSessionSetup | null>(null);
  const [sessionSetupError, setSessionSetupError] = useState<string | null>(
    null,
  );
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionMutating, setSessionMutating] = useState(false);
  const [messageApi, messageContextHolder] = message.useMessage();
  const countdownSeconds = playgroundConfig?.executionUx?.countdownSeconds ?? 3;
  const platformSelectorFieldKey = getPlatformSelectorFieldKey(sessionSetup);
  const selectedPlatformId =
    Form.useWatch(platformSelectorFieldKey || 'platformId', setupForm) ??
    undefined;

  const playgroundSDK = useMemo(
    () =>
      new PlaygroundSDK({
        type: 'remote-execution',
        serverUrl,
      }),
    [serverUrl],
  );

  const {
    serverOnline,
    isUserOperating,
    deviceType,
    runtimeInfo,
    executionUxHints,
  } = useServerStatus(playgroundSDK, defaultDeviceType, pollIntervalMs);
  const sessionViewState = useMemo(
    () => resolveSessionViewState(runtimeInfo),
    [runtimeInfo],
  );

  const countdownTimerRef = useRef<number | null>(null);
  const countdownResolveRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const lastSetupPlatformIdRef = useRef<string | undefined>(undefined);

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

  const refreshSessionSetup = useCallback(
    async (input?: Record<string, unknown>) => {
      const currentValues = {
        ...setupForm.getFieldsValue(true),
        ...(input || {}),
      };

      setSessionLoading(true);
      try {
        const setup = await playgroundSDK.getSessionSetup(input);
        setSessionSetup(setup);
        setSessionSetupError(null);
        const currentPlatformSelectorFieldKey =
          getPlatformSelectorFieldKey(setup);
        lastSetupPlatformIdRef.current =
          currentPlatformSelectorFieldKey &&
          typeof currentValues[currentPlatformSelectorFieldKey] === 'string'
            ? (currentValues[currentPlatformSelectorFieldKey] as string)
            : undefined;
        setupForm.setFieldsValue(
          buildSessionInitialValues(setup, currentValues),
        );
      } catch (error) {
        console.error('Failed to load session setup:', error);
        setSessionSetupError(
          error instanceof Error
            ? error.message
            : 'Failed to load session setup',
        );
      } finally {
        setSessionLoading(false);
      }
    },
    [playgroundSDK, setupForm],
  );

  useEffect(() => {
    if (!serverOnline || sessionViewState.connected) {
      return;
    }

    refreshSessionSetup();
  }, [refreshSessionSetup, serverOnline, sessionViewState.connected]);

  useEffect(() => {
    if (!serverOnline || sessionViewState.connected || !selectedPlatformId) {
      return;
    }

    const currentPlatformSelectorFieldKey =
      getPlatformSelectorFieldKey(sessionSetup);
    if (!currentPlatformSelectorFieldKey) {
      return;
    }

    if (lastSetupPlatformIdRef.current === selectedPlatformId) {
      return;
    }

    refreshSessionSetup({
      ...setupForm.getFieldsValue(true),
      [currentPlatformSelectorFieldKey]: selectedPlatformId,
    });
  }, [
    platformSelectorFieldKey,
    refreshSessionSetup,
    selectedPlatformId,
    serverOnline,
    sessionSetup,
    sessionViewState.connected,
    setupForm,
  ]);

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

  const handleCreateSession = useCallback(async () => {
    try {
      const values = await setupForm.validateFields();
      setSessionMutating(true);
      await playgroundSDK.createSession(values);
      messageApi.success('Agent created');
      await refreshSessionSetup();
    } catch (error) {
      if ((error as { errorFields?: unknown }).errorFields) {
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create Agent';
      messageApi.error(errorMessage);
    } finally {
      setSessionMutating(false);
    }
  }, [messageApi, playgroundSDK, refreshSessionSetup, setupForm]);

  const handleDestroySession = useCallback(async () => {
    try {
      setSessionMutating(true);
      await playgroundSDK.destroySession();
      messageApi.success('Session disconnected');
      await refreshSessionSetup();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to disconnect session';
      messageApi.error(errorMessage);
    } finally {
      setSessionMutating(false);
    }
  }, [messageApi, playgroundSDK, refreshSessionSetup]);

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
      {messageContextHolder}
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
                  {sessionViewState.connected ? (
                    <UniversalPlayground
                      playgroundSDK={playgroundSDK}
                      config={mergedConfig}
                      branding={mergedBranding}
                      className="playground-container"
                    />
                  ) : (
                    <SessionSetupPanel
                      form={setupForm}
                      sessionSetup={sessionSetup}
                      sessionSetupError={sessionSetupError}
                      sessionViewState={sessionViewState}
                      sessionLoading={sessionLoading}
                      sessionMutating={sessionMutating}
                      onCreateSession={handleCreateSession}
                      onRefreshTargets={() =>
                        refreshSessionSetup(setupForm.getFieldsValue(true))
                      }
                    />
                  )}
                </div>
              </div>
            </Panel>

            <PanelResizeHandle
              className={`panel-resize-handle ${isNarrowScreen ? 'vertical' : 'horizontal'}`}
            />

            <Panel className="app-panel right-panel">
              <div className="panel-content right-panel-content">
                {sessionViewState.connected ? (
                  <>
                    <div className="session-toolbar">
                      <Text strong>
                        {sessionViewState.displayName || 'Connected session'}
                      </Text>
                      <Space size={8}>
                        <Button
                          onClick={handleDestroySession}
                          loading={sessionMutating}
                        >
                          Change target
                        </Button>
                      </Space>
                    </div>
                    <PreviewRenderer
                      playgroundSDK={playgroundSDK}
                      runtimeInfo={runtimeInfo}
                      serverUrl={serverUrl}
                      serverOnline={serverOnline}
                      isUserOperating={isUserOperating}
                    />
                  </>
                ) : (
                  <Alert
                    type="info"
                    showIcon
                    message={mergedBranding.title || 'Playground session'}
                    description={
                      sessionViewState.setupState === 'blocked'
                        ? sessionViewState.setupBlockingReason ||
                          'Resolve the local setup issue before creating an Agent.'
                        : 'Create an Agent from the left panel to enable preview and execution.'
                    }
                  />
                )}
              </div>
            </Panel>
          </PanelGroup>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
