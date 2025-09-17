import { PlaygroundSDK } from '@midscene/playground';
import {
  Logo,
  NavActions,
  UniversalPlayground,
  useEnvConfig,
} from '@midscene/visualizer';
import { useEffect, useMemo } from 'react';
import './index.less';

declare const __APP_VERSION__: string;

/**
 * Playground panel component for Android Playground using Universal Playground
 * Replaces the left panel with form and results
 */
export default function PlaygroundPanel() {
  // Get config from the global state
  const { config } = useEnvConfig();

  // Initialize PlaygroundSDK for remote execution
  const playgroundSDK = useMemo(() => {
    return new PlaygroundSDK({
      type: 'remote-execution',
    });
  }, []);

  // Check server status on mount to initialize SDK ID
  useEffect(() => {
    const checkServer = async () => {
      try {
        const online = await playgroundSDK.checkStatus();
        console.log(
          '[DEBUG] Android playground server status:',
          online,
          'ID:',
          playgroundSDK.id,
        );
      } catch (error) {
        console.error(
          'Failed to check android playground server status:',
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
    <div className="playground-panel">
      {/* Header with Logo and Config */}
      <div className="playground-panel-header">
        <div className="header-row">
          <Logo />
          <NavActions showTooltipWhenEmpty={false} showModelName={false} />
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
            title: 'Android Playground',
            version: __APP_VERSION__,
          }}
          className="playground-container"
        />
      </div>
    </div>
  );
}
