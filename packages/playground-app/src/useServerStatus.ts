import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import type { DeviceType, ExecutionUxHint } from '@midscene/visualizer';
import { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    runtimeInfoRef.current = runtimeInfo;
  }, [runtimeInfo]);

  useEffect(() => {
    playgroundSDK.onProgressUpdate((tip: string) => {
      setIsUserOperating(Boolean(tip));
    });
  }, [playgroundSDK]);

  useEffect(() => {
    let active = true;

    const checkServer = async () => {
      try {
        const online = await playgroundSDK.checkStatus();
        if (!active) return;
        setServerOnline(online);

        if (!online) {
          runtimeInfoRef.current = null;
          setRuntimeInfo(null);
          setExecutionUxHints([]);
          return;
        }

        try {
          const nextRuntimeInfo = await playgroundSDK.getRuntimeInfo();
          if (!active) return;

          if (nextRuntimeInfo) {
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
          if (!active || !interfaceInfo?.type) return;

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
        if (!active) return;
        console.error('Failed to check server status:', error);
        setServerOnline(false);
      }
    };

    checkServer();
    const interval = window.setInterval(checkServer, pollIntervalMs);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [playgroundSDK, pollIntervalMs, defaultDeviceType]);

  return {
    serverOnline,
    isUserOperating,
    deviceType,
    runtimeInfo,
    executionUxHints,
  };
}
