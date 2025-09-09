import { PlaygroundSDK } from '@midscene/playground';
import {
  LocalStorageProvider,
  UniversalPlayground,
} from '@midscene/visualizer';
import { useEnvConfig } from '@midscene/visualizer';
import { useCallback, useMemo, useRef } from 'react';
import PlaygroundIcon from '../icons/playground.svg?react';
import { getExtensionVersion } from '../utils/chrome';
import './playground.less';

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

  // Create storage provider for persistence
  const storage = useMemo(
    () => new LocalStorageProvider('chrome-extension-playground'),
    [],
  );

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

        // If we have a stored progress callback, re-apply it to the new SDK
        if (progressCallbackRef.current) {
          sdkRef.current.onProgressUpdate(progressCallbackRef.current);
        }
      } catch (error) {
        console.error('Failed to create PlaygroundSDK:', error);
        throw error;
      }
    }
    return sdkRef.current;
  }, [getAgent, forceSameTabNavigation]);

  // Store the current progress callback
  const progressCallbackRef = useRef<((tip: string) => void) | null>(null);

  // Create a wrapper SDK that uses the original pattern
  const wrappedSDK = useMemo(() => {
    return {
      executeAction: async (actionType: string, value: any, options?: any) => {
        const sdk = getOrCreateSDK();

        // Get agent and reset dump like the original playground does
        const agent = getAgent(forceSameTabNavigation);
        if (agent) {
          // Reset dump before execution
          if (agent.resetDump) {
            agent.resetDump();
          }
        }

        return sdk.executeAction(actionType, value, options || {});
      },
      getActionSpace: (context?: any) => {
        // Don't create SDK immediately for getActionSpace - return empty array until config is confirmed ready
        if (!runEnabled) {
          return Promise.resolve([]);
        }
        try {
          const sdk = getOrCreateSDK();
          return sdk.getActionSpace(context);
        } catch (error) {
          console.error('getActionSpace failed:', error);
          return Promise.resolve([]);
        }
      },
      overrideConfig: (aiConfig: any) => {
        const sdk = getOrCreateSDK();
        return sdk.overrideConfig?.(aiConfig);
      },
      checkStatus: () => {
        const sdk = getOrCreateSDK();
        return sdk.checkStatus?.();
      },
      cancelExecution: (requestId: string) => {
        const sdk = getOrCreateSDK();
        return sdk.cancelTask?.(requestId);
      },
      onProgressUpdate: (callback: (tip: string) => void) => {
        // Store the callback for our own use
        progressCallbackRef.current = callback;

        // Also call the underlying PlaygroundSDK's onProgressUpdate
        const sdk = getOrCreateSDK();
        if (sdk?.onProgressUpdate) {
          sdk.onProgressUpdate(callback);
        }
      },
    };
  }, [getOrCreateSDK, runEnabled, getAgent, forceSameTabNavigation]);

  // Context provider - delay creation until actually needed
  const contextProvider = useMemo(() => {
    if (!showContextPreview) {
      return undefined;
    }

    // Return a lazy context provider that only creates agent when needed
    return {
      async getUIContext() {
        const agent = getAgent(forceSameTabNavigation);
        if (!agent) {
          throw new Error('Please configure AI settings first');
        }
        return agent.page.screenshot();
      },
      async refreshContext() {
        const agent = getAgent(forceSameTabNavigation);
        if (!agent) {
          throw new Error('Please configure AI settings first');
        }
        return agent.page.screenshot();
      },
    };
  }, [showContextPreview, getAgent, forceSameTabNavigation]);

  return (
    <UniversalPlayground
      playgroundSDK={wrappedSDK}
      storage={storage}
      contextProvider={contextProvider}
      config={{
        showContextPreview,
        enablePersistence: true,
        layout: 'vertical',
        showVersionInfo: true,
        enableScrollToBottom: true,
      }}
      branding={{
        title: 'Playground',
        icon: PlaygroundIcon,
        version: `${extensionVersion}(SDK v${__SDK_VERSION__})`,
      }}
      className="chrome-extension-playground"
      dryMode={dryMode}
    />
  );
}

export default BrowserExtensionPlayground;
