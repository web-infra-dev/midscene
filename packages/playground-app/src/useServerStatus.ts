import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import type { DeviceType, ExecutionUxHint } from '@midscene/visualizer';
import { useEffect, useState } from 'react';
import {
  normalizeExecutionUxHints,
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
            setExecutionUxHints(normalizeExecutionUxHints(nextRuntimeInfo));
            return;
          }
        } catch (error) {
          console.warn('Failed to get runtime info:', error);
        }

        try {
          const interfaceInfo = await playgroundSDK.getInterfaceInfo();
          if (!active || !interfaceInfo?.type) return;

          setRuntimeInfo((previous) => ({
            ...previous,
            interface: interfaceInfo,
            preview: previous?.preview || { kind: 'none', capabilities: [] },
            executionUxHints: previous?.executionUxHints || [],
            metadata: previous?.metadata || {},
          }));
          setDeviceType(
            normalizeRuntimeDeviceType(
              {
                interface: interfaceInfo,
                preview: { kind: 'none', capabilities: [] },
                executionUxHints: [],
                metadata: {},
              },
              defaultDeviceType,
            ),
          );
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
