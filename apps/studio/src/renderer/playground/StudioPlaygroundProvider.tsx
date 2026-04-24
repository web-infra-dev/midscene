import type {
  DiscoverDevicesResult,
  PlaygroundBootstrap,
} from '@shared/electron-contract';
import type { PropsWithChildren } from 'react';
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { bucketDiscoveredDevices } from './selectors';
import type { DiscoveredDevicesByPlatform } from './types';
import { StudioPlaygroundContext } from './useStudioPlayground';

const ReadyStudioPlaygroundProvider = lazy(
  () => import('./StudioPlaygroundReadyProvider'),
);

function getMissingBridgeError() {
  return 'Studio preload bridge is unavailable. Restart the Electron app.';
}

function normalizeBootstrapError(bootstrap: PlaygroundBootstrap): string {
  return bootstrap.error || 'Failed to start playground runtime.';
}

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
  const applyDiscoveredDevices = useCallback(
    (devices: DiscoverDevicesResult) => {
      setDiscoveredDevices(bucketDiscoveredDevices(devices));
    },
    [],
  );

  const setDiscoveryPollingPausedValue = useCallback((paused: boolean) => {
    void window.studioRuntime?.setDiscoveryPollingPaused(paused);
  }, []);

  // Imperative scan — safe to call from anywhere (user-initiated refresh,
  // post-destroy session cleanup, etc). Resolves after state is updated.
  const refreshDiscoveredDevices = useCallback(async () => {
    const studioRuntime = window.studioRuntime;
    if (!studioRuntime?.discoverDevices) {
      return;
    }

    try {
      const devices = await studioRuntime.discoverDevices({
        forceRefresh: true,
      });
      applyDiscoveredDevices(devices);
    } catch (err) {
      console.warn('[studio] device discovery failed:', err);
    }
  }, [applyDiscoveredDevices]);

  useEffect(() => {
    if (bootstrap.phase !== 'ready') {
      return;
    }

    const studioRuntime = window.studioRuntime;
    if (!studioRuntime) {
      return;
    }

    let cancelled = false;
    const unsubscribe = studioRuntime.onDiscoveredDevicesChanged((devices) => {
      if (cancelled) {
        return;
      }
      applyDiscoveredDevices(devices);
    });

    void studioRuntime
      .discoverDevices()
      .then((devices) => {
        if (!cancelled) {
          applyDiscoveredDevices(devices);
        }
      })
      .catch((err) => {
        console.warn('[studio] initial device discovery failed:', err);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applyDiscoveredDevices, bootstrap.phase]);

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
        refreshDiscoveredDevices,
        setDiscoveryPollingPaused: setDiscoveryPollingPausedValue,
        discoveredDevices,
      };
    }

    return {
      phase: 'booting' as const,
      restartPlayground,
      refreshDiscoveredDevices,
      setDiscoveryPollingPaused: setDiscoveryPollingPausedValue,
      discoveredDevices,
    };
  }, [
    bootstrap,
    discoveredDevices,
    refreshDiscoveredDevices,
    restartPlayground,
    setDiscoveryPollingPausedValue,
  ]);

  const bootingContextValue = useMemo(
    () => ({
      phase: 'booting' as const,
      restartPlayground,
      refreshDiscoveredDevices,
      setDiscoveryPollingPaused: setDiscoveryPollingPausedValue,
      discoveredDevices,
    }),
    [
      discoveredDevices,
      refreshDiscoveredDevices,
      restartPlayground,
      setDiscoveryPollingPausedValue,
    ],
  );

  return bootstrap.phase === 'ready' ? (
    <Suspense
      fallback={
        <StudioPlaygroundContext.Provider value={bootingContextValue}>
          {children}
        </StudioPlaygroundContext.Provider>
      }
    >
      <ReadyStudioPlaygroundProvider
        discoveredDevices={discoveredDevices}
        refreshDiscoveredDevices={refreshDiscoveredDevices}
        restartPlayground={restartPlayground}
        setDiscoveryPollingPaused={setDiscoveryPollingPausedValue}
        serverUrl={bootstrap.serverUrl}
      >
        {children}
      </ReadyStudioPlaygroundProvider>
    </Suspense>
  ) : (
    <StudioPlaygroundContext.Provider value={contextValue}>
      {children}
    </StudioPlaygroundContext.Provider>
  );
}
