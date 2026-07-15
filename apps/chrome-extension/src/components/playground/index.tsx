import { PlaygroundSDK } from '@midscene/playground';
import { UniversalPlayground } from '@midscene/visualizer';
import { useEnvConfig } from '@midscene/visualizer';
import { Empty } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { getExtensionVersion } from '../../utils/chrome';
import './index.less';

declare const __SDK_VERSION__: string;

export interface PlaygroundProps {
  getAgent: (forceSameTabNavigation?: boolean) => any | null;
  showContextPreview?: boolean;
  dryMode?: boolean;
  onPlaygroundSDKChange?: (sdk: PlaygroundSDK | null) => void;
}

function ExtensionWelcomeEmptyState() {
  return (
    <div className="extension-welcome-empty-state">
      <Empty
        image={
          <img
            alt=""
            className="extension-welcome-midscene-icon"
            src="icon128.png"
          />
        }
        description={
          <div className="extension-welcome-copy">
            <div className="extension-welcome-title">
              Welcome to Midscene.js Playground!
            </div>
            <p>
              This is a panel for experimenting and testing Midscene.js
              features. You can use natural language instructions to operate the
              web page, such as clicking buttons, filling in forms, and querying
              information.
            </p>
            <p>
              Please enter your instructions in the input box below to start
              experiencing.
            </p>
          </div>
        }
      />
    </div>
  );
}

// Browser Extension Playground Component using Universal Playground
export function BrowserExtensionPlayground({
  getAgent,
  showContextPreview = true,
  dryMode = false,
  onPlaygroundSDKChange,
}: PlaygroundProps) {
  const extensionVersion = getExtensionVersion();
  const forceSameTabNavigation = useEnvConfig(
    (state) => state.forceSameTabNavigation,
  );

  // Initialize SDK whenever the extension can attach to the active tab.
  // Execution remains gated elsewhere by the saved model configuration.
  const canInitializeSDK = !!getAgent;

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
    if (!canInitializeSDK || activeTabId === null) {
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
  }, [canInitializeSDK, getAgent, forceSameTabNavigation, activeTabId]);

  useEffect(() => {
    onPlaygroundSDKChange?.(playgroundSDK);
  }, [playgroundSDK, onPlaygroundSDKChange]);

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
        // The SDK is intentionally recreated when the active browser tab
        // changes. Keep the Playground conversation independent of that
        // short-lived SDK instance so a tab switch does not open an empty
        // session.
        storageNamespace: 'chrome-extension-playground',
        layout: 'vertical',
        showVersionInfo: true,
        enableScrollToBottom: true,
        showEnvConfigReminder: true,
        emptyState: <ExtensionWelcomeEmptyState />,
        // Studio uses a timeline wrapper for its execution-flow connectors.
        // Keep that structure local to the extension so Studio remains
        // unaffected while both surfaces share the same progress-row markup.
        timelineWrapper: (content, { headerAction }) => (
          <div className="chrome-extension-execution-timeline-skin">
            {headerAction}
            {content}
          </div>
        ),
      }}
      branding={{
        title: 'Playground',
        version: `${extensionVersion}(SDK v${__SDK_VERSION__})`,
      }}
      // Use the same compact execution-flow skin as Studio. The extension
      // keeps its own shell and controls, while this shared class normalizes
      // progress rows into Studio-style timeline entries.
      className="chrome-extension-playground playground-conversation-skin"
      dryMode={dryMode}
    />
  );
}

export default BrowserExtensionPlayground;
