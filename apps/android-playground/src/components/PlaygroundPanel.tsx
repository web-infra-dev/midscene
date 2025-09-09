import { PlaygroundSDK } from '@midscene/playground';
import {
  EnvConfig,
  Logo,
  MemoryStorageProvider,
  UniversalPlayground,
  useEnvConfig,
} from '@midscene/visualizer';
import { useEffect, useMemo } from 'react';

interface PlaygroundPanelProps {
  selectedDeviceId: string | null;
  serverValid: boolean;
  configAlreadySet: boolean;
  connectionReady: boolean;
}

/**
 * Playground panel component for Android Playground using Universal Playground
 * Replaces the left panel with form and results
 */
export default function PlaygroundPanel({
  selectedDeviceId,
  serverValid,
  configAlreadySet,
  connectionReady,
}: PlaygroundPanelProps) {
  // Get config from the global state
  const { config } = useEnvConfig();

  // Initialize PlaygroundSDK for remote execution
  const playgroundSDK = useMemo(() => {
    return new PlaygroundSDK({
      type: 'remote-execution',
    });
  }, []);

  // Override SDK config when configuration changes
  useEffect(() => {
    if (playgroundSDK.overrideConfig && config) {
      playgroundSDK.overrideConfig(config).catch((error) => {
        console.error('Failed to override SDK config:', error);
      });
    }
  }, [playgroundSDK, config]);

  // Memory storage for non-persistent mode
  const storage = useMemo(() => new MemoryStorageProvider(), []);

  // Create a wrapper SDK that includes validation checks
  const wrappedSDK = useMemo(() => {
    const originalExecuteAction =
      playgroundSDK.executeAction.bind(playgroundSDK);
    const originalGetActionSpace =
      playgroundSDK.getActionSpace.bind(playgroundSDK);
    const originalOverrideConfig =
      playgroundSDK.overrideConfig.bind(playgroundSDK);
    const originalCheckStatus = playgroundSDK.checkStatus.bind(playgroundSDK);
    const originalCancelExecution =
      playgroundSDK.cancelTask.bind(playgroundSDK);

    return {
      executeAction: async (actionType: string, value: any, options: any) => {
        if (!selectedDeviceId) {
          throw new Error('Please select a device first');
        }
        if (!configAlreadySet) {
          throw new Error('Please configure AI settings first');
        }
        if (!serverValid) {
          throw new Error('Server connection not available');
        }
        if (!connectionReady) {
          throw new Error(
            'Waiting for connection establishment, please try again later',
          );
        }

        // Add selectedDeviceId as context
        const optionsWithContext = {
          ...options,
          context: selectedDeviceId,
        };

        return originalExecuteAction(actionType, value, optionsWithContext);
      },
      getActionSpace: async () => {
        if (!selectedDeviceId) {
          return [];
        }
        return originalGetActionSpace(selectedDeviceId);
      },
      overrideConfig: originalOverrideConfig,
      checkStatus: originalCheckStatus,
      cancelExecution: originalCancelExecution,
      onProgressUpdate: (callback: (tip: string) => void) => {
        // For remote execution, pass the callback directly to the underlying PlaygroundSDK
        if (playgroundSDK.onProgressUpdate) {
          playgroundSDK.onProgressUpdate(callback);
        }
      },
    };
  }, [
    playgroundSDK,
    selectedDeviceId,
    configAlreadySet,
    serverValid,
    connectionReady,
  ]);

  return (
    <div className="playground-panel">
      {/* Header with Logo and Config */}
      <div className="playground-panel-header">
        <div className="header-row">
          <Logo />
          <EnvConfig />
        </div>
        <h2>Command input</h2>
      </div>

      {/* Main playground area */}
      <div className="playground-panel-content">
        {!selectedDeviceId ||
        !serverValid ||
        !configAlreadySet ||
        !connectionReady ? (
          <div className="placeholder-message">
            <h3>🚀 Ready to start?</h3>
            {!selectedDeviceId && (
              <p>Please select a connected device to begin testing.</p>
            )}
            {!configAlreadySet && <p>Please configure AI settings first.</p>}
            {selectedDeviceId && !connectionReady && (
              <p>Waiting for device connection...</p>
            )}
            {!serverValid && (
              <div className="server-start-tip">
                <p>
                  Don't worry, just one more step to launch the playground
                  server.
                </p>
                <strong>npx --yes @midscene/android-playground</strong>
              </div>
            )}
          </div>
        ) : (
          <UniversalPlayground
            playgroundSDK={wrappedSDK}
            storage={storage}
            config={{
              showContextPreview: false, // Android doesn't need context preview
              enablePersistence: false, // Use memory storage for android
              layout: 'vertical',
              showVersionInfo: false, // Version shown in main app
              enableScrollToBottom: true,
            }}
            branding={{
              title: 'Android Playground',
            }}
            className="android-universal-playground"
          />
        )}
      </div>
    </div>
  );
}
