import type { PlaygroundControllerResult } from '@midscene/playground-app';

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

export type StudioPlaygroundContextValue =
  | {
      phase: 'booting';
      restartAndroidPlayground: () => Promise<void>;
    }
  | {
      phase: 'error';
      error: string;
      restartAndroidPlayground: () => Promise<void>;
    }
  | {
      phase: 'ready';
      serverUrl: string;
      controller: PlaygroundControllerResult;
      restartAndroidPlayground: () => Promise<void>;
    };
