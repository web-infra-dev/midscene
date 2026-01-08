import { PlaygroundSDK } from '@midscene/playground';
import { UniversalPlayground } from '@midscene/visualizer';
import { useEnvConfig } from '@midscene/visualizer';
import { useEffect, useMemo, useState } from 'react';
import { getExtensionVersion } from '../../utils/chrome';
import './index.less';

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

  // Track active tab to trigger SDK recreation on tab change
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  useEffect(() => {
    const updateActiveTab = () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        setActiveTabId(tabs[0]?.id ?? null);
      });
    };
    updateActiveTab();
    chrome.tabs.onActivated.addListener(updateActiveTab);
    return () => chrome.tabs.onActivated.removeListener(updateActiveTab);
  }, []);

  // Create SDK when needed - recreate on tab change
  const playgroundSDK = useMemo(() => {
    if (!runEnabled || activeTabId === null) {
      return null;
    }

    try {
      return new PlaygroundSDK({
        type: 'local-execution',
        agentFactory: () => getAgent(forceSameTabNavigation),
      });
    } catch (error) {
      console.error('Failed to initialize PlaygroundSDK:', error);
      return null;
    }
  }, [runEnabled, getAgent, forceSameTabNavigation, activeTabId]);

  // Progress callback handling is now managed in usePlaygroundExecution hook
  // No need to override onProgressUpdate here

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
