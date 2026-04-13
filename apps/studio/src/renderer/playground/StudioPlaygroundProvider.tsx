import {
  PlaygroundThemeProvider,
  usePlaygroundController,
} from '@midscene/playground-app';
import type { AndroidPlaygroundBootstrap } from '@shared/electron-contract';
import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StudioPlaygroundContext } from './useStudioPlayground';

function getMissingBridgeError() {
  return 'Studio preload bridge is unavailable. Restart the Electron app.';
}

function normalizeBootstrapError(
  bootstrap: AndroidPlaygroundBootstrap,
): string {
  return bootstrap.error || 'Failed to start Android playground runtime.';
}

function ReadyStudioPlaygroundProvider({
  children,
  restartAndroidPlayground,
  serverUrl,
}: PropsWithChildren<{
  restartAndroidPlayground: () => Promise<void>;
  serverUrl: string;
}>) {
  const controller = usePlaygroundController({
    serverUrl,
    defaultDeviceType: 'android',
  });

  const contextValue = useMemo(
    () => ({
      phase: 'ready' as const,
      serverUrl,
      controller,
      restartAndroidPlayground,
    }),
    [controller, restartAndroidPlayground, serverUrl],
  );

  return (
    <StudioPlaygroundContext.Provider value={contextValue}>
      {children}
    </StudioPlaygroundContext.Provider>
  );
}

export function StudioPlaygroundProvider({ children }: PropsWithChildren) {
  const [bootstrap, setBootstrap] = useState<
    | { phase: 'booting' }
    | { phase: 'error'; error: string }
    | { phase: 'ready'; serverUrl: string }
  >({ phase: 'booting' });
  const [bootstrapTick, setBootstrapTick] = useState(0);

  const readBootstrap = useCallback(async () => {
    if (!window.studioRuntime) {
      setBootstrap({
        phase: 'error',
        error: getMissingBridgeError(),
      });
      return;
    }

    const nextBootstrap =
      await window.studioRuntime.getAndroidPlaygroundBootstrap();
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

  const restartAndroidPlayground = useCallback(async () => {
    setBootstrap({ phase: 'booting' });

    if (!window.studioRuntime) {
      setBootstrap({
        phase: 'error',
        error: getMissingBridgeError(),
      });
      return;
    }

    const nextBootstrap = await window.studioRuntime.restartAndroidPlayground();
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
        restartAndroidPlayground,
      };
    }

    return {
      phase: 'booting' as const,
      restartAndroidPlayground,
    };
  }, [bootstrap, restartAndroidPlayground]);

  return (
    <PlaygroundThemeProvider>
      {bootstrap.phase === 'ready' ? (
        <ReadyStudioPlaygroundProvider
          restartAndroidPlayground={restartAndroidPlayground}
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
