import { PlaygroundSDK } from '@midscene/playground';
import { UniversalPlayground } from '@midscene/visualizer';
import { useEnvConfig } from '@midscene/visualizer';
import { useCallback, useMemo, useRef } from 'react';
import { getExtensionVersion } from '../../utils/chrome';

declare const __SDK_VERSION__: string;

export interface PlaygroundProps {
  getAgent: (forceSameTabNavigation?: boolean) => any | null;
  showContextPreview?: boolean;
  dryMode?: boolean;
}

// Browser Extension Playground Component using Universal Playground
export function BrowserExtensionPlayground({
  getAgent,
  showContextPreview = true,
  dryMode = false,
}: PlaygroundProps) {
  const extensionVersion = getExtensionVersion();
  const { forceSameTabNavigation } = useEnvConfig((state) => ({
    forceSameTabNavigation: state.forceSameTabNavigation,
  }));

  // Check if run button should be enabled - but DON'T call getAgent yet
  const { config } = useEnvConfig();
  const runEnabled = !!getAgent && Object.keys(config || {}).length >= 1;

  // Use the same pattern as original BrowserExtensionPlayground
  const sdkRef = useRef<PlaygroundSDK | null>(null);
  const currentAgent = useRef<any>(null);

  // Create SDK only when needed, following original playground pattern
  const getOrCreateSDK = useCallback(() => {
    const agent = getAgent(forceSameTabNavigation);
    if (!agent) {
      throw new Error('Please configure AI settings first');
    }

    // Only recreate if agent has changed or SDK doesn't exist
    if (!sdkRef.current || currentAgent.current !== agent) {
      try {
        sdkRef.current = new PlaygroundSDK({
          type: 'local-execution',
          agent: agent,
        });
        currentAgent.current = agent;

        console.log(
          '[DEBUG] Chrome extension PlaygroundSDK created, ID:',
          sdkRef.current.id,
        );
      } catch (error) {
        console.error('Failed to create PlaygroundSDK:', error);
        throw error;
      }
    }
    return sdkRef.current;
  }, [getAgent, forceSameTabNavigation]);

  // Get the current SDK - create it lazily when needed
  const playgroundSDK = useMemo(() => {
    try {
      if (!runEnabled) {
        return null;
      }
      return getOrCreateSDK();
    } catch (error) {
      console.error('Failed to initialize PlaygroundSDK:', error);
      return null;
    }
  }, [getOrCreateSDK, runEnabled]);

  // Context provider - delay creation until actually needed
  const contextProvider = useMemo(() => {
    if (!showContextPreview) {
      return undefined;
    }

    // Return a lazy context provider that only creates agent when needed
    return {
      async getUIContext() {
        try {
          const agent = getAgent(forceSameTabNavigation);
          if (!agent) {
            throw new Error('Please configure AI settings first');
          }
          return agent.page.screenshot();
        } catch (error) {
          console.warn('Failed to get UI context:', error);
          // Return null context instead of throwing to allow UI to initialize
          return null;
        }
      },
      async refreshContext() {
        try {
          const agent = getAgent(forceSameTabNavigation);
          if (!agent) {
            throw new Error('Please configure AI settings first');
          }
          return agent.page.screenshot();
        } catch (error) {
          console.warn('Failed to refresh context:', error);
          // Return null context instead of throwing to allow UI to initialize
          return null;
        }
      },
    };
  }, [showContextPreview, getAgent, forceSameTabNavigation]);

  return (
    <UniversalPlayground
      playgroundSDK={playgroundSDK}
      contextProvider={contextProvider}
      config={{
        showContextPreview,
        layout: 'vertical',
        showVersionInfo: true,
        enableScrollToBottom: true,
        storageNamespace: 'chrome-extension-playground',
        showEnvConfigReminder: true,
      }}
      branding={{
        title: 'Playground',
        version: `${extensionVersion}(SDK v${__SDK_VERSION__})`,
      }}
      className="chrome-extension-playground"
      dryMode={dryMode}
    />
  );
}

export default BrowserExtensionPlayground;
