import type { PlaygroundControllerResult } from '@midscene/playground-app';
import type {
  DiscoveredDevice,
  StudioPlatformId,
} from '@shared/electron-contract';

export type StudioSidebarPlatformKey = StudioPlatformId;

export interface StudioAndroidDeviceItem {
  id: string;
  label: string;
  description?: string;
  selected: boolean;
  status: 'active' | 'idle';
  isPlaceholder?: boolean;
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
      refreshDiscoveredDevices: () => Promise<void>;
      discoveredDevices?: DiscoveredDevicesByPlatform;
    }
  | {
      phase: 'error';
      error: string;
      restartPlayground: () => Promise<void>;
      refreshDiscoveredDevices: () => Promise<void>;
      discoveredDevices?: DiscoveredDevicesByPlatform;
    }
  | {
      phase: 'ready';
      serverUrl: string;
      controller: PlaygroundControllerResult;
      restartPlayground: () => Promise<void>;
      refreshDiscoveredDevices: () => Promise<void>;
      discoveredDevices?: DiscoveredDevicesByPlatform;
    };
