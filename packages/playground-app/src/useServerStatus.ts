import type { PlaygroundSDK } from '@midscene/playground';
import { useEffect, useState } from 'react';
import type { DeviceType } from './PlaygroundApp';

const VALID_DEVICE_TYPES: readonly DeviceType[] = [
  'android',
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
}

export function useServerStatus(
  playgroundSDK: PlaygroundSDK,
  defaultDeviceType: DeviceType,
  pollIntervalMs: number,
): ServerStatusResult {
  const [serverOnline, setServerOnline] = useState(false);
  const [isUserOperating, setIsUserOperating] = useState(false);
  const [deviceType, setDeviceType] = useState<DeviceType>(defaultDeviceType);

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

        if (!online) return;

        try {
          const interfaceInfo = await playgroundSDK.getInterfaceInfo();
          if (!active || !interfaceInfo?.type) return;

          const type = interfaceInfo.type.toLowerCase();
          if (isValidDeviceType(type)) {
            setDeviceType(type);
          }
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
  }, [playgroundSDK, pollIntervalMs]);

  return { serverOnline, isUserOperating, deviceType };
}
