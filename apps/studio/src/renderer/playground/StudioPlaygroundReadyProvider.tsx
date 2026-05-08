import {
  PlaygroundThemeProvider,
  usePlaygroundController,
} from '@midscene/playground-app';
import type { StudioPlatformId } from '@shared/electron-contract';
import type { PropsWithChildren } from 'react';
import { useEffect, useMemo } from 'react';
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
  const controller = usePlaygroundController({
    initialFormValues: { platformId: DEFAULT_PLATFORM_ID },
    serverUrl,
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
        {children}
      </StudioPlaygroundContext.Provider>
    </PlaygroundThemeProvider>
  );
}
