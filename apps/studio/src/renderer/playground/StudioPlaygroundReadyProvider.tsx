import {
  PlaygroundThemeProvider,
  usePlaygroundController,
} from '@midscene/playground-app';
import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';
import type { DiscoveredDevicesByPlatform } from './types';
import { StudioPlaygroundContext } from './useStudioPlayground';

interface StudioPlaygroundReadyProviderProps {
  discoveredDevices?: DiscoveredDevicesByPlatform;
  refreshDiscoveredDevices: () => Promise<void>;
  restartPlayground: () => Promise<void>;
  setDiscoveryPollingPaused: (paused: boolean) => void;
  serverUrl: string;
}

export default function StudioPlaygroundReadyProvider({
  children,
  discoveredDevices,
  refreshDiscoveredDevices,
  restartPlayground,
  setDiscoveryPollingPaused,
  serverUrl,
}: PropsWithChildren<StudioPlaygroundReadyProviderProps>) {
  const controller = usePlaygroundController({
    serverUrl,
  });

  const contextValue = useMemo(
    () => ({
      phase: 'ready' as const,
      serverUrl,
      controller,
      restartPlayground,
      refreshDiscoveredDevices,
      setDiscoveryPollingPaused,
      discoveredDevices,
    }),
    [
      controller,
      discoveredDevices,
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
