import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import type { DeviceType, ExecutionUxHint } from '@midscene/visualizer';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildFallbackRuntimeInfo,
  filterValidExecutionUxHints,
  normalizeRuntimeDeviceType,
} from './runtime-info';

interface ServerStatusResult {
  serverOnline: boolean;
  isUserOperating: boolean;
  deviceType: DeviceType;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  executionUxHints: ExecutionUxHint[];
  refreshServerState: () => Promise<void>;
}

export function useServerStatus(
  playgroundSDK: PlaygroundSDK,
  defaultDeviceType: DeviceType,
  pollIntervalMs: number,
): ServerStatusResult {
  const [serverOnline, setServerOnline] = useState(false);
  const [isUserOperating, setIsUserOperating] = useState(false);
  const [deviceType, setDeviceType] = useState<DeviceType>(defaultDeviceType);
  const [runtimeInfo, setRuntimeInfo] = useState<PlaygroundRuntimeInfo | null>(
    null,
  );
  const [executionUxHints, setExecutionUxHints] = useState<ExecutionUxHint[]>(
    [],
  );
  const runtimeInfoRef = useRef<PlaygroundRuntimeInfo | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    runtimeInfoRef.current = runtimeInfo;
  }, [runtimeInfo]);

  useEffect(() => {
    playgroundSDK.onProgressUpdate((tip: string) => {
      setIsUserOperating(Boolean(tip));
    });
  }, [playgroundSDK]);

  const refreshServerState = useCallback(async () => {
    try {
      const online = await playgroundSDK.checkStatus();
      if (!mountedRef.current) return;
      setServerOnline(online);

      if (!online) {
        runtimeInfoRef.current = null;
        setRuntimeInfo(null);
        setExecutionUxHints([]);
        return;
      }

      try {
        const nextRuntimeInfo = await playgroundSDK.getRuntimeInfo();
        if (!mountedRef.current) return;

        if (nextRuntimeInfo) {
          runtimeInfoRef.current = nextRuntimeInfo;
          setRuntimeInfo(nextRuntimeInfo);
          setDeviceType(
            normalizeRuntimeDeviceType(nextRuntimeInfo, defaultDeviceType),
          );
          setExecutionUxHints(filterValidExecutionUxHints(nextRuntimeInfo));
          return;
        }
      } catch (error) {
        console.warn('Failed to get runtime info:', error);
      }

      try {
        const interfaceInfo = await playgroundSDK.getInterfaceInfo();
        if (!mountedRef.current || !interfaceInfo?.type) return;

        const fallbackRuntimeInfo = buildFallbackRuntimeInfo(
          runtimeInfoRef.current,
          interfaceInfo,
        );

        runtimeInfoRef.current = fallbackRuntimeInfo;
        setRuntimeInfo(fallbackRuntimeInfo);
        setDeviceType(
          normalizeRuntimeDeviceType(fallbackRuntimeInfo, defaultDeviceType),
        );
        setExecutionUxHints(filterValidExecutionUxHints(fallbackRuntimeInfo));
      } catch (error) {
        console.warn('Failed to get interface info:', error);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      console.error('Failed to check server status:', error);
      setServerOnline(false);
    }
  }, [defaultDeviceType, playgroundSDK]);

  useEffect(() => {
    void refreshServerState();
    const interval = window.setInterval(() => {
      void refreshServerState();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [pollIntervalMs, refreshServerState]);

  return {
    serverOnline,
    isUserOperating,
    deviceType,
    runtimeInfo,
    executionUxHints,
    refreshServerState,
  };
}
