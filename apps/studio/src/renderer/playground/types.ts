import type { PlaygroundControllerResult } from '@midscene/playground-app';
import type {
  DiscoveredDevice,
  PlatformDiscoveryError,
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
  sessionValues?: DiscoveredDevice['sessionValues'];
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

/**
 * Per-platform discovery errors, bucketed alongside `DiscoveredDevicesByPlatform`.
 * Used by the overview to render an actionable hint (e.g. "未检测到 adb")
 * instead of a generic "No devices" placeholder when a platform's discovery
 * tool is missing.
 */
export type DiscoveryErrorsByPlatform = Partial<
  Record<StudioSidebarPlatformKey, PlatformDiscoveryError>
>;

export type StudioPlaygroundContextValue =
  | {
      phase: 'booting';
      restartPlayground: () => Promise<void>;
      refreshDiscoveredDevices: () => Promise<void>;
      setDiscoveryPollingPaused: (paused: boolean) => void;
      discoveredDevices?: DiscoveredDevicesByPlatform;
      discoveryErrors?: DiscoveryErrorsByPlatform;
    }
  | {
      phase: 'error';
      error: string;
      restartPlayground: () => Promise<void>;
      refreshDiscoveredDevices: () => Promise<void>;
      setDiscoveryPollingPaused: (paused: boolean) => void;
      discoveredDevices?: DiscoveredDevicesByPlatform;
      discoveryErrors?: DiscoveryErrorsByPlatform;
    }
  | {
      phase: 'ready';
      serverUrl: string;
      controller: PlaygroundControllerResult;
      restartPlayground: () => Promise<void>;
      refreshDiscoveredDevices: () => Promise<void>;
      setDiscoveryPollingPaused: (paused: boolean) => void;
      discoveredDevices?: DiscoveredDevicesByPlatform;
      discoveryErrors?: DiscoveryErrorsByPlatform;
    };
