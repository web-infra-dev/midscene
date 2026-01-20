import './App.less';
import { PlaygroundSDK } from '@midscene/playground';
import {
  Logo,
  NavActions,
  UniversalPlayground,
  globalThemeConfig,
  safeOverrideAIConfig,
  useEnvConfig,
} from '@midscene/visualizer';
import { ConfigProvider, Layout, Modal, notification } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

const { Content } = Layout;

declare const __APP_VERSION__: string;

export default function App() {
  const { config } = useEnvConfig();
  const [notificationApi, contextHolder] = notification.useNotification();
  const [countdown, setCountdown] = useState<number | string | null>(null);

  // Override AI configuration when config changes
  useEffect(() => {
    safeOverrideAIConfig(config);
  }, [config]);

  // Show countdown modal
  const showCountdownModal = useCallback(async () => {
    return new Promise<void>((resolve) => {
      let count = 3;
      setCountdown(count);

      const timer = setInterval(() => {
        count--;
        if (count > 0) {
          setCountdown(count);
        } else if (count === 0) {
          setCountdown('GO!');
        } else {
          clearInterval(timer);
          setCountdown(null);
          resolve();
        }
      }, 1000);
    });
  }, []);

  // Initialize PlaygroundSDK for remote execution
  const playgroundSDK = useMemo(() => {
    const sdk = new PlaygroundSDK({
      type: 'remote-execution',
    });

    // Wrap the executeAction method to show countdown
    const originalExecuteAction = sdk.executeAction.bind(sdk);
    sdk.executeAction = async (
      actionType: string,
      value: any,
      options: any,
    ) => {
      // Show countdown modal
      await showCountdownModal();

      const result = await originalExecuteAction(actionType, value, options);
      return result;
    };

    return sdk;
  }, [showCountdownModal]);

  // Check server status on mount
  useEffect(() => {
    const checkServer = async () => {
      try {
        const online = await playgroundSDK.checkStatus();
        console.log(
          '[DEBUG] Computer playground server status:',
          online,
          'ID:',
          playgroundSDK.id,
        );
      } catch (error) {
        console.error(
          'Failed to check computer playground server status:',
          error,
        );
      }
    };

    checkServer();
  }, [playgroundSDK]);

  // Override SDK config when configuration changes
  useEffect(() => {
    if (playgroundSDK.overrideConfig && config) {
      playgroundSDK.overrideConfig(config).catch((error) => {
        console.error('Failed to override SDK config:', error);
      });
    }
  }, [playgroundSDK, config]);

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      {contextHolder}
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
      <Layout className="app-container">
        <Content className="app-content">
          <div className="playground-panel">
            {/* Header with Logo and Config */}
            <div className="playground-panel-header">
              <div className="header-row">
                <Logo />
                <NavActions
                  showTooltipWhenEmpty={false}
                  showModelName={false}
                />
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
                  title: 'Computer Playground',
                  version: __APP_VERSION__,
                }}
                className="playground-container"
              />
            </div>
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
