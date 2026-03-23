import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
} from '@midscene/playground';
import { useEffect, useState } from 'react';
import type { DeviceType } from './PlaygroundApp';

const VALID_DEVICE_TYPES: readonly DeviceType[] = [
  'android',
  'computer',
  'ios',
  'web',
  'harmony',
] as const;

function isValidDeviceType(type: string): type is DeviceType {
  return (VALID_DEVICE_TYPES as readonly string[]).includes(type);
}

interface ServerStatusResult {
  serverOnline: boolean;
  isUserOperating: boolean;
  deviceType: DeviceType;
  runtimeInfo: PlaygroundRuntimeInfo | null;
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
          setDeviceType(defaultDeviceType);
          return;
        }

        try {
          const nextRuntimeInfo = await playgroundSDK.getRuntimeInfo();
          if (!active || !nextRuntimeInfo) return;

          setRuntimeInfo(nextRuntimeInfo);

          const candidateTypes = [
            nextRuntimeInfo.platformId,
            nextRuntimeInfo.interface.type,
          ];

          for (const candidate of candidateTypes) {
            if (!candidate) continue;

            const type = candidate.toLowerCase();
            if (isValidDeviceType(type)) {
              setDeviceType(type);
              break;
            }
          }
        } catch (error) {
          console.warn('Failed to get runtime info:', error);
        }
      } catch (error) {
        if (!active) return;
        console.error('Failed to check server status:', error);
        setServerOnline(false);
        setRuntimeInfo(null);
      }
    };

    checkServer();
    const interval = window.setInterval(checkServer, pollIntervalMs);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [defaultDeviceType, playgroundSDK, pollIntervalMs]);

  return { serverOnline, isUserOperating, deviceType, runtimeInfo };
}
