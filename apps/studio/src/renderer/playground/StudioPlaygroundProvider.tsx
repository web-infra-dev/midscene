import {
  PlaygroundThemeProvider,
  usePlaygroundController,
} from '@midscene/playground-app';
import type {
  DiscoveredDevice,
  PlaygroundBootstrap,
} from '@shared/electron-contract';
import type { PropsWithChildren } from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import type {
  DiscoveredDevicesByPlatform,
  StudioSidebarPlatformKey,
} from './types';
import { StudioPlaygroundContext } from './useStudioPlayground';

function getMissingBridgeError() {
  return 'Studio preload bridge is unavailable. Restart the Electron app.';
}

function normalizeBootstrapError(bootstrap: PlaygroundBootstrap): string {
  return bootstrap.error || 'Failed to start playground runtime.';
}

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
  });

  // Pre-select "android" as the default platform so the very first
  // `refreshSessionSetup` poll sees a `platformId` in the form values
  // and the multi-platform session manager resolves Android targets
  // immediately. Without this, the initial poll returns "Choose a
  // platform" with no targets and the sidebar stays empty until the
  // user manually picks a platform in the setup form.
  useLayoutEffect(() => {
    const currentPlatformId = controller.state.form.getFieldValue('platformId');
    if (!currentPlatformId) {
      controller.state.form.setFieldsValue({ platformId: 'android' });
    }
  }, [controller.state.form]);

  const contextValue = useMemo(
    () => ({
      phase: 'ready' as const,
      serverUrl,
      controller,
      restartPlayground,
      restartAndroidPlayground: restartPlayground,
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

function bucketDiscoveredDevices(
  devices: DiscoveredDevice[],
): DiscoveredDevicesByPlatform {
  const buckets: DiscoveredDevicesByPlatform = {
    android: [],
    ios: [],
    computer: [],
    harmony: [],
    web: [],
  };
  for (const device of devices) {
    const key = device.platformId as StudioSidebarPlatformKey;
    if (buckets[key]) {
      buckets[key].push(device);
    }
  }
  return buckets;
}

export function StudioPlaygroundProvider({ children }: PropsWithChildren) {
  const [bootstrap, setBootstrap] = useState<
    | { phase: 'booting' }
    | { phase: 'error'; error: string }
    | { phase: 'ready'; serverUrl: string }
  >({ phase: 'booting' });
  const [bootstrapTick, setBootstrapTick] = useState(0);

  // Cross-platform device discovery — polls ALL platforms (ADB, HDC,
  // displays) independently of the session manager so the sidebar
  // shows devices from every platform simultaneously.
  const [discoveredDevices, setDiscoveredDevices] = useState<
    DiscoveredDevicesByPlatform | undefined
  >();
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (!window.studioRuntime?.discoverDevices) return;
      try {
        const devices = await window.studioRuntime.discoverDevices();
        if (!cancelled) setDiscoveredDevices(bucketDiscoveredDevices(devices));
      } catch {
        // Silent — device discovery is best-effort.
      }
    };
    void poll();
    const id = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

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
        restartAndroidPlayground: restartPlayground,
        discoveredDevices,
      };
    }

    return {
      phase: 'booting' as const,
      restartPlayground,
      restartAndroidPlayground: restartPlayground,
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
