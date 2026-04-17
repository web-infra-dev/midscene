import type { PlaygroundControllerResult } from '@midscene/playground-app';
import type { DiscoveredDevice } from '@shared/electron-contract';

export type StudioSidebarPlatformKey =
  | 'android'
  | 'ios'
  | 'computer'
  | 'harmony'
  | 'web';

export interface StudioAndroidDeviceItem {
  id: string;
  label: string;
  description?: string;
  selected: boolean;
  status: 'active' | 'idle';
}

export type StudioSidebarDeviceBuckets = Record<
  StudioSidebarPlatformKey,
  StudioAndroidDeviceItem[]
>;

/** All discovered devices from the cross-platform scan, bucketed. */
export type DiscoveredDevicesByPlatform = Record<
  StudioSidebarPlatformKey,
  DiscoveredDevice[]
>;

export type StudioPlaygroundContextValue =
  | {
      phase: 'booting';
      restartPlayground: () => Promise<void>;
      /** @deprecated Use restartPlayground */
      restartAndroidPlayground: () => Promise<void>;
      discoveredDevices?: DiscoveredDevicesByPlatform;
    }
  | {
      phase: 'error';
      error: string;
      restartPlayground: () => Promise<void>;
      /** @deprecated Use restartPlayground */
      restartAndroidPlayground: () => Promise<void>;
      discoveredDevices?: DiscoveredDevicesByPlatform;
    }
  | {
      phase: 'ready';
      serverUrl: string;
      controller: PlaygroundControllerResult;
      restartPlayground: () => Promise<void>;
      /** @deprecated Use restartPlayground */
      restartAndroidPlayground: () => Promise<void>;
      discoveredDevices?: DiscoveredDevicesByPlatform;
    };
