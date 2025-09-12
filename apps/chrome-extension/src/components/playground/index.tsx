import { PlaygroundSDK } from '@midscene/playground';
import {
  LocalStorageProvider,
  UniversalPlayground,
} from '@midscene/visualizer';
import { useEnvConfig } from '@midscene/visualizer';
import { useCallback, useEffect, useMemo, useRef } from 'react';
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

  // Create storage provider for persistence
  const storage = useMemo(
    () => new LocalStorageProvider('chrome-extension-playground'),
    [],
  );

  // Use the same pattern as original BrowserExtensionPlayground
  const sdkRef = useRef<PlaygroundSDK | null>(null);
  const currentAgent = useRef<any>(null);

  // Helper function to detach all debuggers
  const detachAllDebuggers = async () => {
    try {
      const targets = await chrome.debugger.getTargets();
      for (const target of targets) {
        if (target.attached && target.tabId) {
          try {
            await chrome.debugger.detach({ tabId: target.tabId });
          } catch (e) {
            // Ignore errors, debugger might already be detached
          }
        }
      }
    } catch (e) {
      console.warn('Failed to detach debuggers:', e);
    }
  };

  // Create SDK only when needed, following original playground pattern
  const getOrCreateSDK = useCallback(() => {
    const agent = getAgent(forceSameTabNavigation);
    if (!agent) {
      throw new Error('Please configure AI settings first');
    }

    // Only recreate if agent has changed or SDK doesn't exist
    if (!sdkRef.current || currentAgent.current !== agent) {
      // Clean up previous agent and detach debugger if exists
      if (currentAgent.current && currentAgent.current !== agent) {
        try {
          // Call destroy to detach chrome.debugger
          currentAgent.current.page?.destroy?.();
          currentAgent.current.destroy?.();
        } catch (error) {
          console.warn('Failed to cleanup previous agent:', error);
        }
      }

      // Detach all debuggers before creating new SDK to ensure clean state
      detachAllDebuggers().then(() => {
        console.log('[DEBUG] Detached all debuggers before creating SDK');
      });

      try {
        sdkRef.current = new PlaygroundSDK({
          type: 'local-execution',
          agent: agent,
        });
        currentAgent.current = agent;
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

  // Use effect to ensure progress callbacks are properly forwarded
  useEffect(() => {
    if (playgroundSDK && !(playgroundSDK as any)._progressCallbackSetup) {
      const originalOnProgressUpdate =
        playgroundSDK.onProgressUpdate?.bind(playgroundSDK);

      playgroundSDK.onProgressUpdate = (callback: (tip: string) => void) => {
        // Forward to original method if it exists
        if (originalOnProgressUpdate) {
          originalOnProgressUpdate(callback);
        }
      };

      (playgroundSDK as any)._progressCallbackSetup = true;
    }
  }, [playgroundSDK]);

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

  // Cleanup effect to detach chrome.debugger when component unmounts
  useEffect(() => {
    return () => {
      // When component unmounts, clean up agent and detach all debuggers
      if (currentAgent.current) {
        try {
          // Destroy the page first (which detaches debugger)
          if (currentAgent.current.page?.destroy) {
            currentAgent.current.page.destroy();
          }
          // Then destroy the agent
          if (currentAgent.current.destroy) {
            currentAgent.current.destroy();
          }
          currentAgent.current = null;
          sdkRef.current = null;
        } catch (error) {
          console.warn('Failed to cleanup on unmount:', error);
        }
      }
    };
  }, []);

  return (
    <UniversalPlayground
      playgroundSDK={playgroundSDK}
      storage={storage}
      contextProvider={contextProvider}
      config={{
        showContextPreview,
        layout: 'vertical',
        showVersionInfo: true,
        enableScrollToBottom: true,
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
