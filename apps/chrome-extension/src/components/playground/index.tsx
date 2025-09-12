import { decomposeAIAction, generateCode } from '@midscene/core';
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

  // Simplified agent tracking using a single ref for both agent and SDK
  const agentInfoRef = useRef<{ agent: any; sdk: PlaygroundSDK } | null>(null);

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

  // Helper to cleanup agent
  const cleanupAgent = useCallback((agent: any) => {
    if (agent) {
      try {
        agent.page?.destroy?.();
        agent.destroy?.();
      } catch (error) {
        console.warn('Failed to cleanup agent:', error);
      }
    }
  }, []);

  // Create SDK when needed
  const playgroundSDK = useMemo(() => {
    if (!runEnabled) {
      return null;
    }

    try {
      const agent = getAgent(forceSameTabNavigation);
      if (!agent) {
        throw new Error('Please configure AI settings first');
      }

      // Check if we can reuse existing SDK
      if (agentInfoRef.current && agentInfoRef.current.agent === agent) {
        return agentInfoRef.current.sdk;
      }

<<<<<<< HEAD
      // Need to create new SDK
      // Clean up previous agent if it exists
      if (agentInfoRef.current) {
        cleanupAgent(agentInfoRef.current.agent);
      }
=======
        // Execute the action
        const result = await sdk.executeAction(
          actionType,
          value,
          options || {},
        );

        // Generate code if execution was successful and result exists
        if (
          result &&
          typeof result === 'object' &&
          'result' in result &&
          !(result as any).error &&
          (result as any).result !== undefined
        ) {
          try {
            const actionSpace = await sdk.getActionSpace();

            // Check if this action needs structured params
            const action = actionSpace?.find(
              (a: any) =>
                a.interfaceAlias === actionType || a.name === actionType,
            );
            const needsStructuredParams = !!action?.paramSchema;

            // Generate code from parameters
            const parameters = needsStructuredParams
              ? value.params || {}
              : { prompt: value.prompt };
            const generatedCode = generateCode(actionType, parameters);

            // For aiAction, also generate decomposition
            const decomposition =
              actionType === 'aiAction' && value.prompt
                ? decomposeAIAction(value.prompt, (result as any).result)
                : undefined;

            // Add code generation data to result
            return {
              ...result,
              generatedCode,
              decomposition,
              actionType,
            };
          } catch (codeGenError) {
            console.warn('Code generation failed:', codeGenError);
            // Return result without code generation if it fails
            return result;
          }
        }

        return result;
      },
      getActionSpace: (context?: any) => {
        // Only try to get action space when config is ready
        try {
          if (!runEnabled) {
            return Promise.resolve([]);
          }
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
>>>>>>> 330854ea (fix(chrome-extension): correct import path for EnvConfigReminder and remove unused playground component)

      // Detach all debuggers before creating new SDK
      detachAllDebuggers().then(() => {
        console.log('[DEBUG] Detached all debuggers before creating SDK');
      });

      // Create new SDK
      const newSdk = new PlaygroundSDK({
        type: 'local-execution',
        agent: agent,
      });

      // Store the new agent and SDK
      agentInfoRef.current = { agent, sdk: newSdk };
      return newSdk;
    } catch (error) {
      console.error('Failed to initialize PlaygroundSDK:', error);
      return null;
    }
  }, [runEnabled, getAgent, forceSameTabNavigation, cleanupAgent]);

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

  // Cleanup effect to detach chrome.debugger when component unmounts
  useEffect(() => {
    return () => {
      // When component unmounts, clean up agent and detach all debuggers
      if (agentInfoRef.current) {
        cleanupAgent(agentInfoRef.current.agent);
        agentInfoRef.current = null;
      }
    };
  }, [cleanupAgent]);

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
