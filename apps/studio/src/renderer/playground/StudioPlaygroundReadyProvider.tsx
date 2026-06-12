import {
  PlaygroundThemeProvider,
  usePlaygroundController,
} from '@midscene/playground-app';
import type { StudioPlatformId } from '@shared/electron-contract';
import { Form } from 'antd';
import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { resolveDiscoveredDeviceSelectionFormValues } from './selectors';
import type {
  DiscoveredDevicesByPlatform,
  DiscoveryErrorsByPlatform,
} from './types';
import { StudioPlaygroundContext } from './useStudioPlayground';

const DEFAULT_PLATFORM_ID: StudioPlatformId = 'android';

interface StudioPlaygroundReadyProviderProps {
  discoveredDevices?: DiscoveredDevicesByPlatform;
  discoveryErrors?: DiscoveryErrorsByPlatform;
  refreshDiscoveredDevices: () => Promise<void>;
  restartPlayground: () => Promise<void>;
  setDiscoveryPollingPaused: (paused: boolean) => void;
  serverUrl: string;
}

export default function StudioPlaygroundReadyProvider({
  children,
  discoveredDevices,
  discoveryErrors,
  refreshDiscoveredDevices,
  restartPlayground,
  setDiscoveryPollingPaused,
  serverUrl,
}: PropsWithChildren<StudioPlaygroundReadyProviderProps>) {
  const handleCountdownFinish = useCallback(() => {
    void window.electronShell?.minimizeWindow();
  }, []);

  const controller = usePlaygroundController({
    initialFormValues: { platformId: DEFAULT_PLATFORM_ID },
    serverUrl,
    // Computer mode hands control of the desktop to the agent right after the
    // countdown; minimise Studio so the controlled apps are in view instead
    // of the Studio chrome.
    onCountdownFinish: handleCountdownFinish,
  });

  useEffect(() => {
    const selectionPatch = resolveDiscoveredDeviceSelectionFormValues({
      discoveredDevices,
      formValues: controller.state.formValues,
    });
    if (!selectionPatch) {
      return;
    }

    controller.state.form.setFieldsValue(selectionPatch);
  }, [controller.state.form, controller.state.formValues, discoveredDevices]);

  const contextValue = useMemo(
    () => ({
      phase: 'ready' as const,
      serverUrl,
      controller,
      restartPlayground,
      refreshDiscoveredDevices,
      setDiscoveryPollingPaused,
      discoveredDevices,
      discoveryErrors,
    }),
    [
      controller,
      discoveredDevices,
      discoveryErrors,
      refreshDiscoveredDevices,
      restartPlayground,
      setDiscoveryPollingPaused,
      serverUrl,
    ],
  );

  return (
    <PlaygroundThemeProvider>
      <StudioPlaygroundContext.Provider value={contextValue}>
        <Form form={controller.state.form} component={false} />
        {children}
      </StudioPlaygroundContext.Provider>
    </PlaygroundThemeProvider>
  );
}
