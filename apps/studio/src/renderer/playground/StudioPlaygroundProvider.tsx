import {
  PlaygroundThemeProvider,
  usePlaygroundController,
} from '@midscene/playground-app';
import type {
  PlaygroundBootstrap,
  StudioPlatformId,
} from '@shared/electron-contract';
import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { bucketDiscoveredDevices } from './selectors';
import type { DiscoveredDevicesByPlatform } from './types';
import { StudioPlaygroundContext } from './useStudioPlayground';

function getMissingBridgeError() {
  return 'Studio preload bridge is unavailable. Restart the Electron app.';
}

function normalizeBootstrapError(bootstrap: PlaygroundBootstrap): string {
  return bootstrap.error || 'Failed to start playground runtime.';
}

// Default platform for Studio — pre-selected so the first session-setup
// poll already has a `platformId` and immediately returns Android
// targets, instead of the generic "Choose a platform" setup.
const DEFAULT_PLATFORM_ID: StudioPlatformId = 'android';

function ReadyStudioPlaygroundProvider({
  children,
  discoveredDevices,
  restartPlayground,
  serverUrl,
}: PropsWithChildren<{
  discoveredDevices?: DiscoveredDevicesByPlatform;
  restartPlayground: () => Promise<void>;
  serverUrl: string;
}>) {
  const controller = usePlaygroundController({
    serverUrl,
    initialFormValues: { platformId: DEFAULT_PLATFORM_ID },
  });

  const contextValue = useMemo(
    () => ({
      phase: 'ready' as const,
      serverUrl,
      controller,
      restartPlayground,
      discoveredDevices,
    }),
    [controller, discoveredDevices, restartPlayground, serverUrl],
  );

  return (
    <StudioPlaygroundContext.Provider value={contextValue}>
      {children}
    </StudioPlaygroundContext.Provider>
  );
}

const DISCOVERY_POLL_INTERVAL_MS = 5000;

export function StudioPlaygroundProvider({ children }: PropsWithChildren) {
  const [bootstrap, setBootstrap] = useState<
    | { phase: 'booting' }
    | { phase: 'error'; error: string }
    | { phase: 'ready'; serverUrl: string }
  >({ phase: 'booting' });
  const [bootstrapTick, setBootstrapTick] = useState(0);

  // Cross-platform device discovery — polls ALL platforms (ADB, HDC,
  // displays) once the playground runtime is ready, so the sidebar shows
  // devices from every platform simultaneously. Gated on the ready phase
  // to avoid waking up adb/hdc while we are still booting or in error.
  const [discoveredDevices, setDiscoveredDevices] = useState<
    DiscoveredDevicesByPlatform | undefined
  >();
  const pollingActive = bootstrap.phase === 'ready';
  useEffect(() => {
    if (!pollingActive || !window.studioRuntime?.discoverDevices) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const devices = await window.studioRuntime!.discoverDevices();
        if (!cancelled) {
          setDiscoveredDevices(bucketDiscoveredDevices(devices));
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[studio] device discovery failed:', err);
        }
      }
    };
    void poll();
    const id = window.setInterval(poll, DISCOVERY_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollingActive]);

  const readBootstrap = useCallback(async () => {
    if (!window.studioRuntime) {
      setBootstrap({
        phase: 'error',
        error: getMissingBridgeError(),
      });
      return;
    }

    const nextBootstrap = await window.studioRuntime.getPlaygroundBootstrap();
    if (nextBootstrap.status === 'ready' && nextBootstrap.serverUrl) {
      setBootstrap({
        phase: 'ready',
        serverUrl: nextBootstrap.serverUrl,
      });
      return;
    }

    if (nextBootstrap.status === 'error') {
      setBootstrap({
        phase: 'error',
        error: normalizeBootstrapError(nextBootstrap),
      });
      return;
    }

    setBootstrap({ phase: 'booting' });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncBootstrap = async () => {
      await readBootstrap();
      if (cancelled) {
        return;
      }
    };

    void syncBootstrap();

    if (bootstrap.phase !== 'booting') {
      return () => {
        cancelled = true;
      };
    }

    const intervalId = window.setInterval(() => {
      void syncBootstrap();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [bootstrap.phase, bootstrapTick, readBootstrap]);

  const restartPlayground = useCallback(async () => {
    setBootstrap({ phase: 'booting' });

    if (!window.studioRuntime) {
      setBootstrap({
        phase: 'error',
        error: getMissingBridgeError(),
      });
      return;
    }

    const nextBootstrap = await window.studioRuntime.restartPlayground();
    if (nextBootstrap.status === 'ready' && nextBootstrap.serverUrl) {
      setBootstrap({
        phase: 'ready',
        serverUrl: nextBootstrap.serverUrl,
      });
    } else if (nextBootstrap.status === 'error') {
      setBootstrap({
        phase: 'error',
        error: normalizeBootstrapError(nextBootstrap),
      });
    } else {
      setBootstrap({ phase: 'booting' });
      setBootstrapTick((current) => current + 1);
    }
  }, []);

  const contextValue = useMemo(() => {
    if (bootstrap.phase === 'error') {
      return {
        phase: 'error' as const,
        error: bootstrap.error,
        restartPlayground,
        discoveredDevices,
      };
    }

    return {
      phase: 'booting' as const,
      restartPlayground,
      discoveredDevices,
    };
  }, [bootstrap, discoveredDevices, restartPlayground]);

  return (
    <PlaygroundThemeProvider>
      {bootstrap.phase === 'ready' ? (
        <ReadyStudioPlaygroundProvider
          discoveredDevices={discoveredDevices}
          restartPlayground={restartPlayground}
          serverUrl={bootstrap.serverUrl}
        >
          {children}
        </ReadyStudioPlaygroundProvider>
      ) : (
        <StudioPlaygroundContext.Provider value={contextValue}>
          {children}
        </StudioPlaygroundContext.Provider>
      )}
    </PlaygroundThemeProvider>
  );
}
