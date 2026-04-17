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
      restartPlayground: () => Promise<void>;
      /** @deprecated Use restartPlayground */
      restartAndroidPlayground: () => Promise<void>;
    }
  | {
      phase: 'error';
      error: string;
      restartPlayground: () => Promise<void>;
      /** @deprecated Use restartPlayground */
      restartAndroidPlayground: () => Promise<void>;
    }
  | {
      phase: 'ready';
      serverUrl: string;
      controller: PlaygroundControllerResult;
      restartPlayground: () => Promise<void>;
      /** @deprecated Use restartPlayground */
      restartAndroidPlayground: () => Promise<void>;
    };
