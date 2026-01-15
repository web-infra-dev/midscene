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
import { ConfigProvider, Layout, notification } from 'antd';
import { useEffect, useMemo } from 'react';

const { Content } = Layout;

declare const __APP_VERSION__: string;

export default function App() {
  const { config } = useEnvConfig();
  const [notificationApi, contextHolder] = notification.useNotification();

  // Override AI configuration when config changes
  useEffect(() => {
    safeOverrideAIConfig(config);
  }, [config]);

  // Initialize PlaygroundSDK for remote execution
  const playgroundSDK = useMemo(() => {
    const sdk = new PlaygroundSDK({
      type: 'remote-execution',
    });

    // Wrap the executeAction method to show notifications
    const originalExecuteAction = sdk.executeAction.bind(sdk);
    sdk.executeAction = async (
      actionType: string,
      value: any,
      options: any,
    ) => {
      // Show notification when execution starts
      notificationApi.info({
        message: '自动化开始',
        description: '窗口将在 1.5 秒后自动最小化，请勿操作',
        duration: 2,
        placement: 'top',
      });

      const result = await originalExecuteAction(actionType, value, options);
      return result;
    };

    return sdk;
  }, [notificationApi]);

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
